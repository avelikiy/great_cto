// The hook that registers a project on the board runs where /start ends (Stop) and
// where a session opens (SessionStart), and can never fail or print into either.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = join(ROOT, 'scripts/hooks/register-project.mjs');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) { const d = realpathSync(mkdtempSync(join(tmpdir(), prefix))); TMP.push(d); return d; }

function runHook(cwd, input, file) {
  return spawnSync(process.execPath, [HOOK], {
    cwd, input, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, GREAT_CTO_PROJECTS_FILE: file, GREAT_CTO_NO_AUTO_REGISTER: '' },
  });
}

test('the Stop after /start wrote PROJECT.md registers the project, silently', () => {
  const d = tmp('gcto-reghook-');
  mkdirSync(join(d, '.great_cto'));
  writeFileSync(join(d, '.great_cto', 'PROJECT.md'), '# PROJECT.md\narchetype: healthcare\n');
  const file = join(tmp('gcto-reghook-reg-'), 'projects.json');
  const r = runHook(d, JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: d }), file);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'SessionStart output lands in the context; the hook prints nothing');
  const reg = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(reg.projects.map((p) => p.path), [d]);
});

test('it never fails: no project, garbage stdin, empty stdin, a corrupt registry', () => {
  const plain = tmp('gcto-reghook-plain-');
  const file = join(tmp('gcto-reghook-reg-'), 'projects.json');
  for (const [label, input] of [['no project', JSON.stringify({ cwd: plain })], ['garbage', 'not json {'], ['empty', '']]) {
    const r = runHook(plain, input, file);
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
    assert.equal(r.stdout, '', label);
  }
  assert.equal(existsSync(file), false, 'nothing to register, nothing written');

  const d = tmp('gcto-reghook-proj-');
  mkdirSync(join(d, '.great_cto'));
  writeFileSync(join(d, '.great_cto', 'PROJECT.md'), 'archetype: cli\n');
  writeFileSync(file, '{ corrupt');
  const r = runHook(d, JSON.stringify({ cwd: d }), file);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /not registered/, 'a refused registration says so on stderr');
  assert.equal(readFileSync(file, 'utf8'), '{ corrupt', 'a corrupt registry is left alone');
});

const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const entries = (event) => (manifest.hooks?.[event] || []).flatMap((g) => g.hooks || []);

for (const event of ['SessionStart', 'Stop']) {
  test(`${event} runs the registration hook, and a failure cannot fail the event`, () => {
    const found = entries(event).filter((h) => /scripts\/hooks\/register-project\.mjs/.test(String(h.command)));
    assert.equal(found.length, 1, `exactly one register-project entry on ${event}`);
    assert.match(String(found[0].command), /\|\|\s*true\s*$/);
  });
}
