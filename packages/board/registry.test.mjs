// Tests for great_cto-7xfc: duplicate slugs in the project registry resolve
// to a dead path, so the board shows 0 tasks while data exists.
//
// Test seam: lib/config.mjs reads PROJECTS_FILE from GREAT_CTO_PROJECTS_FILE
// when set, so we point it at a tmp fixture instead of the real
// ~/.great_cto/projects.json. Must be set BEFORE importing lib/projects.mjs
// (config.mjs resolves PROJECTS_FILE at module-eval time).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-registry-test-'));
const projectsFile = path.join(tmpDir, 'projects.json');
process.env.GREAT_CTO_PROJECTS_FILE = projectsFile;

const {
  readProjectsRegistry,
  writeProjectsRegistry,
  pickBestBySlug,
  dedupeProjects,
  autoRegisterProject,
  resolveProjectCwd,
  resolveProjectInfo,
  listProjects,
} = await import('./lib/projects.mjs');

function makeRealDir(name) {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function writeProjectMd(dir, slug, archetype = 'cli-tool') {
  const gDir = path.join(dir, '.great_cto');
  fs.mkdirSync(gDir, { recursive: true });
  fs.writeFileSync(
    path.join(gDir, 'PROJECT.md'),
    `project: ${slug}\narchetype: ${archetype}\ndescription: test\n`,
  );
}

test.afterEach(() => {
  // Reset the registry file between tests.
  try { fs.rmSync(projectsFile, { force: true }); } catch {}
});

test('pickBestBySlug prefers the entry whose path exists on disk', () => {
  const realDir = makeRealDir('real-proj');
  const deadDir = path.join(tmpDir, 'this-path-does-not-exist');
  const candidates = [
    { slug: 'great_cto', path: deadDir, added_at: '2026-01-01T00:00:00.000Z' },
    { slug: 'great_cto', path: realDir, added_at: '2025-06-01T00:00:00.000Z' },
  ];
  const best = pickBestBySlug(candidates);
  assert.equal(best.path, realDir);
});

test('pickBestBySlug prefers most-recent added_at among several existing paths', () => {
  const dirA = makeRealDir('proj-a');
  const dirB = makeRealDir('proj-b');
  const candidates = [
    { slug: 's', path: dirA, added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 's', path: dirB, added_at: '2026-01-01T00:00:00.000Z' },
  ];
  const best = pickBestBySlug(candidates);
  assert.equal(best.path, dirB);
});

test('pickBestBySlug prefers most-recent added_at among several missing paths', () => {
  const deadA = path.join(tmpDir, 'dead-a');
  const deadB = path.join(tmpDir, 'dead-b');
  const candidates = [
    { slug: 's', path: deadA, added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 's', path: deadB, added_at: '2026-01-01T00:00:00.000Z' },
  ];
  const best = pickBestBySlug(candidates);
  assert.equal(best.path, deadB);
});

test('dedupeProjects collapses duplicate slugs keeping the existing-path entry', () => {
  const realDir = makeRealDir('dedupe-real');
  const deadDir = path.join(tmpDir, 'dedupe-dead');
  const projects = [
    { slug: 'great_cto', path: deadDir, added_at: '2026-01-01T00:00:00.000Z' },
    { slug: 'great_cto', path: realDir, added_at: '2025-06-01T00:00:00.000Z' },
    { slug: 'other', path: realDir, added_at: '2025-01-01T00:00:00.000Z' },
  ];
  const out = dedupeProjects(projects);
  assert.equal(out.length, 2);
  const gcto = out.find(p => p.slug === 'great_cto');
  assert.equal(gcto.path, realDir);
});

test('writeProjectsRegistry dedupes on write (registry self-heals)', () => {
  const realDir = makeRealDir('write-real');
  const deadDir = path.join(tmpDir, 'write-dead');
  writeProjectsRegistry({
    projects: [
      { slug: 'great_cto', path: deadDir, added_at: '2026-01-01T00:00:00.000Z' },
      { slug: 'great_cto', path: realDir, added_at: '2025-06-01T00:00:00.000Z' },
    ],
  });
  const reg = readProjectsRegistry();
  assert.equal(reg.projects.length, 1);
  assert.equal(reg.projects[0].path, realDir);
});

test('resolveProjectCwd never returns a dead path when an existing match is available', () => {
  const realDir = makeRealDir('resolve-real');
  const deadDir = path.join(tmpDir, 'resolve-dead');
  writeProjectsRegistry({
    projects: [
      { slug: 'great_cto', path: deadDir, added_at: '2026-02-01T00:00:00.000Z' },
      { slug: 'great_cto', path: realDir, added_at: '2025-01-01T00:00:00.000Z' },
    ],
  });
  // writeProjectsRegistry already dedupes, so re-inject the dupe directly to
  // simulate a pre-existing corrupted file (bypass the self-healing write).
  fs.writeFileSync(projectsFile, JSON.stringify({
    projects: [
      { slug: 'great_cto', path: deadDir, added_at: '2026-02-01T00:00:00.000Z' },
      { slug: 'great_cto', path: realDir, added_at: '2025-01-01T00:00:00.000Z' },
    ],
  }, null, 2));
  assert.equal(resolveProjectCwd('great_cto'), realDir);
  const info = resolveProjectInfo('great_cto');
  assert.equal(info.cwd, realDir);
  assert.equal(info.resolved, 'slug');
});

test('autoRegisterProject updates the existing entry in place when a repo moves (no duplicate insert)', () => {
  const oldDir = makeRealDir('move-old');
  const newDir = makeRealDir('move-new');
  writeProjectMd(oldDir, 'moveable-proj');
  writeProjectMd(newDir, 'moveable-proj');

  // Register at the old location first.
  autoRegisterProject(oldDir);
  let reg = readProjectsRegistry();
  assert.equal(reg.projects.filter(p => p.slug === 'moveable-proj').length, 1);
  assert.equal(reg.projects.find(p => p.slug === 'moveable-proj').path, oldDir);

  // "Move" the repo: register the same slug at a new path.
  autoRegisterProject(newDir);
  reg = readProjectsRegistry();
  const matches = reg.projects.filter(p => p.slug === 'moveable-proj');
  assert.equal(matches.length, 1, 'must update in place, not insert a second entry');
  assert.equal(matches[0].path, newDir);
});

// ── HOME-boundary guard (great_cto-qvg9) ────────────────────────────────────
// resolveProjectCwd / resolveProjectInfo previously used a raw absolute or
// `~` path verbatim with no containment check, so `?project=/etc` (or any
// path outside the operator's home directory) would make the board read
// project data from an arbitrary filesystem location. Both functions now
// enforce the same HOME-boundary policy /api/projects/register already used
// (lib/routes.mjs): a raw path must resolve inside os.homedir(), or the
// server falls back to process.cwd() — same fallback already used for an
// unknown slug.
//
// tmpDir (from os.tmpdir()) is outside HOME on every CI/dev machine we
// target (macOS: /private/var/folders/... vs /Users/...; Linux: /tmp vs
// /home/...), so reusing it here gives a real out-of-HOME path without any
// extra fixture setup.
test('resolveProjectCwd falls back to process.cwd() for an absolute path outside HOME', () => {
  const home = os.homedir();
  assert.ok(!tmpDir.startsWith(home + path.sep) && tmpDir !== home, 'test fixture must live outside HOME for this test to be meaningful');
  const outside = path.join(tmpDir, 'outside-home-target');
  fs.mkdirSync(outside, { recursive: true });
  assert.equal(resolveProjectCwd(outside), process.cwd());
});

test('resolveProjectCwd honors an absolute path that resolves inside HOME', () => {
  const home = os.homedir();
  // Use HOME itself — always inside-HOME by definition, and doesn't require
  // creating a fixture under the real ~ (which the test must not touch).
  assert.equal(resolveProjectCwd(home), home);
});

test('resolveProjectCwd falls back to process.cwd() for a ~-relative path outside HOME', () => {
  // ~ always expands to os.homedir() itself, so it can never be "outside
  // HOME" — this documents that invariant rather than testing a rejection.
  assert.equal(resolveProjectCwd('~'), os.homedir());
});

test('resolveProjectInfo marks an out-of-HOME absolute path as fallback, not path', () => {
  const outside = path.join(tmpDir, 'outside-home-info');
  fs.mkdirSync(outside, { recursive: true });
  const info = resolveProjectInfo(outside);
  assert.equal(info.cwd, process.cwd());
  assert.equal(info.resolved, 'fallback');
  assert.equal(info.requested, outside);
});

test('resolveProjectInfo marks an in-HOME absolute path as path (unchanged behavior)', () => {
  const home = os.homedir();
  const info = resolveProjectInfo(home);
  assert.equal(info.cwd, home);
  assert.equal(info.resolved, 'path');
});

test('resolveProjectCwd still resolves registry slugs normally (HOME-boundary does not affect slug lookups)', () => {
  // Registry entries are validated at registration time (register enforces
  // the HOME boundary before writing), so slug resolution must be completely
  // unaffected by this change — including a slug whose registered path
  // happens to live outside HOME (e.g. a pre-existing/legacy registry entry
  // from before this guard existed), which must still resolve normally.
  const legacyDir = makeRealDir('legacy-outside-home-proj');
  writeProjectsRegistry({
    projects: [{ slug: 'legacy-proj', path: legacyDir, added_at: '2025-01-01T00:00:00.000Z' }],
  });
  assert.equal(resolveProjectCwd('legacy-proj'), legacyDir);
  const info = resolveProjectInfo('legacy-proj');
  assert.equal(info.cwd, legacyDir);
  assert.equal(info.resolved, 'slug');
});

test('listProjects hides $HOME, dead (no marker), keeps live projects', () => {
  // live: has PROJECT.md
  const live = makeRealDir('live-proj');
  writeProjectMd(live, 'live-proj');
  // dead: dir exists but .great_cto is empty (no PROJECT.md / tasks.md / .beads)
  const dead = makeRealDir('dead-proj');
  fs.mkdirSync(path.join(dead, '.great_cto'), { recursive: true });
  // tasksmd: no PROJECT.md but a tasks.md fallback → must still show
  const tmd = makeRealDir('tasksmd-proj');
  fs.mkdirSync(path.join(tmd, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(tmd, '.great_cto', 'tasks.md'), '# Tasks\n');

  writeProjectsRegistry({ projects: [
    { slug: 'live-proj', path: live, added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 'dead-proj', path: dead, added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 'tasksmd-proj', path: tmd, added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 'home-junk', path: os.homedir(), added_at: '2025-01-01T00:00:00.000Z' },
    { slug: 'gone-proj', path: path.join(tmpDir, 'never-existed'), added_at: '2025-01-01T00:00:00.000Z' },
  ] });

  const slugs = listProjects().map(p => p.slug);
  assert.ok(slugs.includes('live-proj'), 'live project shown');
  assert.ok(slugs.includes('tasksmd-proj'), 'tasks.md-backed project shown');
  assert.ok(!slugs.includes('dead-proj'), 'empty .great_cto hidden');
  assert.ok(!slugs.includes('home-junk'), '$HOME (global config dir) hidden');
  assert.ok(!slugs.includes('gone-proj'), 'non-existent path hidden');
});
