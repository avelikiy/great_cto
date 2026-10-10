import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-skills-api-'));
const previous = { HOME: process.env.HOME, projects: process.env.GREAT_CTO_PROJECTS_FILE };
process.env.HOME = dir;
process.env.GREAT_CTO_PROJECTS_FILE = path.join(dir, '.great_cto/projects.json');
after(() => {
  if (previous.HOME === undefined) delete process.env.HOME; else process.env.HOME = previous.HOME;
  if (previous.projects === undefined) delete process.env.GREAT_CTO_PROJECTS_FILE; else process.env.GREAT_CTO_PROJECTS_FILE = previous.projects;
  fs.rmSync(dir, { recursive: true, force: true });
});
const projects = ['alpha', 'beta'].map(slug => ({ slug, name: slug, path: path.join(dir, slug) }));
fs.mkdirSync(path.join(dir, '.great_cto'));
fs.writeFileSync(process.env.GREAT_CTO_PROJECTS_FILE, JSON.stringify({ projects }));
for (const p of projects) {
  const root = path.join(p.path, '.codex/skills', p.slug);
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(p.path, '.great_cto'));
  fs.writeFileSync(path.join(p.path, '.great_cto/PROJECT.md'), `# ${p.slug}\nproject: ${p.slug}\n`);
  fs.writeFileSync(path.join(root, 'SKILL.md'), `---\nname: ${p.slug}\ndescription: This project-only skill tests isolation between selected projects.\n---\n`);
}
const { dispatch } = await import('./lib/routes.mjs');
async function request(method, query = '') {
  let status, body, headers;
  const res = { setHeader() {}, writeHead(s, h) { status = s; headers = h; }, end(s) { body = JSON.parse(s); } };
  const handled = await dispatch({ method, headers: {} }, res, new URL('http://localhost/api/skills' + query), projects[0].path);
  return { handled, status, headers, body };
}
test('API respects selected project and refuses an unknown project instead of fallback', async () => {
  for (const p of projects) {
    const r = await request('GET', '?project=' + p.slug);
    assert.equal(r.handled, true); assert.equal(r.status, 200);
    assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.deepEqual(r.body.skills.filter(s => s.scope === 'project').map(s => s.name), [p.slug]);
  }
  const missing = await request('GET', '?project=missing');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /Unknown project/);
});
test('all mutation methods are refused and path parameters do not add arbitrary roots', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await request(method);
    assert.equal(r.status, 405); assert.equal(r.headers.Allow, 'GET');
  }
  const r = await request('GET', '?project=alpha&path=/etc');
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.body).includes('/etc'));
});
test('concurrent requests share an observed snapshot rather than racing source writers', async () => {
  const a = await Promise.all(Array.from({ length: 5 }, () => request('GET', '?project=beta')));
  assert.equal(new Set(a.map(r => r.body.observed_at)).size, 1);
  assert.ok(a.every(r => r.status === 200));
});

test('project parameter cannot select arbitrary HOME roots; registered paths and server default remain readable', async () => {
  const raw = path.join(dir, 'unregistered-directory'); fs.mkdirSync(raw);
  assert.equal((await request('GET', '?project=' + encodeURIComponent(raw))).status, 404);
  assert.equal((await request('GET', '?project=' + encodeURIComponent(projects[1].path))).status, 200);
  assert.equal((await request('GET')).status, 200);
});
