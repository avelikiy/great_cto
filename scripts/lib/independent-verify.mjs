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
import { parsePipelineToml } from '../hooks/pipeline-dispatcher.mjs';

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
 *
 * Raised from 12k to 128k on 2026-08-26, sized from the artefacts rather than
 * guessed. Measured across the 68 documents this judge reads — architecture,
 * plans, designs, QA reports, impl-briefs — the median is 4.2 KB and the largest
 * is 34.5 KB; 12 KB held 89% of them whole, 64 KB holds all of them. The other
 * evidence source is a receipt's changed-file set, and the three on this
 * repository total 79–85 KB. 128 KB covers both cases entirely, so the "judge
 * saw the first N of M" caveat stops applying to real inputs instead of being
 * disclosed on most of them.
 *
 * The bound is about COST, not context: the judge's window is 1.31M tokens, and
 * 128 KB is ~32k. Each of the nine questions per stage re-sends the artefact, so
 * this is ~$0.022 per stage at the current model's price — against $0.0005 at
 * 12 KB, and against $0.20 for one stage on the model this replaced.
 */
export const EXCERPT_BYTES = 128 * 1024;

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

/** The second judge. A different FAMILY on purpose: correlated failure modes are
 *  the thing a second opinion is supposed to escape. */
/**
 * The judge's model, on its own variable.
 *
 * It used to be `GREAT_CTO_ROUTER_MODEL`, which is read by FIVE consumers:
 * the ask_kimi router, generate-summary, memory-filter, and — the one that bit —
 * the eval runner's ACTOR and JUDGE. Setting it to a cheap judge silently made
 * the eval suite's actor a cheap model too. The suite's pass rate fell from its
 * calibrated bar to 1/8 and its reported cost read $0.000, because the model is
 * not in the price table and an unknown model is priced at zero.
 *
 * Neither symptom names the cause. A shared knob whose blast radius is invisible
 * is the same defect as a shared field with two meanings, one level out.
 *
 * Passed explicitly to routerAsk rather than exported through the environment,
 * so this lane cannot move another one again.
 *
 * And the NAME was checked before it was taken. The first attempt used
 * `GREAT_CTO_JUDGE_MODEL`, which the eval runner already reads for its own
 * rubric judge — the identical collision under a different name, made by
 * choosing a name instead of looking for one. These are different jobs: the eval
 * judge scores an agent's answer 0-1 against a rubric, this one answers closed
 * questions about an artefact.
 */
export const JUDGE_MODEL = process.env.GREAT_CTO_VERIFY_MODEL || 'z-ai/glm-5.3-flash';

export const SECOND_OPINION_MODEL = process.env.GREAT_CTO_SECOND_JUDGE || 'moonshotai/kimi-k3';

/**
 * The output contract for a stage, read from the pipeline map.
 *
 * This was a hardcoded object here with exactly one entry. A stage contract
 * written in JavaScript instead of in the stage map is a list somebody has to
 * remember to update, which is a list that will be wrong — the same shape as the
 * bundler's file list before it started deriving itself from the imports.
 *
 * `produces = ["arch"]` in shared/pipeline.toml is the declaration; this is the
 * consumer. Borrowed from Pipelex, where every step declares its typed output.
 *
 * Returns null when the map is unreadable or the stage declares nothing — and
 * those are different from each other and from "contract met", which is why the
 * caller reports three states rather than two.
 */
export function contractFor(agent, { root = process.cwd(), pipelinePath = null } = {}) {
  const candidates = pipelinePath ? [pipelinePath] : [
    path.join(root, 'shared', 'pipeline.toml'),
    path.join(root, '.great_cto', 'pipeline.toml'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'shared', 'pipeline.toml'),
  ];
  // The FIRST map that parses wins, whether or not it mentions this stage.
  //
  // Searching on until some map recognises the agent is how one project ends up
  // judged by another project's contracts: a project whose own map simply does
  // not run `pm` would inherit this repository's pm contract and be told it owes
  // a plan it never promised. "This pipeline does not have that stage" is an
  // answer, and it belongs to the map that was found — not a reason to keep
  // looking for a map that agrees.
  let sawMap = null;
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    let map;
    try {
      map = parsePipelineToml(readFileSync(f, 'utf8'));
    } catch { continue; }   // unreadable is not an answer; a later candidate may be
    sawMap = f;
    const rule = map[agent];
    if (rule?.produces?.length) return { keys: rule.produces, source: f, known: true };
    if (rule) return { keys: [], source: f, known: true };     // stage known, contract absent
    break;                                                     // map found, stage absent — that IS the answer
  }
  // Three outcomes, and the first version collapsed the last two: a map that
  // does not exist and a map that does not mention this stage are different
  // facts, and only one of them is the operator's to fix.
  return sawMap ? { keys: [], source: sawMap, known: false } : null;
}

