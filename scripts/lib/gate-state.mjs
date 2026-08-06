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
 * Reading fails safe: no `bd`, a broken payload, an unparseable date — all
 * report `pending`. A gate that cannot be read is a gate that has not been
 * approved.
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
 * @param {string} gate            e.g. 'gate:arch'
 * @param {Array}  beads           bead records: {title, status, updated_at}
 * @param {string} [verdictTs]     ISO ts of the verdict this gate would let past
 * @returns {{state:'approved'|'pending'|'absent'|'stale', bead?:object, why:string}}
 */
export function gateState(gate, beads, { verdictTs = null } = {}) {
  const rel = (Array.isArray(beads) ? beads : []).filter((b) => titleNamesGate(b?.title, gate));
  if (!rel.length) {
    return { state: 'absent', why: `no ${gate} bead exists — the question has not been asked` };
  }

  // Newest by update time decides: a new feature raises a new bead, so an old
  // closed one never speaks for it.
  const sorted = [...rel].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const newest = sorted[0];

  if (OPEN_STATES.has(String(newest.status || '').toLowerCase())) {
    return { state: 'pending', bead: newest, why: `${gate} is ${newest.status} — awaiting the CTO` };
  }
  if (String(newest.status || '').toLowerCase() !== 'closed') {
    return { state: 'pending', bead: newest, why: `${gate} has an unrecognised status "${newest.status}" — treated as unapproved` };
  }

  if (verdictTs) {
    const closedAt = Date.parse(newest.updated_at || '');
    const raisedAt = Date.parse(verdictTs);
    if (Number.isFinite(closedAt) && Number.isFinite(raisedAt) && closedAt < raisedAt) {
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
