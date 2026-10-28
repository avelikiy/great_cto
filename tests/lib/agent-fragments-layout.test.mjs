// Shared prompt fragments are not agents, so they do not live under agents/.
//
// `claude plugin validate` treats every .md under agents/ — at any depth — as an
// agent definition. The 17 contracts that sat in a `_shared/` subdirectory of agents/
// (verdict format, phase task, work-fast, ...) have no frontmatter by design, so the validator
// reported 17 "No frontmatter block found" warnings on every run, and a plugin
// scan without an explicit `agents` list registered them as agents.
//
// They live in shared/agent-fragments/ now. `shared/` is already a runtime
// directory of the plugin (pipeline.toml, orchestrator.toml), so both the git
// marketplace checkout and the versioned cache copy carry it.
//
// This file pins the layout and the one thing a move can silently break: an
// installed agent that still points at a fragment nobody inlined.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { syncManaged } from '../../scripts/lib/sync-managed.mjs';
import { isInstallFile } from '../../scripts/lib/local-install-cache.mjs';
import { isPluginRuntimePath } from '../../scripts/build-release-artifacts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRAGMENTS = join(ROOT, 'shared', 'agent-fragments');
// The retired directory, spelled in pieces so this file does not match its own scan.
const RETIRED = ['agents', '_shared'].join('/');

const topLevelAgents = () => readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('agents/ holds agents only: no subdirectory, every markdown file has frontmatter with a name', () => {
  const all = walk(join(ROOT, 'agents')).map((p) => relative(ROOT, p));
  const nested = all.filter((p) => p.split('/').length > 2);
  assert.deepEqual(nested, [], 'a nested file under agents/ is validated as an agent');
  const bad = all.filter((p) => {
    const fm = readFileSync(join(ROOT, p), 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
    return !(fm && /^name:\s*\S+/m.test(fm[1]));
  });
  assert.deepEqual(bad, [], 'a markdown file under agents/ without frontmatter is what claude plugin validate warns about');
});

test('the fragments live in shared/agent-fragments/', () => {
  assert.ok(existsSync(FRAGMENTS), 'shared/agent-fragments/ is missing');
  const md = readdirSync(FRAGMENTS).filter((f) => f.endsWith('.md'));
  for (const f of ['verdict-format.md', 'phase-task.md', 'work-fast.md', 'untrusted-content.md', 'task-brief.md']) {
    assert.ok(md.includes(f), `${f} is not in shared/agent-fragments/`);
  }
  assert.ok(existsSync(join(FRAGMENTS, 'prose-deny.txt')), 'the prose deny-list moves with the fragments');
});

// Both ways the plugin reaches a user — the local cache (tracked files through isInstallFile)
// and the published runtime artifact (isPluginRuntimePath) — must carry every fragment,
// the .txt deny-list included, or the move would ship agents whose pointers resolve to nothing.
test('the local cache and the runtime artifact both admit every file in shared/agent-fragments/', () => {
  const files = readdirSync(FRAGMENTS).map((f) => `shared/agent-fragments/${f}`);
  assert.ok(files.length >= 18, 'seventeen fragments and the deny-list');
  assert.deepEqual(files.filter((f) => !isInstallFile(f)), [], 'local cache would drop these');
  assert.deepEqual(files.filter((f) => !isPluginRuntimePath(f)), [], 'runtime artifact would drop these');
});

test('every fragment pointer in an agent source resolves to a file there', () => {
  const dangling = [];
  for (const f of topLevelAgents()) {
    const text = readFileSync(join(ROOT, 'agents', f), 'utf8');
    for (const m of text.matchAll(/shared\/agent-fragments\/([a-z0-9-]+\.md)/g)) {
      if (!existsSync(join(FRAGMENTS, m[1]))) dangling.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(dangling, []);
});

test('no tracked file outside the changelog and historical plans names the retired directory', () => {
  const ls = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(ls.status, 0, `git ls-files failed: ${ls.stderr}`);
  const hits = ls.stdout.split('\0').filter(Boolean)
    .filter((p) => p !== 'CHANGELOG.md' && !p.startsWith('docs/plans/'))
    .filter((p) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile())
    .filter((p) => readFileSync(join(ROOT, p)).includes(RETIRED));
  assert.deepEqual(hits, [], 'these still point at the old fragment directory');
});

// The runtime half: SessionStart runs sync-managed against the installed plugin
// directory. Every fragment an installed agent points at must have been inlined, or
// the agent runs in a project where that relative path does not exist.
test('syncing the real plugin dir installs every agent with every fragment pointer inlined', () => {
  const home = mkdtempSync(join(tmpdir(), 'gcto-fragments-'));
  try {
    const r = syncManaged({ pluginDir: ROOT, home });
    assert.equal(r.agents.state, 'synced');
    const installed = readdirSync(join(home, '.claude', 'agents')).filter((f) => f.endsWith('.md'));
    assert.equal(installed.length, topLevelAgents().length, 'one installed copy per agent');
    const unresolved = [];
    for (const f of installed) {
      const text = readFileSync(join(home, '.claude', 'agents', f), 'utf8');
      assert.ok(!text.includes(RETIRED), `${f} still names the retired directory`);
      for (const file of new Set([...text.matchAll(/shared\/agent-fragments\/([a-z0-9-]+\.md)/g)].map((m) => m[1]))) {
        if (!text.includes(`<<< BEGIN shared/agent-fragments/${file} >>>`)) unresolved.push(`${f}: ${file}`);
      }
    }
    assert.deepEqual(unresolved, [], 'a pointer that was not inlined resolves to nothing in a user project');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
