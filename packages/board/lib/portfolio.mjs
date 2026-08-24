// One screen for the whole fleet.
//
// The board answers a CTO's questions one project at a time. With twenty-two in
// the registry, finding out where you are needed means switching to each of them
// by hand — so the question "what needs me right now, across everything" has no
// answer at all, and the switcher is a poor substitute for one.
//
// Three columns, one row per project: what is waiting on a decision, when the
// project last moved, what it has cost. No sorting, no drill-down, no charts —
// if this page is worth having, that will show without them.
//
// Every cell can say `unread`
// ---------------------------
// This is the point rather than a detail. A fleet view built on readers that
// return zero when they fail multiplies one silent lie by twenty-two, and the
// screen most likely to be trusted becomes the one most likely to mislead. A
// project whose state could not be read says so; it never contributes a
// confident zero to a total.
//
// Why no `bd`
// -----------
// Gate approval is authoritative but costs about 530ms per project — twelve
// seconds for the fleet, on a screen meant to be glanced at. The pipeline
// position computed from verdict files alone reports `awaiting-gate`
// conservatively, which for a decisions queue errs toward "this may need you".
// That is the right direction to be wrong in here, and it is stated rather than
// hidden.

import fs from 'node:fs';
import path from 'node:path';
import { readVerdicts } from './verdicts.mjs';

/** A project's state, or an honest account of why it is unknown. */
export function projectRow(entry, opts = {}) {
  const { now = Date.now() } = opts;
  const base = { slug: entry.slug, path: entry.path, archetype: entry.archetype || null, description: entry.description || '' };

  if (!entry.path || !fs.existsSync(entry.path)) {
    return { ...base, unread: 'the project directory no longer exists' };
  }
  const gc = path.join(entry.path, '.great_cto');
  if (!fs.existsSync(gc)) {
    return { ...base, unread: 'not initialised — no .great_cto here' };
  }

  let verdicts;
  try {
    verdicts = readVerdicts(entry.path);
  } catch (e) {
    return { ...base, unread: `verdicts could not be read: ${e.message}` };
  }
  if (!Array.isArray(verdicts)) {
    return { ...base, unread: 'verdicts could not be read' };
  }

  const withTs = verdicts.filter((v) => v.ts && !Number.isNaN(Date.parse(v.ts)));
  const newest = withTs.length
    ? Math.max(...withTs.map((v) => Date.parse(v.ts)))
    : null;

  // Spend is only claimed over verdicts that carry a cost. A verdict without one
  // is not zero spend — it is spend nobody recorded, and adding it as zero is how
  // a dashboard reports a number smaller than the invoice.
  //
  // The rule was right and the test for it was `typeof === 'number'`, which a
  // RECORDED zero passes. `log-verdict.sh` wrote `cost_usd: 0` whenever no cost
  // was passed to it, for the whole history of this repository, so the fleet read
  // eight projects as "$0.00 spent" over 2 to 27 records each — the confident
  // zero this file's own header exists to prevent, assembled out of
  // non-measurements.
  //
  // A zero is not evidence of spend. It is counted separately and shown, never
  // dropped and never summed: `booking` and `subs` prove the mixture is real, so
  // silently discarding the zeros would hide how little of each figure is
  // actually measured.
  const priced = verdicts.filter((v) => typeof v.cost_usd === 'number' && v.cost_usd > 0);
  const recordedZero = verdicts.filter((v) => v.cost_usd === 0).length;
  const spend = priced.reduce((a, v) => a + v.cost_usd, 0);

  const last = verdicts.length
    ? verdicts.reduce((a, b) => (Date.parse(b.ts || 0) > Date.parse(a.ts || 0) ? b : a))
    : null;

  return {
    ...base,
    stages: verdicts.length,
    lastAgent: last?.agent || null,
    lastVerdict: last?.verdict || null,
    lastMovedAt: newest ? new Date(newest).toISOString() : null,
    idleMs: newest ? now - newest : null,
    spend: priced.length ? Number(spend.toFixed(4)) : null,
    spendKnownFor: priced.length,
    spendZeroFor: recordedZero,
    spendUnknownFor: verdicts.length - priced.length - recordedZero,
    needsYou: needsAttention(last, { transitions: opts.transitions || null }),
  };
}

