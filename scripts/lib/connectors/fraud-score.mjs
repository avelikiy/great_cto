// scripts/lib/connectors/fraud-score.mjs — claims fraud-indicator scoring (Phase 4 Wave 7, insurance).
//
// score-fraud runs a REAL, transparent rule-based P&C fraud-indicator model — the standard SIU
// (Special Investigations Unit) red flags used by insurers / NICB to triage first-party claims.
// Each fired indicator adds explicit, documented points; the total maps to a band and a refer flag.
// This is deterministic and network-free: the same claim always yields the same score, and the
// rationale (which indicators fired, and why) is fully inspectable — which is what an autopilot
// needs to justify escalating a claim to a human adjuster / SIU.
//
// A high score is NOT an accusation of fraud — it is a triage signal that a claim warrants a human
// look before payout. The insurance autopilot may auto-approve LOW-band claims but MUST route
// elevated/high (refer=true) claims to SIU / an adjuster. To delegate to a real provider's model
// (e.g. an analytics vendor), set FRAUD_SCORE_URL and the adapter POSTs the claim there instead.
//
// No external deps. Indicator weights below are explicit and tunable.

export const capabilities = ['score-fraud'];

// --- Fraud-indicator rule set (P&C SIU red flags). ---------------------------------------------
// Each rule: { code, label, points, test(claim) -> bool }. Points are weighted by how predictive
// the flag is in industry SIU practice — a single strong flag (e.g. theft with no police report)
// carries more weight than a soft one (round-number amount). Weights are intentionally explicit so
// the model is auditable; tune them here rather than burying logic in the call() body.
const INDICATORS = [
  {
    // Claim filed very soon after the policy started — classic "buy-and-burn" pattern.
    code: 'EARLY_CLAIM',
    label: 'Loss reported soon after policy inception',
    points: 25,
    test: (c) => Number(c.daysSincePolicyStart) >= 0 && Number(c.daysSincePolicyStart) <= 30,
  },
  {
    // Still early, just less extreme — a softer version of the above.
    code: 'EARLY_CLAIM_SOFT',
    label: 'Loss reported within 90 days of policy inception',
    points: 10,
    test: (c) => Number(c.daysSincePolicyStart) > 30 && Number(c.daysSincePolicyStart) <= 90,
  },
  {
    // Coverage or limits increased shortly before the loss.
    code: 'RECENT_COVERAGE_INCREASE',
    label: 'Coverage increased shortly before the loss',
    points: 18,
    test: (c) => c.recentCoverageIncrease === true ||
      (Number(c.coverageIncreaseDaysAgo) >= 0 && Number(c.coverageIncreaseDaysAgo) <= 60),
  },
  {
    // A theft / burglary loss with no police report is a top SIU flag.
    code: 'THEFT_NO_POLICE_REPORT',
    label: 'Theft/burglary loss with no police report',
    points: 22,
    test: (c) => /theft|burglary|stolen|robbery/i.test(String(c.lossType || '')) &&
      c.hasPoliceReport === false,
  },
  {
    // Reporting the loss long after it allegedly happened — gives time to stage/assemble a claim.
    code: 'LATE_REPORTING',
    label: 'Loss reported late (long delay after the event)',
    points: 15,
    test: (c) => Number(c.reportedDelayDays) >= 30,
  },
  {
    // High prior-claim frequency in the trailing 12 months.
    code: 'HIGH_PRIOR_FREQUENCY',
    label: 'High prior-claim frequency (12 months)',
    points: 20,
    test: (c) => Number(c.priorClaims12mo) >= 3,
  },
  {
    // Some prior history — softer than the above.
    code: 'PRIOR_FREQUENCY_SOFT',
    label: 'Recent prior claim history',
    points: 8,
    test: (c) => Number(c.priorClaims12mo) === 2,
  },
  {
    // Suspiciously round claim amount (e.g. exactly $5,000) — estimates, not real losses, round off.
    code: 'ROUND_NUMBER_AMOUNT',
    label: 'Suspiciously round claim amount',
    points: 8,
    test: (c) => Number(c.amountUsd) >= 1000 && Number(c.amountUsd) % 1000 === 0,
  },
  {
    // Claimant was added to the policy very recently before the loss.
    code: 'NEW_CLAIMANT',
    label: 'Claimant recently added to the policy',
    points: 12,
    test: (c) => Number(c.claimantTenureDays) >= 0 && Number(c.claimantTenureDays) <= 30,
  },
  {
    // No witnesses / no supporting documentation supplied.
    code: 'NO_SUPPORTING_EVIDENCE',
    label: 'No witnesses or supporting documentation',
    points: 7,
    test: (c) => c.hasWitnesses === false && c.hasSupportingDocs === false,
  },
  {
    // Large claim relative to typical — a soft amplifier (capped weight).
    code: 'HIGH_VALUE_CLAIM',
    label: 'High-value claim',
    points: 6,
    test: (c) => Number(c.amountUsd) >= 50000,
  },
];

