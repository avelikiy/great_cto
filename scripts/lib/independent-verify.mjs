#!/usr/bin/env node
/**
 * independent-verify — a second model checks an agent's work before the next
 * agent is allowed to build on it.
 *
 * Why this exists
 * ---------------
 * The pipeline hands one agent's output to the next on the strength of a single
 * line the agent wrote about itself. `architect | APPROVED | arch=docs/...` is a
 * self-report, and every stage downstream treats it as fact. When it is wrong the
 * error is not caught at the next stage — it is BUILT ON, and by the time anything
 * notices, five agents have produced work resting on it.
 *
 * What this is NOT
 * ----------------
 * It is not "ask a second model whether the report looks good". A model reading a
 * report judges whether it reads plausibly, and a confident wrong answer is
 * exactly what passes that test. Two models agreeing is also weak evidence — they
 * are trained on overlapping data and fail in correlated ways.
 *
 * So the judgement is ordered cheapest-and-hardest first, and the model is only
 * asked what the machine cannot settle:
 *
 *   1. ARTEFACTS   Does every file the verdict claims exist, with content?
 *                  A missing file is a fact. No model needed, and no model asked:
 *                  when this fails the run stops here and costs nothing.
 *   2. ACCEPTANCE  Do the frozen `## ACCEPTANCE` criteria pass, by running their
 *                  own `verify:` commands? Also a fact.
 *   3. JUDGEMENT   Only now, and only on what is left: a different model reads the
 *                  ACTUAL artefact against ONE requirement at a time and answers a
 *                  closed question. Not "is this good" — "is requirement R
 *                  addressed: yes / no / unclear".
 *
 * Three states, never two
 * -----------------------
 *   verified      every check that ran, passed — and at least one check ran
 *   rework        something failed, and the failure names what to fix
 *   unverifiable  nothing could be checked: no artefact claims, no acceptance
 *                 criteria, no reachable judge
 *
 * `unverifiable` is the state this whole module exists for. It is NOT a pass. An
 * agent that claims nothing and freezes no criteria cannot be verified, and the
 * pipeline must say so rather than wave it through — otherwise the cheapest way
 * to pass verification is to claim nothing, and that is the incentive we would be
 * building in.
 *
 * `unclear` from the judge is likewise not a vote. An unparseable or hedging
 * answer is an abstention; counting it as agreement would let a broken judge
 * confirm anything.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkArtifacts, explainArtifacts, pathClaims, THIN_BYTES } from './artifact-claims.mjs';
import { parseAcceptance, summarize } from './acceptance-verify.mjs';
import { spawnSync } from 'node:child_process';

export const STATE = Object.freeze({
  VERIFIED: 'verified',
  REWORK: 'rework',
  UNVERIFIABLE: 'unverifiable',
});

/** Answers the judge is allowed to give. Anything else is an abstention. */
export const JUDGE_ANSWERS = Object.freeze(['yes', 'no', 'unclear']);

/**
 * How much of an artefact the judge is shown, per question.
 *
 * Bounded on purpose, and the bound is REPORTED rather than applied quietly: a
 * judge that saw the first 12k of a 40k document and said "yes" answered about
 * the part it saw. Truncation that is not disclosed turns a partial read into a
 * full verdict, which is the same defect one level down.
 */
export const EXCERPT_BYTES = 12_000;

/** Requirements checked by the judge in one verification. Excess is reported. */
export const MAX_JUDGED = 12;

/**
 * How many times each requirement is asked, and why it is not one.
 *
 * Setting the router to `temperature: 0` was the obvious fix for a judge that
 * answered the identical closed question differently between runs. It helps and
 * it is not sufficient — measured, not assumed: four consecutive verifications
 * of the same fixture at temperature 0 returned "2 not met, 2 not met, 1 not
 * met, 2 not met". Inference at temperature 0 is not bit-reproducible across
 * requests, and a single sample is therefore a coin with a heavy bias, not a
 * reading.
 *
 * So each requirement is asked three times and the majority answer is taken.
 * A split is not hidden: it is reported, because "the judge was unsure" is
 * information about the requirement — usually that it is worded so that a
 * careful reader cannot tell.
 *
 * This triples the cost of layer 3, which is why layers 1 and 2 run first and
 * short-circuit. A missing file costs nothing to find.
 */
