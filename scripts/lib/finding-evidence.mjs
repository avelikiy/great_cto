#!/usr/bin/env node
/**
 * finding-evidence — a finding must carry the command that proves it.
 *
 * Why this exists
 * ---------------
 * The Structured Findings Format already asks for problems that are
 * "evidence-backed". That is an adjective. Nothing reads it, nothing rejects a
 * finding without evidence, and the failure it permits is the expensive one: an
 * agent writes "the secret is not set" because it looks true, and the sentence
 * is indistinguishable from one produced by running `grep` and reading the
 * output. A reviewer cannot tell them apart either — a fluent wrong finding is
 * exactly what plausibility-checking approves.
 *
 * So the check does not judge the prose. It asks whether the agent touched the
 * world: a claim about live state carries the command it ran and that command's
 * raw output, or it is a hypothesis and must say so.
 *
 * The status vocabulary is the existing one (scripts/lib/proof-status.mjs) —
 * `passed` / `failed` are results, `not_run` / `inconclusive` are the two ways
 * of not knowing, and neither may be rendered as a result. A finding whose
 * evidence is not_run or inconclusive is a hypothesis: real, worth recording,
 * and not a finding.
 *
 * Shape it enforces:
 *
 *   ### [High] Session secret is unset in production
 *
 *   - **Location**: `packages/board/lib/config.mjs:12`
 *   - **Problem**: …
 *   - **Evidence**: failed
 *     ```
 *     $ grep -n SESSION_SECRET .env.production
 *     (no output — exit 1)
 *     ```
 *   - **Why it matters**: …
 *   - **Recommended fix**: …
 *
 * CLI:
 *   node scripts/lib/finding-evidence.mjs <report.md>... [--strict] [--json]
 */

import { PROOF, PROOF_VALUES, isProofStatus } from './proof-status.mjs';

/** A heading that opens a finding: `### [Severity] Title`. */
const FINDING_HEAD = /^#{2,4}\s*\[([^\]]+)\]\s*(.+?)\s*$/;

/** Headings under which an unproven claim is allowed to live. */
const HYPOTHESIS_SECTION = /^#{1,4}\s*(hypothes[ie]s|unverified|open questions|to investigate)\b/i;

/**
 * Split a report into finding blocks, remembering whether each sits under a
 * hypotheses heading — because the same text is a defect in one section and a
 * question in the other.
 *
 * @returns {Array<{severity, title, body, line, underHypotheses}>}
 */
export function parseFindings(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let cur = null;
  let underHypotheses = false;
  let inFence = false;

  const close = (end) => { if (cur) { cur.body = lines.slice(cur.line, end).join('\n'); out.push(cur); cur = null; } };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // A heading inside a fenced block is not a heading — a `# comment` in a
    // shell example must not end the finding that quotes it.
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; continue; }
    if (inFence) continue;

    if (/^#{1,4}\s/.test(l)) {
      const head = l.match(FINDING_HEAD);
      if (head) {
        close(i);
        cur = { severity: head[1].trim(), title: head[2].trim(), line: i + 1, underHypotheses, body: '' };
        continue;
      }
      // A plain heading ends the current finding and may switch the section.
      close(i);
      if (HYPOTHESIS_SECTION.test(l)) underHypotheses = true;
      else if (/^#{1,4}\s/.test(l)) underHypotheses = false;
    }
  }
  close(lines.length);
  return out;
}

/** `- **Evidence**: <status>` → the status, or null when the field is absent. */
export function evidenceStatus(body) {
  const m = String(body ?? '').match(/^\s*[-*]?\s*\*\*Evidence\*\*\s*:\s*([a-z_]+)/mi);
  if (!m) return null;
  const s = m[1].toLowerCase();
  return isProofStatus(s) ? s : s;   // returned as-is so the caller can name a bad value
}

/**
 * The fenced block that follows the Evidence field, if any.
 *
 * The command and its output live together on purpose: a command with no output
 * proves nothing was observed, and output with no command cannot be re-run by
 * the person reading it.
 */
export function evidenceBlock(body) {
  const text = String(body ?? '');
  const at = text.search(/^\s*[-*]?\s*\*\*Evidence\*\*\s*:/mi);
  if (at === -1) return null;
  const after = text.slice(at);
  const fence = after.match(/```[\w-]*\n([\s\S]*?)```/);
  if (!fence) return null;
  const lines = fence[1].split('\n');
  const cmdIdx = lines.findIndex((l) => /^\s*(\$|>|#)?\s*\S/.test(l) && l.trim());
  if (cmdIdx === -1) return null;
  const command = lines[cmdIdx].replace(/^\s*[$>#]\s*/, '').trim();
  const output = lines.slice(cmdIdx + 1).join('\n').trim();
  return { command, output, raw: fence[1] };
}

/**
 * Check one finding.
 * @returns {{ok: boolean, problems: string[], status: string|null, hypothesis: boolean}}
 */
export function checkFinding(finding) {
  const problems = [];
  const status = evidenceStatus(finding.body);
  const block = evidenceBlock(finding.body);

  if (status === null) {
    problems.push(
      'no `**Evidence**` field — a claim about live state carries the command that ' +
      `established it. If nothing was run, say so: ${PROOF.NOT_RUN}.`,
    );
    return { ok: false, problems, status: null, hypothesis: false };
  }

  if (!isProofStatus(status)) {
    problems.push(`\`${status}\` is not a proof status — use one of: ${PROOF_VALUES.join(', ')}`);
    return { ok: false, problems, status, hypothesis: false };
  }

  const settled = status === PROOF.PASSED || status === PROOF.FAILED;

  if (settled) {
    // A settled status is a claim that a command ran. Show it.
    if (!block) {
      problems.push(`\`${status}\` claims a check ran — include the command and its raw output in a fenced block`);
    } else {
      if (!block.command) problems.push('the evidence block has no command on its first line');
      if (!block.output) {
        problems.push(
          'the evidence block shows a command but no output — a command with no output ' +
          'proves nothing was observed',
        );
      }
    }
  }

  // not_run / inconclusive are honest, and they are not findings.
  const hypothesis = !settled;
  if (hypothesis && !finding.underHypotheses) {
    problems.push(
      `evidence is \`${status}\`, so this is a hypothesis — move it under a ` +
      '“Hypotheses” heading rather than listing it as a finding',
    );
  }

  return { ok: problems.length === 0, problems, status, hypothesis };
}

/**
 * Check a whole report.
 * @returns {{findings: number, hypotheses: number, problems: Array<{line, title, problem}>}}
 */
export function checkReport(text) {
  const findings = parseFindings(text);
  const problems = [];
  let hypotheses = 0;
  for (const f of findings) {
    const r = checkFinding(f);
    if (r.hypothesis) hypotheses++;
    for (const p of r.problems) problems.push({ line: f.line, title: f.title, problem: p });
  }
  return { findings: findings.length, hypotheses, problems };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: finding-evidence.mjs <report.md>... [--strict] [--json]');
    return 2;
  }
  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { console.error(`cannot read ${f}`); continue; }
    const r = checkReport(text);
    all.push({ file: f, ...r });
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(all, null, 2));
  } else {
    for (const r of all) {
      const bad = r.problems.length;
      console.log(`${r.file}: ${r.findings} finding(s), ${r.hypotheses} hypothes(e)s, ${bad} problem(s)`);
      for (const p of r.problems) console.log(`  line ${p.line}  ${p.title}\n      ↳ ${p.problem}`);
    }
  }
  const total = all.reduce((n, r) => n + r.problems.length, 0);
  return argv.includes('--strict') && total ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
