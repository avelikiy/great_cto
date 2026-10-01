// great_cto's machine-local state stays out of a project's git, contracts are
// read from the plugin, and hooks write at the project root.
//
// On 23.09 a session in one project listed a dozen uncommitted files it had to
// step around — .great_cto/ turn markers and logs, shared/*.toml the plugin
// re-copied every session, and .great_cto/ directories two levels down in
// backend/src. All written by this plugin, none ignored.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot, ROOT_SNIPPET } from '../../scripts/lib/project-root.mjs';
import { contractPath, OVERRIDE_MARK } from '../../scripts/lib/contract-path.mjs';
import { ensureStateGitignore, mergeGitignore, BEGIN, END } from '../../scripts/lib/state-gitignore.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'proj-state-')));
  made.push(d);
  mkdirSync(join(d, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(d, '.great_cto', 'PROJECT.md'), 'primary: web-service\n');
  mkdirSync(join(d, 'backend', 'src'), { recursive: true });
  return d;
}
const plugin = JSON.parse(readFileSync(resolve('.claude-plugin/plugin.json'), 'utf8'));
const commands = Object.values(plugin.hooks).flat().flatMap((h) => h.hooks.map((x) => x.command));

test('the root is the nearest directory with .great_cto/PROJECT.md', () => {
  const d = project();
  assert.equal(projectRoot(join(d, 'backend', 'src')), d);
  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'no-proj-'))); made.push(plain);
  assert.equal(projectRoot(plain), plain, 'outside a project: where it started, as before');
});

test('every hook command starts by moving to the project root — in sh, from a subdirectory', () => {
  assert.ok(commands.length > 30);
  const bad = commands.filter((c) => !c.startsWith(ROOT_SNIPPET));
  assert.deepEqual(bad.map((c) => c.slice(0, 60)), []);
  const d = project();
  const r = spawnSync('sh', ['-c', `${ROOT_SNIPPET}pwd`], { cwd: join(d, 'backend', 'src'), encoding: 'utf8' });
  assert.equal(realpathSync(r.stdout.trim()), d);
});

test('no hook copies the plugin contracts into the project any more', () => {
  assert.equal(commands.filter((c) => /cp [^;]*shared\/(pipeline|orchestrator)\.toml/.test(c)).length, 0);
  assert.ok(commands.some((c) => c.includes('scripts/lib/state-gitignore.mjs')), 'SessionStart writes the state .gitignore instead');
});

test('a project contract counts only when marked as an override', () => {
  const d = project();
  const shared = join(d, '.plugin-shared'); mkdirSync(shared);
  writeFileSync(join(shared, 'pipeline.toml'), '# plugin\n');
  mkdirSync(join(d, 'shared'));
  writeFileSync(join(d, 'shared', 'pipeline.toml'), '# great_cto pipeline transition map\n');
  assert.equal(contractPath('pipeline.toml', { cwd: d, pluginShared: shared }), join(shared, 'pipeline.toml'), 'an unmarked copy is a leftover, not an override');
  writeFileSync(join(d, 'shared', 'pipeline.toml'), `# ${OVERRIDE_MARK}\n[transitions]\n`);
  assert.equal(contractPath('pipeline.toml', { cwd: join(d, 'backend'), pluginShared: shared }), join(d, 'shared', 'pipeline.toml'));
  rmSync(join(d, 'shared'), { recursive: true });
  assert.equal(contractPath('pipeline.toml', { cwd: d, pluginShared: shared }), join(shared, 'pipeline.toml'));
});

test('state files are ignored by git; project records are not', () => {
  const d = project();
  spawnSync('git', ['init', '-q'], { cwd: d });
  assert.equal(ensureStateGitignore(join(d, 'backend')), 'written');
  const ignored = (p) => spawnSync('git', ['check-ignore', '-q', p], { cwd: d }).status === 0;
  for (const p of ['.great_cto/.last-stop', '.great_cto/events.jsonl', '.great_cto/cost-history.log', '.great_cto/env.sh',
    '.great_cto/SKILL.md', '.great_cto/.completion-asked-senior-dev', '.great_cto/status/abc.json', '.great_cto/cache/x',
    '.great_cto/logs/session-2026-09-23-1010-end.md', '.great_cto/logs/session-2026-09-23-autocompact.md']) {
    assert.ok(ignored(p), `${p} should be ignored`);
  }
  for (const p of ['.great_cto/PROJECT.md', '.great_cto/verdicts/qa-engineer.log', '.great_cto/brain.md', '.great_cto/lessons.md',
    '.great_cto/decisions.md', '.great_cto/FLOW.md', '.great_cto/logs/session-2026-09-23-payments-refactor.md', 'shared/pipeline.toml']) {
    assert.ok(!ignored(p), `${p} is a project record and must stay in git`);
  }
});

test('the managed block is replaced in place; the project keeps its own lines; a second run changes nothing', () => {
  const merged = mergeGitignore('# ours\nscratch/\n');
  assert.match(merged, /^# ours\nscratch\/\n\n# >>> great_cto managed/);
  const stale = `# ours\n${BEGIN}\nold-pattern\n${END}\ntail/\n`;
  const again = mergeGitignore(stale);
  assert.doesNotMatch(again, /old-pattern/);
  assert.match(again, /tail\//);
  assert.equal(mergeGitignore(again), again);
  const d = project();
  ensureStateGitignore(d);
  assert.equal(ensureStateGitignore(d), 'unchanged');
});

test('outside a great_cto project nothing is written', () => {
  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'no-proj2-'))); made.push(plain);
  assert.equal(ensureStateGitignore(plain), 'not-a-project');
});
