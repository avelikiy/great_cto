// scripts/lib/review-catch.mjs — does a reviewer catch the defects a diff actually has?
//
// The EVAL-*.md files ask a judge whether one answer to one prose case was right. They
// cannot say what share of real defects in real code a reviewer finds, and the
// code-reviewer holdout says so of itself: 16 of its 20 cases measure resistance to a
// stated reason for skipping, not the review. This module scores the review itself.
//
// A case is a unified diff of small realistic files plus `known_defects` — file, line
// range on the new side, class, severity floor, and the roles expected to catch it.
// Decoy cases have no defect and look like they might; they measure false alarms.
//
// Scoring is deterministic: no judge. A finding catches a defect when it names the same
// file, a line inside the defect's range (± tolerance), and a compatible class. Recall
// is caught / expected for the role; the decoy-clean rate is the share of decoys with no
// finding at P0–P2. Both carry Wilson intervals and are settled by eval-power's verdict,
// so 13 defects that cannot settle a 0.6 bar are reported as inconclusive, not passed.
//
// What it does not measure: whether the reasoning is right (a finding at the right
// line with the right class but a wrong explanation counts), and anything outside the
// diff. The live run is a one-shot proxy of the agent prompt, not the full harness.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { wilson, verdict as powerVerdict, dropout as dropoutOf } from './eval-power.mjs';
import { PROOF } from './proof-status.mjs';

export const REVIEW_ROLES = Object.freeze(['code-reviewer', 'security-officer']);

/** The defect classes a case may seed, and the words reviewers use for each. */
export const CLASSES = Object.freeze({
  'money-precision': ['money', 'precision', 'rounding', 'float', 'floating-point', 'decimal', 'currency', 'minor-units', 'remainder', 'arithmetic'],
  idempotency: ['idempotent', 'idempotency-key', 'replay', 'duplicate', 'double-credit', 'double-charge', 'double-payout', 'double-refund', 'dedupe', 'deduplication', 'redelivery', 'retry'],
  authz: ['authorization', 'authorisation', 'access-control', 'broken-access-control', 'idor', 'bola', 'tenant-isolation', 'cross-tenant', 'tenant-leak', 'privilege-escalation', 'missing-authorization'],
  injection: ['sql-injection', 'sqli', 'command-injection', 'os-command-injection', 'shell-injection', 'rce', 'remote-code-execution', 'code-injection'],
  race: ['race-condition', 'missing-await', 'unawaited-promise', 'floating-promise', 'unhandled-rejection', 'async', 'ordering'],
  'secret-exposure': ['secret', 'secret-logging', 'secrets-in-logs', 'credential-leak', 'credential-exposure', 'token-leak', 'sensitive-data-exposure', 'information-disclosure', 'logging'],
  toctou: ['time-of-check-time-of-use', 'check-then-act', 'double-spend', 'lost-update', 'concurrency', 'missing-lock', 'missing-transaction'],
});

/**
 * Classes close enough that naming one for the other is the same catch. A double spend
 * described as a race condition is the defect, seen; refusing it would score vocabulary.
 */
const COMPATIBLE = [['race', 'toctou']];

export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
const SEVERITY_WORDS = { critical: 'P0', blocker: 'P0', high: 'P1', major: 'P1', medium: 'P2', moderate: 'P2', minor: 'P2', low: 'P3', info: 'P3', nit: 'P3', observation: 'P3' };
/** A finding at P3 is an observation: it can catch a defect, it is never a false alarm. */
const COUNTED = new Set(['P0', 'P1', 'P2']);

export const DEFAULT_TOLERANCE = 3;

const slug = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s_/]+/g, '-').replace(/[^a-z0-9-]/g, '');

export function normalizeClass(raw) {
  const s = slug(raw);
  if (!s) return 'other';
  if (Object.hasOwn(CLASSES, s)) return s;
  for (const [cls, words] of Object.entries(CLASSES)) if (words.includes(s)) return cls;
  return 'other';
}

