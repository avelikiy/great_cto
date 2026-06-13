// scripts/lib/flow-overrides.mjs — per-tenant parametric flow customization (Phase 1 of the
// flow-configurator plan: "настройка, не сборка").
//
// A tenant does NOT assemble a flow from scratch — that would forfeit the measured qualityScore
// and the domain knowledge baked into each vertical. Instead an admin / compliance-lead applies a
// small, validated set of OVERRIDES on top of the shipped base flow:
//
//   roles         { [gateId]: "Senior CPC coder (in-house)" }  — rename who signs a gate
//   disabledSteps [baseStepIndex, …]                           — skip optional reversible agent steps
//   extraGates    [{ after, does, human, gate }]               — add a second human checkpoint
//
// The EFFECTIVE flow (base + overrides) must still pass BOTH validators before anything is saved:
//   - structural  validateFlow()  from flow.mjs   (required fields, known connectors)
//   - invariants  validateFlow()  from flow-runner.mjs ("the permission was the wound":
//     irreversible ⟹ a human gate before it; an accountable owner is named)
// so a tenant cannot configure their way out of the safety model.
//
// Storage: ~/.great_cto/flow-overrides/<tenant>--<vertical>.json (GREAT_CTO_OVERRIDES_DIR to move).
// Every save appends to the file's own history[] — who changed what, when.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFlow, validateFlow as validateInvariants } from './flow-runner.mjs';
import { validateFlow as validateStructure } from './flow.mjs';

const OVERRIDES_DIR = process.env.GREAT_CTO_OVERRIDES_DIR
  || path.join(os.homedir(), '.great_cto', 'flow-overrides');

