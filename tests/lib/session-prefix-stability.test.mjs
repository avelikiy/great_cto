// What every session reads before it reads anything else.
//
// `scripts/hooks/read-global-memory.mjs` injects three files from ~/.great_cto —
// preferences, decisions, lessons — into the context of EVERY session, in EVERY
// project. It is the system section, and it has two properties worth holding:
//
//   BOUNDED  — it is paid for once per session, forever, in every project.
//   STABLE   — a system section that changes between sessions invalidates the
//              prompt prefix cache, and the whole prefix is then re-billed at
//              full rate. Borrowed from agentic-in/inferoa, whose framing of the
//              agent loop as an inference workload is the one idea there that
//              applies to a plugin rather than a harness.
//
// This repository is currently clean on both, and found that out by measuring
// rather than by assuming. The decisions log WOULD have grown without bound —
// appendDecisionLog once wrote to the global file on every gate approval. It
// stopped because ADR-008 scoped decisions per project after a client name
// leaked through that exact path into every other project's context. A privacy
// fix that incidentally fixed the cache property.
//
// Incidental is not guaranteed. This is the guarantee.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HOOK = path.join(ROOT, 'scripts/hooks/read-global-memory.mjs');
const GLOBAL = path.join(homedir(), '.great_cto');

/** The bytes the hook actually puts in front of the model. */
function inject() {
  try {
    return execFileSync(process.execPath, [HOOK], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    // A hook that cannot run is a third state, not an empty injection.
    return `__UNREADABLE__ ${e.code ?? e.message}`;
  }
}

test('the injection is deterministic — the same session start twice is the same bytes', () => {
  const a = inject();
  const b = inject();
  assert.equal(a, b,
    'the SessionStart injection differs between two identical reads — something in it is ' +
    'time- or count-dependent, which re-bills the whole prompt prefix every session');
  assert.doesNotMatch(a, /^__UNREADABLE__/, 'the hook ran');
});

test('nothing in the injection is a clock', () => {
  // The shape that breaks a prefix without anyone noticing: a rendered "now".
  // Dates that are CONTENT (a decision was taken on 2026-05-14) are fine and
  // expected — they do not move. A timestamp of this moment is not.
  const text = inject();
  const now = new Date().toISOString().slice(0, 10);
  assert.ok(!text.includes(now) || !/\d{2}:\d{2}:\d{2}/.test(text),
    `the injection contains today's date beside a wall-clock time — that is a rendered "now", ` +
    `and it changes the system section on every run`);
  assert.doesNotMatch(text, /\b\d+ (?:minutes?|hours?|days?) ago\b/,
    'relative time in the injection re-renders on every session');
});

test('a project-scoped gate approval does not touch the global injection', async () => {
  // ADR-008's guarantee, asserted. appendDecisionLog once wrote the global file
  // on every approval; that made the system section grow with normal use.
  const { appendDecisionLog } = await import('../../packages/board/lib/fleet.mjs');

  const before = inject();
  const globalBefore = existsSync(path.join(GLOBAL, 'decisions.md'))
    ? readFileSync(path.join(GLOBAL, 'decisions.md'), 'utf8') : null;

  const proj = mkdtempSync(path.join(tmpdir(), 'gcto-prefix-'));
  mkdirSync(path.join(proj, '.great_cto'), { recursive: true });
  try {
    appendDecisionLog({
      ts: '2026-09-01T12:00:00.000Z', project: 'prefix-probe', action: 'approve',
      id: 'probe-1', title: 'gate:ship — a decision taken in a project',
      reason: 'asserting this does not reach the global log', cwd: proj,
    });
    // It landed where it should.
    const local = readFileSync(path.join(proj, '.great_cto', 'decisions.md'), 'utf8');
    assert.match(local, /prefix-probe/, 'the decision was recorded in the PROJECT log');

    // And nowhere else.
    assert.equal(inject(), before,
      'a gate approval changed what every future session reads — the global decisions log ' +
      'is being appended to again (ADR-008), which both leaks project vocabulary and ' +
      're-bills the prompt prefix');
    const globalAfter = existsSync(path.join(GLOBAL, 'decisions.md'))
      ? readFileSync(path.join(GLOBAL, 'decisions.md'), 'utf8') : null;
    assert.equal(globalAfter, globalBefore, 'the global decisions log is unchanged');
  } finally {
    rmSync(proj, { recursive: true, force: true });
  }
});

test('the injection stays bounded — the ratchet', () => {
  // Measured 2026-09-01: 4842 bytes, roughly 1.2k tokens, paid once per session
  // in every project forever. The ceiling has headroom for real additions and
  // fails on drift, which is the only way an always-on cost gets noticed at all.
  const CEILING = 6500;
  const size = Buffer.byteLength(inject(), 'utf8');
  assert.ok(size <= CEILING,
    `the SessionStart injection is ${size} bytes, over the ${CEILING} floor. ` +
    `This is read by every session in every project — trim it, or raise the ceiling ` +
    `in the same commit that earns it.`);
});