/**
 * Did this stage claim what its contract says it produces?
 *
 * Three states, because "no contract" and "contract met" must not look alike.
 * A stage that declares nothing is the cheapest way to pass verification, and
 * naming that out loud is the point — of seven scored runs on this repository,
 * three came back unverifiable for exactly this reason.
 */
export function checkRequiredClaim(verdict, { root = process.cwd(), pipelinePath = null } = {}) {
  const c = contractFor(verdict?.agent, { root, pipelinePath });
  if (!c) return { status: 'none', detail: 'no pipeline map found — the stage contract cannot be read' };
  if (!c.known) {
    return {
      status: 'none',
      detail: `${verdict?.agent} is not a stage in ${path.basename(c.source)} — it ran outside the mapped pipeline`,
    };
  }
  if (!c.keys.length) {
    return {
      status: 'none',
      detail: `${verdict?.agent} declares no \`produces\` in the pipeline map — nothing to hold it to`,
    };
  }
    // `receipt` is a declarable output, and it is not a path.
    //
    // senior-dev and code-reviewer were the two stages nothing could verify:
    // measured across every project's logs, neither has EVER written a path into
    // its meta. Declaring `produces = ["report"]` for them would invent an
    // obligation and start rejecting correct work — which is the rule this
    // module follows, a key is declared only where the agent's prompt and its
    // verdict history agree.
    //
    // They do leave evidence, of a stronger kind: the receipt records head, base
    // and every file touched with its hash — 11 files on the last senior-dev run.
    // A path says "I wrote something somewhere"; a receipt says which bytes the
    // stage saw. What the contract requires is EVIDENCE, and a path was only ever
    // one shape of it.
    const has = (k) => (k === 'receipt'
      ? Object.keys(verdict?.receipt?.files || {}).length > 0
      : !!verdict?.meta?.[k]);
    const missing = c.keys.filter((k) => !has(k));
  if (missing.length) {
    return {
      status: 'fail',
      detail: `${verdict.agent} must produce ${missing.map((k) => (k === 'receipt' ? '`receipt` (the files it touched, with hashes)' : '`' + k + '=<path>`')).join(' and ')} ` +
              `(declared in ${path.basename(c.source)}) and its verdict does not — ` +
              `no stage downstream can be verified against what it did not produce`,
    };
  }
    return { status: 'pass', detail: `contract met: ${c.keys.map((k) => (k === 'receipt' ? `receipt over ${Object.keys(verdict.receipt.files || {}).length} file(s)` : `${k}=${verdict.meta[k]}`)).join(', ')}` };
}

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
  if (!doc) {
    // No document freezes criteria for this stage. Fall back to what the verdict
    // itself asserts — reported as a different source, because a criterion
    // frozen before the work and a claim written after it are not equal evidence
    // and the caller must be able to tell which it got.
    const fromClaims = claimsAsRequirements(verdict);
    return { doc: null, source: fromClaims.length ? 'verdict-claims' : 'none', requirements: fromClaims };
  }
  const items = parseAcceptance(readFileSync(doc, 'utf8'));
  return { doc, source: 'acceptance-criteria',
           requirements: items.filter((i) => !i.verify).map((i) => i.text).filter(Boolean) };
}

/**
 * What a stage CHANGED, when it named no artefact.
 *
 * `senior-dev`, `qa-engineer` and `code-reviewer` came back `unverifiable` on
 * this repository — not because a check failed but because there was nothing to
 * check: they write code and reports, not documents they name in `meta`.
 *
 * They do carry a receipt. `receipt.files` is a map of every path the run
 * touched to its digest, recorded by the agent at the moment it finished.
 * receipt.mjs proves those bytes are still the bytes; it says so itself, and
 * says the rung below — whether the change is any good — is somebody else's.
 * This is that rung: the files the receipt names, read as the artefact.
 *
 * Bounded by count and by bytes, and both bounds are reported. A judge shown 3
 * of 11 changed files answered about 3 of 11.
 */
