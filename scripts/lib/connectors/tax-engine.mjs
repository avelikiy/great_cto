// scripts/lib/connectors/tax-engine.mjs — tax-engine adapter (Phase 4 Wave 7, tax).
//
// compute-return runs a REAL US federal income-tax computation (2025 individual brackets + standard
// deduction) — a deterministic calculation, no service, no keys. classify-position assigns a
// position-authority level (substantial authority / reasonable basis / below standard) per the
// §6694 ladder, which drives whether the tax autopilot may take it or must escalate. Going further
// (state, e-file) needs licensed engines / IRS MeF — set GREAT_CTO_TAX_ENGINE_URL to delegate.
//
// No external deps. Figures are the published IRS 2025 amounts.

export const capabilities = ['compute-return', 'classify-position'];

// IRS 2025 federal income-tax brackets (taxable income thresholds → marginal rate).
const BRACKETS = {
  single: [[0, 0.10], [11925, 0.12], [48475, 0.22], [103350, 0.24], [197300, 0.32], [250525, 0.35], [626350, 0.37]],
  married: [[0, 0.10], [23850, 0.12], [96950, 0.22], [206700, 0.24], [394600, 0.32], [501050, 0.35], [751600, 0.37]],
  hoh: [[0, 0.10], [17000, 0.12], [64850, 0.22], [103350, 0.24], [197300, 0.32], [250500, 0.35], [626350, 0.37]],
};
const STD_DEDUCTION = { single: 15000, married: 30000, hoh: 22500 };

function taxFor(taxable, status) {
  const b = BRACKETS[status] || BRACKETS.single;
  let tax = 0;
  for (let i = 0; i < b.length; i++) {
    const [floor, rate] = b[i];
    const ceil = i + 1 < b.length ? b[i + 1][0] : Infinity;
    if (taxable > floor) tax += (Math.min(taxable, ceil) - floor) * rate;
    else break;
  }
  return Math.round(tax * 100) / 100;
}

export async function call(op, payload = {}) {
  if (op === 'compute-return') {
    const status = String(payload.filingStatus || payload.status || 'single').toLowerCase();
    const income = Number(payload.income || 0);
    const adjustments = Number(payload.adjustments || 0);
    const itemized = Number(payload.itemized || 0);
    const withheld = Number(payload.withheld || 0);
    const std = STD_DEDUCTION[status] ?? STD_DEDUCTION.single;
    const deduction = Math.max(std, itemized);
    const agi = Math.max(0, income - adjustments);
    const taxable = Math.max(0, agi - deduction);
    const tax = taxFor(taxable, status);
    const marginal = (BRACKETS[status] || BRACKETS.single).filter((x) => taxable > x[0]).pop()?.[1] ?? 0.10;
    return { ok: true, mode: 'live', data: {
      filingStatus: status, income, agi, deduction, deductionType: itemized > std ? 'itemized' : 'standard',
      taxableIncome: taxable, tax, withheld, balanceDue: +(tax - withheld).toFixed(2),
      effectiveRate: income ? +((tax / income) * 100).toFixed(2) : 0, marginalRate: marginal * 100 } };
  }

  if (op === 'classify-position') {
    // A simple §6694 authority ladder by the position's support level (0..1).
    const support = Number(payload.support ?? 0.5);
    let level, action;
    if (support >= 0.4) { level = 'substantial authority'; action = 'may take the position'; }
    else if (support >= 0.2) { level = 'reasonable basis'; action = 'take only WITH Form 8275 disclosure'; }
    else { level = 'below reasonable basis'; action = 'do NOT take — escalate to a credentialed preparer'; }
    return { ok: true, mode: 'live', data: { position: payload.position || '(unspecified)', support, level, action,
      escalate: support < 0.2 } };
  }

  return { ok: false, error: `tax-engine adapter has no op '${op}'` };
}