export const SAMPLES = 3;

// ── layer 1: artefacts ───────────────────────────────────────────────────────

/**
 * Do the files this verdict names exist and carry content?
 * @returns {{status:'pass'|'fail'|'none', detail:string, missing:string[]}}
 */
export function checkClaimedArtifacts(verdict, { root = process.cwd() } = {}) {
  const meta = verdict?.meta || {};
  const r = checkArtifacts(meta, { root });
  if (!r.checked.length) {
    return { status: 'none', detail: 'the verdict names no artefact', missing: [] };
  }
  if (!r.ok) {
    return {
      status: 'fail',
      detail: explainArtifacts(r) || 'claimed artefacts do not back the verdict',
      missing: [
        ...r.missing.map((m) => `${m.key}=${m.path} (absent)`),
        ...r.thin.map((t) => `${t.key}=${t.path} (${t.size}B — under ${THIN_BYTES})`),
      ],
    };
  }
  return { status: 'pass', detail: `${r.checked.length} claimed artefact(s) exist with content`, missing: [] };
}

// ── layer 2: frozen acceptance criteria ──────────────────────────────────────

/**
 * Find the document whose ACCEPTANCE criteria govern this stage.
 *
 * Looked up from the verdict's own claims first — the agent said which document
 * it produced, and that is the one to hold it to. The brief directory is a
 * fallback, not the primary: a brief that exists but was never named by the
 * verdict is not evidence about THIS run.
 */
export function findAcceptanceDoc(verdict, { root = process.cwd() } = {}) {
  const claims = pathClaims(verdict?.meta || {}).filter((c) => /\.md$/i.test(c.path));
  for (const { path: rel } of claims) {
    const abs = path.resolve(root, rel);
    if (!existsSync(abs)) continue;
    try {
      if (parseAcceptance(readFileSync(abs, 'utf8')).length) return abs;
    } catch { /* unreadable — try the next */ }
  }
  return null;
}

/**
 * Run the `verify:` commands frozen into the governing document.
 * @returns {{status:'pass'|'fail'|'none', detail:string, failed:string[], unverifiable:number}}
 */
export function checkAcceptance(verdict, { root = process.cwd(), timeoutMs = 120_000 } = {}) {
  const doc = findAcceptanceDoc(verdict, { root });
  if (!doc) return { status: 'none', detail: 'no document with ## ACCEPTANCE criteria', failed: [], unverifiable: 0 };

  const items = parseAcceptance(readFileSync(doc, 'utf8'));
  const results = [];
  for (const it of items) {
    if (!it.verify) { results.push({ ...it, status: 'no-verify' }); continue; }
    const res = spawnSync('bash', ['-c', it.verify], { cwd: root, encoding: 'utf8', timeout: timeoutMs });
    results.push({ ...it, status: res.status === 0 ? 'pass' : 'fail', code: res.status });
  }
  const s = summarize(results);
  const failed = results.filter((r) => r.status === 'fail').map((r) => `${r.text} — verify: ${r.verify}`);
  if (failed.length) {
    return {
      status: 'fail',
      detail: `${s.failed} of ${s.total} acceptance criteria failed in ${path.relative(root, doc)}`,
      failed,
      unverifiable: s.unverifiable,
    };
  }
  if (!s.verified) {
    return {
      status: 'none',
      detail: `${s.total} acceptance criteria in ${path.relative(root, doc)}, none carries a verify: directive`,
      failed: [],
      unverifiable: s.unverifiable,
    };
  }
  return {
    status: 'pass',
    detail: `${s.verified} of ${s.total} acceptance criteria verified in ${path.relative(root, doc)}` +
      (s.unverifiable ? ` (${s.unverifiable} manual)` : ''),
    failed: [],
    unverifiable: s.unverifiable,
  };
}

