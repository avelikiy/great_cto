// Tests for effectiveGates(archetype, size, tier) — the per-change risk-tier axis
// composed with the existing project_size axis (gatesFor).
//
// Run: npm run build && node --test tests/effective-gates.test.mjs
//
// Model (PLAN-2026-06-18-gate-tiering-reviewer-consolidation.md):
//   base = gatesFor(archetype, size)
//   T2 (irreversible/regulated)  → base, with `ship` forced on. Never downgraded.
//   T1 (reversible feature)      → review intent: `plan` + the archetype floor.
//   T0 (maintenance/fix)         → the archetype floor only (CI is the gate).
//   Floor (regulated archetypes only — base has `security` or `compliance`):
//                                   {security, compliance, ship} ∩ base, kept at every tier.
//   Default tier is T2 (unknown ⇒ full behavior — back-compat safe).

import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveGates, gatesFor } from "../dist/archetypes.js";

const REGULATED = ["fintech", "healthcare", "commerce", "enterprise-saas", "regulated"];
const PLAIN = ["web-service", "cli-tool", "library", "data-platform", "game", "cms"];

// ── Back-compat: default tier behaves like today (+ ship guaranteed) ──────────

test("default tier (omitted) is T2 → equals base with ship forced", () => {
  for (const a of [...REGULATED, ...PLAIN, "ai-system", "web3", "greenfield"]) {
    const base = gatesFor(a, "medium");
    const eff = effectiveGates(a, "medium"); // tier omitted
    const expected = base.includes("ship") ? base : [...base, "ship"];
    assert.deepEqual(eff, expected, `${a}: default must equal base+ship`);
  }
});

test("invalid/unknown tier string is treated as T2 (fail-safe)", () => {
  const t2 = effectiveGates("fintech", "medium", "T2");
  assert.deepEqual(effectiveGates("fintech", "medium", "bogus"), t2);
  assert.deepEqual(effectiveGates("fintech", "medium", undefined), t2);
});

// ── T2 never downgrades ──────────────────────────────────────────────────────

test("T2 returns the full size baseline (no gate removed)", () => {
  for (const a of [...REGULATED, ...PLAIN, "ai-system"]) {
    const base = gatesFor(a, "medium");
    const eff = effectiveGates(a, "medium", "T2");
    for (const g of base) assert.ok(eff.includes(g), `${a}: T2 must keep ${g}`);
  }
});

test("T2 forces a ship gate even when project_size stripped it", () => {
  // nano web-service: gatesFor → [plan] (no ship). T2 must still gate the ship.
  assert.deepEqual(gatesFor("web-service", "nano"), ["plan"]);
  assert.ok(effectiveGates("web-service", "nano", "T2").includes("ship"),
    "irreversible change must always have a final go/no-go");
});

// ── T0 — maintenance ─────────────────────────────────────────────────────────

test("T0 on a plain archetype opens ZERO human gates", () => {
  for (const a of PLAIN) {
    assert.deepEqual(effectiveGates(a, "medium", "T0"), [],
      `${a}: a maintenance fix must not open a human gate (CI is the gate)`);
  }
});

test("T0 on a regulated archetype still enforces the floor (security/compliance/ship)", () => {
  // fintech base = [plan, qa, security, ship, compliance]
  const eff = effectiveGates("fintech", "medium", "T0");
  assert.deepEqual(eff, ["security", "ship", "compliance"],
    "regulated repo: even a fix passes security+compliance+ship");
  assert.ok(!eff.includes("plan"), "T0 must drop plan");
  assert.ok(!eff.includes("qa"), "T0 must drop the human qa gate");
});

// ── T1 — reversible feature ──────────────────────────────────────────────────

test("T1 on a plain archetype opens exactly [plan]", () => {
  for (const a of PLAIN) {
    assert.deepEqual(effectiveGates(a, "medium", "T1"), ["plan"],
      `${a}: a reversible feature → review intent only`);
  }
});

test("T1 on a regulated archetype = plan + floor, drops the qa ceremony", () => {
  // fintech base = [plan, qa, security, ship, compliance]
  const eff = effectiveGates("fintech", "medium", "T1");
  assert.deepEqual(eff, ["plan", "security", "ship", "compliance"]);
  assert.ok(!eff.includes("qa"), "T1 drops the standalone qa gate (CI covers)");
});

// ── Floor invariant — the safety property that makes downgrading sound ────────

test("regulated archetypes never lose security/compliance/ship at ANY tier", () => {
  for (const a of REGULATED) {
    const base = gatesFor(a, "medium");
    const floor = base.filter((g) => g === "security" || g === "compliance" || g === "ship");
    for (const tier of ["T0", "T1", "T2"]) {
      const eff = effectiveGates(a, "medium", tier);
      for (const g of floor) {
        assert.ok(eff.includes(g), `${a} @ ${tier}: floor gate ${g} must survive`);
      }
    }
  }
});

// ── Structural guarantees ────────────────────────────────────────────────────

test("effectiveGates never invents a gate outside base (except a forced ship)", () => {
  for (const a of [...REGULATED, ...PLAIN, "ai-system", "web3"]) {
    const base = new Set(gatesFor(a, "medium"));
    for (const tier of ["T0", "T1", "T2"]) {
      for (const g of effectiveGates(a, "medium", tier)) {
        assert.ok(base.has(g) || g === "ship", `${a} @ ${tier}: ${g} not in base`);
      }
    }
  }
});

test("output preserves base gate order", () => {
  const base = gatesFor("ai-system", "medium"); // [plan, cost, qa, security, ship]
  for (const tier of ["T0", "T1", "T2"]) {
    const eff = effectiveGates("ai-system", "medium", tier);
    const idx = eff.map((g) => base.indexOf(g)).filter((i) => i >= 0);
    const sorted = [...idx].sort((x, y) => x - y);
    assert.deepEqual(idx, sorted, `${tier}: gates must stay in base order`);
  }
});

// ── Product Builder archetypes (A1–A6) — the single CTO gate ──────────────────

test("product-builder archetypes open exactly ONE gate (plan) at T1 — the CTO gate", () => {
  for (const a of ["vertical-saas", "booking", "crm", "dashboard", "content-platform"]) {
    assert.deepEqual(effectiveGates(a, "medium", "T1"), ["plan"],
      `${a}: a reversible product feature → the single CTO gate only`);
    assert.deepEqual(effectiveGates(a, "medium", "T0"), [],
      `${a}: a maintenance fix → zero gates (CI is the gate)`);
    assert.ok(effectiveGates(a, "medium", "T2").includes("ship"),
      `${a}: an irreversible change still forces ship`);
  }
});

test("monotonicity: T0 ⊆ T1 ⊆ T2 for every archetype/size", () => {
  for (const a of [...REGULATED, ...PLAIN, "ai-system", "greenfield"]) {
    for (const size of ["nano", "small", "medium", "large"]) {
      const t0 = new Set(effectiveGates(a, size, "T0"));
      const t1 = effectiveGates(a, size, "T1");
      const t2 = new Set(effectiveGates(a, size, "T2"));
      for (const g of t0) assert.ok(t1.includes(g), `${a}/${size}: T0 gate ${g} missing from T1`);
      for (const g of t1) assert.ok(t2.has(g), `${a}/${size}: T1 gate ${g} missing from T2`);
    }
  }
});
