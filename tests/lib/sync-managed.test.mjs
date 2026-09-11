// What great_cto puts into ~/.claude/agents and ~/.claude/commands, and what it
// is allowed to take out.
//
// SessionStart pruned every managed file whose source was "absent" under
// ${PLUGIN_DIR}. On 2026-09-11 install-local --prune deleted the version
// directory six open sessions were still pointing at; the next SessionStart in
// them found every source absent and deleted 38 of 44 commands and all 70
// agents, then "restored" them by copying from the directory that no longer
// existed. The copy half also named 55 agents by hand, so the 15 newest never
// reached ~/.claude/agents through a session start at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncManaged, MARKER } from '../../scripts/lib/sync-managed.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/lib/sync-managed.mjs');

function world({ agents = ['architect', 'senior-dev', 'mobile-app-builder'], commands = ['start', 'inbox'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sync-managed-'));
  const plugin = join(root, 'plugin');
  const home = join(root, 'home');
  mkdirSync(join(plugin, 'agents', '_shared'), { recursive: true });
  mkdirSync(join(plugin, 'commands'), { recursive: true });
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true });
  mkdirSync(join(home, '.claude', 'commands'), { recursive: true });
  for (const a of agents) writeFileSync(join(plugin, 'agents', `${a}.md`), `---\nname: ${a}\n---\n`);
  writeFileSync(join(plugin, 'agents', '_partial.md'), 'shared fragment, not an agent\n');
  for (const c of commands) writeFileSync(join(plugin, 'commands', `${c}.md`), `# /${c}\n`);
  return { root, plugin, home, A: join(home, '.claude', 'agents'), C: join(home, '.claude', 'commands') };
}
const managed = (text) => `${text}\n${MARKER}\n`;
const ls = (dir) => readdirSync(dir).sort();

test('a plugin directory that does not exist deletes nothing', () => {
  const w = world();
  writeFileSync(join(w.A, 'great_cto-architect.md'), managed('installed'));
  writeFileSync(join(w.C, 'start.md'), managed('installed'));
  const r = syncManaged({ pluginDir: join(w.root, 'deleted-version'), home: w.home });
  assert.equal(r.agents.state, 'skipped');
  assert.equal(r.commands.state, 'skipped');
  assert.deepEqual(ls(w.A), ['great_cto-architect.md']);
  assert.deepEqual(ls(w.C), ['start.md']);
});

test('a plugin without an agents directory, or with an empty one, prunes no agent', () => {
  for (const shape of ['missing', 'empty']) {
    const w = world({ agents: [] });
    if (shape === 'missing') spawnSync('rm', ['-rf', join(w.plugin, 'agents')]);
    writeFileSync(join(w.A, 'great_cto-architect.md'), managed('installed'));
    const r = syncManaged({ pluginDir: w.plugin, home: w.home });
    assert.equal(r.agents.state, 'skipped', shape);
    assert.deepEqual(ls(w.A), ['great_cto-architect.md'], `${shape}: an installed agent was deleted`);
  }
});

test('every agent the plugin ships is installed — not a hand-kept list — and partials are not agents', () => {
  const w = world();
  const r = syncManaged({ pluginDir: w.plugin, home: w.home });
  assert.equal(r.agents.state, 'synced');
  assert.deepEqual(ls(w.A), ['great_cto-architect.md', 'great_cto-mobile-app-builder.md', 'great_cto-senior-dev.md']);
  assert.equal(r.agents.copied, 3);
  const text = readFileSync(join(w.A, 'great_cto-mobile-app-builder.md'), 'utf8');
  assert.equal(text.split(MARKER).length - 1, 1, 'marked exactly once');
});

test('a managed agent whose source was retired is removed; files great_cto did not write are not', () => {
  const w = world();
  writeFileSync(join(w.A, 'great_cto-retired.md'), managed('old agent'));
  writeFileSync(join(w.A, 'great_cto-mine.md'), 'written by the user, no marker\n');
  writeFileSync(join(w.A, 'my-agent.md'), managed('not ours by name'));
  const r = syncManaged({ pluginDir: w.plugin, home: w.home });
  assert.equal(r.agents.pruned, 1);
  assert.ok(!existsSync(join(w.A, 'great_cto-retired.md')));
  assert.ok(existsSync(join(w.A, 'great_cto-mine.md')));
  assert.ok(existsSync(join(w.A, 'my-agent.md')));
});

test('every command is installed, a user command of the same name is kept, a retired one is removed', () => {
  const w = world({ commands: ['start', 'inbox', 'review'] });
  writeFileSync(join(w.C, 'review.md'), 'my own /review\n');
  writeFileSync(join(w.C, 'digest-old.md'), managed('retired command'));
  const r = syncManaged({ pluginDir: w.plugin, home: w.home });
  assert.equal(r.commands.state, 'synced');
  assert.equal(readFileSync(join(w.C, 'review.md'), 'utf8'), 'my own /review\n', 'a user command was overwritten');
  assert.ok(existsSync(join(w.C, 'start.md')) && existsSync(join(w.C, 'inbox.md')));
  assert.ok(!existsSync(join(w.C, 'digest-old.md')));
  assert.equal(r.commands.kept, 1);
});

test('a second run changes nothing', () => {
  const w = world();
  syncManaged({ pluginDir: w.plugin, home: w.home });
  const before = ls(w.A).map((f) => readFileSync(join(w.A, f), 'utf8'));
  const r = syncManaged({ pluginDir: w.plugin, home: w.home });
  assert.equal(r.agents.pruned, 0);
  assert.deepEqual(ls(w.A).map((f) => readFileSync(join(w.A, f), 'utf8')), before);
});

test('the CLI against a deleted plugin directory exits 0 and deletes nothing', () => {
  const w = world();
  writeFileSync(join(w.A, 'great_cto-architect.md'), managed('installed'));
  const r = spawnSync(process.execPath, [CLI, '--plugin-dir', join(w.root, 'gone')],
    { encoding: 'utf8', env: { ...process.env, HOME: w.home } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(ls(w.A), ['great_cto-architect.md']);
});

test('an unmarked copy identical to the plugin file is ours, and gets updated and marked', () => {
  // commands/learn.md mentions "great_cto-managed" in prose; the old loop's
  // substring grep took that for the marker, so the installed copy never had one.
  const w = world({ commands: ['learn'] });
  const src = '# /learn\n# Must be in a great_cto-managed project\n';
  writeFileSync(join(w.plugin, 'commands', 'learn.md'), src);
  writeFileSync(join(w.C, 'learn.md'), src);
  const r = syncManaged({ pluginDir: w.plugin, home: w.home });
  assert.equal(r.commands.kept, 0, 'an exact copy of our own file was treated as the user\'s');
  assert.ok(readFileSync(join(w.C, 'learn.md'), 'utf8').includes(MARKER));
});