export function compatible(a, b) {
  return a === b || COMPATIBLE.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function normalizeSeverity(raw) {
  const s = String(raw ?? '').trim();
  const up = s.toUpperCase();
  if (SEVERITIES.includes(up)) return up;
  return SEVERITY_WORDS[s.toLowerCase()] ?? 'P3';
}

const rank = (sev) => SEVERITIES.indexOf(sev);

export function normalizePath(p) {
  return String(p ?? '').trim().replace(/^[ab]\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Parse a unified diff. For each file: the new-side line numbers the diff shows
 * (`visible` — context and added) and the ones it adds. Hunk counts are checked, so a
 * hand-edited patch that no longer adds up is refused rather than scored.
 */
export function parsePatch(text) {
  const files = new Map();
  const lines = String(text).split('\n');
  let cur = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (line.startsWith('+++ ')) {
      const path = normalizePath(line.slice(4));
      cur = { visible: new Set(), added: new Set() };
      files.set(path, cur);
      continue;
    }
    const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!h) continue;
    if (!cur) throw new Error(`patch: hunk before a file header at line ${k + 1}`);
    let oldLeft = h[2] === undefined ? 1 : Number(h[2]);
    let newLeft = h[4] === undefined ? 1 : Number(h[4]);
    let n = Number(h[3]);
    while (oldLeft > 0 || newLeft > 0) {
      const body = lines[++k];
      if (body === undefined) throw new Error('patch: hunk runs past the end');
      const t = body[0];
      if (t === ' ') { cur.visible.add(n++); oldLeft--; newLeft--; }
      else if (t === '+') { cur.visible.add(n); cur.added.add(n++); newLeft--; }
      else if (t === '-') { oldLeft--; }
      else if (t === '\\') { /* no newline marker */ }
      else throw new Error(`patch: hunk counts do not match its body near line ${k + 1}`);
      if (oldLeft < 0 || newLeft < 0) throw new Error(`patch: hunk counts do not match its body near line ${k + 1}`);
    }
  }
  return files;
}

/** Load and validate a case set. Throws with every problem found, not the first. */
export function loadSet(dir) {
  const set = JSON.parse(readFileSync(join(dir, 'set.json'), 'utf8'));
  const casesDir = join(dir, 'cases');
  const ids = existsSync(casesDir) ? readdirSync(casesDir).sort() : [];
  const cases = ids.map((id) => {
    const c = JSON.parse(readFileSync(join(casesDir, id, 'case.json'), 'utf8'));
    return { ...c, dir: join(casesDir, id), patch: readFileSync(join(casesDir, id, 'diff.patch'), 'utf8') };
  });
  const problems = validateSet(set, cases);
  if (problems.length) throw new Error(`review-catch set invalid:\n  ${problems.join('\n  ')}`);
  return { set, cases };
}

export function validateSet(set, cases) {
  const problems = [];
  if (set?.version !== 1) problems.push('set.json: version must be 1');
  const tuning = Array.isArray(set?.tuning) ? set.tuning : [];
  const holdout = Array.isArray(set?.holdout) ? set.holdout : [];
  for (const k of ['recall', 'decoy_clean']) {
    const v = set?.thresholds?.[k];
    if (!(Number.isFinite(v) && v > 0 && v < 1)) problems.push(`set.json: thresholds.${k} must be a number in (0,1)`);
  }
  const listed = [...tuning, ...holdout];
  const seen = new Set();
  for (const id of listed) {
    if (seen.has(id)) problems.push(`set.json: ${id} is listed twice`);
    seen.add(id);
  }
  const present = new Set(cases.map((c) => c.id));
  for (const id of listed) if (!present.has(id)) problems.push(`set.json: ${id} has no case directory`);
  for (const id of present) if (!seen.has(id)) problems.push(`cases/${id}: in neither tuning nor holdout`);
  const defectIds = new Set();
  for (const c of cases) {
    let files;
    try { files = parsePatch(c.patch); } catch (e) { problems.push(`cases/${c.id}: ${e.message}`); continue; }
    if (!files.size) problems.push(`cases/${c.id}: diff.patch has no file`);
    const defects = Array.isArray(c.known_defects) ? c.known_defects : [];
    if (Boolean(c.decoy) !== (defects.length === 0)) problems.push(`cases/${c.id}: decoy must be true exactly when there are no known_defects`);
    for (const d of defects) {
      const where = `cases/${c.id} ${d.id}`;
      if (defectIds.has(d.id)) problems.push(`${where}: defect id repeats`);
      defectIds.add(d.id);
      if (!Object.hasOwn(CLASSES, d.class)) problems.push(`${where}: unknown class ${d.class}`);
      if (!SEVERITIES.includes(d.severity_floor)) problems.push(`${where}: unknown severity_floor ${d.severity_floor}`);
      if (!Array.isArray(d.roles) || !d.roles.length || d.roles.some((r) => !REVIEW_ROLES.includes(r))) problems.push(`${where}: roles must be a non-empty subset of ${REVIEW_ROLES.join(', ')}`);
      const f = files.get(normalizePath(d.file));
      const [s, e] = Array.isArray(d.lines) ? d.lines : [];
      if (!f) { problems.push(`${where}: ${d.file} is not in the diff`); continue; }
      if (!(Number.isInteger(s) && Number.isInteger(e) && s >= 1 && e >= s)) { problems.push(`${where}: lines must be [start, end]`); continue; }
      let shown = false;
      for (let n = s; n <= e; n++) if (f.visible.has(n)) shown = true;
      if (!shown) problems.push(`${where}: lines ${s}-${e} are not shown by the diff`);
    }
  }
  return problems;
}

/** Cases in a split, in the set's own order. */
export function casesFor(loaded, split = 'all') {
  const order = split === 'tuning' ? loaded.set.tuning
    : split === 'holdout' ? loaded.set.holdout
      : [...loaded.set.tuning, ...loaded.set.holdout];
  const byId = new Map(loaded.cases.map((c) => [c.id, c]));
  return order.map((id) => byId.get(id));
}

/**
 * The reviewer's findings, from its reply. A fenced ```json block wins (the last one),
 * else the reply as JSON. Accepts `{findings:[...]}` or a bare array. A reply with no
 * parseable findings is `null` — not an empty review, which is `[]`.
 */
export function extractFindings(reply) {
  const text = String(reply ?? '');
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const body of [...fences.reverse(), text]) {
    try {
      const v = JSON.parse(body.trim());
      const list = Array.isArray(v) ? v : Array.isArray(v?.findings) ? v.findings : null;
      if (list) return list.filter((f) => f && typeof f === 'object');
    } catch { /* next candidate */ }
  }
  return null;
}

