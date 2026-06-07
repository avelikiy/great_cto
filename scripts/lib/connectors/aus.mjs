// scripts/lib/connectors/aus.mjs — automated-underwriting adapter (Phase 4 Wave 7, mortgage).
//
// run-aus runs a REAL agency-style automated underwriting decision (Fannie Mae DU / Freddie Mac
// LPA risk-grid logic) on a single loan — a deterministic calculation, no service, no keys. It
// computes LTV and DTI, applies the codified agency-guideline thresholds below, and returns an
// Approve/Eligible · Refer · Ineligible recommendation with findings + conditions. The mortgage
// autopilot uses this to triage loans: Approve/Eligible may proceed; Refer must go to a DE (Direct
// Endorsement) underwriter for manual judgment; Ineligible is a hard stop. Set AUS_URL to delegate
// to a real engine (Fannie DU / Freddie LPA) — otherwise the deterministic decision is returned
// with a `note` that no live engine was reached.
//
// No external deps. Thresholds are the published agency/HUD guideline limits (see comments below).

export const capabilities = ['run-aus'];

// ── Codified agency-guideline thresholds (DU / LPA style) ────────────────────────────────────────
// LTV  = loan-to-value         = loanAmount / propertyValue
// DTI  = debt-to-income (back-end) = (monthlyDebts + estimated PITI) / monthlyIncome
//
// conventional (Fannie/Freddie conforming):
//   max LTV 97% (HomeReady/standard 97 LTV programs; >97 is ineligible without an agency exception)
//   max DTI 50% hard ceiling; 45% is the base/comfort limit — 45–50% is borderline (Refer)
//   min FICO 620 (Selling Guide minimum representative score)
// FHA (HUD 4000.1):
//   max LTV 96.5% (3.5% min down) when FICO >= 580; 90% when FICO 500–579
//   min FICO 580 for max financing; below 580 (down to 500) only at 90% LTV — else ineligible
//   DTI base 43%; up to ~50% allowed WITH compensating factors (borderline → Refer)
// VA (VA Lender's Handbook 26-7):
//   LTV up to 100% (no down-payment required); no agency min FICO (lender overlays vary; ~580 typical)
//   DTI guideline 41%; above 41% allowed with adequate residual income (borderline → Refer)
const LIMITS = {
  conventional: { maxLtv: 0.97, dtiBase: 0.45, dtiMax: 0.50, minFico: 620 },
  fha:          { maxLtv: 0.965, dtiBase: 0.43, dtiMax: 0.50, minFico: 580, minFicoFloor: 500, reducedLtv: 0.90 },
  va:           { maxLtv: 1.00, dtiBase: 0.41, dtiMax: 0.50, minFico: 0 },
};

// Estimate monthly PITI from the loan amount. Principal & interest at a representative 30-yr fixed
// rate, grossed up ~1.25x to cover taxes, hazard insurance, HOA and (FHA/low-down) mortgage
// insurance — a conservative proxy when an exact escrow figure is not supplied.
const ANNUAL_RATE = 0.07;          // representative 30-yr fixed note rate
const TERM_MONTHS = 360;           // 30 years
const PITI_GROSS_UP = 1.25;        // P&I → PITI (taxes/insurance/MI/HOA)

function estimatePiti(loanAmount, providedPiti) {
  if (providedPiti != null && Number(providedPiti) > 0) return Number(providedPiti);
  const r = ANNUAL_RATE / 12;
  const pi = r === 0
    ? loanAmount / TERM_MONTHS
    : (loanAmount * r) / (1 - Math.pow(1 + r, -TERM_MONTHS));
  return pi * PITI_GROSS_UP;
}

