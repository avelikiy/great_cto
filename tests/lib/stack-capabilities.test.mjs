// Borrowed from anthropics/oncall-kit: no skill names a vendor; skills refer to
// capabilities, and one declaration maps each to the tool the team actually has.
//
// The property under test is not "it parses YAML". It is that THREE answers stay
// three. `pager: none` is a decision the project made; `metrics:` absent means
// nobody has said. An agent that collapses the second into the first stops
// looking for something that exists — which is this repository's governing defect
// pointed at an incident at 3am.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CAPABILITIES, capabilitiesFromProjectMd, describeCapability, describeCapabilities, upsertCapability,
} from '../../scripts/lib/stack-capabilities.mjs';

const CLI = path.resolve(import.meta.dirname, '../../scripts/lib/stack-capabilities.mjs');

test('declared, none and undeclared are three states, not two', () => {
  const { map } = capabilitiesFromProjectMd(
    'capabilities:\n  logs: grafana-loki\n  pager: none\n');
  assert.deepEqual(map.logs, { state: 'declared', tool: 'grafana-loki' });
  assert.deepEqual(map.pager, { state: 'none', tool: null });
  assert.deepEqual(map.metrics, { state: 'undeclared', tool: null });
});

test('the undeclared wording sends the reader to look, not to conclude', () => {
  const { map } = capabilitiesFromProjectMd('');
  const line = describeCapability('traces', map.traces);
  assert.match(line, /do not assume there is none/);
  // The failure this guards: an "undeclared" line that reads like an answer.
  assert.doesNotMatch(line, /^traces: none/);
});

test('a project that declares nothing says so, rather than looking checked', () => {
  const out = describeCapabilities(capabilitiesFromProjectMd('archetype: devtools\n'));
  assert.match(out, /declares NO operational capabilities/);
  assert.match(out, /rather than implying the stack was checked/);
});

test('a misspelled capability is reported, not silently dropped', () => {
  // The author believes it is declared. Dropping it makes their belief and the
  // machine's state disagree with nothing to notice the difference.
  const r = capabilitiesFromProjectMd('capabilities:\n  logz: grafana-loki\n');
  assert.deepEqual(r.unknownKeys, ['logz']);
  assert.equal(r.declaredCount, 0);
  assert.match(describeCapabilities(r), /unrecognised capability key\(s\).*logz/);
});

test('the block ends at the dedent — a later top-level key is not a capability', () => {
  const r = capabilitiesFromProjectMd(
    'capabilities:\n  logs: loki\nstack: TypeScript / Node.js 22\napproval-level: strict\n');
  assert.equal(r.map.logs.tool, 'loki');
  assert.deepEqual(r.unknownKeys, [], 'stack: and approval-level: are not capability keys');
  assert.equal(r.declaredCount, 1);
});

test('the vocabulary is closed, and covers what an incident needs', () => {
  for (const c of ['logs', 'metrics', 'traces', 'errors', 'alerts', 'pager', 'deploys', 'code-host']) {
    assert.ok(CAPABILITIES.includes(c), `${c} is part of the vocabulary`);
  }
  assert.equal(new Set(CAPABILITIES).size, CAPABILITIES.length, 'no duplicates');
});

test('a missing PROJECT.md is unknown, not empty — and the CLI still exits 0', () => {
  // Failing here would make an unconfigured project unable to run an incident,
  // which is precisely when the agent is needed.
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-cap-'));
  const out = execFileSync(process.execPath, [CLI, '--cwd', dir], { encoding: 'utf8' });
  assert.match(out, /unknown, not absent/);
  assert.doesNotMatch(out, /declares NO operational capabilities/,
    'no file at all is a different answer from a file that declares nothing');
  rmSync(dir, { recursive: true, force: true });
});

