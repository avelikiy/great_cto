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
function lint(files, args = [], env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'artlint-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    const r = spawnSync('node', [LINTER, '--json', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
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

test('fenced code cannot fake structure: bash comments in ``` are not headings', () => {
  // Regression: pre-fix, `# context` / `# decision` / `# consequence` inside a
  // fence satisfied both the H1 check and all required-section regexes, letting
  // a section-less stub sail through --enforce.
  const r = lint({
    'docs/adr/ADR-005-x.md':
      'Intro prose, no real heading.\n\n```bash\n# context — just a bash comment\n# decision goes here\n# consequence: none\n```\n',
  });
  assert.ok(errKinds(r).includes('no-h1'));
  const missing = r.errors.filter((e) => e.kind === 'missing-section');
  assert.equal(missing.length, 3); // context, decision, consequence all missing
});

test('real headings around fences still count (fence stripping is not greedy)', () => {
  const r = lint({
    'docs/adr/ADR-006-x.md':
      `# ADR-006: X\n**Date:** ${today}\n## Context\n\`\`\`bash\necho hi\n\`\`\`\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
  });
  assert.equal(r.errors.length, 0);
  assert.equal(r.warns.length, 0);
});

// ─── sourcing ──────────────────────────────────────────────────────────────

test('ADR with zero references warns (no-source)', () => {
  const r = lint({
    'docs/adr/ADR-004-x.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\ne\n`,
  });
  assert.ok(warnKinds(r).includes('no-source'));
  assert.equal(r.errors.length, 0);
});

test('an inline-code file path counts as a source (no no-source warn)', () => {
  const r = lint({
    'docs/adr/ADR-007-x.md':
      `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\nSee \`scripts/agent-prompt-lint.mjs\`.\n`,
  });
  assert.ok(!warnKinds(r).includes('no-source'));
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

// ─── freshness: declared stale_after (ARCH-stale-after) ────────────────────

test('REQ-1: future stale_after reads fresh via --now, basis declared, no warn', () => {
  const r = lint(
    {
      'docs/adr/ADR-030-x.md':
        `---\nstale_after: 2027-06-01\n---\n# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    ['--now', '2026-08-17'],
  );
  assert.equal(r.errors.length, 0);
  assert.equal(warnKinds(r).filter((k) => k === 'stale' || k === 'stale-declared').length, 0);
  const f = r.freshness.find((x) => x.file === 'docs/adr/ADR-030-x.md');
  assert.equal(f.verdict, 'fresh');
  assert.equal(f.basis, 'declared');
  assert.equal(f.staleAfter, '2027-06-01');
});

test('REQ-1: past stale_after warns stale-declared via --now, regardless of a fresh **Date:**', () => {
  const r = lint(
    {
      'docs/adr/ADR-031-x.md':
        `---\nstale_after: 2026-01-01\n---\n# ADR\n**Date:** 2026-08-16\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    ['--now', '2026-08-17'],
  );
  assert.ok(warnKinds(r).includes('stale-declared'));
  assert.ok(!warnKinds(r).includes('stale'), 'declared precedence must suppress the plain mtime "stale" kind');
  const w = r.warns.find((x) => x.kind === 'stale-declared');
  assert.match(w.msg, /2026-01-01/);
});

test('REQ-1: future stale_after suppresses a stale warn even though **Date:** is ancient', () => {
  const r = lint(
    {
      'docs/adr/ADR-032-x.md':
        `---\nstale_after: 2099-01-01\n---\n# ADR\n**Date:** 2000-01-01\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    ['--now', '2026-08-17'],
  );
  assert.equal(warnKinds(r).filter((k) => k === 'stale' || k === 'stale-declared').length, 0);
});

test('GREAT_CTO_NOW env var resolves `now` the same way --now does', () => {
  const r = lint(
    {
      'docs/adr/ADR-033-x.md':
        `---\nstale_after: 2026-01-01\n---\n# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    [],
    { GREAT_CTO_NOW: '2026-08-17' },
  );
  assert.ok(warnKinds(r).includes('stale-declared'));
});

test('REQ-2: no stale_after, date:any type with neither field — unknown, exact message names the basis', () => {
  const r = lint({ 'docs/arch/ARCH-y.md': `# ARCH\n## Non-goals\nn\n## Risks\nr\n` }, ['--now', '2026-08-17']);
  const w = r.warns.find((x) => x.kind === 'no-date');
  assert.equal(w.msg, 'no stale_after, no date — judged by mtime, freshness unknown');
  const f = r.freshness.find((x) => x.file === 'docs/arch/ARCH-y.md');
  assert.equal(f.verdict, 'unknown');
  assert.equal(f.basis, 'mtime');
});

test('REQ-2: date:optional type (PLAN) with neither field stays silent, as today — pre-field docs never start failing', () => {
  const r = lint(
    { 'docs/plans/PLAN-old.md': `# PLAN\n## Principle\np\n## Sequence\ns\n` },
    ['--now', '2026-08-17'],
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.warns.length, 0);
});

test('a malformed stale_after falls back to the mtime rule through the full CLI, never to "fresh"', () => {
  const r = lint(
    {
      'docs/adr/ADR-034-x.md':
        `---\nstale_after: 2026-13-40\n---\n# ADR\n**Date:** 2000-01-01\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    ['--now', '2026-08-17'],
  );
  assert.ok(warnKinds(r).includes('stale'));
  assert.ok(!warnKinds(r).includes('stale-declared'));
});

test('freshness[] records a basis for every checked non-template artifact, even a clean pass', () => {
  const r = lint({
    'docs/adr/ADR-035-x.md': `# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
  });
  const f = r.freshness.find((x) => x.file === 'docs/adr/ADR-035-x.md');
  assert.equal(f.verdict, 'fresh');
  assert.equal(f.basis, 'mtime');
  assert.equal(f.staleAfter, null);
});

test('Safeguard: stale-declared is WARN-only — --enforce does not exit non-zero for it', () => {
  const r = lint(
    {
      'docs/adr/ADR-036-x.md':
        `---\nstale_after: 2026-01-01\n---\n# ADR\n**Date:** ${today}\n## Context\nc\n## Decision\nd\n## Consequences\n[r](https://x)\n`,
    },
    ['--now', '2026-08-17', '--enforce'],
  );
  assert.ok(warnKinds(r).includes('stale-declared'));
  assert.equal(r.status, 0);
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