const safeSlug = (s) => String(s || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
const fileFor = (vertical, tenant) =>
  path.join(OVERRIDES_DIR, `${safeSlug(tenant)}--${safeSlug(vertical)}.json`);

/** Load the stored override for a tenant+vertical, or null when none exists. */
export function loadOverride(vertical, tenant = 'default') {
  try { return JSON.parse(fs.readFileSync(fileFor(vertical, tenant), 'utf8')); }
  catch { return null; }
}

const GATE_ID_RE = /^gate:[a-z0-9][a-z0-9-]*$/;

/**
 * Validate an override against its base flow WITHOUT saving.
 * Returns { ok, errors:[…], effective } — effective is the merged flow when ok.
 */
export function validateOverride(baseFlow, ov = {}) {
  const errors = [];
  const steps = baseFlow.steps || [];
  const baseGates = new Set(steps.filter((s) => s.gate).map((s) => s.gate));

  // roles: gateId → new signer label (the gate must exist in the base flow)
  for (const [gateId, role] of Object.entries(ov.roles || {})) {
    if (!baseGates.has(gateId)) errors.push(`roles: unknown gate "${gateId}" in this flow`);
    if (!role || typeof role !== 'string' || !role.trim()) errors.push(`roles: empty signer for "${gateId}"`);
    else if (role.length > 80) errors.push(`roles: signer for "${gateId}" is too long (max 80 chars)`);
  }

  // disabledSteps: only reversible, non-human agent steps may be switched off — gates and
  // irreversible writes are the safety/work product, not options.
  for (const idx of ov.disabledSteps || []) {
    const s = steps[idx];
    if (!s) { errors.push(`disabledSteps: no step ${idx} in the base flow`); continue; }
    if (s.gate || s.human) errors.push(`disabledSteps: step ${idx + 1} ("${s.does}") is a human checkpoint — it cannot be disabled`);
    else if (s.reversible === false) errors.push(`disabledSteps: step ${idx + 1} ("${s.does}") is the irreversible write — it cannot be disabled`);
  }

  // extraGates: a well-formed, uniquely-named human checkpoint inserted after a base step.
  const seenGateIds = new Set(baseGates);
  for (const g of ov.extraGates || []) {
    if (!Number.isInteger(g.after) || g.after < -1 || g.after >= steps.length) {
      errors.push(`extraGates: "after" must be a base step index (-1..${steps.length - 1}), got ${g.after}`);
    }
    if (!g.does || !String(g.does).trim()) errors.push('extraGates: each extra gate needs a "does" description');
    if (!g.human || !String(g.human).trim()) errors.push('extraGates: each extra gate needs a "human" (who signs)');
    if (!GATE_ID_RE.test(g.gate || '')) errors.push(`extraGates: gate id "${g.gate}" must match ${GATE_ID_RE}`);
    else if (seenGateIds.has(g.gate)) errors.push(`extraGates: gate id "${g.gate}" already exists in this flow`);
    else seenGateIds.add(g.gate);
  }

  if (errors.length) return { ok: false, errors, effective: null };

  const effective = applyOverrides(baseFlow, ov);

  // The merged flow must still satisfy the structural schema AND the safety invariants.
  const struct = validateStructure(effective);
  if (!struct.valid) errors.push(...struct.errors.map((e) => `effective flow: ${e}`));
  const inv = validateInvariants(effective);
  if (!inv.ok) errors.push(...inv.violations.map((v) =>
    `effective flow violates "${v.type}"${v.does ? ` at "${v.does}"` : ''} — overrides may not weaken the safety model`));

  return { ok: errors.length === 0, errors, effective: errors.length === 0 ? effective : null };
}

/** Pure merge: base flow + override → effective flow. Does NOT validate — see validateOverride. */
export function applyOverrides(baseFlow, ov = {}) {
  const flow = JSON.parse(JSON.stringify(baseFlow));
  const disabled = new Set(ov.disabledSteps || []);
  const roles = ov.roles || {};
  const extraByAfter = new Map();
  for (const g of ov.extraGates || []) {
    if (!extraByAfter.has(g.after)) extraByAfter.set(g.after, []);
    extraByAfter.get(g.after).push(g);
  }

  const out = [];
  const pushExtras = (after) => {
    for (const g of extraByAfter.get(after) || []) {
      out.push({ does: String(g.does), human: String(g.human), gate: g.gate, addedByOverride: true });
    }
  };
  pushExtras(-1); // gates inserted before the first step
  (baseFlow.steps || []).forEach((s, i) => {
    if (!disabled.has(i)) {
      const step = { ...flow.steps[i], baseIndex: i };
      if (step.gate && roles[step.gate]) step.human = roles[step.gate];
      out.push(step);
    }
    pushExtras(i);
  });

  flow.steps = out;
  if (Object.keys(roles).length || disabled.size || (ov.extraGates || []).length) {
    flow.customized = true;
    flow.overrideMeta = {
      tenant: ov.tenant || 'default',
      roles: Object.keys(roles).length, disabledSteps: disabled.size, extraGates: (ov.extraGates || []).length,
      updatedAt: ov.updatedAt, updatedBy: ov.updatedBy,
    };
  }
  return flow;
}

/**
 * Validate + persist an override. Throws on validation failure (message lists every error).
 * Returns { override, effective }.
 */
export function saveOverride(vertical, tenant, patch, by = 'admin') {
  const base = loadFlow(vertical);
  const prev = loadOverride(vertical, tenant) || {};
  const next = {
    vertical, tenant: tenant || 'default',
    roles: patch.roles ?? prev.roles ?? {},
    disabledSteps: patch.disabledSteps ?? prev.disabledSteps ?? [],
    extraGates: patch.extraGates ?? prev.extraGates ?? [],
    updatedAt: new Date().toISOString(), updatedBy: by,
    history: [...(prev.history || []), {
      at: new Date().toISOString(), by,
      summary: `roles:${Object.keys(patch.roles ?? prev.roles ?? {}).length} disabled:${(patch.disabledSteps ?? prev.disabledSteps ?? []).length} extraGates:${(patch.extraGates ?? prev.extraGates ?? []).length}`,
    }].slice(-50),
  };
  const v = validateOverride(base, next);
  if (!v.ok) { const err = new Error(`override rejected:\n  - ${v.errors.join('\n  - ')}`); err.errors = v.errors; throw err; }
  fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
  fs.writeFileSync(fileFor(vertical, tenant), JSON.stringify(next, null, 2));
  return { override: next, effective: v.effective };
}

/** Remove a tenant's override (back to the shipped base flow). Returns true if one existed. */
export function clearOverride(vertical, tenant = 'default') {
  try { fs.unlinkSync(fileFor(vertical, tenant)); return true; } catch { return false; }
}

/**
 * The flow the runtime should execute for this tenant: the shipped base, with the tenant's
 * validated overrides applied when present. Falls back to the base flow if a stored override
 * no longer validates (e.g. the base flow changed underneath it) — safety over customization.
 */
export function getEffectiveFlow(vertical, tenant = 'default') {
  const base = loadFlow(vertical);
  const ov = loadOverride(vertical, tenant);
  if (!ov) return base;
  const v = validateOverride(base, ov);
  if (!v.ok) {
    console.warn(`flow-overrides: stored override for ${tenant}/${vertical} no longer validates — using base flow (${v.errors[0]})`);
    return base;
  }
  return v.effective;
}
