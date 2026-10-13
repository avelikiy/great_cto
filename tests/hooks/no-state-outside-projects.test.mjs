// great_cto wrote its state into repositories that are not great_cto projects
// (great_cto-tng1). A Claude Code session opened by another tool in a throwaway
// repo got .great_cto/{SKILL.md, ARCHETYPES.md, env.sh, events.jsonl,
// status/<sid>.json, .session-resume} — 984 lines the user saw as the agent's
// changes. The project-root walk finds no PROJECT.md and leaves the hook in the
// cwd; every writer then created `.great_cto/` there. A project is a directory
// with .great_cto/PROJECT.md (or verdicts/); nothing else gets state.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendEvent } from '../../scripts/lib/agent-events.mjs';
import { recordHookEvent } from '../../scripts/lib/session-status.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); made.push(d); return d; };
const project = (p) => { const d = tmp(p); fs.mkdirSync(path.join(d, '.great_cto')); fs.writeFileSync(path.join(d, '.great_cto', 'PROJECT.md'), 'archetype: devtools\n'); return d; };

// The SessionStart block that seeds .great_cto, cut from the shipped plugin.json
// — run as written, with the plugin root pinned to this checkout.
function seedBlock() {
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const cmd = plugin.hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command)
    .find((c) => c.includes('skills/great_cto/SKILL.md'));
  assert.ok(cmd, 'located the SessionStart hook that copies SKILL.md');
  const start = cmd.indexOf('if [ -z "$PLUGIN_DIR" ]');
  // The block ends with every `fi;` that closes it (the project guard nests one).
  let end = cmd.indexOf('fi;', cmd.indexOf('> .great_cto/env.sh')) + 3;
  while (cmd.startsWith(' fi;', end)) end += 4;
  assert.ok(start > 0 && end > start, 'located the seeding block');
  return cmd.slice(start, end);
}
function runSeed(cwd) {
  const home = tmp('nostate-home-');
  return spawnSync('sh', ['-c', `PLUGIN_DIR="${REPO}"; ${seedBlock().replace('node "${PLUGIN_DIR}/scripts/lib/sync-managed.mjs" --plugin-dir "${PLUGIN_DIR}" 2>/dev/null || true;', '')}`],
    { cwd, env: { ...process.env, HOME: home }, encoding: 'utf8' });
}

test('SessionStart does not seed .great_cto in a repository that is not a project', () => {
  const repo = tmp('nostate-repo-');
  const r = runSeed(repo);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(repo, '.great_cto')), false, 'no .great_cto made outside a project');
});

test('SessionStart still seeds a project', () => {
  const repo = project('nostate-proj-');
  const r = runSeed(repo);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['SKILL.md', 'ARCHETYPES.md', 'env.sh']) assert.ok(fs.existsSync(path.join(repo, '.great_cto', f)), f);
});

test('the event log is not created outside a project', () => {
  const repo = tmp('nostate-events-');
  const r = appendEvent(path.join(repo, '.great_cto'), { kind: 'agent-start', agent: 'qa' }, { env: {} });
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(repo, '.great_cto')), false);
  const proj = project('nostate-events-proj-');
  assert.equal(appendEvent(path.join(proj, '.great_cto'), { kind: 'agent-start', agent: 'qa' }, { env: {} }).ok, true);
});

test('session status is not written into a stray .great_cto', () => {
  const repo = tmp('nostate-status-');
  fs.mkdirSync(path.join(repo, '.great_cto')); // what an older SessionStart left behind
  const r = recordHookEvent({ cwd: repo, session_id: 'abc123', hook_event_name: 'UserPromptSubmit' });
  assert.equal(r, null);
  assert.equal(fs.existsSync(path.join(repo, '.great_cto', 'status')), false);
});

test('the session-resume hook leaves a non-project untouched', () => {
  const repo = tmp('nostate-resume-');
  fs.mkdirSync(path.join(repo, '.great_cto')); // a stray directory, not a project
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'hooks', 'session-pipeline-resume.mjs')],
    { cwd: repo, input: '{}', env: { ...process.env, HOME: tmp('nostate-home-'), GREAT_CTO_DIR: '' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(path.join(repo, '.great_cto')), [], 'nothing written into it');
});

import { ensureStateDir } from '../../scripts/lib/great-cto-scope.mjs';

test('ensureStateDir creates state only inside a project', () => {
  const repo = tmp('nostate-ensure-');
  assert.equal(ensureStateDir(path.join(repo, '.great_cto', 'cache')), false);
  assert.equal(fs.existsSync(path.join(repo, '.great_cto')), false, 'nothing created');
  assert.equal(ensureStateDir(path.join(repo, 'no-state-here')), false, 'not a .great_cto path at all');
  const proj = project('nostate-ensure-proj-');
  assert.equal(ensureStateDir(path.join(proj, '.great_cto', 'cache')), true);
  assert.ok(fs.existsSync(path.join(proj, '.great_cto', 'cache')));
});

// The guarantee is the code, not the memory of it: a hook that creates
// .great_cto with a plain mkdir is the bug coming back. Allowed only behind a
// project check (session-end's learner) — listed by name, with the reason.
const MKDIR_STATE = /mkdirSync\(\s*(?:'\.great_cto'|"\.great_cto"|PROJ_DIR|join\(\s*(?:PROJ_DIR|cwd|root)\s*,\s*['"]\.great_cto['"])/;
const ALLOWED = new Map([
  ['session-end.mjs', 'spawnLearner returns first unless isProjectState(.great_cto)'],
  ['session-pipeline-resume.mjs', 'trace and marker are written only when isProjectState(PROJ_DIR)'],
  ['pipeline-stall-guard.mjs', 'returns first for the global layer and unless .great_cto/verdicts exists — a project by isProjectState'],
  ['subagent-stop-completion.mjs', 'leaves early unless isProjectState(PROJ_DIR)'],
]);
function offenders(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !ALLOWED.has(f))
    .filter((f) => MKDIR_STATE.test(fs.readFileSync(path.join(dir, f), 'utf8')));
}

test('no hook creates .great_cto with a plain mkdir', () => {
  assert.deepEqual(offenders(path.join(REPO, 'scripts', 'hooks')), []);
});

test('the scan catches the bad shape it exists for', () => {
  const d = tmp('nostate-scan-');
  fs.writeFileSync(path.join(d, 'bad-hook.mjs'), "try { mkdirSync('.great_cto', { recursive: true }); } catch {}\n");
  fs.writeFileSync(path.join(d, 'bad-join.mjs'), "mkdirSync(join(cwd, '.great_cto'), { recursive: true });\n");
  fs.writeFileSync(path.join(d, 'good-hook.mjs'), "if (!ensureStateDir('.great_cto')) throw new Error('x');\n");
  assert.deepEqual(offenders(d).sort(), ['bad-hook.mjs', 'bad-join.mjs']);
});