function normFinding(f, index) {
  const line = Number.parseInt(f.line ?? f.start_line ?? f.lines?.[0], 10);
  return {
    index,
    file: normalizePath(f.file ?? f.path),
    line: Number.isInteger(line) ? line : null,
    class: normalizeClass(f.class ?? f.category ?? f.type),
    severity: normalizeSeverity(f.severity ?? f.priority),
    title: String(f.title ?? f.summary ?? '').slice(0, 200),
  };
}

const near = (f, d, tol) => f.file === normalizePath(d.file) && f.line !== null
  && f.line >= d.lines[0] - tol && f.line <= d.lines[1] + tol;
const distance = (f, d) => (f.line < d.lines[0] ? d.lines[0] - f.line : f.line > d.lines[1] ? f.line - d.lines[1] : 0);

/**
 * Score one case for one role.
 *
 * Each defect takes at most one finding (the most severe, then the nearest, then the
 * first); each finding catches at most one defect. Unmatched findings at a defect's
 * lines are `misclassified` (wrong class) or `duplicate` (defect already caught) —
 * noise, not invention. Everything else at P0–P2 is a false alarm, including a finding
 * with no file or line: a reviewer is held to citing evidence.
 */
export function scoreCase(c, rawFindings, { role, tolerance = DEFAULT_TOLERANCE } = {}) {
  const findings = (rawFindings || []).map(normFinding);
  const defects = c.known_defects || [];
  const used = new Set();
  const matches = new Map();
  for (const d of defects) {
    const cands = findings.filter((f) => !used.has(f.index) && near(f, d, tolerance) && compatible(f.class, d.class))
      .sort((a, b) => rank(a.severity) - rank(b.severity) || distance(a, d) - distance(b, d) || a.index - b.index);
    if (cands.length) { used.add(cands[0].index); matches.set(d.id, cands[0]); }
  }
  const expected = defects.filter((d) => d.roles.includes(role));
  const caught = expected.filter((d) => matches.has(d.id));
  const caughtAtSeverity = caught.filter((d) => rank(matches.get(d.id).severity) <= rank(d.severity_floor));
  const bonus = defects.filter((d) => !d.roles.includes(role) && matches.has(d.id));
  const misclassified = [], duplicate = [], falseAlarms = [];
  for (const f of findings) {
    if (used.has(f.index)) continue;
    const at = defects.find((d) => near(f, d, tolerance));
    if (at) (matches.has(at.id) ? duplicate : misclassified).push(f);
    else if (COUNTED.has(f.severity)) falseAlarms.push(f);
  }
  return {
    id: c.id, decoy: defects.length === 0,
    expected: expected.map((d) => d.id),
    caught: caught.map((d) => d.id),
    caughtAtSeverity: caughtAtSeverity.map((d) => d.id),
    missed: expected.filter((d) => !matches.has(d.id)).map((d) => d.id),
    bonus: bonus.map((d) => d.id),
    misclassified, duplicate, falseAlarms,
    truePositives: matches.size,
  };
}

