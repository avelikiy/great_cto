// An approval that is not recorded must not answer like one that is.
//
// `POST /api/gates/:id` closed the gate, then looked the gate's TITLE up through
// `getTasks()` — which reads beads, which takes a Dolt lock — and wrote the
// decision line. Both were inside ONE `catch { /* best-effort */ }`, after which
// the handler returned `{ ok: true }` whatever had happened.
//
// So under a loaded test run the lookup threw, the line was never written, and
// the API reported success. It surfaced as tests/resume-e2e failing about one run
// in four with "Got 0 decisions" — four layers away from the swallowed exception,
// and passing 5/5 in isolation, which is how it survived as "flaky" rather than
// as the silent data loss it was.
//
// Two properties keep it fixed. The title is a nicety and `id` is its documented
// fallback, so the LOOKUP can never take the RECORD down with it; and the
// response says which of the two happened, because `ok: true` alone cannot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { freePort } from '../../tests/helpers/free-port.mjs';
import { reap } from '../../tests/helpers/reap.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli', 'index.mjs');

async function waitForBoard(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`board did not start on port ${port}`);
}
const api = async (port, path, init) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

/**
 * A project with NO beads store and a gate row in tasks.md.
 *
 * This is the closest NATURAL analogue of the condition that lost the record: the
 * handler cannot reach beads, so it takes the tasks.md path. Testing it through a
 * fault injected into production code would prove the injection works; testing it
 * through a path the product genuinely has proves the product does.
 */
function makeProject() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-dl-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-dl-proj-'));
  mkdirSync(join(project, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  writeFileSync(join(project, '.great_cto', 'tasks.md'),
    '# Tasks\n\n| ID | Title | Status | Labels |\n|---|---|---|---|\n'
    + '| g-1 | gate:ship — release the thing | open | gate |\n');
  return { home, project };
}

test('an approval that cannot reach beads still records its decision, and says so', async () => {
  const { home, project } = makeProject();
  const port = await freePort();
  const board = spawn('node', [CLI, 'board', '--port', String(port), '--no-open'], {
    cwd: project, env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  try {
    await waitForBoard(port);
    const r = await api(port, '/api/gates/g-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'decision-log-marker' }),
    });

    assert.equal(r.status, 200, 'the approval itself lands');
    assert.equal(r.body.ok, true);

    // The half that used to be missing. `ok: true` says the gate closed; it has
    // never said whether the record was kept, and for months it did not.
    assert.ok(r.body.decision, 'the response reports the decision-log outcome');
    assert.equal(r.body.decision.logged, true,
      `decision should be logged on the no-beads path, got ${JSON.stringify(r.body.decision)}`);

    // And it is actually on disk, project-scoped (ADR-008), not merely claimed.
    const logged = readFileSync(join(project, '.great_cto', 'decisions.md'), 'utf8');
    assert.match(logged, /decision-log-marker/, 'the reason reached the log');
    assert.match(logged, /APPROVED/);
    assert.match(logged, /g-1/);
  } finally {
    await reap(board);
    for (const d of [home, project]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

test('the record does not ride on the title lookup', () => {
  // A behavioural test cannot easily make getTasks() throw without a fault hook
  // in production code, and a fault hook shipped for a test is a worse defect
  // than the one it guards. What CAN be asserted is the structure that makes the
  // behaviour impossible to regress: two separate try blocks, the lookup's
  // failure defaulting to `id` rather than escaping.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib', 'routes.mjs'), 'utf8');
  const i = src.indexOf('const projectSlug = parsed.project || path.basename(gateCwd);');
  assert.ok(i > 0, 'the approve handler still builds the decision line here');
  const block = src.slice(i, i + 1600);

  const lookup = block.indexOf('getTasks(gateCwd)');
  const write = block.indexOf('appendDecisionLog(');
  assert.ok(lookup > 0 && write > lookup, 'the title lookup precedes the write');

  // The lookup must be closed off before the write begins — if one `try` spans
  // both, a throw in the lookup skips the write, which is the original bug.
  const between = block.slice(lookup, write);
  assert.match(between, /\}\s*catch\s*\{[^}]*\}/,
    'the title lookup has its own catch, so it cannot take the record with it');
  assert.match(block.slice(0, lookup), /let title = id;/,
    'and `id` is the standing value, so a failed lookup degrades the title, not the record');
});