// ── layer 3: the independent judge ───────────────────────────────────────────

/**
 * Requirements to hold the artefact against, in priority order.
 *
 * Taken from the governing document's ACCEPTANCE items that have NO `verify:`
 * directive — precisely the ones layer 2 cannot settle. That is the division of
 * labour: the machine runs what is runnable, the judge is asked only about what
 * a human would otherwise have to read.
 */
export function judgeableRequirements(verdict, { root = process.cwd() } = {}) {
  const doc = findAcceptanceDoc(verdict, { root });
  if (!doc) return { doc: null, requirements: [] };
  const items = parseAcceptance(readFileSync(doc, 'utf8'));
  return { doc, requirements: items.filter((i) => !i.verify).map((i) => i.text).filter(Boolean) };
}

/** The artefact text the judge reads, and whether it was cut. */
export function artefactExcerpt(verdict, { root = process.cwd(), bytes = EXCERPT_BYTES } = {}) {
  for (const { path: v } of pathClaims(verdict?.meta || {})) {
    const abs = path.resolve(root, v);
    if (!existsSync(abs)) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    const full = statSync(abs).size;
    return {
      path: v,
      text: text.slice(0, bytes),
      truncated: text.length > bytes,
      shownBytes: Math.min(text.length, bytes),
      totalBytes: full,
    };
  }
  return null;
}

/**
 * Ask one closed question per requirement.
 *
 * @param {(q:string, allowed:string[]) => Promise<string>} ask
 */
