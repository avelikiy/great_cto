// A fix keeps working because something fails when it stops. Most of ours do.
// The ones that do not are the fixes whose load-bearing line lives inside a
// file that is tested at a different altitude — and those are exactly the ones
// that come back.
//
// Three examples this registry was built from, all shipped in 3.27.x:
//
//   - `cross-review-gate` has a test file. It exercises the pure decision
//     function, `decideCrossReviewGate({enabled})`, and never the line that
//     computes `enabled` from the environment. Changing `=== '1'` to `!== '0'`
//     turns an opt-in gate on for every user, and the whole suite stays green.
//   - `capture-screenshots` refuses to photograph a degraded page. Nothing
//     asserts the refusal; deleting the selector restores the exact bug that
//     put a red banner in every README screenshot.
//   - `seed-demo` and `record-demo` pass argument arrays instead of building
//     shell strings. Neither file has a test at all.
//
// So: a registry of markers. Each entry names a file and a literal substring
// that must still be in it. Deleting the line that carries a fix fails here,
// whatever else is green. Borrowed from ruvnet/ruflo's `verification/`, whose
// motivating story is ours — regressions that passed unit tests on the broken
// commit and reached users anyway.
//
// What this is NOT. It does not prove a fix still WORKS; a marker present in a
// file that no longer runs proves nothing. It proves the line was not quietly
// removed, which is the failure this repository keeps having. A fix that can be
// tested at its own altitude gets a test, not an entry here.
//
// Deliberately not taken from ruflo: Ed25519 signatures and per-OS manifests
// written by CI runners. One maintainer, one machine, Actions billing-locked —
// that is key management with no threat model behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'verification', 'witness.json');

const load = () => JSON.parse(readFileSync(REGISTRY, 'utf8'));

test('the registry exists and lists something — an empty one passes vacuously', () => {
  assert.ok(existsSync(REGISTRY), `no witness registry at ${REGISTRY}`);
  const { fixes } = load();
  assert.ok(Array.isArray(fixes) && fixes.length > 0, 'witness.json lists no fixes');
});

test('every entry says what it is, where it lives, and why it matters', () => {
  const { fixes } = load();
  const seen = new Set();
  for (const f of fixes) {
    for (const field of ['id', 'file', 'marker', 'why', 'fixed-in']) {
      assert.ok(String(f?.[field] || '').trim(), `entry ${f?.id ?? '<no id>'}: empty \`${field}\``);
    }
    assert.ok(!seen.has(f.id), `duplicate witness id \`${f.id}\``);
    seen.add(f.id);
    // A `why` that does not say what breaks is a label, not a reason — and the
    // next reader deletes the line anyway because nothing told them not to.
    assert.ok(f.why.length >= 40, `entry \`${f.id}\`: \`why\` is too short to be a reason`);
  }
});

test('every witnessed fix is still in the file that carries it', () => {
  const { fixes } = load();
  const gone = [];
  for (const f of fixes) {
    const path = join(ROOT, f.file);
    if (!existsSync(path)) { gone.push(`${f.id}: ${f.file} no longer exists`); continue; }
    if (!readFileSync(path, 'utf8').includes(f.marker)) {
      gone.push(`${f.id}: marker absent from ${f.file}\n      fixed in ${f['fixed-in']} — ${f.why}\n      missing: ${f.marker}`);
    }
  }
  assert.deepEqual(gone, [], `a witnessed fix lost its load-bearing line:\n    ${gone.join('\n    ')}`);
});

test('a marker is specific enough to be about one thing', () => {
  // A marker like `return true` matches everywhere and witnesses nothing: it
  // would survive the deletion it exists to catch.
  const { fixes } = load();
  for (const f of fixes) {
    assert.ok(f.marker.length >= 20,
      `entry \`${f.id}\`: marker \`${f.marker}\` is too short to identify one line`);
    const path = join(ROOT, f.file);
    if (!existsSync(path)) continue;
    const hits = readFileSync(path, 'utf8').split(f.marker).length - 1;
    assert.equal(hits, 1, `entry \`${f.id}\`: marker appears ${hits}× in ${f.file} — it must name one site`);
  }
});
