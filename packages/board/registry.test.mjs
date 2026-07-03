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
