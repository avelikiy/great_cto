// Tests for scripts/lib/freshness.mjs — declared `stale_after` vs the existing
// date-age heuristic (labelled `mtime`, though it actually reads the doc's own
// declared date, not the filesystem — see the comment on ageDays()/judgeFreshness()
// for why the label survives anyway).
//
// Three states only: 'fresh' | 'stale' | 'unknown'. Every judgement carries a
// `basis` ('declared' | 'mtime') so the report can say which rule fired. `now`
// is always an injected parameter — these tests never touch the real clock, so
// every state is reachable without a timer hack.
//
// ARCH: docs/architecture/ARCH-stale-after.md — "Freshness contract" section.
// ADR:  docs/adr/ADR-011-stale-after-precedence.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStaleAfter, extractDate, ageDays, judgeFreshness } from '../../scripts/lib/freshness.mjs';

const NOW = Date.parse('2026-08-17T00:00:00Z');
const DAY = 86_400_000;

// ─── parseStaleAfter ────────────────────────────────────────────────────────

test('parseStaleAfter reads a YAML frontmatter stale_after', () => {
  const text = '---\nname: ARCH-x\nstale_after: 2027-02-12\n---\n# X\n';
  assert.equal(parseStaleAfter(text), '2027-02-12');
});

test('parseStaleAfter reads the inline **Stale after:** marker (no frontmatter)', () => {
  const text = '# ADR-011\n**Status:** Proposed\n**Stale after:** 2027-01-01\n## Context\n';
  assert.equal(parseStaleAfter(text), '2027-01-01');
});

test('parseStaleAfter prefers frontmatter when both forms are present', () => {
  const text = '---\nstale_after: 2027-03-01\n---\n**Stale after:** 2099-01-01\n';
  assert.equal(parseStaleAfter(text), '2027-03-01');
});

test('parseStaleAfter discards a non-date value instead of coercing it', () => {
  // "soon" never matches the anchored \d{4}-\d{2}-\d{2} pattern at all.
  const text = '---\nstale_after: soon\n---\n# X\n';
  assert.equal(parseStaleAfter(text), null);
});

test('parseStaleAfter discards a shape-valid but calendar-invalid date', () => {
  // Matches \d{4}-\d{2}-\d{2} syntactically; month 13 / day 40 do not exist.
  const text = '---\nstale_after: 2026-13-40\n---\n# X\n';
  assert.equal(parseStaleAfter(text), null);
});

test('parseStaleAfter returns null when the field is absent entirely', () => {
  assert.equal(parseStaleAfter('# X\n**Date:** 2026-01-01\n'), null);
});

// ─── extractDate (moved here from artifact-lint.mjs — single source, no drift) ─

test('extractDate reads the inline **Date:** marker', () => {
  assert.equal(extractDate('# X\n**Date:** 2026-05-09\n'), '2026-05-09');
});

test('extractDate returns null with no date anywhere', () => {
  assert.equal(extractDate('# X\nno date here\n'), null);
});

// ─── ageDays — now is a parameter, never the real clock ───────────────────────

test('ageDays computes age against the injected now, not Date.now()', () => {
  assert.equal(ageDays('2026-08-01', NOW), 16);
});

test('ageDays returns null for an unparseable date', () => {
  assert.equal(ageDays('not-a-date', NOW), null);
});

// ─── judgeFreshness — declared basis wins over date-age, in both directions ───

test('REQ-1: future stale_after is fresh/declared even when the doc is old by date-age', () => {
  const text = '---\nstale_after: 2027-01-01\n---\n# X\n**Date:** 2000-01-01\n';
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'fresh');
  assert.equal(r.basis, 'declared');
  assert.equal(r.staleAfter, '2027-01-01');
});

test('REQ-1: past stale_after is stale/declared even when the doc is fresh by date-age', () => {
  const text = `---\nstale_after: 2026-01-01\n---\n# X\n**Date:** ${new Date(NOW - DAY).toISOString().slice(0, 10)}\n`;
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'stale');
  assert.equal(r.basis, 'declared');
  assert.equal(r.staleAfter, '2026-01-01');
});

test('stale_after equal to now reads as stale ("on/after that date")', () => {
  const text = '---\nstale_after: 2026-08-17\n---\n# X\n';
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'stale');
  assert.equal(r.basis, 'declared');
});

// ─── judgeFreshness — REQ-2: absent stale_after falls to the labelled mtime rule ─