/**
 * Score a run. `outputs` maps case id to the findings list, or to null/absent when the
 * reviewer never answered or the reply had no findings to read — those are dropout,
 * and eval-power refuses a settled verdict over a run that lost too much.
 */
export function scoreRun({ cases, outputs, role, thresholds, tolerance = DEFAULT_TOLERANCE }) {
  if (!REVIEW_ROLES.includes(role)) throw new Error(`role must be one of ${REVIEW_ROLES.join(', ')}`);
  const get = (id) => (outputs instanceof Map ? outputs.get(id) : outputs?.[id]);
  const order = cases.map((c) => c.id);
  const missing = order.filter((id) => !Array.isArray(get(id)));
  const perCase = cases.filter((c) => Array.isArray(get(c.id))).map((c) => scoreCase(c, get(c.id), { role, tolerance }));
  const drop = dropoutOf({ skippedNums: missing, orderedNums: order });

  const defectCases = perCase.filter((r) => !r.decoy);
  const decoys = perCase.filter((r) => r.decoy);
  const expected = defectCases.reduce((n, r) => n + r.expected.length, 0);
  const caught = defectCases.reduce((n, r) => n + r.caught.length, 0);
  const atSeverity = defectCases.reduce((n, r) => n + r.caughtAtSeverity.length, 0);
  const tp = perCase.reduce((n, r) => n + r.truePositives, 0);
  const fa = perCase.reduce((n, r) => n + r.falseAlarms.length, 0);
  const cleanDecoys = decoys.filter((r) => r.falseAlarms.length === 0).length;

  const byClass = {};
  for (const c of cases) for (const d of c.known_defects || []) {
    if (!d.roles.includes(role)) continue;
    const r = perCase.find((x) => x.id === c.id);
    if (!r) continue;
    byClass[d.class] ??= { expected: 0, caught: 0 };
    byClass[d.class].expected++;
    if (r.caught.includes(d.id)) byClass[d.class].caught++;
  }

  const recall = powerVerdict(caught, expected, thresholds?.recall, { dropout: drop });
  const decoyClean = powerVerdict(cleanDecoys, decoys.length, thresholds?.decoy_clean, { dropout: drop });
  const statuses = [recall.status, decoyClean.status];
  const status = statuses.includes(PROOF.FAILED) ? PROOF.FAILED
    : statuses.every((s) => s === PROOF.PASSED) ? PROOF.PASSED
      : statuses.every((s) => s === PROOF.NOT_RUN) ? PROOF.NOT_RUN : PROOF.INCONCLUSIVE;

  return {
    role, status, tolerance,
    cases: order.length, answered: perCase.length, missing, dropout: drop,
    recall: { ...recall, caught, expected },
    severityRecall: { caught: atSeverity, expected, interval: wilson(atSeverity, expected) },
    precision: { truePositives: tp, falseAlarms: fa, point: tp + fa ? tp / (tp + fa) : null, interval: wilson(tp, tp + fa) },
    decoyClean: { ...decoyClean, clean: cleanDecoys, decoys: decoys.length },
    byClass, perCase,
  };
}

