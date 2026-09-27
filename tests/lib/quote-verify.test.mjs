// A quoted passage must exist in the file it cites.
//
// Reviewers quote regulations, ADRs, specs and code, and a quote reads as
// evidence: the reader assumes somebody copied it. finding-evidence.mjs asks for
// the command behind a claim about live state, but nothing asked whether a
// passage in quotation marks is actually in the file next to it — so an invented
// quote, fluent and plausible, passed every check that existed. This is that
// check: a substring search, not a judgement.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeText, verifyQuote, findQuoteCitations, verifyQuotesInText,
} from '../../scripts/lib/quote-verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'scripts/lib/quote-verify.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-quote-verify-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const ADR = [
  '# ADR-009 — gates follow reversibility',
  '',
  'An operation that is expensive to reverse gets a gate only if it',
  'happens to land on a stage boundary.',
  '',
  'The **gate** must be a human decision — never a “silent” default…',
  'Retention is `30 days` for audit logs.',
].join('\n');
fs.mkdirSync(path.join(tmp, 'docs/adr'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'docs/adr/ADR-009.md'), ADR);
const FILE = path.join(tmp, 'docs/adr/ADR-009.md');

// ── verifyQuote ────────────────────────────────────────────────────────────

test('an exact quote is found, with the line it starts on', () => {
  const r = verifyQuote({ file: FILE, quote: 'expensive to reverse gets a gate' });
  assert.equal(r.status, 'exact');
  assert.equal(r.line, 3);
});

test('a quote that crosses a line break and swaps typographic marks still verifies — as normalized', () => {
  // The file breaks the sentence across two lines and writes “silent”, an em
  // dash and a real ellipsis; the reviewer typed it on one line with ASCII.
  const r = verifyQuote({ file: FILE, quote: 'gets a gate only if it happens to land on a stage boundary' });
  assert.equal(r.status, 'normalized');
  assert.equal(r.line, 3, 'the line is where the match starts in the ORIGINAL file');

  const marks = verifyQuote({ file: FILE, quote: 'The gate must be a human decision - never a "silent" default...' });
  assert.equal(marks.status, 'normalized', 'quotes, dashes, ellipsis and **emphasis** are unified');
  assert.equal(marks.line, 6);

  const code = verifyQuote({ file: FILE, quote: 'Retention is 30 days for audit logs.' });
  assert.equal(code.status, 'normalized', 'backticks are formatting, not words');
  assert.equal(code.line, 7);
});

test('case is significant unless asked otherwise', () => {
  assert.equal(verifyQuote({ file: FILE, quote: 'AN OPERATION THAT IS EXPENSIVE' }).status, 'not-found');
  const ci = verifyQuote({ file: FILE, quote: 'AN OPERATION THAT IS EXPENSIVE', ci: true });
  assert.equal(ci.status, 'normalized');
  assert.equal(ci.line, 3);
});

test('an invented quote is not found, and the nearest real line is offered', () => {
  const r = verifyQuote({ file: FILE, quote: 'every gate must land on a stage boundary twice' });
  assert.equal(r.status, 'not-found');
  assert.ok(r.nearest, 'a not-found names the closest line so the author can re-copy it');
  assert.equal(r.nearest.line, 4);
  assert.match(r.nearest.text, /stage boundary/);
  assert.ok(r.nearest.text.length <= 80);
});

test('a missing file is its own status, not a not-found', () => {
  const r = verifyQuote({ file: path.join(tmp, 'docs/adr/ADR-404.md'), quote: 'anything at all here' });
  assert.equal(r.status, 'file-missing');
});

test('a relative path resolves against cwd', () => {
  const r = verifyQuote({ file: 'docs/adr/ADR-009.md', quote: 'stage boundary', cwd: tmp });
  assert.equal(r.status, 'exact');
  assert.equal(r.line, 4);
});

test('normalisation collapses whitespace and unifies marks', () => {
  assert.equal(normalizeText('a\n  b\t“c” — d…  '), 'a b "c" - d...');
  assert.equal(normalizeText('**bold** and `code`'), 'bold and code');
});

// ── finding citations in prose ─────────────────────────────────────────────

