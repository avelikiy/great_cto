// A project with a PROJECT.md is registered on the board without `great-cto register`.
//
// Every case points GREAT_CTO_PROJECTS_FILE at a temp registry: nothing here may touch
// ~/.great_cto/projects.json.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerProject } from '../../scripts/lib/project-registry.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) { const d = realpathSync(mkdtempSync(join(tmpdir(), prefix))); TMP.push(d); return d; }

function project(md = '# PROJECT.md\narchetype: healthcare\n') {
  const d = tmp('gcto-reg-proj-');
  mkdirSync(join(d, '.great_cto'));
  writeFileSync(join(d, '.great_cto', 'PROJECT.md'), md);
  return d;
}
function registry(content) {
  const file = join(tmp('gcto-reg-file-'), 'projects.json');
  if (content !== undefined) writeFileSync(file, content);
  return { file, env: { GREAT_CTO_PROJECTS_FILE: file } };
}
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('a new project is added with slug, archetype and path; existing entries are kept', () => {
  const d = project();
  const { file, env } = registry(JSON.stringify({ projects: [{ slug: 'old', path: '/nowhere', archetype: 'cli' }] }));
  const r = registerProject(d, { env, now: new Date('2026-09-15T00:00:00Z') });
  assert.equal(r.state, 'registered');
  const reg = read(file);
  assert.equal(reg.projects.length, 2);
  assert.deepEqual(reg.projects[0], { slug: 'old', path: '/nowhere', archetype: 'cli' });
  assert.deepEqual(reg.projects[1], {
    slug: d.split('/').pop(), archetype: 'healthcare', description: '', path: d, added_at: '2026-09-15T00:00:00.000Z',
  });
});

test('a missing registry is created', () => {
  const d = project('project: rx\nprimary: fintech\n');
  const { file, env } = registry();
  assert.equal(registerProject(d, { env }).state, 'registered');
  const [entry] = read(file).projects;
  assert.equal(entry.slug, 'rx', 'project: names the slug');
  assert.equal(entry.archetype, 'fintech', 'primary: stands in when archetype: is absent');
});

test('registering twice writes once', () => {
  const d = project();
  const { file, env } = registry();
  assert.equal(registerProject(d, { env }).state, 'registered');
  const before = readFileSync(file, 'utf8');
  assert.equal(registerProject(d, { env }).state, 'already');
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('a directory without PROJECT.md is not a project', () => {
  const { file, env } = registry();
  assert.equal(registerProject(tmp('gcto-reg-empty-'), { env }).state, 'none');
  assert.equal(existsSync(file), false);
});

test('an unreadable registry is refused, never overwritten', () => {
  const d = project();
  for (const bad of ['{ not json', '[]', '{"projects": 3}']) {
    const { file, env } = registry(bad);
    const r = registerProject(d, { env });
    assert.equal(r.state, 'refused', `${bad}: ${JSON.stringify(r)}`);
    assert.equal(readFileSync(file, 'utf8'), bad, `${bad}: the registry must be left as it was`);
  }
});

test('switched off with GREAT_CTO_NO_AUTO_REGISTER=1', () => {
  const d = project();
  const { file, env } = registry();
  assert.equal(registerProject(d, { env: { ...env, GREAT_CTO_NO_AUTO_REGISTER: '1' } }).state, 'skipped');
  assert.equal(existsSync(file), false);
});

test('scratch locations never reach the default registry', () => {
  // No GREAT_CTO_PROJECTS_FILE: the default (real) registry would be the target, so a
  // temp-dir project must be skipped before anything is read or written.
  const d = project();
  const r = registerProject(d, { env: {} });
  assert.equal(r.state, 'skipped');
  assert.equal(r.reason, 'temporary directory');
});
