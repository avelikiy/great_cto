// Which harness gives the second opinion — four states, because an absent
// Codex must never read as a project's decision to review without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSecondOpinion, codexAsk, codexReview, SECOND_OPINION_PROVIDERS } from '../../scripts/lib/second-opinion.mjs';

const AVAILABLE = { state: 'available', version: '0.153.4', auth: 'chatgpt', model: 'gpt-5.6-terra', why: '' };
const ABSENT = { state: 'absent', version: null, auth: null, model: null, why: 'codex is not on PATH — npm i -g @openai/codex' };

test('undeclared is its own state, and its wording says so', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  logs: loki\n', codex: AVAILABLE });
  assert.equal(r.state, 'undeclared');
  assert.equal(r.provider, null);
  assert.match(r.why, /not declared is not none/);
});

test('none is a decision', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: none\n', codex: AVAILABLE });
  assert.equal(r.state, 'none');
  assert.equal(r.provider, 'none');
});

test('codex declared and present is declared, carrying what will run', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: codex\n', codex: AVAILABLE });
  assert.equal(r.state, 'declared');
  assert.equal(r.provider, 'codex');
  assert.equal(r.codex.model, 'gpt-5.6-terra');
});

test('codex declared and absent is UNAVAILABLE — never none, never declared', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: codex\n', codex: ABSENT });
  assert.equal(r.state, 'unavailable');
  assert.equal(r.provider, 'codex', 'the provider the project asked for is still named');
  assert.match(r.why, /not on PATH/);
});

test('openrouter without a key is unavailable, not declared', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: openrouter\n', env: {} });
  assert.equal(r.state, 'unavailable');
  const ok = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: openrouter\n', env: { OPENROUTER_API_KEY: 'k' } });
  assert.equal(ok.state, 'declared');
});

test('a provider the plugin does not know is unavailable, with the list it does know', () => {
  const r = resolveSecondOpinion({ projectMd: 'capabilities:\n  second_opinion: gemini\n' });
  assert.equal(r.state, 'unavailable');
  for (const p of SECOND_OPINION_PROVIDERS) assert.ok(r.why.includes(p));
});

function fakeCodex(dir, reply) {
  const bin = path.join(dir, 'codex');
  // printf, not echo: /bin/sh's echo turns the JSON's escaped \n into a real
  // newline and splits the event across two lines, which parses as nothing.
  writeFileSync(bin, `#!/bin/sh\ncat > "${dir}/stdin"\nprintf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: reply } })}'\n`);
  chmodSync(bin, 0o755);
  return bin;
}

test('codexAsk has the judge\'s ask shape and returns the word, or empty on a non-answer', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-so-'));
  const ask = codexAsk(dir, { bin: fakeCodex(dir, 'yes') });
  assert.equal(await ask('Is it done?', ['yes', 'no', 'unclear']), 'yes');
  const sent = (await import('node:fs')).readFileSync(path.join(dir, 'stdin'), 'utf8');
  assert.match(sent, /exactly one word from: yes, no, unclear/);
  const gone = codexAsk(dir, { bin: '/nonexistent/codex', timeoutMs: 3000 });
  assert.equal(await gone('q', ['yes', 'no']), '', 'no binary → empty, which the judge already reads as unparsed');
});

test('codexReview passes the non-ok state through — a skipped review must not look like PASS', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-so-'));
  const ok = await codexReview({ system: 's', user: 'u', cwd: dir, bin: fakeCodex(dir, 'a.js:3 | P0 | boom\nVERDICT: BLOCK') });
  assert.equal(ok.state, 'ok');
  assert.match(ok.text, /VERDICT: BLOCK/);
  const dead = await codexReview({ system: 's', user: 'u', cwd: dir, bin: '/nonexistent/codex', timeoutMs: 3000 });
  assert.equal(dead.state, 'unreadable');
  assert.equal(dead.text, null);
});

// One lever. The reviewer, the verifier and the board's detector must all read
// the same variable for the Codex binary — the first version of the board test
// stripped PATH to hide codex and hid node with it. A lever that three files
// spell three ways is three levers.
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');

test('the three consumers read GREAT_CTO_CODEX_BIN, and nobody hardcodes the binary past it', () => {
  for (const f of ['scripts/lib/cross-model-review.mjs', 'scripts/lib/independent-verify.mjs', 'scripts/lib/codex-exec.mjs']) {
    assert.match(src(f), /GREAT_CTO_CODEX_BIN/, `${f} reads the lever`);
  }
});

test('code-reviewer is told the three exit codes, and that a skipped review is not a pass', () => {
  const md = src('agents/code-reviewer.md');
  assert.match(md, /`3`/, 'the SKIPPED code is named');
  assert.match(md, /Never write PASS for a review that did not happen/);
  assert.match(md, /second_opinion/, 'and where the decision comes from');
});
