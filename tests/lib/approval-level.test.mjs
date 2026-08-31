// The pipeline chains itself; the only open question is where it pauses. The
// existing levels could not express the one an operator most often wants — ask
// about the product, decide the technical parts yourself — so `gates-only` made
// them approve architecture they did not want to review, and `auto` skipped the
// product decision too.
//
// The properties worth pinning: product-only keeps exactly the two expensive-to-
// undo decisions, a regulated archetype cannot be stripped of its floor by
// choosing a lighter level, and a typo falls back to gating rather than to none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  gatesForApprovalLevel, gateApplies, levelFromProjectMd, describeLevel,
  isRegulated, APPROVAL_LEVELS, DEFAULT_LEVEL, briefedGatesFor,
} from '../../scripts/lib/approval-level.mjs';

test('product-only pauses at product and ship — and nowhere technical it can skip', () => {
  const g = gatesForApprovalLevel('product-only', { archetype: 'web-service' });
  // `import` is present at every level and is not part of what this level chose.
  // See IRREVERSIBLE_FLOOR: a level says how much review you want; it is not a
  // decision about whether a client's data may be overwritten unattended.
  assert.deepEqual(g, ['product', 'import', 'ship']);
  assert.ok(!g.includes('arch') && !g.includes('code') && !g.includes('qa'),
    'nothing technical that the level is entitled to skip');
});

test('every level except auto asks the WHAT question', () => {
  // This test used to assert the opposite for `gates-only` — that the default
  // "stops at architecture but never at the product decision". It was an
  // accurate description of a defect: the pipeline gated the cheap-to-undo
  // decision (how to build, which you fix by rewriting a document) and left the
  // expensive one ungated (what to build, which is wrong for six stages before
  // anyone finds out). ADR-009 puts gates on cost-of-undo, not on position.
  for (const lvl of ['product-only', 'gates-only', 'expert', 'step-by-step']) {
    assert.equal(gateApplies('product', lvl), true, lvl);
  }
  assert.equal(gateApplies('product', 'auto'), false, 'auto still asks nothing');
});

test('product-only skips architecture and planning', () => {
  for (const gate of ['arch', 'plan', 'code']) {
    assert.equal(gateApplies(gate, 'product-only', { archetype: 'web-service' }), false, gate);
  }
});

test('a gate: prefix is accepted, since that is how they are written everywhere', () => {
  assert.equal(gateApplies('gate:ship', 'product-only'), true);
});

// ── the floor that cannot be opted out of ──────────────────────────────────

test('a regulated archetype keeps its security/compliance floor under product-only', () => {
  const g = gatesForApprovalLevel('product-only', { archetype: 'fintech' });
  assert.ok(g.includes('security'), 'security survives');
  assert.ok(g.includes('compliance'), 'compliance survives');
  assert.ok(g.includes('product'), 'and the product decision is still asked');
});

test('even `auto` cannot strip a regulated floor', () => {
  const g = gatesForApprovalLevel('auto', { archetype: 'healthcare' });
  assert.ok(g.includes('security') && g.includes('compliance') && g.includes('ship'),
    'a lighter level must not become a compliance bypass');
});

test('auto has no gates it is entitled to skip — but cannot skip an irreversible one', () => {
  // `auto` used to return []. It now returns the irreversible floor, and the
  // distinction matters: every gate an operator can trade away for speed is
  // gone, and the one that destroys evidence is not theirs to trade. ADR-009
  // states it as a second axis — cost-of-undo, not pipeline position.
  //
  // In practice this costs an unattended run nothing unless it actually imports
  // data: `gate:import` is declared on exactly one edge, so a project that never
  // runs migration-import-engineer never meets it.
  assert.deepEqual(gatesForApprovalLevel('auto', { archetype: 'cli-tool' }), ['import']);
  for (const g of ['product', 'arch', 'plan', 'code', 'qa', 'security', 'ship']) {
    assert.ok(!gatesForApprovalLevel('auto', { archetype: 'cli-tool' }).includes(g), `${g} must stay skippable at auto`);
  }
});

test('the irreversible floor cannot be removed by any level', () => {
  for (const level of ['auto', 'product-only', 'gates-only', 'strict', 'expert', 'step-by-step', 'bogus']) {
    assert.ok(gatesForApprovalLevel(level, { archetype: 'cli-tool' }).includes('import'),
      `${level} must still stop before an irreversible import`);
  }
});

test('isRegulated is case-insensitive and safe on junk', () => {
  assert.equal(isRegulated('FinTech'), true);
  assert.equal(isRegulated('cli-tool'), false);
  assert.equal(isRegulated(undefined), false);
});

// ── failure modes ──────────────────────────────────────────────────────────

test('an unknown level falls back to the default, never to no gates', () => {
  const g = gatesForApprovalLevel('prodcut-only');           // typo on purpose
  assert.deepEqual(g, gatesForApprovalLevel(DEFAULT_LEVEL));
  assert.ok(g.length > 0, 'a typo must not silently disable human review');
});

test('a missing level is the default', () => {
  assert.deepEqual(gatesForApprovalLevel(undefined), gatesForApprovalLevel(DEFAULT_LEVEL));
});

test('levelFromProjectMd reads the field, and rejects an unknown value', () => {
  assert.equal(levelFromProjectMd('project: x\napproval-level: product-only\n'), 'product-only');
  assert.equal(levelFromProjectMd('project: x\n'), DEFAULT_LEVEL);
  assert.equal(levelFromProjectMd('approval-level: nonsense\n'), DEFAULT_LEVEL);
});

