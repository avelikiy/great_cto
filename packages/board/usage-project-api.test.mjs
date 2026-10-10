import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-api-'));
const previousHome = process.env.HOME;
process.env.HOME = fixture;
process.env.GREAT_CTO_PROJECTS_FILE = path.join(fixture, '.great_cto', 'projects.json');
after(() => {
  process.env.HOME = previousHome;
  fs.rmSync(fixture, { recursive: true, force: true });
});
// Two registered projects share one Git database: workers must retain their
// subdirectory scopes rather than treating the entire monorepo as one project.
const monorepo = path.join(fixture, 'monorepo');
fs.mkdirSync(path.join(monorepo, '.git'), { recursive: true });
const projects = ['alpha', 'beta'].map(slug => ({ slug, name: slug, path: path.join(monorepo, 'apps', slug) }));
const ts = new Date().toISOString();
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
fs.mkdirSync(path.join(fixture, '.great_cto'));
fs.writeFileSync(process.env.GREAT_CTO_PROJECTS_FILE, JSON.stringify({ projects }));
for (const [i, p] of projects.entries()) {
  fs.mkdirSync(path.join(p.path, '.great_cto', 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(p.path, '.great_cto', 'PROJECT.md'), `# ${p.slug}\nproject: ${p.slug}\n`);
  fs.writeFileSync(path.join(p.path, '.great_cto', 'verdicts', 'senior-dev.log'), jsonl([
    { v: 1, ts, agent: 'senior-dev', verdict: i ? 'FAIL' : 'PASS' },
    { v: 1, ts, agent: 'senior-dev', verdict: i ? 'PASS' : 'FAIL', project: i ? 'alpha' : 'beta' },
  ]));
  const claude = path.join(fixture, '.claude', 'projects', p.slug);
  fs.mkdirSync(claude, { recursive: true });
  fs.writeFileSync(path.join(claude, `${p.slug}.jsonl`), jsonl([{ type: 'assistant', timestamp: ts, cwd: p.path, message: {
    id: p.slug, model: 'claude-opus-5', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: (i + 1) * 10, output_tokens: 1 },
  } }]));
  const codex = path.join(fixture, '.codex', 'sessions'); fs.mkdirSync(codex, { recursive: true });
  fs.writeFileSync(path.join(codex, `${p.slug}.jsonl`), jsonl([
    { type: 'session_meta', payload: { id: p.slug, cwd: p.path } },
    { type: 'turn_context', payload: { model: 'codex-fixture' } },
    { type: 'token_usage_record', timestamp: ts, payload: { response_id: p.slug, usage: { input_tokens: (i + 1) * 100, output_tokens: 1 } } },
  ]));
}
const { dispatch } = await import('./lib/routes.mjs');
async function get(endpoint, project) {
  const url = new URL(`http://localhost${endpoint}?days=7${project ? `&project=${encodeURIComponent(project)}` : ''}`);
  let status, body;
  const res = { setHeader() {}, writeHead(s) { status = s; }, end(s) { body = JSON.parse(s); } };
  await dispatch({ method: 'GET', headers: {} }, res, url, projects[0].path);
  return { status, body };
}
async function counted(endpoint, project) {
  const deadline = Date.now() + 10000;
  for (;;) {
    const r = await get(endpoint, project);
    if (r.body.state !== 'computing') return r;
    assert.ok(Date.now() < deadline, 'background statistics must finish');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('actual worker/API isolates both hosts and cache between two selected projects', async () => {
  for (const [i, p] of projects.entries()) {
    const { status, body } = await counted('/api/usage', p.slug);
    assert.equal(status, 200);
    assert.equal(body.scope.path, fs.realpathSync(p.path));
    assert.equal(body.hosts.claude.tokens, (i + 1) * 10 + 1);
    assert.equal(body.hosts.codex.tokens, (i + 1) * 100 + 1);
    assert.equal(body.files, 2);
    assert.deepEqual(body.top.claude.map(c => c.project), [p.slug]);
    const outcomes = (await counted('/api/outcomes', p.slug)).body;
    assert.equal(outcomes.projects, 1);
    assert.equal(outcomes.agents.agents[0][i ? 'failed' : 'pass'], 1);
    assert.equal(outcomes.agents.agents[0].runs, 1, 'foreign tags in local logs cannot override project attribution');
  }
  assert.equal((await counted('/api/usage', 'alpha')).body.hosts.claude.tokens, 11);
  assert.equal((await counted('/api/usage')).body.hosts.codex.tokens, 101, 'default is server project, not machine-wide');
});

test('unknown selected projects fail closed, never return default/global statistics', async () => {
  for (const endpoint of ['/api/usage', '/api/outcomes']) {
    const r = await get(endpoint, 'unknown-fixture');
    assert.equal(r.status, 404);
    assert.equal(r.body.state, 'unavailable');
    assert.equal(r.body.hosts, undefined);
  }
});

test('writer tags survive display-name, slug and absolute-path selection without foreign verdicts', async () => {
  const p = { slug: 'registered-label', path: path.join(fixture, 'checkout-directory') };
  fs.mkdirSync(path.join(p.path, '.great_cto', 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(p.path, '.great_cto', 'PROJECT.md'), 'project: display-label\nname: alternate-label\nslug: receipt-label\n');
  fs.writeFileSync(process.env.GREAT_CTO_PROJECTS_FILE, JSON.stringify({ projects: [...projects, p] }));
  execFileSync('bash', [path.resolve('scripts/log-verdict.sh'), 'senior-dev', 'PASS', '0.50'], { cwd: p.path, env: process.env, stdio: 'pipe' });
  fs.appendFileSync(path.join(p.path, '.great_cto', 'verdicts', 'senior-dev.log'), jsonl([
    { v: 1, ts, agent: 'senior-dev', verdict: 'PASS', project: 'checkout-directory' },
    { v: 1, ts, agent: 'senior-dev', verdict: 'FAIL', project: 'beta' },
  ]));
  for (const selected of [p.slug, 'display-label', p.path]) {
    const r = await counted('/api/outcomes', selected);
    assert.equal(r.status, 200);
    assert.equal(r.body.agents.agents[0].runs, 2);
    assert.equal(r.body.agents.agents[0].failed, 0);
  }
});

test('unregistered HOME roots cannot trigger scoped statistics reads', async () => {
  const raw = path.join(fixture, 'unregistered-directory');
  fs.mkdirSync(raw);
  for (const endpoint of ['/api/usage', '/api/outcomes']) {
    assert.equal((await get(endpoint, raw)).status, 404);
  }
});
