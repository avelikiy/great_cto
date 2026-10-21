import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-knowledge-'));
const oldRegistry = process.env.GREAT_CTO_PROJECTS_FILE;
const oldHome = process.env.HOME;
process.env.HOME = fixture;
process.env.GREAT_CTO_PROJECTS_FILE = path.join(fixture, 'projects.json');
const projects = ['alpha', 'beta'].map(slug => ({ slug, path: path.join(fixture, slug) }));
for (const p of projects) {
  fs.mkdirSync(p.path);
  fs.writeFileSync(path.join(p.path, 'README.md'), `# ${p.slug}\n${p.slug} unique content`);
}
fs.writeFileSync(process.env.GREAT_CTO_PROJECTS_FILE, JSON.stringify({ projects }));
after(() => {
  if (oldRegistry === undefined) delete process.env.GREAT_CTO_PROJECTS_FILE;
  else process.env.GREAT_CTO_PROJECTS_FILE = oldRegistry;
  if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
  fs.rmSync(fixture, { recursive: true, force: true });
});
const { dispatch } = await import('./lib/routes.mjs');
const { listDocs, readProjectFile, declaredStatus, MAX_DOC_BYTES } = await import('./lib/docs.mjs');
const write = (root, rel, text) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text);
  return abs;
};
function tree(t) {
  const root = fs.mkdtempSync(path.join(fixture, 'tree-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
async function get(endpoint, params = {}, cwd = projects[0].path) {
  let status, body, headers;
  const res = { setHeader() {}, writeHead(s, h) { status = s; headers = h; }, end(s) { body = JSON.parse(s); } };
  await dispatch({ method: 'GET', headers: {} }, res,
    new URL(`http://localhost${endpoint}?${new URLSearchParams(params)}`), cwd);
  return { status, body, headers };
}

test('Knowledge endpoints reject unknown and unregistered project selection', async t => {
  const unregistered = tree(t);
  write(unregistered, 'README.md', '# PRIVATE OUTSIDE');
  for (const endpoint of ['/api/docs', '/api/doc', '/api/docs/search']) {
    for (const project of ['missing-project', unregistered]) {
      const r = await get(endpoint, { project, path: 'README.md', q: 'PRIVATE' });
      assert.equal(r.status, 404, `${endpoint}: ${project}`);
      assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));
      assert.ok(!JSON.stringify(r.body).includes(unregistered));
    }
  }
});

test('registered project and server default remain isolated', async () => {
  for (const p of projects) {
    for (const selected of [p.slug, p.path]) {
      const r = await get('/api/doc', { project: selected, path: 'README.md' });
      assert.equal(r.status, 200); assert.match(r.body.content, new RegExp(p.slug));
      assert.equal(r.headers['Cache-Control'], 'no-store');
    }
  }
  const r = await get('/api/doc', { path: 'README.md' });
  assert.equal(r.status, 200); assert.match(r.body.content, /alpha/);
});

test('listing never follows a docs-root, directory or file symlink outside project', t => {
  const root = tree(t), outside = tree(t);
  write(outside, 'secret.md', '# EXTERNAL TITLE\nEXTERNAL NEEDLE');
  fs.symlinkSync(outside, path.join(root, 'docs'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'README.md'));
  assert.equal(listDocs(root).total, 0);
  fs.unlinkSync(path.join(root, 'docs')); fs.mkdirSync(path.join(root, 'docs'));
  fs.symlinkSync(outside, path.join(root, 'docs/architecture'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'docs/linked.md'));
  write(root, 'docs/local.md', '# Local');
  const indexed = listDocs(root);
  assert.equal(indexed.total, 1);
  assert.ok(!JSON.stringify(indexed).includes('EXTERNAL'));
});

test('doc and search refuse symlink escapes without leaking external bytes or paths', async t => {
  const root = tree(t), outside = tree(t);
  const secret = write(outside, 'secret.md', '# EXTERNAL TITLE\nEXTERNAL NEEDLE');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.symlinkSync(secret, path.join(root, 'docs/file.md'));
  fs.symlinkSync(outside, path.join(root, 'docs/architecture'));
  for (const rel of ['docs/file.md', 'docs/architecture/secret.md']) {
    const r = await get('/api/doc', { path: rel }, root);
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.body).includes(secret));
    assert.ok(!JSON.stringify(r.body).includes('EXTERNAL'));
  }
  const r = await get('/api/docs/search', { q: 'EXTERNAL' }, root);
  assert.equal(r.status, 200); assert.equal(r.body.matched, 0);
});

test('doc rejects traversal, absolute paths and non-Markdown content', async t => {
  const root = tree(t);
  for (const rel of ['../alpha/README.md', '/etc/passwd.md', 'docs/a/../../README.md', 'README.txt']) {
    const r = await get('/api/doc', { path: rel }, root);
    assert.equal(r.status, 400);
  }
});

test('canonical symlink alias for the server root remains readable', async t => {
  const root = tree(t), alias = path.join(tree(t), 'alias');
  write(root, 'README.md', '# Alias project'); fs.symlinkSync(root, alias);
  const r = await get('/api/doc', { path: 'README.md' }, alias);
  assert.equal(r.status, 200); assert.match(r.body.content, /Alias project/);
});

