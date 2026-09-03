/**
 * Every `bd` call in the repository is bounded, and bounded above what bd takes.
 *
 * This guards a CLASS, because chasing the instances is what failed. The board's
 * flake was five separate caps below bd's measured worst case; a hand-written
 * grep found three of them and missed the two that mattered most — the gate
 * approval path and the default that every unconfigured call site inherits.
 *
 * The measurement is this repository's own, recorded in
 * tests/pipeline-contracts.test.mjs while chasing an earlier version of the same
 * bug:
 *
 *     bd init takes 1.9s alone and up to 8.7s when ten test files spawn it at
 *     once — which is what `node --test` does.
 *
 * Two failure directions, and both are covered:
 *
 *   too low  — ordinary load looks like beads failing. Everything downstream
 *              then treats "busy" as "broken": HTTP 500 to a caller who did
 *              nothing wrong, a gate reported as never raised.
 *   absent   — a hook with no cap waits forever on a stale .beads/.lock, and a
 *              hung session gives no signal at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Measured for bd under `node --test` parallelism. A cap must exceed it.
const MEASURED_WORST_MS = 8700;

// Directories of shipping code. Tests are excluded: a test may deliberately use
// a tiny cap to prove what happens when one fires.
const DIRS = [
  'packages/board/lib', 'packages/cli/src', 'scripts/lib', 'scripts/hooks',
];

function sources() {
  const out = [];
  for (const d of DIRS) {
    const abs = join(ROOT, d);
    let entries;
    try { entries = readdirSync(abs); } catch { continue; }
    for (const e of entries) {
      const p = join(abs, e);
      try { if (statSync(p).isDirectory()) continue; } catch { continue; }
      if (/\.(mjs|ts|js)$/.test(e) && !/\.test\.(mjs|ts|js)$/.test(e)) out.push(p);
    }
  }
  return out;
}

/** Every line that launches `bd`, with the timeout on that call if there is one. */
function bdCalls(src) {
  const calls = [];
  // Comments quote these calls to explain them — beads.mjs has a note reading
  // "Then `spawnSync('bd', …)` → ENOENT". A guard that cannot tell a quote from
  // the code it describes flags the documentation of the fix as the bug.
  src = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // The launcher, then a fixed window of the text that follows it. Matching to a
  // balanced closing paren is what a parser is for; a window is enough to see
  // whether an options object mentions a timeout, and it does not quietly stop
  // early at a paren inside an argument — which is how the first version of this
  // check reported a call that HAS a timeout as having none.
  const re = /(?:spawnSync|execFileSync|exec|spawn)\(\s*(?:BD_BIN|['"]bd['"])/g;
  for (const m of src.matchAll(re)) {
    const window = src.slice(m.index, m.index + 400);
    const t = window.match(/timeout:\s*(\d+)/);
    const named = window.match(/timeout:\s*([A-Za-z_$][\w$]*)/);
    calls.push({ text: window, ms: t ? Number(t[1]) : null, named: named ? named[1] : null });
  }
  return calls;
}

test('every bd call is bounded, and above the measured worst case', () => {
  const problems = [];
  for (const p of sources()) {
    const src = readFileSync(p, 'utf8');
    const rel = relative(ROOT, p);
    for (const c of bdCalls(src)) {
      if (c.ms === null && c.named === null) {
        problems.push(`${rel}: a bd call with NO timeout — it can wait forever on a stale .beads/.lock`);
        continue;
      }
      if (c.ms === null) {
        // Timeout comes from a variable; check that variable's default here.
        const def = src.match(new RegExp(`${c.named}\\s*=\\s*(\\d+)`));
        if (!def) { problems.push(`${rel}: bd timeout \`${c.named}\` has no default this check can read`); continue; }
        if (Number(def[1]) <= MEASURED_WORST_MS) {
          problems.push(`${rel}: bd timeout default ${c.named}=${def[1]}ms is not above ${MEASURED_WORST_MS}ms`);
        }
        continue;
      }
      if (c.ms <= MEASURED_WORST_MS) {
        problems.push(`${rel}: bd timeout ${c.ms}ms is not above the measured ${MEASURED_WORST_MS}ms`);
      }
    }
  }
  assert.deepEqual(problems, [],
    'bd was measured at up to 8.7s under this suite\'s own parallelism — a cap at or below that ' +
    'reports a busy store as a broken one');
});

test('the check actually finds bd calls — it is not passing on an empty set', () => {
  // A guard that matches nothing passes forever. This is the mutation that
  // caught the board flake's siblings, so it is pinned.
  let n = 0;
  for (const p of sources()) n += bdCalls(readFileSync(p, 'utf8')).length;
  assert.ok(n >= 5, `expected to find several bd call sites, found ${n}`);
});
