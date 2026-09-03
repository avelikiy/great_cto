// `?project=<unknown>` serves the board's OWN project and returns its numbers.
//
// That fallback is defensible and it has been announced since the BH-5 fix, in
// `X-Project-Fallback`. What no test asked, for months, is whether anything
// LISTENS: `packages/board/public/index.html` read the header zero times, so the
// announcement went to a channel with no subscriber and every panel rendered
// another project's 242 tasks and $2.70 as if they were yours. For an operator
// running eighteen projects that is not a missing number — it is a confidently
// wrong one, and nothing else on the screen looks off.
//
// So this file asserts BOTH halves. A test that only checked the header would
// have passed throughout the period the defect existed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { startBoard } from './helpers/board-start.mjs';
import { reap } from './helpers/reap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');
const BOARD_HTML = join(__dirname, '..', 'packages', 'board', 'public', 'index.html');


function makeProject() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-pf-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-pf-proj-'));
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  return { home, project };
}

test('an unknown project is announced, and the announcement names who is being served', async () => {
  const { home, project } = makeProject();
  // startBoard: it retries a port taken between pick and bind, and distinguishes
  // that from a server that crashed on boot — the local wait loop threw the same
  // `board did not start on port <n>` for either.
  const { port, proc: board } = await startBoard({ cliEntry: CLI_ENTRY, project, home });
  try {

    const miss = await fetch(`http://127.0.0.1:${port}/api/metrics?project=__definitely_not_a_project__`);
    assert.equal(miss.headers.get('X-Project-Resolved'), 'fallback');
    assert.ok(miss.headers.get('X-Project-Fallback'), 'the requested slug is echoed back');

    // The header that was missing. "Redirected" without "to where" leaves the
    // operator looking for a project instead of learning whose figures they have
    // been reading.
    const serving = miss.headers.get('X-Project-Serving');
    assert.ok(serving, 'X-Project-Serving names the project actually served');
    assert.equal(serving, project.split('/').pop(),
      'and it is the board\'s own directory, which is what the fallback serves');

    // CORS hides custom headers by default — an exposed-list that forgot one is
    // the same defect as not sending it, for any browser client.
    const exposed = miss.headers.get('Access-Control-Expose-Headers') || '';
    for (const h of ['X-Project-Fallback', 'X-Project-Resolved', 'X-Project-Serving']) {
      assert.ok(exposed.includes(h), `${h} is exposed to the browser`);
    }

    // The other direction: a request with no project resolves to cwd and must
    // NOT raise the alarm, or the banner is permanent and therefore ignored.
    const ok = await fetch(`http://127.0.0.1:${port}/api/metrics`);
    assert.notEqual(ok.headers.get('X-Project-Resolved'), 'fallback');
    assert.equal(ok.headers.get('X-Project-Serving'), null,
      'no fallback, nothing to announce');
  } finally {
    await reap(board);
    for (const d of [home, project]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

test('the board actually reads the header — the half that was missing', () => {
  const html = readFileSync(BOARD_HTML, 'utf8');

  // Not "the string appears somewhere": it has to be read off a response inside
  // the shared fetch wrapper, which is the only place every panel goes through.
  assert.ok(/getHeader|headers\.get\(['"]X-Project-Resolved['"]\)/.test(html),
    'index.html reads X-Project-Resolved from the response');
  assert.ok(html.includes("headers.get('X-Project-Serving')"),
    'index.html reads X-Project-Serving');

  const api = html.slice(html.indexOf('function api(url, opts)'));
  const body = api.slice(0, api.indexOf('\nfunction connectSSE'));
  assert.ok(body.includes('X-Project-Resolved'),
    'the read happens in api(), so no panel can be added that forgets it');

  // Raised AND lowered. A banner that never clears is a banner that gets ignored
  // within a day, which is how a real warning becomes decoration.
  assert.ok(body.includes('PROJECT_FALLBACK = null'),
    'a resolved project clears the warning');
  assert.ok(html.includes('renderProjectFallbackBanner'),
    'and the state is rendered, not merely recorded');

  // role="alert" is what makes it reach an operator using a screen reader; the
  // sighted path is a red banner, and only one of those two was ever tested.
  const banner = html.slice(html.indexOf('function renderProjectFallbackBanner'));
  assert.ok(banner.slice(0, 1400).includes("setAttribute('role', 'alert')"),
    'the banner is announced assistively, not only painted');
});
