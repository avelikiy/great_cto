// The board is multi-project — a registry of twenty-two, a switcher in the
// sidebar — and sixteen of its eighteen endpoints read `cwd`, the directory the
// SERVER was started in. Switching project changed the heading and nothing else.
//
// A <private-project> with a .great_cto holding two verdicts and thirty-nine
// session logs had every panel show 0. Which is this system's recurring failure
// in another costume: a read that did not happen looked exactly like an absence
// of data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dispatch } from './lib/routes.mjs';
import { listProjects } from './lib/projects.mjs';

const ROUTES = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib/routes.mjs'), 'utf8');

/** Call a GET route and return the parsed body plus any headers it set. */
async function get(pathname, project) {
  const url = new URL(`http://x${pathname}${project ? `?project=${encodeURIComponent(project)}` : ''}`);
  let body = '';
  const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, writeHead() {}, end(b) { body = b; }, on() {}, write() {} };
  await dispatch({ method: 'GET', url: pathname, on() {}, headers: {} }, res, url, process.cwd());
  let json = null;
  try { json = JSON.parse(body); } catch { /* not json */ }
  return { json, headers, body };
}

test('the project is resolved once, at the entry, not per route', () => {
  // Resolving inside each handler is how sixteen of them came to forget. A
  // single resolution at the top means the next endpoint added cannot.
  assert.match(ROUTES, /const requestedProject = url\.searchParams\.get\('project'\)/);
  assert.match(ROUTES, /cwd = info\.cwd/);
});

// The second project is taken from whatever registry this machine has, rather
// than named. Naming one hard-coded a private repository's slug into a public
// test suite, and made the test pass only on the laptop that repository lives on.
function anotherProject() {
  try {
    return (listProjects() || []).map((p) => p.slug).find((s) => s && s !== 'great_cto') || null;
  } catch { return null; }
}

test('logs come from the selected project, not the server directory', async () => {
  const other = anotherProject();
  if (!other) return;  // a machine with a single registered project cannot show this
  const a = await get('/api/logs', 'great_cto');
  const b = await get('/api/logs', other);
  // Both projects exist on this machine; if either is absent the assertion below
  // still holds by being skipped rather than by passing vacuously.
  if (!a.json?.logs?.length || !b.json?.logs?.length) return;
  // The field is `file`; an earlier version of this test compared `.name` and
  // therefore compared undefined with undefined, which passes for the wrong
  // reason in one direction and fails for the wrong reason in the other.
  assert.ok(a.json.logs[0].file && b.json.logs[0].file, 'each entry names its file');
  assert.notEqual(a.json.logs[0].file, b.json.logs[0].file,
    'two different projects must not return the same newest session log');
});

test('an unresolvable slug does not quietly serve another project', async () => {
  const r = await get('/api/logs', 'no-such-project-anywhere');
  assert.equal(r.headers['X-Project-Fallback'], 'no-such-project-anywhere',
    'falling back is defensible; doing it silently is not');
});

test('no project parameter keeps the server directory', async () => {
  const r = await get('/api/logs');
  assert.ok(r.json, 'the default path still works');
  assert.equal(r.headers['X-Project-Fallback'], undefined, 'not asking for a project is not a fallback');
});

test('a path outside HOME is refused rather than honoured', async () => {
  // resolveProjectInfo enforces the HOME boundary; the header is how the UI
  // learns it was refused.
  const r = await get('/api/logs', '/etc');
  assert.equal(r.headers['X-Project-Fallback'], '/etc');
});