test('oversized document is indexed as unreadable, never scanned or returned', async t => {
  const root = tree(t);
  write(root, 'docs/large.md', '# Must not read this title\n' + 'Z'.repeat(1024 * 1024));
  const item = listDocs(root).groups.flatMap(g => g.docs)[0];
  assert.equal(item.readState, 'too-large'); assert.equal(item.title, 'large');
  const r = await get('/api/doc', { path: 'docs/large.md' }, root);
  assert.equal(r.status, 404);
  const searched = await get('/api/docs/search', { q: 'Must not read' }, root);
  assert.equal(searched.body.matched, 0); assert.equal(searched.body.unreadable, 1);
});

test('only explicit document declarations supply accepted/draft/superseded status', t => {
  const root = tree(t);
  write(root, 'docs/accepted.md', '---\nstatus: Accepted\n---\n# Decision');
  write(root, 'docs/draft.md', '# Plan\n\nStatus: Draft\n');
  write(root, 'docs/superseded.md', '---\nstatus: "Superseded"\n---\n# Old');
  write(root, 'docs/inferred.md', '# Accepted plan\nThe plan was accepted by everyone.');
  const docs = Object.fromEntries(listDocs(root).groups.flatMap(g => g.docs).map(d => [d.name, d]));
  assert.equal(docs['accepted.md'].status, 'accepted');
  assert.equal(docs['draft.md'].status, 'draft');
  assert.equal(docs['superseded.md'].status, 'superseded');
  assert.equal(docs['inferred.md'].status, null);
});

test('code examples and narrative are not document status declarations', () => {
  assert.equal(declaredStatus('# Example\n```yaml\nStatus: Accepted\n```'), null);
  assert.equal(declaredStatus('# Example\n~~~text\nStatus: Accepted\n~~~'), null);
  assert.equal(declaredStatus('# Example\n> Status: Accepted'), null);
});

test('system map and pipeline do not follow links or disclose a foreign projection', async t => {
  const root = tree(t), outside = tree(t);
  write(outside, 'pipeline.toml', '[transitions.foreign-secret]\nnext = "leaked-node"');
  write(outside, 'SECRET.md', '# Private prompt');
  fs.symlinkSync(outside, path.join(root, 'agents'));
  fs.symlinkSync(outside, path.join(root, 'shared'));
  const r = await get('/api/docs', {}, root);
  assert.equal(r.status, 200); assert.equal(r.body.pipeline, null);
  assert.ok(!JSON.stringify(r.body).includes('leaked-node'));
  assert.ok(!JSON.stringify(r.body).includes('foreign-secret'));
  assert.ok(!JSON.stringify(r.body).includes(outside));
  assert.equal(r.body.map.state, 'partial');
  assert.equal(r.body.map.nodes.length, 0);
});

test('bounded reader accepts exactly 1MiB, rejects growth, and never allocates an unbounded read', t => {
  const root = tree(t), file = write(root, 'docs/exact.md', 'a'.repeat(MAX_DOC_BYTES));
  const original = fs.readSync;
  let grew = false, observed = 0;
  fs.readSync = (...args) => {
    assert.ok(args[1].length <= MAX_DOC_BYTES + 1);
    observed++;
    const result = original(...args);
    if (!grew) { grew = true; fs.appendFileSync(file, 'growth'); }
    return result;
  };
  try {
    const read = readProjectFile(root, 'docs/exact.md');
    assert.ok(observed > 0);
    assert.notEqual(read.state, 'readable'); assert.equal(read.content, null);
  } finally { fs.readSync = original; }
  fs.truncateSync(file, MAX_DOC_BYTES);
  assert.equal(readProjectFile(root, 'docs/exact.md').content.length, MAX_DOC_BYTES);
});

test('descriptor validation refuses a parent swapped to a foreign directory before open', t => {
  const root = tree(t), outside = tree(t);
  write(root, 'docs/doc.md', '# Local'); write(outside, 'doc.md', '# FOREIGN SECRET');
  const original = fs.openSync; let swapped = false;
  fs.openSync = (...args) => {
    if (!swapped && args[0] === path.join(fs.realpathSync(root), 'docs/doc.md')) {
      swapped = true;
      fs.renameSync(path.join(root, 'docs'), path.join(root, 'previous-docs'));
      fs.symlinkSync(outside, path.join(root, 'docs'));
    }
    return original(...args);
  };
  try {
    const read = readProjectFile(root, 'docs/doc.md');
    assert.equal(swapped, true); assert.equal(read.state, 'unreadable'); assert.equal(read.content, null);
  } finally { fs.openSync = original; }
});

test('search returns only selected-project content and document metadata never infers Git revision', async () => {
  for (const p of projects) {
    const r = await get('/api/docs/search', { project: p.slug, q: 'unique' });
    assert.equal(r.status, 200); assert.equal(r.body.matched, 1);
    assert.ok(r.body.results.every(d => d.hits.every(h => h.text.includes(p.slug))));
    const doc = await get('/api/doc', { project: p.slug, path: 'README.md' });
    assert.equal(doc.body.sourceRevision, null);
    assert.equal(doc.body.status, null);
  }
});
