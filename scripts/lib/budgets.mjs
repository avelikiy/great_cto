// scripts/lib/budgets.mjs — Tier-3 ops: per-vertical latency budgets + a connector cost model.
//
// A run has an operational cost envelope, not just a regulatory deadline (that's sla.mjs):
//   - latency budget: the wall-clock the connector work should fit inside (soc is seconds; a
//     document-heavy vertical gets more). Exceeding it is an ops signal, not a compliance breach.
//   - cost: a flat per-connector-call unit cost — a deterministic, keyless meter for billing/metering
//     and budget alerts. Real provider invoices replace this when creds land (same seam as adapters).

export const LATENCY_BUDGET_MS = Object.freeze({
  soc: 5000, msp: 6000, freight: 6000, customs: 8000, rcm: 8000, collections: 8000,
  'prior-auth': 8000, procurement: 8000, accounting: 8000, legaltech: 9000, title: 9000,
  insurance: 10000, mortgage: 10000, tax: 10000, aml: 10000, credentialing: 10000,
  audit: 12000, cro: 12000, pharma: 12000,
});
const DEFAULT_LATENCY_BUDGET_MS = 10000;

/** Per-connector-call unit cost (USD). Flat + deterministic so metering is reproducible offline.
 *  GREAT_CTO_CONNECTOR_UNIT_COST overrides (e.g. to model a real provider's per-call price). */
export function unitCostUsd() {
  const v = parseFloat(process.env.GREAT_CTO_CONNECTOR_UNIT_COST);
  return Number.isFinite(v) ? v : 0.02;
}

export function latencyBudgetMs(vertical) { return LATENCY_BUDGET_MS[vertical] || DEFAULT_LATENCY_BUDGET_MS; }