test('REQ-2: no stale_after, recent date, within threshold → fresh/mtime', () => {
  const recent = new Date(NOW - 10 * DAY).toISOString().slice(0, 10);
  const text = `# X\n**Date:** ${recent}\n`;
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'fresh');
  assert.equal(r.basis, 'mtime');
  assert.equal(r.staleAfter, null);
  assert.equal(r.ageDays, 10);
});

test('REQ-2: no stale_after, date past threshold → stale/mtime', () => {
  const text = '# X\n**Date:** 2000-01-01\n';
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'stale');
  assert.equal(r.basis, 'mtime');
});

test('REQ-2: neither field present → unknown/mtime, never silently fresh', () => {
  const text = '# X\nno date, no stale_after\n';
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.basis, 'mtime');
  assert.equal(r.date, null);
  assert.equal(r.ageDays, null);
});

test('neither field present is "unknown" regardless of dateType — the any/optional gate is a report-time decision, not a verdict-time one', () => {
  const text = '# X\nno date, no stale_after\n';
  const any = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  const optional = judgeFreshness({ text, dateType: 'optional', nowMs: NOW, staleDays: 180 });
  assert.equal(any.verdict, 'unknown');
  assert.equal(optional.verdict, 'unknown');
});

test('a malformed stale_after falls to mtime, never to fresh (inverse-control safety)', () => {
  // A far-future or garbage stale_after must never mask a genuinely stale doc by
  // being silently read as "fresh". Garbage discards to null; the doc falls to
  // the ordinary date-age judgement, which still fires.
  const text = '---\nstale_after: not-a-real-date\n---\n# X\n**Date:** 2000-01-01\n';
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.basis, 'mtime');
  assert.equal(r.verdict, 'stale');
});

// ─── now is genuinely injected, not read from the real clock ──────────────────

test('the same document judges differently under two different injected `now` values', () => {
  const text = '---\nstale_after: 2026-09-01\n---\n# X\n';
  const before = judgeFreshness({ text, dateType: 'any', nowMs: Date.parse('2026-08-01T00:00:00Z'), staleDays: 180 });
  const after = judgeFreshness({ text, dateType: 'any', nowMs: Date.parse('2026-10-01T00:00:00Z'), staleDays: 180 });
  assert.equal(before.verdict, 'fresh');
  assert.equal(after.verdict, 'stale');
});

// ─── What the reviewers found, and the fixtures did not ──────────────────────
//
// Four findings from the qa-engineer and security-officer passes on d128ce10.
// Each one is a case where the document declared a date and the parser lost it,
// or where a comment described a check that was not happening — the same class
// of defect the module exists to remove.

test('CRLF frontmatter still declares its date', () => {
  // A Windows checkout or an editor normalising line endings must not demote a
  // declared document to the mtime rule, where it looks exactly like a document
  // that never declared anything.
  const text = '---\r\nstale_after: 2026-09-01\r\n---\r\n# X\r\n';
  assert.equal(parseStaleAfter(text), '2026-09-01');
  const r = judgeFreshness({ text, dateType: 'any', nowMs: NOW, staleDays: 180 });
  assert.equal(r.basis, 'declared');
});

test('a leading BOM does not hide the frontmatter block', () => {
  const text = '﻿---\nstale_after: 2026-09-01\n---\n# X\n';
  assert.equal(parseStaleAfter(text), '2026-09-01');
});

test('CRLF and BOM are tolerated by extractDate too, not only where reported', () => {
  // Both parsers live in one module precisely so a fix to one is a fix to both;
  // a tolerance applied only to the reported path would recreate the drift.
  assert.equal(extractDate('﻿---\r\ndate: 2026-05-01\r\n---\r\n'), '2026-05-01');
});

test('an impossible day of month is discarded, not rolled forward', () => {
  // `Date.parse` rejects an impossible MONTH but silently rolls an impossible
  // DAY forward: 2026-02-30 becomes March 2. Judging a document against a date
  // its author never wrote is worse than having no date at all.
  for (const bad of ['2026-02-30', '2026-04-31', '2026-06-31', '2026-11-31']) {
    assert.equal(parseStaleAfter(`---\nstale_after: ${bad}\n---\n`), null, `${bad} must not parse`);
  }
});

test('a real end-of-month date still parses — the day check is not over-eager', () => {
  for (const good of ['2026-02-28', '2028-02-29', '2026-04-30', '2026-12-31']) {
    assert.equal(parseStaleAfter(`---\nstale_after: ${good}\n---\n`), good, `${good} must parse`);
  }
});