test('the CLI reads a real project and resolves its declarations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-cap-'));
  mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
  writeFileSync(path.join(dir, '.great_cto/PROJECT.md'),
    'archetype: web-service\ncapabilities:\n  logs: datadog\n  pager: pagerduty\n');
  const out = execFileSync(process.execPath, [CLI, '--cwd', dir], { encoding: 'utf8' });
  assert.match(out, /logs: datadog/);
  assert.match(out, /pager: pagerduty/);
  assert.match(out, /declares 2 of 9/);
  rmSync(dir, { recursive: true, force: true });
});

test('l3-support actually reads the map — a layer nothing consults is not a layer', () => {
  const agent = readFileSync(path.resolve(import.meta.dirname, '../../agents/l3-support.md'), 'utf8');
  assert.match(agent, /stack-capabilities\.mjs/, 'the agent invokes the reader');
  const step0 = agent.indexOf('Step 0');
  const table = agent.indexOf('Alert Source → Tool Routing');
  assert.ok(step0 > 0 && table > step0,
    'and it runs BEFORE the routing table — the table cannot say which row is this project');
});

test('second_opinion is in the vocabulary, with the same three states', () => {
  assert.ok(CAPABILITIES.includes('second_opinion'));
  const md = 'capabilities:\n  logs: loki\n  second_opinion: codex\n';
  assert.deepEqual(capabilitiesFromProjectMd(md).map.second_opinion, { state: 'declared', tool: 'codex' });
  assert.deepEqual(capabilitiesFromProjectMd('capabilities:\n  logs: loki\n').map.second_opinion, { state: 'undeclared', tool: null });
  assert.deepEqual(capabilitiesFromProjectMd('capabilities:\n  second_opinion: none\n').map.second_opinion, { state: 'none', tool: null });
});

test('upsertCapability replaces in place and reports what it replaced', () => {
  const md = '# P\n\ncapabilities:\n  logs: loki\n  second_opinion: openrouter\n\nstack: node\n';
  const r = upsertCapability(md, 'second_opinion', 'codex');
  assert.equal(r.previous, 'openrouter');
  assert.equal(r.created, false);
  assert.deepEqual(capabilitiesFromProjectMd(r.text).map.second_opinion, { state: 'declared', tool: 'codex' });
  assert.match(r.text, /\nstack: node\n$/, 'nothing after the block moved');
  assert.equal((r.text.match(/second_opinion/g) || []).length, 1, 'replaced, not appended');
});

test('upsertCapability adds to an existing block, or creates one, and says which', () => {
  const add = upsertCapability('capabilities:\n  logs: loki\n', 'second_opinion', 'codex');
  assert.equal(add.previous, null); assert.equal(add.created, false);
  assert.deepEqual(capabilitiesFromProjectMd(add.text).map.logs, { state: 'declared', tool: 'loki' });
  assert.deepEqual(capabilitiesFromProjectMd(add.text).map.second_opinion, { state: 'declared', tool: 'codex' });
  const made = upsertCapability('# P\nstack: node\n', 'second_opinion', 'codex');
  assert.equal(made.created, true);
  assert.deepEqual(capabilitiesFromProjectMd(made.text).map.second_opinion, { state: 'declared', tool: 'codex' });
});

test('removing a capability returns it to undeclared — which is not none', () => {
  const md = 'capabilities:\n  second_opinion: codex\n';
  const r = upsertCapability(md, 'second_opinion', null);
  assert.equal(r.previous, 'codex');
  assert.equal(capabilitiesFromProjectMd(r.text).map.second_opinion.state, 'undeclared');
  const none = upsertCapability(md, 'second_opinion', 'none');
  assert.equal(capabilitiesFromProjectMd(none.text).map.second_opinion.state, 'none');
});

test('upsertCapability refuses a key outside the vocabulary and a value that is not a name', () => {
  assert.throws(() => upsertCapability('', 'logz', 'x'), /not a capability/);
  assert.throws(() => upsertCapability('', 'second_opinion', 'a b\nc'), /invalid value/);
});
