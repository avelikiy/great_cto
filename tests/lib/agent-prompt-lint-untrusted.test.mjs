// SEC-001: an agent that can fetch from the web is told that what it fetches is data.
//
// A page, an issue body or a log line can carry text written to steer the model
// ("ignore previous instructions", a fake system message). An agent with WebFetch
// or WebSearch and Write/Edit/Bash can act on it. `agents/_shared/untrusted-content.md`
// is the contract; this rule makes every web-capable agent point at it.
//
// Same shape as the FM-005 tests: each case mutates one agent in a throwaway copy
// and asserts the specific error, so a rule that stopped judging cannot pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FRAGMENT = 'agents/_shared/untrusted-content.md';

function lint(root) {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(root, 'scripts/agent-prompt-lint.mjs'), '--json'],
      { cwd: root, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout ?? '';
  }
  return JSON.parse(out);
}

/** SEC-001 findings as `slug: message`. */
const untrustedErrors = (d) => d.results.flatMap((r) => r.findings
  .filter((f) => f.rule === 'SEC-001' && f.severity === 'error')
  .map((f) => `${path.basename(r.file, '.md')}: ${f.message}`));

function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-lint-untrusted-'));
  cpSync(path.join(ROOT, 'agents'), path.join(dir, 'agents'), { recursive: true });
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/agent-prompt-lint.mjs'), path.join(dir, 'scripts/agent-prompt-lint.mjs'));
  return dir;
}

function mutate(dir, slug, fn) {
  const f = path.join(dir, 'agents', `${slug}.md`);
  writeFileSync(f, fn(readFileSync(f, 'utf8')));
}

/** Slugs whose frontmatter `tools:` names WebFetch or WebSearch. */
function webAgents(root) {
  const dir = path.join(root, 'agents');
  return readdirSync(dir).filter((f) => f.endsWith('.md')).filter((f) => {
    const fm = readFileSync(path.join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
    const tools = fm?.[1].match(/^tools:(.*(?:\n[ \t-].*)*)/m)?.[1] ?? '';
    return /\bWeb(?:Fetch|Search)\b/.test(tools);
  }).map((f) => f.replace(/\.md$/, '')).sort();
}

const dropPointer = (text) => text.split('\n').filter((l) => !l.includes(FRAGMENT)).join('\n');

test('every shipped agent with web tools points at the untrusted-content contract', () => {
  const d = lint(ROOT);
  assert.deepEqual(untrustedErrors(d), []);
  const web = webAgents(ROOT);
  assert.ok(web.length >= 60, `found ${web.length} web-capable agents`);
  for (const slug of web) {
    const text = readFileSync(path.join(ROOT, 'agents', `${slug}.md`), 'utf8');
    assert.equal(text.split(FRAGMENT).length - 1, 1, `${slug}: expected exactly one pointer`);
  }
});

test('agents without web tools do not pay for the contract', () => {
  const web = new Set(webAgents(ROOT));
  const extra = readdirSync(path.join(ROOT, 'agents'))
    .filter((f) => f.endsWith('.md') && !web.has(f.replace(/\.md$/, '')))
    .filter((f) => readFileSync(path.join(ROOT, 'agents', f), 'utf8').includes(FRAGMENT));
  assert.deepEqual(extra, []);
});

test('a web-capable agent that loses the pointer is an error', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'devops', dropPointer);
    const errs = untrustedErrors(lint(dir));
    assert.equal(errs.length, 1, errs.join('\n'));
    assert.match(errs[0], /^devops: .*WebSearch.*agents\/_shared\/untrusted-content\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('granting WebFetch to an agent that lacks the pointer is an error', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'decision-scorer', (t) => t.replace(/^tools: /m, 'tools: WebFetch, '));
    const errs = untrustedErrors(lint(dir));
    assert.equal(errs.length, 1, errs.join('\n'));
    assert.match(errs[0], /^decision-scorer: .*WebFetch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a pointer at a fragment that cannot be read is an error, not a pass', () => {
  const dir = sandbox();
  try {
    rmSync(path.join(dir, FRAGMENT));
    const errs = untrustedErrors(lint(dir));
    assert.equal(errs.length, webAgents(ROOT).length, errs.slice(0, 3).join('\n'));
    assert.match(errs[0], /could not be read \(ENOENT\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the fragment stays within its per-turn budget and says what it must', () => {
  const text = readFileSync(path.join(ROOT, FRAGMENT), 'utf8');
  assert.ok(text.length <= 1200, `fragment is ${text.length} chars (budget 1,200)`);
  for (const re of [/data/i, /instruction/i, /WebFetch|WebSearch/, /issue|PR/, /secret/i,
    /URL/, /ignore previous instructions/i, /report/i, /gate/i]) {
    assert.match(text, re);
  }
});
