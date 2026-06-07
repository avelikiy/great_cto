// scripts/lib/flow.mjs — vertical flow loader / validator / renderer (autopilot pivot).
//
// A "flow" is the single source of truth for a vertical autopilot, in BUSINESS language: the
// steps of the work, which agent does each, which connectors (tools) it uses, and where a human
// signs off. The landing page, README, /flow, and /start all render from the same flow JSON, so
// positioning stays consistent. The compliance reviewer + gates + scorecard are referenced (the
// under-the-hood trust layer), not the headline.

import { flowConnectors, unknownConnectors, getConnector } from './connectors.mjs';

const REQUIRED = ['vertical', 'autopilot', 'outcome', 'steps'];

/**
 * Validate a flow object.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateFlow(flow = {}) {
  const errors = [];
  const warnings = [];
  for (const k of REQUIRED) if (!flow[k]) errors.push(`missing "${k}"`);
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  if (!steps.length) errors.push('flow has no steps');

  let humanGates = 0;
  steps.forEach((s, i) => {
    if (!s.does) errors.push(`step ${i + 1}: missing "does"`);
    if (!s.agent && !s.human) errors.push(`step ${i + 1}: needs an "agent" or a "human"`);
    if (s.human && !s.gate) warnings.push(`step ${i + 1}: human step without a gate id`);
    if (s.gate) humanGates += 1;
  });
  if (humanGates === 0) warnings.push('flow has no human gate — an autopilot should keep a human on the judgment calls');

  for (const id of unknownConnectors(flow)) errors.push(`unknown connector "${id}" (not in the catalog)`);
  return { valid: errors.length === 0, errors, warnings };
}

/** Count steps that run autonomously (agent) vs that require a human. */
export function flowStats(flow) {
  const steps = flow.steps || [];
  const autonomous = steps.filter((s) => s.agent && !s.human).length;
  const human = steps.filter((s) => s.human).length;
  const connectors = flowConnectors(flow).length;
  return { steps: steps.length, autonomous, human, connectors };
}

/** One-line business summary. */
export function flowSummary(flow) {
  const st = flowStats(flow);
  return `${flow.autopilot} — ${st.autonomous} automated step(s), ${st.human} human checkpoint(s), ${st.connectors} connector(s)`;
}

const ICON = (s) => (s.human ? '🧑‍⚖️' : '🤖');

/** Render the flow in business-readable text (for /flow and CLI). */
export function renderFlow(flow) {
  const out = [];
  out.push(`# ${flow.autopilot}`);
  if (flow.tagline) out.push(flow.tagline);
  out.push('');
  if (flow.audience) out.push(`Buyer:   ${flow.audience}`);
  if (flow.marketSizeUsd) out.push(`Market:  $${flow.marketSizeUsd}`);
  if (typeof flow.qualityScore === 'number') out.push(`Quality: ${flow.qualityScore}/100 (measured — see scorecard)`);
  out.push('');
  if (flow.problem) out.push(`Problem:  ${flow.problem}`);
  if (flow.outcome) out.push(`Outcome:  ${flow.outcome}`);
  out.push('', 'The flow:');
  (flow.steps || []).forEach((s, i) => {
    const who = s.human ? `👤 ${s.human}` : `agent: ${s.agent}`;
    out.push(`  ${i + 1}. ${ICON(s)} ${s.does}`);
    const tools = (s.tools || []).map((t) => (getConnector(t)?.label || t)).join(', ');
    const bits = [who];
    if (tools) bits.push(`tools: ${tools}`);
    if (s.gate) bits.push(`HUMAN GATE → ${s.gate}`);
    out.push(`       ${bits.join('  ·  ')}`);
  });
  out.push('');
  if (flow.startups?.length) out.push(`In this space: ${flow.startups.join(', ')}`);
  out.push(`Under the hood: ${flow.reviewer || 'compliance reviewer'} + signed gates + audit trail (the trust layer).`);
  return out.join('\n');
}

/** Render the connectors a flow needs (with stub/live status) — the integration checklist. */
export function renderConnectors(flow) {
  const out = [`Connectors for ${flow.autopilot}:`];
  for (const { id, spec } of flowConnectors(flow)) {
    if (!spec) { out.push(`  ✗ ${id} — UNKNOWN (catalog gap)`); continue; }
    out.push(`  ${spec.status === 'stub' ? '◻' : '◼'} ${spec.label} (${id}) — ${spec.status}; real: ${spec.realProviders.join(' / ')}`);
  }
  return out.join('\n');
}