// Band thresholds on the 0..100 score. refer=true (escalate to SIU / adjuster) at/above REFER_AT.
const ELEVATED_AT = 25;
const HIGH_AT = 50;
const REFER_AT = ELEVATED_AT; // anything not clearly LOW gets a human look.

function scoreClaim(claim) {
  const fired = INDICATORS.filter((ind) => {
    try { return ind.test(claim) === true; } catch { return false; }
  }).map((ind) => ({ code: ind.code, label: ind.label, points: ind.points }));

  const raw = fired.reduce((sum, ind) => sum + ind.points, 0);
  const score = Math.min(100, raw); // cap at 100
  const band = score >= HIGH_AT ? 'high' : score >= ELEVATED_AT ? 'elevated' : 'low';
  const refer = score >= REFER_AT;
  return { score, band, indicators: fired, refer };
}

export async function call(op, payload = {}) {
  if (op === 'score-fraud') {
    const claim = payload.claim || payload;
    const result = scoreClaim(claim);

    const url = process.env.FRAUD_SCORE_URL;
    if (url) {
      // Delegate to a real provider's model when configured.
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ claim }),
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, mode: 'live', data };
        }
        return { ok: false, error: `fraud-score provider returned HTTP ${res.status}` };
      } catch (e) {
        return { ok: false, error: `fraud-score provider request failed: ${e.message}` };
      }
    }

    return {
      ok: true,
      mode: 'deterministic',
      data: {
        ...result,
        decision: result.refer
          ? `REFER — score ${result.score}/100 (${result.band}); route to SIU / adjuster before payout`
          : `clear — score ${result.score}/100 (low); eligible for straight-through processing`,
        note: 'Deterministic rule-based SIU red-flag model (network-free). Set FRAUD_SCORE_URL to delegate to a provider model. A high score is a triage signal, not proof of fraud.',
      },
    };
  }

  return { ok: false, error: `fraud-score adapter has no op '${op}'` };
}

// --- CLI -----------------------------------------------------------------------------------------
// Usage:  node fraud-score.mjs '{"amountUsd":5000,"daysSincePolicyStart":12,...}'
// With no arg, runs a smoke test on a clearly-fraudulent and a clean claim.
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg) {
    const claim = JSON.parse(arg);
    call('score-fraud', { claim }).then((r) => console.log(JSON.stringify(r, null, 2)));
  } else {
    const fraudulent = {
      amountUsd: 25000,
      daysSincePolicyStart: 12,
      priorClaims12mo: 4,
      lossType: 'theft',
      hasPoliceReport: false,
      reportedDelayDays: 45,
      claimantTenureDays: 10,
      recentCoverageIncrease: true,
      hasWitnesses: false,
      hasSupportingDocs: false,
    };
    const clean = {
      amountUsd: 3275,
      daysSincePolicyStart: 640,
      priorClaims12mo: 0,
      lossType: 'collision',
      hasPoliceReport: true,
      reportedDelayDays: 1,
      claimantTenureDays: 900,
      recentCoverageIncrease: false,
      hasWitnesses: true,
      hasSupportingDocs: true,
    };
    Promise.all([call('score-fraud', { claim: fraudulent }), call('score-fraud', { claim: clean })])
      .then(([f, c]) => {
        console.log('--- fraudulent claim ---');
        console.log(JSON.stringify(f, null, 2));
        console.log('\n--- clean claim ---');
        console.log(JSON.stringify(c, null, 2));
      });
  }
}
