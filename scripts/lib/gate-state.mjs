#!/usr/bin/env node
/**
 * gate-state — has this gate actually been approved?
 *
 * Why this exists
 * ---------------
 * The pipeline machinery never asked. `pipeline-dispatcher` computes that a
 * stage is behind `gate:arch` and emits a directive telling the orchestrator to
 * run `bd list --label gate --status open` and wait — it reads nothing itself.
 * So a gate the CTO has already approved still reads as pending, and the pull
 * view says `awaiting-gate` after the bead is closed.
 *
 * The consequence is the whole cost of gates today: approving one is not enough,
 * someone must also tell the orchestrator to continue. Two human actions where
 * the second carries no decision.
 *
 * The polarity is the design
 * --------------------------
 * Every failure mode here is on the same side, so all three non-approved states
 * behave identically — wait:
 *
 *   approved — the newest bead for this gate is closed, and closed AFTER the
 *              verdict it would let past.
 *   pending  — the newest bead is open/blocked/in-progress. The question is
 *              asked and unanswered.
 *   absent   — no bead for this gate exists. NOT approval: the question was
 *              never asked, and treating silence as a yes is how an ungated
 *              operation ships (ADR-009).
 *   stale    — the newest bead is closed, but closed BEFORE the verdict. It
 *              approved some earlier run. `gate:plan` closed for one feature
 *              must not wave through the next one.
 *
 * Reading fails safe: no `bd`, a broken payload, an unparseable or implausible
 * date — all read as not-approved. A gate that cannot be read, or a time
 * comparison that cannot be made, is an approval that has not happened.
 *
 * The trust boundary, stated rather than implied
 * ----------------------------------------------
 * This module reports faithfully what is in the `bd` store. It is not an
 * authorization boundary: anything that can run `bd create "gate:X — …" --label
 * gate` and `bd close <id>` can manufacture an approval signal, and every
 * pipeline agent has Bash and the `bd` CLI — agent instructions document that as
 * the normal way to open and close gate beads. What this module does is refuse
 * the accidents and the cheap paths: a stale approval from a previous feature, a
 * second matching-titled bead outranking a real pending one, an unreadable or
 * back-dated timestamp. Pinning approval to a specific bead ID recorded when the
 * gate is raised would close the rest, and is not done here.
 */

import { execFileSync } from 'node:child_process';

/** Does a bead title name this gate? Titles read `gate:arch — <what>`. */
export function titleNamesGate(title, gate) {
  const bare = String(gate || '').replace(/^gate:/, '').trim();
  if (!bare) return false;
  return new RegExp(`^\\s*gate:${bare.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(String(title || ''));
}

const OPEN_STATES = new Set(['open', 'blocked', 'in_progress', 'in-progress']);

/**
 * How old a verdict may be and still be "this run".
 *
 * The staleness rule asks whether the gate was closed AFTER the verdict, and an
 * agent writes its own verdict timestamp. A verdict dated 1970 makes every gate
 * bead ever closed look like it was closed afterwards — so the check that exists
 * to stop an old approval carrying a new run does the opposite. That is not
 * hypothetical: it was the first reproduction in the security review, and needs
 * no `bd` access, only the verdict file the agent writes as a normal part of its
 * job.
 *
 * Thirty days is deliberately generous — the dispatcher's own freshness window
 * is thirty MINUTES, and a gate can legitimately sit unanswered over a holiday.
 * It is a bound on absurdity, not a freshness policy.
 */
export const MAX_VERDICT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {string} gate            e.g. 'gate:arch'
 * @param {Array}  beads           bead records: {title, status, updated_at}
 * @param {string} [verdictTs]     ISO ts of the verdict this gate would let past
 * @returns {{state:'approved'|'pending'|'absent'|'stale', bead?:object, why:string}}
 */
export function gateState(gate, beads, { verdictTs = null, now = Date.now() } = {}) {
  const rel = (Array.isArray(beads) ? beads : []).filter((b) => titleNamesGate(b?.title, gate));
  if (!rel.length) {
    return { state: 'absent', why: `no ${gate} bead exists — the question has not been asked` };
  }

  // ANY open bead for this gate means the question is unanswered, whatever else
  // exists. Taking the newest bead first let a second, unrelated `gate:ship —
  // …`-titled bead, closed later, outrank the CTO's real still-open one:
  //
  //   real-42   gate:ship — deploy X          open    2026-08-01
  //   forged-99 gate:ship — unrelated note    closed  2026-08-06   → approved
  //
  // Reported CRITICAL by security review with that reproduction. An open gate
  // outranks every closed one; a later close cannot answer an earlier question.
  const open = rel.find((b) => OPEN_STATES.has(String(b.status || '').toLowerCase()));
  if (open) {
    return { state: 'pending', bead: open, why: `${gate} is ${open.status} — awaiting the CTO` };
  }

  // Newest by update time decides among the closed ones: a new feature raises a
  // new bead, so an old closed one never speaks for it.
  const sorted = [...rel].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const newest = sorted[0];
  if (String(newest.status || '').toLowerCase() !== 'closed') {
    return { state: 'pending', bead: newest, why: `${gate} has an unrecognised status "${newest.status}" — treated as unapproved` };
  }

  // The staleness check FAILS CLOSED. It used to require both timestamps to be
  // finite before comparing, so an unreadable one skipped the comparison and
  // fell through to `approved` — the exact opposite of what the check is for.
  // Three ways in, none needing bd access: a verdict with an ancient but
  // well-formed ts (validateVerdict checks shape, not recency), a legacy-dialect
  // line whose ts is unvalidated free text, and a closed bead with a blank
  // updated_at from an export quirk. Reported CRITICAL by security review.
  //
  // A time comparison this gate depends on and cannot make is a comparison that
  // has not passed.
  const closedAt = Date.parse(newest.updated_at || '');
  if (!Number.isFinite(closedAt)) {
    return { state: 'stale', bead: newest, why: `${gate} has no readable close time — cannot confirm it approved THIS run` };
  }
  if (verdictTs != null) {
    const raisedAt = Date.parse(verdictTs);
    if (!Number.isFinite(raisedAt)) {
      return { state: 'stale', bead: newest, why: `this stage has no readable timestamp — cannot confirm ${gate} approved it` };
    }
    // A verdict dated outside the plausible window cannot be the current run, and
    // an implausibly OLD one is what makes every historical approval look valid.
    if (raisedAt > now + 60_000) {
      return { state: 'stale', bead: newest, why: `this stage is dated in the future — ${gate} cannot have approved it` };
    }
    if (now - raisedAt > MAX_VERDICT_AGE_MS) {
      return { state: 'stale', bead: newest, why: `this stage is dated more than 30 days ago — too old to be the run ${gate} approved` };
    }
    if (closedAt < raisedAt) {
      return { state: 'stale', bead: newest, why: `${gate} was approved before this stage finished — it approved an earlier run` };
    }
  }
  return { state: 'approved', bead: newest, why: `${gate} approved (${newest.id || 'bead'} closed)` };
}

/**
 * Gate beads from Beads. Returns [] on any failure — which reads as `absent`,
 * which waits. Bounded so a hook never hangs on a slow store.
 */
export function readGateBeads({ timeoutMs = 4000, cwd = process.cwd() } = {}) {
  try {
    const out = execFileSync('bd', ['list', '--label', 'gate', '--json', '--status', 'all'],
      { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(out || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** {gate: state} for several gates at once, from one read. */
export function gateStates(gates, beads, opts) {
  const out = {};
  for (const g of gates || []) out[g] = gateState(g, beads, opts);
  return out;
}