/**
 * Does this project look like it is waiting on a human?
 *
 * A blocking verdict is unambiguous. Everything else is a guess made without
 * reading gate state, so it is reported as a reason rather than a flag — the row
 * says "security-officer returned REJECTED", not a red dot the reader has to
 * interpret.
 */
/**
 * What is waiting on the CTO in this project, or null.
 *
 * This only looked at whether the LAST verdict was a failure, so across
 * seventeen projects it returned null seventeen times — including for one with a
 * blocked task and an open P0 visible on its own inbox. The column that exists
 * to answer "what needs me" answered nothing, everywhere, and looked like calm.
 *
 * A stage that ended in a terminal APPROVED/DONE and has a gate declared after
 * it is waiting on a person. That is what the module header promised: position
 * from verdicts alone, erring toward "this may need you", which is the right
 * direction to be wrong in for a decisions queue.
 *
 * Derived from verdicts and the pipeline map only. This module deliberately does
 * not run `bd` — the header above says why, and a sweep of seventeen projects at
 * 2-6 s each is the saturation this board was fixed for today.
 *
 * @param {object|null} last     the newest verdict
 * @param {object} [opts]
 * @param {object} [opts.transitions]  the pipeline map, for the gate question
 */
export function needsAttention(last, { transitions = null } = {}) {
  if (!last) return null;
  const v = String(last.verdict || '').toUpperCase();
  if (['BLOCKED', 'FAIL', 'FAILED', 'REJECTED'].includes(v)) {
    return `${last.agent || 'a stage'} returned ${v}`;
  }

  // A stage that finished successfully behind a declared gate is waiting on a
  // person. Reported conservatively — the map says a gate is declared there, not
  // that this particular gate is currently open — because for a decisions queue
  // "this may need you" is the right direction to be wrong in.
  if (transitions && ['APPROVED', 'DONE', 'PASS', 'PLAN_READY', 'BRIEF_READY'].includes(v)) {
    const rule = transitions[last.agent];
    const gates = rule?.gate ? (Array.isArray(rule.gate) ? rule.gate : [rule.gate]) : [];
    if (gates.length) {
      return `${last.agent} finished — ${gates.join(', ')} declared next`;
    }
  }
  return null;
}

/**
 * The fleet.
 *
 * `registryUnread` carries a broken projects.json up to the reader: an
 * unreadable registry used to render as a board with no projects, which is the
 * same lie one level further out.
 */
export function portfolio(registry, { now = Date.now(), maxProjects = 100, transitions = null } = {}) {
  if (!registry || registry.unread) {
    return { registryUnread: registry?.unread || 'the project registry could not be read', projects: [] };
  }
  // The map is read ONCE for the sweep, not once per project. It is the same map
  // for every project now that it lives in the plugin, and seventeen reads of a
  // file to answer one question each is how a glanceable screen stops being one.
  const entries = (registry.projects || []).slice(0, maxProjects);
  const projects = entries.map((e) => projectRow(e, { now, transitions }));

  const readable = projects.filter((p) => !p.unread);
  return {
    projects,
    total: projects.length,
    unreadable: projects.length - readable.length,
    // Totals are over what could be read, and say so. A sum that silently
    // excludes four projects is a different number from the one it claims to be.
    spend: readable.some((p) => p.spend != null)
      ? Number(readable.reduce((a, p) => a + (p.spend || 0), 0).toFixed(4))
      : null,
    spendCoveredProjects: readable.filter((p) => p.spend != null).length,
    needsYou: readable.filter((p) => p.needsYou).length,
  };
}