export function changedFilesExcerpt(verdict, { root = process.cwd(), bytes = EXCERPT_BYTES, maxFiles = 40 } = {}) {
  const files = verdict?.receipt?.files;
  if (!files || typeof files !== 'object') return null;
  const paths = Object.keys(files);
  if (!paths.length) return null;

  const shown = [];
  let text = '', truncated = false;
  for (const rel of paths.slice(0, maxFiles)) {
    const abs = path.resolve(root, rel);
    if (!existsSync(abs)) continue;
    let body;
    try { body = readFileSync(abs, 'utf8'); } catch { continue; }
    const room = bytes - text.length;
    if (room <= 0) { truncated = true; break; }
    const slice = body.slice(0, room);
    if (slice.length < body.length) truncated = true;
    text += `\n----- ${rel} -----\n${slice}\n`;
    shown.push(rel);
  }
  if (!shown.length) return null;
  return {
    path: `${shown.length} changed file(s)`,
    text,
    truncated: truncated || paths.length > shown.length,
    shownBytes: text.length,
    totalBytes: text.length,
    files: shown,
    totalFiles: paths.length,
  };
}

/**
 * Requirements built from the stage's OWN claims, when no document states any.
 *
 * `senior-dev`, `qa-engineer` and `code-reviewer` freeze no ACCEPTANCE criteria —
 * they write code and reports. So the judge had evidence (the receipt's changed
 * files) and nothing to hold it against, and the stage stayed unverifiable for a
 * second reason after the first was fixed.
 *
 * The verdict itself carries claims: `feature=stale-after`, `tests=46`,
 * `coverage=100-unit-coverage`. Turning them into questions is not a weaker
 * substitute for real criteria — it is the module's whole premise applied one
 * level in. The agent said what it did; this asks the evidence whether it did.
 *
 * Only claims a reader could settle FROM THE FILES become questions. `ci=pass`
 * is a fact about a run that happened elsewhere and no amount of reading the
 * diff will confirm it, so it is left alone rather than asked about badly.
 */
