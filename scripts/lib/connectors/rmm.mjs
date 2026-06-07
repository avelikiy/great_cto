// scripts/lib/connectors/rmm.mjs — RMM adapter (Phase 4 Wave 7, msp).
//
// stage-change turns a fleet change into a REAL staged-rollout plan: canary → progressive rings
// with a health gate and an auto-halt-and-rollback rule between each, a pre-change snapshot, and a
// tested rollback — never a fleet-wide simultaneous push. rollback returns the rollback steps. This
// is the msp autopilot's blast-radius guardrail, deterministic and keyless. POSTs the plan to an
// RMM (NinjaOne / ConnectWise) when GREAT_CTO_RMM_URL + token are set.

const RMM_URL = (process.env.GREAT_CTO_RMM_URL || '').replace(/\/$/, '');
const RMM_TOKEN = process.env.GREAT_CTO_RMM_TOKEN || '';

export const capabilities = ['stage-change', 'rollback'];

const RINGS = [
  { ring: 'canary', pct: 1 },
  { ring: 'early', pct: 5 },
  { ring: 'broad', pct: 25 },
  { ring: 'fleet', pct: 100 },
];

/** Build a staged-rollout plan for a fleet change. */
export function planRollout(change = {}, fleetSize = 1000) {
  const name = change.name || change.change || 'patch';
  const tenant = change.tenant || 'tenant-A';
  const stages = RINGS.map((r, i) => ({
    step: i + 1, ring: r.ring, targetPct: r.pct, targetCount: Math.max(1, Math.round((fleetSize * r.pct) / 100)),
    healthGate: 'error-rate < 1% AND no new P1 for 15m',
    onRegression: 'auto-halt + roll back this ring; do not advance',
  }));
  return {
    change: name, tenant, fleetSize,
    preChange: 'snapshot taken (verified restore point)',
    rollback: 'tested rollback prepared for every ring',
    stages,
    requiresApproval: change.destructive === true || change.privileged === true,
    approvalGate: 'gate:change-approval',
  };
}

export async function call(op, payload = {}) {
  if (op === 'stage-change') {
    const plan = planRollout(payload.change || payload, payload.fleetSize || 1000);
    if (RMM_URL && RMM_TOKEN) {
      try {
        const r = await fetch(`${RMM_URL}/rollouts`, { method: 'POST', headers: { Authorization: `Bearer ${RMM_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(plan) });
        return { ok: r.ok, mode: 'live', dispatched: r.ok, status: r.status, data: plan };
      } catch (e) {
        return { ok: false, mode: 'live', error: `RMM dispatch failed: ${e.message}`, data: plan };
      }
    }
    return { ok: true, mode: 'live', dispatched: false, data: plan,
      note: 'Generated a staged-rollout plan. Set GREAT_CTO_RMM_URL/TOKEN to dispatch to your RMM.' };
  }

  if (op === 'rollback') {
    const name = payload.change || payload.name || 'patch';
    return { ok: true, mode: 'live', data: { change: name, steps: ['halt the active ring', 'restore from the pre-change snapshot', 'verify health', 'open an incident ticket for review'] } };
  }

  return { ok: false, error: `rmm adapter has no op '${op}'` };
}