test('a citation with an inline quote on the same line is paired', () => {
  const c = findQuoteCitations('Per `docs/adr/ADR-009.md:4`, "happens to land on a stage boundary".');
  assert.equal(c.length, 1);
  assert.equal(c[0].file, 'docs/adr/ADR-009.md');
  assert.equal(c[0].citedLine, 4);
  assert.equal(c[0].quote, 'happens to land on a stage boundary');
});

test('a blockquote after a citation is the quote, across its lines', () => {
  const text = [
    'The ADR says (docs/adr/ADR-009.md):',
    '',
    '> An operation that is expensive to reverse gets a gate only if it',
    '> happens to land on a stage boundary.',
  ].join('\n');
  const c = findQuoteCitations(text);
  assert.equal(c.length, 1);
  assert.equal(c[0].file, 'docs/adr/ADR-009.md');
  assert.match(c[0].quote, /expensive to reverse[\s\S]*stage boundary/);
});

test('a `> Source:` line names the file of the quote above it', () => {
  const c = findQuoteCitations('> "a human decision"\n> Source: docs/adr/ADR-009.md\n');
  assert.equal(c.length, 1);
  assert.equal(c[0].file, 'docs/adr/ADR-009.md');
  assert.equal(c[0].quote, 'a human decision');
});

test('code fences, URLs, short quoted words and marked paraphrases are not quotes to check', () => {
  const text = [
    '```',
    '$ grep "not in the file at all" docs/adr/ADR-009.md',
    '```',
    'See https://example.com/spec.md "an entirely made up passage here".',
    'Status in `src/a.ts:3` is "passed".',
    'In docs/adr/ADR-009.md the rule is "gates are always optional" (paraphrase).',
  ].join('\n');
  assert.deepEqual(findQuoteCitations(text), []);
});

test('verifyQuotesInText verifies each pair against the file', () => {
  const text = [
    'Per `docs/adr/ADR-009.md:4`, "happens to land on a stage boundary".',
    'Per `docs/adr/ADR-009.md:3`, "gates are optional for small teams".',
    'Per `docs/adr/ADR-404.md`, "whatever the missing file says".',
  ].join('\n');
  const r = verifyQuotesInText(text, { cwd: tmp });
  assert.deepEqual(r.map((x) => x.status), ['exact', 'not-found', 'file-missing']);
  assert.equal(r[0].line, 4);
  assert.equal(r[1].reportLine, 2, 'each result says where in the report the quote was');
});

test('a scanned citation may not leave the working directory', () => {
  const outside = path.join(os.tmpdir(), `gc-qv-outside-${process.pid}.md`);
  fs.writeFileSync(outside, 'secret words live here\n');
  try {
    const r = verifyQuotesInText(`In \`${outside}\`: "secret words live here".`, { cwd: tmp });
    assert.equal(r.length, 1);
    assert.equal(r[0].status, 'file-missing', 'a report is untrusted text — it cannot make us read /etc');
  } finally { fs.rmSync(outside, { force: true }); }
});

// ── CLI ────────────────────────────────────────────────────────────────────

const run = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: tmp, encoding: 'utf8' });

test('CLI --file/--quote exits 0 on a match and 1 on an invented quote', () => {
  const ok = run(['--file', 'docs/adr/ADR-009.md', '--quote', 'stage boundary']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /exact/);
  const bad = run(['--file', 'docs/adr/ADR-009.md', '--quote', 'two humans must approve']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /not-found/);
});

test('CLI --scan of a report with one good and one invented quote exits 1 and names the bad one', () => {
  fs.writeFileSync(path.join(tmp, 'REVIEW.md'), [
    '# REVIEW',
    '',
    '- Per `docs/adr/ADR-009.md:4`, "happens to land on a stage boundary".',
    '- Per `docs/adr/ADR-009.md:5`, "reviewers may waive any gate at will".',
  ].join('\n'));
  const r = run(['--scan', 'REVIEW.md']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /reviewers may waive/);
  assert.match(r.stdout, /1 not verified|not-found/);

  fs.writeFileSync(path.join(tmp, 'CLEAN.md'), '- Per `docs/adr/ADR-009.md:4`, "happens to land on a stage boundary".\n');
  assert.equal(run(['--scan', 'CLEAN.md']).status, 0);
});

test('CLI with no arguments prints usage and exits 2', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});