function runAus(payload = {}) {
  const loanType = String(payload.loanType || 'conventional').toLowerCase();
  const L = LIMITS[loanType] || LIMITS.conventional;

  const loanAmount = Number(payload.loanAmount || 0);
  const propertyValue = Number(payload.propertyValue || 0);
  const monthlyIncome = Number(payload.monthlyIncome || 0);
  const monthlyDebts = Number(payload.monthlyDebts || 0);
  const ficoScore = Number(payload.ficoScore || 0);
  const occupancy = String(payload.occupancy || 'primary').toLowerCase();
  const reserves = payload.reserves != null ? Number(payload.reserves) : null;

  if (loanAmount <= 0 || propertyValue <= 0 || monthlyIncome <= 0) {
    return { ok: false, error: 'run-aus needs positive { loanAmount, propertyValue, monthlyIncome }' };
  }

  const piti = estimatePiti(loanAmount, payload.estimatedPiti ?? payload.piti);
  const ltv = +(loanAmount / propertyValue).toFixed(4);
  const dti = +((monthlyDebts + piti) / monthlyIncome).toFixed(4);

  const findings = [];
  const conditions = [];
  let ineligible = false;   // hard limit breached
  let refer = false;        // borderline — needs DE underwriter judgment

  // ── FICO ──────────────────────────────────────────────────────────────────────────────────────
  if (loanType === 'fha') {
    if (ficoScore < L.minFicoFloor) {
      ineligible = true;
      findings.push(`FICO ${ficoScore} is below the FHA floor of ${L.minFicoFloor} — ineligible.`);
    } else if (ficoScore < L.minFico) {
      // 500–579: FHA only at <=90% LTV.
      findings.push(`FICO ${ficoScore} is in the 500–579 band — FHA caps LTV at ${(L.reducedLtv * 100).toFixed(0)}% (10% down).`);
      if (ltv > L.reducedLtv) {
        ineligible = true;
        findings.push(`LTV ${(ltv * 100).toFixed(1)}% exceeds the reduced ${(L.reducedLtv * 100).toFixed(0)}% cap for FICO < ${L.minFico} — ineligible.`);
      } else {
        refer = true;
      }
    } else {
      findings.push(`FICO ${ficoScore} meets the FHA minimum of ${L.minFico}.`);
    }
  } else if (L.minFico > 0) {
    if (ficoScore < L.minFico) {
      ineligible = true;
      findings.push(`FICO ${ficoScore} is below the ${loanType} minimum of ${L.minFico} — ineligible.`);
    } else {
      findings.push(`FICO ${ficoScore} meets the ${loanType} minimum of ${L.minFico}.`);
    }
  } else {
    findings.push(`No agency minimum FICO for ${loanType}; lender overlays may still apply (FICO ${ficoScore || 'n/a'}).`);
    if (ficoScore && ficoScore < 580) refer = true;
  }

  // ── LTV ───────────────────────────────────────────────────────────────────────────────────────
  // FHA 500–579 case already handled its reduced LTV cap above.
  const ltvCap = (loanType === 'fha' && ficoScore < L.minFico) ? L.reducedLtv : L.maxLtv;
  if (ltv > ltvCap) {
    if (!(loanType === 'fha' && ficoScore < L.minFico)) {
      ineligible = true;
      findings.push(`LTV ${(ltv * 100).toFixed(1)}% exceeds the ${loanType} max of ${(ltvCap * 100).toFixed(1)}% — ineligible.`);
    }
  } else {
    findings.push(`LTV ${(ltv * 100).toFixed(1)}% is within the ${loanType} max of ${(ltvCap * 100).toFixed(1)}%.`);
    if (ltv > ltvCap - 0.005) conditions.push('Verify the appraised value supports the high LTV.');
  }

  // ── DTI ───────────────────────────────────────────────────────────────────────────────────────
  if (dti > L.dtiMax) {
    ineligible = true;
    findings.push(`DTI ${(dti * 100).toFixed(1)}% exceeds the ${loanType} hard ceiling of ${(L.dtiMax * 100).toFixed(0)}% — ineligible.`);
  } else if (dti > L.dtiBase) {
    refer = true;
    findings.push(`DTI ${(dti * 100).toFixed(1)}% is above the ${(L.dtiBase * 100).toFixed(0)}% base but within the ${(L.dtiMax * 100).toFixed(0)}% ceiling — needs compensating factors.`);
    conditions.push('Document compensating factors (reserves, residual income, stable employment) for the elevated DTI.');
  } else {
    findings.push(`DTI ${(dti * 100).toFixed(1)}% is within the ${loanType} base limit of ${(L.dtiBase * 100).toFixed(0)}%.`);
  }

  // ── Reserves / occupancy ────────────────────────────────────────────────────────────────────────
  if (occupancy !== 'primary') {
    refer = refer || false;
    conditions.push(`Occupancy is '${occupancy}' — apply the non-owner-occupied pricing/reserve overlays.`);
    if (reserves == null) {
      refer = true;
      findings.push(`Non-primary occupancy ('${occupancy}') typically requires documented reserves — none supplied, refer for review.`);
    }
  }
  if (reserves != null) {
    const monthsReserve = +(reserves / piti).toFixed(1);
    findings.push(`Reserves cover ~${monthsReserve} months of PITI.`);
    if (monthsReserve < 2) conditions.push('Reserves below ~2 months PITI — document source of funds and any compensating factors.');
  }

  // VA residual-income note (codified as a condition rather than a hard cut).
  if (loanType === 'va' && dti > L.dtiBase) {
    conditions.push('VA: confirm residual income meets the regional table for the elevated DTI.');
  }

  let recommendation;
  if (ineligible) recommendation = 'Ineligible';
  else if (refer) recommendation = 'Refer';
  else recommendation = 'Approve/Eligible';

  return {
    ok: true,
    data: {
      loanType,
      recommendation,
      ltv,
      dti,
      estimatedPiti: +piti.toFixed(2),
      findings,
      conditions,
    },
  };
}

export async function call(op, payload = {}) {
  if (op === 'run-aus') {
    // Live-engine delegation: only reach out when AUS_URL (Fannie DU / Freddie LPA endpoint) is set.
    const url = process.env.AUS_URL;
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, mode: 'live', data };
        }
        // fall through to deterministic on a non-2xx
      } catch { /* fall through to deterministic */ }
    }
    const out = runAus(payload);
    if (!out.ok) return out;
    return {
      ok: true,
      mode: 'deterministic',
      data: { ...out.data, note: 'Deterministic agency-guideline decision (no live AUS engine). Set AUS_URL to delegate to Fannie DU / Freddie LPA.' },
    };
  }

  return { ok: false, error: `aus adapter has no op '${op}'` };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
// node scripts/lib/connectors/aus.mjs            → runs the two smoke-test loans
// node scripts/lib/connectors/aus.mjs '<json>'   → runs run-aus on the supplied loan JSON
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg) {
    call('run-aus', JSON.parse(arg)).then((r) => console.log(JSON.stringify(r, null, 2)));
  } else {
    const approvable = {
      loanAmount: 300000, propertyValue: 400000, monthlyIncome: 9000, monthlyDebts: 400,
      ficoScore: 740, loanType: 'conventional', occupancy: 'primary', reserves: 12000,
    };
    const overLimit = {
      loanAmount: 392000, propertyValue: 400000, monthlyIncome: 5000, monthlyDebts: 1500,
      ficoScore: 660, loanType: 'conventional', occupancy: 'primary',
    };
    Promise.all([call('run-aus', approvable), call('run-aus', overLimit)]).then(([a, b]) => {
      console.log('— approvable loan —');
      console.log(JSON.stringify(a, null, 2));
      console.log('\n— over-DTI / over-LTV loan —');
      console.log(JSON.stringify(b, null, 2));
    });
  }
}
