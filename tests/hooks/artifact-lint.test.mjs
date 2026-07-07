// Tests for scripts/hooks/artifact-lint.mjs — structural + freshness linter.
//
// The linter is a CLI that walks cwd and exits, so we test it as a black box:
// build a throwaway repo of fixture artifacts in a temp dir, run the linter
// there with --json, and assert on the machine-readable report. This exercises
// the real contract (walk → classify → check → exit code), not internals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINTER = resolve(__dirname, '../../scripts/hooks/artifact-lint.mjs');

/** Write { relPath: contents } into a fresh temp repo and run the linter in it. */
function lint(files, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'artlint-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    const r = spawnSync('node', [LINTER, '--json', ...args], { cwd: dir, encoding: 'utf8' });
    // --json prints the report object on stdout regardless of exit code.
    const report = JSON.parse(r.stdout);
    return { ...report, status: r.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const errKinds = (r) => r.errors.map((e) => e.kind);
const warnKinds = (r) => r.warns.map((w) => w.kind);
const today = new Date().toISOString().slice(0, 10);

// ─── structure: ADR ──────────────────────────────────────────────────────

test('valid ADR passes clean', () => {
  const r = lint({
    'docs/adr/ADR-001-x.md':
      `# ADR-001: X\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[ref](https://x)\n`,
  });
  assert.equal(r.errors.length, 0);
  assert.equal(r.warns.length, 0);
  assert.equal(r.checked, 1);
});

test('ADR missing a required section is a structural ERROR', () => {
  const r = lint({
    'docs/adr/ADR-002-x.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\n[r](https://x)\n`,
  });
  assert.ok(errKinds(r).includes('missing-section'));
  assert.ok(r.errors.some((e) => /consequence/i.test(e.msg)));
});

test('ADR with no H1 is flagged', () => {
  const r = lint({
    'docs/adr/ADR-003-x.md': `## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
  });
  assert.ok(errKinds(r).includes('no-h1'));
});

// ─── sourcing ──────────────────────────────────────────────────────────────

test('ADR with zero references warns (no-source)', () => {
  const r = lint({
    'docs/adr/ADR-004-x.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\ne\n`,
  });
  assert.ok(warnKinds(r).includes('no-source'));
  assert.equal(r.errors.length, 0);
});

// ─── freshness ─────────────────────────────────────────────────────────────

test('stale-dated artifact warns; inline **Date:** is parsed', () => {
  const r = lint({
    'docs/adr/ADR-005-x.md':
      `# ADR\n**Date:** 2000-01-01\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
  });
  assert.ok(warnKinds(r).includes('stale'));
});

test('YAML frontmatter date is parsed and recent date is fresh', () => {
  const r = lint({
    'docs/design/DESIGN-x.md':
      `---\ndate: ${today}\n---\n# DESIGN\n## Design system\n## Component inventory\n## A11y\n## Responsive\n`,
  });
  assert.equal(warnKinds(r).filter((k) => k === 'stale' || k === 'no-date').length, 0);
});

test('missing date warns only for date:any types', () => {
  const r = lint({
    'docs/arch/ARCH-x.md': `# ARCH\n## Non-goals\nn\n## Risks\nr\n`,
  });
  assert.ok(warnKinds(r).includes('no-date'));
});

// ─── templates: structure-only ─────────────────────────────────────────────

test('templates are structurally checked but never warned for freshness/sourcing', () => {
  const r = lint({
    // Valid TM template shape, no date, no links — must NOT warn (it's a skeleton).
    'skills/great_cto/templates/TM-x.md':
      `# TM-x\n## 1. Surface\ns\n## 3. Findings\nf\n## 6. Gates\ng\n`,
  });
  assert.equal(r.errors.length, 0, 'valid template shape → no structural error');
  assert.equal(r.warns.length, 0, 'template must not warn on no-date / no-source');
});

test('template still fails structure when a section is missing', () => {
  const r = lint({
    'skills/great_cto/templates/TM-y.md': `# TM-y\n## 1. Surface\ns\n## 3. Findings\nf\n`, // no gate
  });
  assert.ok(r.errors.some((e) => /gate/i.test(e.msg)));
});

test('"Surface" satisfies the TM scope requirement (attack-surface wording)', () => {
  const r = lint({
    'skills/great_cto/templates/TM-z.md': `# TM-z\n## Surface\ns\n## Findings\nf\n## Gates\ng\n`,
  });
  assert.equal(r.errors.length, 0);
});

// ─── PLAN: structure-agnostic thinness check ───────────────────────────────

test('PLAN with < 2 H2 sections is a stub ERROR', () => {
  const r = lint({ 'docs/plans/PLAN-stub.md': `# PLAN\n## Only one\nx\n` });
  assert.ok(errKinds(r).includes('thin'));
});

test('PLAN with 2+ H2 sections of any name passes structure', () => {
  const r = lint({ 'docs/plans/PLAN-ok.md': `# PLAN\n## Principle\np\n## Sequence\ns\n## Skip\nk\n` });
  assert.equal(r.errors.length, 0);
});

// ─── generated digests are ignored ─────────────────────────────────────────

test('*.summary.md generated digests are not linted', () => {
  const r = lint({ 'docs/plans/PLAN-x.summary.md': `# just a digest, no sections\n` });
  assert.equal(r.checked, 0);
  assert.equal(r.errors.length, 0);
});

// ─── enforcement exit code ─────────────────────────────────────────────────

test('--enforce exits non-zero on structural errors, zero otherwise', () => {
  const bad = lint({ 'docs/plans/PLAN-stub.md': `# PLAN\n## one\nx\n` }, ['--enforce']);
  assert.equal(bad.status, 1);

  const good = lint(
    { 'docs/adr/ADR-1.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n` },
    ['--enforce'],
  );
  assert.equal(good.status, 0);
});

test('warn-only (default) exits 0 even with warnings', () => {
  const r = lint({
    'docs/adr/ADR-9.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\ne\n`,
  });
  assert.ok(r.warns.length > 0);
  assert.equal(r.status, 0);
});
