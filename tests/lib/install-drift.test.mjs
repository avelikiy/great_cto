// You edited the plugin. The session is reading the old one.
//
// great_cto is developed from source but LOADED from a versioned cache
// (~/.claude/plugins/cache/local/great_cto/<version>/), populated by rsync. So an
// edit to agents/ or shared/ does not change what a running session reads until
// `scripts/install-local.sh` runs. Nothing said so.
//
// Measured on 2026-08-31, after a week of contract work: installed 3.16.0 against
// a repo at 3.18.0, ARCHETYPES.md 30 lines apart, and ELEVEN of 69 agents
// diverged — exactly the eleven edited that week. Every one of those changes was
// invisible to the session that was making them. The board knew (it reports
// `"installed":"3.16.0","stale":"ahead"`); the session did not say it.
//
// This only matters when the repository IS the plugin. In someone else's project
// the installed plugin is the source of truth and there is nothing to warn about
// — a warning there would be noise, and noise is how a warning stops being read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installDrift } from '../../scripts/lib/install-drift.mjs';

function repo(version, files = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-repo-'));
  fs.mkdirSync(path.join(d, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(d, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'great_cto', version }));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(d, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), body);
  }
  return d;
}

function cache(version, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-cache-'));
  const d = path.join(root, version);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(d, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), body);
  }
  fs.mkdirSync(d, { recursive: true });
  return root;
}

test('a project that is not the plugin is never warned', () => {
  const notPlugin = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-other-'));
  const r = installDrift(notPlugin, { cacheRoot: cache('3.18.0') });
  assert.equal(r.state, 'not-applicable',
    'in someone else\'s project the installed plugin IS the truth — a warning there is noise');
});

test('matching versions and matching files say so', () => {
  const files = { 'agents/architect.md': 'a', 'shared/pipeline.toml': 'b' };
  const r = installDrift(repo('3.18.0', files), { cacheRoot: cache('3.18.0', files) });
  assert.equal(r.state, 'match');
  assert.deepEqual(r.files, []);
});

test('a repo ahead of the install names the version gap and the files', () => {
  const r = installDrift(
    repo('3.18.0', { 'agents/architect.md': 'new', 'agents/pm.md': 'same' }),
    { cacheRoot: cache('3.16.0', { 'agents/architect.md': 'old', 'agents/pm.md': 'same' }) });
  assert.equal(r.state, 'ahead');
  assert.equal(r.repo, '3.18.0');
  assert.equal(r.installed, '3.16.0');
  assert.deepEqual(r.files, ['agents/architect.md'], 'only what actually differs');
});

test('same version, different bytes, is still drift', () => {
  // The common case while developing: you edit without bumping. A version check
  // alone would report "match" over eleven changed agents, which is the reassuring
  // answer and the wrong one.
  const r = installDrift(
    repo('3.18.0', { 'agents/architect.md': 'edited' }),
    { cacheRoot: cache('3.18.0', { 'agents/architect.md': 'original' }) });
  assert.equal(r.state, 'ahead');
  assert.deepEqual(r.files, ['agents/architect.md']);
});

test('no cache at all is unknown, not match', () => {
  const r = installDrift(repo('3.18.0'), { cacheRoot: path.join(os.tmpdir(), 'drift-absent-xyz') });
  assert.equal(r.state, 'unknown',
    'a comparison nobody could make is not a comparison that passed');
});

test('the sentence names the fix, not just the problem', () => {
  const r = installDrift(
    repo('3.18.0', { 'agents/architect.md': 'new' }),
    { cacheRoot: cache('3.16.0', { 'agents/architect.md': 'old' }) });
  assert.match(r.sentence, /install-local\.sh/, 'a warning without a command is a complaint');
  assert.match(r.sentence, /3\.16\.0/);
  assert.match(r.sentence, /1 file/);
});

test('the sentence is grammatical, and says the right thing when versions match', () => {
  const one = installDrift(
    repo('3.18.0', { 'agents/a.md': 'new' }),
    { cacheRoot: cache('3.18.0', { 'agents/a.md': 'old' }) });
  assert.match(one.sentence, /1 file differs/, 'one file differs; it does not "differ"');
  assert.doesNotMatch(one.sentence, /3\.18\.0.*3\.18\.0/,
    'repeating the same version twice reads as a contradiction — say it was never reinstalled');

  const many = installDrift(
    repo('3.18.0', { 'agents/a.md': 'x', 'agents/b.md': 'y' }),
    { cacheRoot: cache('3.16.0', { 'agents/a.md': 'p', 'agents/b.md': 'q' }) });
  assert.match(many.sentence, /2 files differ/);
  assert.match(many.sentence, /3\.16\.0/, 'a version gap is named when there is one');
});