export function claimsAsRequirements(verdict) {
  const meta = verdict?.meta || {};
  const out = [];
  const feature = meta.feature || meta.task;
  if (feature) {
    out.push(`The change implements "${feature}" — the feature this verdict claims to have delivered.`);
  }
  if (meta.tests) {
    out.push(`The change adds or updates automated tests (the verdict claims \`tests=${meta.tests}\`).`);
  }
  if (meta.report || meta.findings) {
    out.push(`The change records what was found, rather than only asserting a conclusion` +
             (meta.findings ? ` (the verdict claims \`findings=${meta.findings}\`).` : '.'));
  }
  if (meta.scope) {
    out.push(`The change stays within "${meta.scope}" — the scope this verdict claims.`);
  }
  return out;
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
/** The question put to a judge about one requirement. Shared, so a second
 *  judge answers the identical question rather than a paraphrase of it. */
function questionFor(req, excerpt) {
  // On the same line as `return`, and it matters: a newline after `return` makes
  // ASI insert a semicolon, the function returns undefined, and the judge is sent
  // an empty question. `node --check` passes — the syntax is valid and the
  // behaviour is silently empty, which is this module's own defect class.
  return `Judge one requirement against one artefact. Answer only about what the artefact contains.\n\n` +
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
}

export async function judge(verdict, ask, { root = process.cwd(), max = MAX_JUDGED, samples = SAMPLES, second = null } = {}) {
  // Gated on REQUIREMENTS, not on a document. This read `if (!doc || …)`, which
  // was right while criteria could only come from an ACCEPTANCE section — and
  // silently discarded every requirement built from the verdict's own claims the
  // moment that second source existed. The three stages it was added for went on
  // reporting "no requirement needs a judge" with two questions in hand.
  const { doc, requirements, source } = judgeableRequirements(verdict, { root });
  if (!requirements.length) {
    return { status: 'none', detail: 'no requirement needs a judge', answers: [], unmet: [], abstained: 0, skipped: 0 };
  }
  const excerpt = artefactExcerpt(verdict, { root })
    || changedFilesExcerpt(verdict, { root });
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
    const q = questionFor(req, excerpt);

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

  // A second model, asked only where the answer is expensive to get wrong.
  //
  // Three samples of one judge are not a second opinion — one model asked three
  // times repeats its own failure modes, which is confidence by repetition and
  // is what second-opinion.mjs exists to refuse. A different family fails
  // differently, and where two disagree about a specific closed question is a
  // place a human settles in seconds.
  //
  // Only on `no`, because that is the answer that costs: a wrong `yes` lets one
  // stage through, a wrong `no` puts an agent in a rework loop. Divergence is
  // REPORTED, never resolved — the second model does not overrule the first, and
  // agreement between two models is deliberately not presented as strong.
  if (second) {
    for (const a of answers) {
      if (a.answer !== 'no') continue;
      const raw = String((await second(questionFor(a.requirement, excerpt), JUDGE_ANSWERS)) || '').trim().toLowerCase();
      const m = raw.match(/\b(yes|no|unclear)\b/);
      a.second = m ? m[1] : null;
      a.diverged = a.second === 'yes';
    }
  }

  const unmet = answers.filter((a) => a.answer === 'no').map((a) => a.requirement);
  const diverged = answers.filter((a) => a.diverged);
  const abstained = answers.filter((a) => a.answer !== 'yes' && a.answer !== 'no').length;
  const split = answers.filter((a) => a.split);

  return {
    status: unmet.length ? 'fail' : (abstained === answers.length ? 'none' : 'pass'),
    detail: `${answers.length} requirement(s) judged \u00d7${samples}` +
      (source === 'verdict-claims'
        ? ' (from the verdict\u2019s own claims — no document freezes criteria for this stage)' : '') +
      (unmet.length ? `, ${unmet.length} not met` : '') +
      (diverged.length ? `, ${diverged.length} where a second model DISAGREED` : '') +
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
export async function verifyAgentOutput({ verdict, root = process.cwd(), ask = null, second = null } = {}) {
  const checks = [];
  const findings = [];

  const art = checkClaimedArtifacts(verdict, { root });
  checks.push({ layer: 'artefacts', ...art });
  if (art.status === 'fail') {
    findings.push(...art.missing.map((m) => `claimed artefact is missing or empty: ${m}`));
    return conclude(STATE.REWORK, checks, findings, verdict);
  }

  const req = checkRequiredClaim(verdict, { root });
  checks.push({ layer: 'required artefact', ...req });
  if (req.status === 'fail') {
    findings.push(req.detail);
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
    const j = await judge(verdict, ask, { root, second });
    checks.push({ layer: 'judgement', ...j });
    if (j.status === 'fail') {
      // Phrased as the question that was actually asked, because a requirement
      // is a declarative sentence and the answer is no. "requirement not met:
      // The change implements X" reads as a contradiction — the reader takes
      // the trailing clause for the judge's conclusion when it is the claim the
      // judge rejected. Seen in the first live run against a real verdict.
      findings.push(...j.unmet.map((r) =>
        `the independent judge was asked whether this is true and answered no — “${r}”`));
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
    if (existsSync(server)) ask = routerAsk(server, { model: JUDGE_MODEL });
    else console.error('  llm-router server not found — running layers 1–2 only');
  }

  // The second judge is only wired when the first one is, and only when a second
  // model is actually reachable — one model answering twice under two names would
  // be worse than no second opinion at all.
  let second = null;
  if (ask && !argv.includes('--no-second-opinion')) {
    const { routerAsk } = await import('./second-opinion.mjs');
    const server = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..',
                             'mcp-servers', 'llm-router', 'server.py');
    if (existsSync(server)) second = routerAsk(server, { model: SECOND_OPINION_MODEL });
  }

  const r = await verifyAgentOutput({ verdict, root, ask, second });

  // The assessment gets written down.
  //
  // Until this line it was printed and lost — the module reached a conclusion,
  // returned an exit code, and the reasoning vanished with the scrollback. An
  // assessment nobody can read tomorrow is an assessment that was not made, and
  // nothing downstream could ask "was this stage ever verified, and by what".
  //
  // It goes to scores.jsonl rather than into the verdict, because it is a
  // different kind of fact: the verdict says what the run did, the score says
  // how well, they are produced by different actors at different times, and a
  // re-score must not rewrite history.
  if (!argv.includes('--no-record')) {
    try {
      const { writeScore } = await import('./scores.mjs');
      writeScore(root, {
        agent: verdict.agent,
        runTs: verdict.ts,
        name: 'independent-verify',
        state: r.state,
        scorer: ask ? 'mechanical+judge' : 'mechanical',
        findings: r.findings,
        comment: (r.checks || []).map((c) => `${c.layer}: ${c.detail}`).join(' | ').slice(0, 500),
      });
    } catch (e) {
      // Recording must not change the outcome. A store that cannot be written
      // is worth saying out loud and is not a verification failure.
      console.error(`  note: could not record the score — ${e.message}`);
    }
  }

  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(r.conclusion);

  process.exit(r.state === STATE.VERIFIED ? 0 : r.state === STATE.REWORK ? 1 : 2);
}