/** The instruction a live reviewer gets for one case. Never carries the answer key. */
export function reviewPrompt(c, role) {
  return [
    `You are reviewing a pull request as the ${role}. Review only what the diff shows.`,
    `PR description: ${c.summary}`,
    '',
    'Report every defect you would raise. For each give the file, the line on the new side of',
    'the diff, a class, and a severity. Classes (use one of these words):',
    `  ${Object.keys(CLASSES).join(', ')}, other`,
    'Severity: P0 (blocks merge, exploitable or loses money), P1, P2, P3 (observation).',
    'If the change has no defect, return an empty list — do not invent findings.',
    '',
    'End your reply with exactly one fenced block:',
    '```json',
    '{"findings":[{"file":"src/x.ts","line":12,"class":"injection","severity":"P0","title":"..."}]}',
    '```',
    '',
    'Diff:',
    '```diff',
    c.patch.trimEnd(),
    '```',
  ].join('\n');
}

const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(0)}%`);
const ci = (v) => (v && v.low !== null && v.low !== undefined ? `[${pct(v.low)}, ${pct(v.high)}]` : '');

/** A human summary. Per-case lines only when asked: a holdout's misses are not for the improver. */
export function formatReport(r, { showCases = false } = {}) {
  const out = [];
  out.push(`review-catch · ${r.role} · ${r.answered}/${r.cases} case(s) answered · ${r.status.toUpperCase()}`);
  out.push(`  recall (file:line + class)  ${r.recall.caught}/${r.recall.expected}  ${pct(r.recall.point)} ${ci(r.recall)}  vs ${r.recall.threshold ?? '—'} → ${r.recall.status}`);
  out.push(`  recall at severity floor    ${r.severityRecall.caught}/${r.severityRecall.expected}`);
  out.push(`  decoys with no false alarm  ${r.decoyClean.clean}/${r.decoyClean.decoys}  ${ci(r.decoyClean)}  vs ${r.decoyClean.threshold ?? '—'} → ${r.decoyClean.status}`);
  out.push(`  precision                   ${r.precision.truePositives} true / ${r.precision.falseAlarms} false alarm(s)  ${pct(r.precision.point)}`);
  const classes = Object.entries(r.byClass).map(([k, v]) => `${k} ${v.caught}/${v.expected}`);
  if (classes.length) out.push(`  by class: ${classes.join(' · ')}`);
  if (r.missing.length) out.push(`  not answered: ${r.missing.length}${r.dropout?.why ? ` — ${r.dropout.why}` : ''}`);
  if (r.recall.why) out.push(`  ${r.recall.why}`);
  if (showCases) for (const c of r.perCase) {
    const bits = [];
    if (c.missed.length) bits.push(`missed ${c.missed.join(',')}`);
    if (c.falseAlarms.length) bits.push(`${c.falseAlarms.length} false alarm(s)`);
    if (c.misclassified.length) bits.push(`${c.misclassified.length} misclassified`);
    out.push(`    ${c.id}: ${bits.length ? bits.join('; ') : 'ok'}`);
  }
  return out.join('\n');
}