test('gates come back in pipeline order, not insertion order', () => {
  const g = gatesForApprovalLevel('expert', { archetype: 'web-service' });
  assert.equal(g[0], 'product', 'product is first — WHAT before HOW');
  assert.equal(g[g.length - 1], 'ship', 'ship is last');
});

test('every advertised level resolves to something', () => {
  for (const l of APPROVAL_LEVELS) {
    assert.ok(Array.isArray(gatesForApprovalLevel(l)), l);
  }
});

test('describeLevel explains an unattended run rather than printing an empty list', () => {
  // No longer "no human gates" — it pauses at exactly one, and saying otherwise
  // would promise an unattended run it does not deliver.
  assert.match(describeLevel('auto', { archetype: 'cli-tool' }), /gate:import/);
  assert.match(describeLevel('product-only'), /gate:product/);
  assert.match(describeLevel('bogus'), /unknown/, 'a typo is surfaced, not silently corrected');
});

// ── The default gates the decision that costs most to reverse ───────────────

test('the default level gates the PRODUCT decision, not only the technical ones', () => {
  // `gates-only` was ['arch', 'ship'] until 2026-08-19: the pipeline stopped on
  // HOW to build and on WHETHER to release, and never on WHAT to build. ADR-009
  // puts gates on cost-of-undo rather than position, and by that rule this was
  // inverted — architecture is cheap to undo (rewrite the document); the product
  // decision is the most expensive, because it is wrong for six stages before
  // anyone finds out.
  const gates = gatesForApprovalLevel(DEFAULT_LEVEL);
  assert.ok(gates.includes('product'), `default level ${DEFAULT_LEVEL} must gate the product decision`);
  assert.ok(gates.includes('ship'), 'and still gate the thing that reaches users');
});

test('auto remains the way to ask for nothing this level chose', () => {
  // The escape hatch has to keep existing, or the new default becomes
  // unavoidable rather than chosen. `import` is not part of that choice — it is
  // present at every level, including this one, for the reason stated at the top
  // of this file.
  assert.deepEqual(gatesForApprovalLevel('auto').filter((g) => g !== 'import'), []);
});

// ── ship-only: one gate, and a briefing where the other one was ─────────────
//
// The operator asked for a single human gate across every pipeline. Four stops
// were measured at `gates-only` — product, arch, import, ship — and they do not
// collapse into one, because they guard different failures: `arch` is cheap to
// undo, `import` destroys data, `product` wastes the whole build, `ship` escapes
// the machine.
//
// Only `ship` is irreversible in ADR-009's sense. So it is the one gate. `product`
// does not vanish — a decision about WHAT to build that nobody sees is how a
// pipeline spends a day on the wrong thing — it becomes a mandatory console
// briefing instead: one screen, non-blocking, stay silent and it proceeds.
//
// A briefing is only an acceptable substitute for a gate while it actually
// appears. If the brief cannot be read, this falls back to gating `product`,
// because "I could not show you" must never be delivered as "you were shown and
// said nothing".
test('ship-only gates exactly one pipeline decision', () => {
  const g = gatesForApprovalLevel('ship-only');
  assert.deepEqual(g.filter((x) => x !== 'import'), ['ship'],
    'one pipeline gate — the only stop whose consequence leaves the machine');
});

test('ship-only still cannot bypass a regulated archetype', () => {
  // A new level must not become a bypass by omission. SKILL.md holds regulated
  // archetypes to a strict minimum and that is encoded, not remembered.
  const g = gatesForApprovalLevel('ship-only', { archetype: 'fintech' });
  assert.ok(g.includes('security') || g.includes('compliance') || g.length > 2,
    `a regulated archetype keeps its sign-off; got ${g.join(', ')}`);
});

test('the destructive-import guard survives every level', () => {
  for (const level of APPROVAL_LEVELS) {
    assert.ok(gatesForApprovalLevel(level).includes('import'),
      `${level} dropped the import gate — it guards data loss, not process depth`);
  }
});

test('product is briefed, not gated, and only at ship-only', () => {
  assert.equal(briefedGatesFor('ship-only').includes('product'), true,
    'the WHAT-to-build decision is still surfaced, as one non-blocking screen');
  assert.equal(gatesForApprovalLevel('ship-only').includes('product'), false,
    'and it does not stop the pipeline');
  for (const level of APPROVAL_LEVELS.filter((l) => l !== 'ship-only')) {
    assert.deepEqual(briefedGatesFor(level), [],
      `${level} either gates product or does not run it — briefing belongs to ship-only alone`);
  }
});

test('a brief that cannot be read falls back to the gate', () => {
  assert.equal(gatesForApprovalLevel('ship-only', { briefReadable: false }).includes('product'), true,
    '"I could not show you" must not be delivered as "you were shown and said nothing"');
  assert.equal(gatesForApprovalLevel('ship-only', { briefReadable: true }).includes('product'), false);
});

test("product-owner's own contract agrees with the levels that exist", () => {
  // It said "active at every approval level except `auto`" — true when written,
  // false the moment ship-only shipped. An agent that tells the operator the
  // pipeline will stop, in a pipeline that will not, is worse than silence: the
  // claim is specific, confident, and wrong.
  const c = fs.readFileSync(new URL('../../agents/product-owner.md', import.meta.url), 'utf8');
  const claim = c.match(/That gate is active at every approval level except ([^.]+)\./);
  assert.ok(claim, 'the contract still states where its gate applies');
  const named = claim[1].match(/`([a-z-]+)`/g).map((s) => s.replace(/`/g, ''));
  const actual = APPROVAL_LEVELS.filter((l) => !gatesForApprovalLevel(l).includes('product'));
  assert.deepEqual(named.sort(), actual.sort(),
    'the levels the contract names must be exactly the levels that drop this gate');
});