export async function judge(verdict, ask, { root = process.cwd(), max = MAX_JUDGED, samples = SAMPLES } = {}) {
  const { doc, requirements } = judgeableRequirements(verdict, { root });
  if (!doc || !requirements.length) {
    return { status: 'none', detail: 'no requirement needs a judge', answers: [], unmet: [], abstained: 0, skipped: 0 };
  }
  const excerpt = artefactExcerpt(verdict, { root });
  if (!excerpt) {
    return { status: 'none', detail: 'no readable artefact for a judge to read', answers: [], unmet: [], abstained: 0, skipped: 0 };
  }

  const asked = requirements.slice(0, max);
  const skipped = requirements.length - asked.length;
  const answers = [];
  for (const req of asked) {
    // The wording is the instrument, and the first version of it was the bug.
    //
    // It said "do not be generous" and "answer no if you cannot tell from what
    // is shown". Against a fixture whose artefact implements a rate limit in
    // plain code, the judge answered "no" — correctly, by that instruction,
    // since code is not proof. The measurement then looked like an unstable
    // judge; it was an instruction that made rejection the default and would
    // have sent every stage back forever.
    //
    // So the question separates the two things it was conflating: is the
    // requirement ADDRESSED by what is here, versus is it PROVEN. This asks the
    // first. Proof is layer 2's job, and layer 2 runs commands rather than
    // opinions.
    const q =
      `Judge one requirement against one artefact. Answer only about what the artefact contains.\n\n` +
      `REQUIREMENT:\n${req}\n\n` +
      `ARTEFACT (${excerpt.path}${excerpt.truncated ? `, first ${excerpt.shownBytes} of ${excerpt.totalBytes} bytes` : ''}):\n` +
      `---\n${excerpt.text}\n---\n\n` +
      `Does the artefact ADDRESS this requirement — is there concrete content ` +
      `(code, configuration, or a specific written commitment) that implements it?\n` +
      `  yes     — the artefact contains something that implements this requirement\n` +
      `  no      — the artefact contains nothing that implements it, or only names it\n` +
      `  unclear — the artefact touches it but you cannot tell whether it is implemented\n` +
      `Do NOT answer "no" merely because there is no test or proof; you are judging ` +
      `presence of the implementation, not evidence that it works.`;

    const votes = [];
    for (let i = 0; i < samples; i += 1) {
      const raw = String((await ask(q, JUDGE_ANSWERS)) || '').trim().toLowerCase();
      const m = raw.match(/\b(yes|no|unclear)\b/);
      votes.push({ answer: m ? m[1] : null, raw: raw.slice(0, 200) });
    }
    const tally = votes.reduce((acc, v) => { const k = v.answer || 'unparsed'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    // Majority, with a tie resolving to the more cautious answer. A judge that
    // cannot make up its mind about a requirement has told you something about
    // the requirement, and the safe reading of "half of me says this is not
    // done" is that it is not done.
    const yes = tally.yes || 0, no = tally.no || 0;
    const answer = yes > no ? 'yes' : no > yes ? 'no' : (yes === 0 && no === 0 ? null : 'no');
    answers.push({
      requirement: req,
      answer,
      split: yes && no ? `${yes} yes / ${no} no` : null,
      tally,
      raw: votes[0]?.raw || '',
    });
  }

  const unmet = answers.filter((a) => a.answer === 'no').map((a) => a.requirement);
  const abstained = answers.filter((a) => a.answer !== 'yes' && a.answer !== 'no').length;
  const split = answers.filter((a) => a.split);

  return {
    status: unmet.length ? 'fail' : (abstained === answers.length ? 'none' : 'pass'),
    detail: `${answers.length} requirement(s) judged \u00d7${samples}` +
      (unmet.length ? `, ${unmet.length} not met` : '') +
      (split.length ? `, ${split.length} where the judge was split (${split.map((a) => a.split).join('; ')})` : '') +
      (abstained ? `, ${abstained} abstained` : '') +
      (skipped ? `, ${skipped} NOT judged (over the ${max} cap)` : '') +
      (excerpt.truncated ? ` — judge saw ${excerpt.shownBytes} of ${excerpt.totalBytes} bytes` : ''),
    answers, unmet, abstained, skipped,
  };
}

// ── the verdict on the verdict ───────────────────────────────────────────────

/**
 * @param {object} o
 * @param {object} o.verdict parsed verdict record (see verdict-record.mjs)
 * @param {string} [o.root] project root
 * @param {Function} [o.ask] judge; omitted → layers 1–2 only, and the result says so
 * @returns {Promise<{state:string, checks:object[], findings:string[], conclusion:string}>}
 */
export async function verifyAgentOutput({ verdict, root = process.cwd(), ask = null } = {}) {
  const checks = [];
  const findings = [];

  const art = checkClaimedArtifacts(verdict, { root });
  checks.push({ layer: 'artefacts', ...art });
  if (art.status === 'fail') {
    findings.push(...art.missing.map((m) => `claimed artefact is missing or empty: ${m}`));
    return conclude(STATE.REWORK, checks, findings, verdict);
  }

  const acc = checkAcceptance(verdict, { root });
  checks.push({ layer: 'acceptance', ...acc });
  if (acc.status === 'fail') {
    findings.push(...acc.failed.map((f) => `acceptance criterion failed: ${f}`));
    return conclude(STATE.REWORK, checks, findings, verdict);
  }

  if (!ask) {
    checks.push({ layer: 'judgement', status: 'none', detail: 'no judge configured — layers 1–2 only' });
  } else {
    const j = await judge(verdict, ask, { root });
    checks.push({ layer: 'judgement', ...j });
    if (j.status === 'fail') {
      findings.push(...j.unmet.map((r) => `requirement not met, per the independent judge: ${r}`));
      return conclude(STATE.REWORK, checks, findings, verdict);
    }
  }

  // Passing requires that something actually ran. All three layers reporting
  // "none" is the shape of an agent nothing could be asked about — reported as
  // unverifiable, never as success.
  // A judge that ran and could not answer ANY requirement has verified nothing,
  // and the artefact merely existing is not a substitute. Caught by its own test:
  // an artefact was present, the judge abstained on every question, and the stage
  // came back `verified` on the strength of a file being on disk. That is the
  // self-report this module replaces, one layer out.
  const judgement = checks.find((c) => c.layer === 'judgement');
  if (judgement && judgement.answers?.length && judgement.abstained === judgement.answers.length) {
    findings.push(`the judge could not answer any of the ${judgement.answers.length} requirement(s) — ` +
                  'nothing about the substance of this stage has been checked');
    return conclude(STATE.UNVERIFIABLE, checks, findings, verdict);
  }

  const ran = checks.filter((c) => c.status === 'pass');
  if (!ran.length) {
    findings.push('nothing about this stage could be checked: no artefact claims, ' +
                  'no runnable acceptance criteria, and no requirement a judge could read');
    return conclude(STATE.UNVERIFIABLE, checks, findings, verdict);
  }
  return conclude(STATE.VERIFIED, checks, findings, verdict);
}

function conclude(state, checks, findings, verdict) {
  const lines = [
    `independent-verify: ${state.toUpperCase()} for ${verdict?.agent || '(unknown agent)'}` +
      (verdict?.verdict ? ` (self-reported ${verdict.verdict})` : ''),
  ];
  for (const c of checks) lines.push(`  ${symbol(c.status)} ${c.layer}: ${c.detail}`);
  if (findings.length) {
    lines.push('', 'Send back to the agent:');
    for (const f of findings) lines.push(`  - ${f}`);
  }
  return { state, checks, findings, conclusion: lines.join('\n') };
}

const symbol = (s) => (s === 'pass' ? '✓' : s === 'fail' ? '✗' : '·');

// ── CLI ──────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/independent-verify.mjs <agent> [--root DIR] [--no-judge] [--json]
//
// Reads that agent's newest verdict and verifies it. Exit 0 = verified,
// 1 = rework, 2 = unverifiable or bad input. Three exit codes for three states,
// because collapsing unverifiable into either of the others is the bug.

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const agent = argv.find((a) => !a.startsWith('--'));
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd();
  if (!agent) {
    console.error('usage: independent-verify.mjs <agent> [--root DIR] [--no-judge] [--json]');
    process.exit(2);
  }

  const { parseVerdictLog } = await import('./verdict-record.mjs');
  const home = process.env.GREAT_CTO_DIR || path.join(process.env.HOME || '', '.great_cto');
  const logs = [path.join(root, '.great_cto', 'verdicts', `${agent}.log`),
                path.join(home, 'verdicts', `${agent}.log`)];
  const logFile = logs.find((f) => existsSync(f));
  if (!logFile) { console.error(`  no verdict log for ${agent}`); process.exit(2); }

  // parseVerdictLog returns { records, rejected } — not an array. A rejected
  // line is a line that exists and could not be read, which is different from
  // no line at all, so it is reported rather than dropped.
  const parsed = parseVerdictLog(readFileSync(logFile, 'utf8'), { agent });
  const records = parsed.records || [];
  if (parsed.rejected?.length) {
    console.error(`  note: ${parsed.rejected.length} unparseable line(s) in ${logFile} — ignored, not counted as absent`);
  }
  const verdict = records[records.length - 1];
  if (!verdict) { console.error(`  ${logFile} has no parseable verdict`); process.exit(2); }

  let ask = null;
  if (!argv.includes('--no-judge')) {
    const { routerAsk } = await import('./second-opinion.mjs');
    const server = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..',
                             'mcp-servers', 'llm-router', 'server.py');
    if (existsSync(server)) ask = routerAsk(server);
    else console.error('  llm-router server not found — running layers 1–2 only');
  }

  const r = await verifyAgentOutput({ verdict, root, ask });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(r.conclusion);

  process.exit(r.state === STATE.VERIFIED ? 0 : r.state === STATE.REWORK ? 1 : 2);
}
