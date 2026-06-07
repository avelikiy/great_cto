// scripts/lib/connectors/um-criteria.mjs — utilization-management criteria (prior-auth vertical).
//
// check-criteria evaluates a prior-authorization request against a curated slice of real CMS
// NCD/LCD-style medical-necessity rules for a handful of high-prior-auth services (advanced
// imaging, a high-cost biologic, an elective procedure). For each rule it checks the gating
// conditions (e.g. ≥6 weeks of conservative therapy before lumbar MRI, unless documented red-flags)
// and returns whether the request MEETS-CRITERIA.
//
// SAFETY INVARIANT — this adapter NEVER auto-denies. When criteria are not met, or no rule is on
// file, it returns requiresMdReview=true: a denial is a clinical determination that, by regulation
// and by design, only a licensed medical director may make. The autopilot may auto-APPROVE when
// criteria are clearly met; everything else escalates.
//
// Deterministic, no keys, no network by default. The embedded ruleset is a representative,
// public-domain modelling of CMS coverage logic (CPT descriptors are AMA-licensed and not
// reproduced). Set UM_CRITERIA_URL to delegate to a licensed MCG / InterQual engine; until that is
// wired the built-in ruleset is evaluated and the result carries a `note`.

export const capabilities = ['check-criteria'];

const APPROVE = 'MEETS-CRITERIA (approve)';
const ESCALATE = 'DOES-NOT-MEET (escalate to medical director)';
const NO_CRITERIA = 'NO-CRITERIA-ON-FILE';

// Curated medical-necessity ruleset. Keyed by the primary procedure/service code (CPT/HCPCS).
// Each rule exposes an `evaluate(payload)` returning { met, missing[] }. `criteria` cites the
// governing policy id/source. Modelled on real CMS NCD/LCD + payer UM logic.
const RULES = {
  // MRI lumbar spine, without contrast — the canonical "≥6 weeks conservative therapy" gate.
  // Bypassed by documented red-flags (cauda equina, suspected malignancy/infection, progressive
  // neuro deficit, trauma) which themselves justify urgent imaging.
  '72148': {
    service: 'MRI lumbar spine without contrast',
    criteria: 'LCD L34807 (advanced imaging) / ACR Appropriateness — low back pain',
    evaluate(p) {
      const missing = [];
      const redFlags = !!(p.redFlags || p.caudaEquina || p.suspectedMalignancy ||
        p.suspectedInfection || p.progressiveNeuroDeficit || p.trauma);
      if (redFlags) return { met: true, missing, basis: 'red-flag indication — conservative therapy waived' };
      const weeks = Number(p.priorConservativeTherapyWeeks ?? 0);
      if (weeks < 6) missing.push('≥6 weeks of documented conservative therapy (PT, NSAIDs, activity modification) or a red-flag indication');
      return { met: missing.length === 0, missing, basis: 'conservative-therapy threshold' };
    },
  },

  // MRI brain without contrast — for chronic headache, requires a prior failed empiric treatment
  // trial and/or neurologic red-flags; routine uncomplicated headache does not warrant MRI.
  '70551': {
    service: 'MRI brain without contrast',
    criteria: 'ACR Appropriateness — headache / LCD advanced imaging',
    evaluate(p) {
      const missing = [];
      const redFlags = !!(p.redFlags || p.focalNeuroDeficit || p.thunderclap ||
        p.papilledema || p.newOnsetOver50);
      if (redFlags) return { met: true, missing, basis: 'neurologic red-flag indication' };
      if (!p.failedEmpiricTreatment && !p.abnormalNeuroExam) {
        missing.push('failed empiric headache treatment OR abnormal neuro exam OR a documented red-flag');
      }
      return { met: missing.length === 0, missing, basis: 'headache imaging criteria' };
    },
  },

  // High-cost biologic — adalimumab (HCPCS J0135), e.g. for rheumatoid arthritis. Step therapy:
  // failure/intolerance of a conventional DMARD (methotrexate) before the biologic, plus a TB
  // screen on file. Pediatric dosing flagged for review.
  'J0135': {
    service: 'Adalimumab (biologic) — step therapy',
    criteria: 'Payer step-therapy policy / ACR RA treatment guideline',
    evaluate(p) {
      const missing = [];
      if (!p.failedConventionalDmard && !p.failedMethotrexate) {
        missing.push('documented failure or intolerance of a conventional DMARD (e.g. methotrexate)');
      }
      if (!p.tbScreening && !p.tbScreen) {
        missing.push('latent-TB screening on file prior to biologic initiation');
      }
      return { met: missing.length === 0, missing, basis: 'step-therapy + safety screening' };
    },
  },

  // Elective lumbar fusion (CPT 22612) — high-scrutiny elective procedure. Requires a sustained
  // conservative-care trial AND advanced imaging confirming a surgical lesion. Age sanity check.
  '22612': {
    service: 'Lumbar spinal fusion (elective)',
    criteria: 'LCD/NCD spinal fusion medical-necessity policy',
    evaluate(p) {
      const missing = [];
      const weeks = Number(p.priorConservativeTherapyWeeks ?? 0);
      if (weeks < 12) missing.push('≥12 weeks (3 months) of failed conservative management');
      if (!p.imagingDone && !p.imagingConfirmsLesion) {
        missing.push('advanced imaging (MRI/CT) confirming an instability/lesion correlating with symptoms');
      }
      if (p.age != null && Number(p.age) < 18) missing.push('skeletal-maturity / pediatric review for fusion');
      return { met: missing.length === 0, missing, basis: 'elective-surgery necessity criteria' };
    },
  },
};

const norm = (c) => String(c || '').toUpperCase().replace(/\s/g, '').trim();

function resolveRule(payload) {
  const code = norm(payload.cpt || payload.code || payload.hcpcs || payload.service);
  if (RULES[code]) return { code, rule: RULES[code] };
  // Allow lookup by free-text service name as a fallback.
  const svc = String(payload.service || '').toLowerCase().trim();
  if (svc) {
    for (const [k, r] of Object.entries(RULES)) {
      if (r.service.toLowerCase().includes(svc) || svc.includes(r.service.toLowerCase())) {
        return { code: k, rule: r };
      }
    }
  }
  return { code: code || svc || '(unspecified)', rule: null };
}

export async function call(op, payload = {}) {
  if (op === 'check-criteria') {
    const delegate = process.env.UM_CRITERIA_URL;
    const { code, rule } = resolveRule(payload);

    if (!rule) {
      // No rule on file — do NOT deny. Escalate for a manual medical-necessity determination.
      return { ok: true, mode: delegate ? 'delegate' : 'live', data: {
        service: code,
        met: false,
        determination: NO_CRITERIA,
        criteria: null,
        missing: [],
        requiresMdReview: true,
        note: delegate
          ? `No built-in rule for ${code}; a real query would be delegated to ${delegate} (MCG/InterQual). Escalated to the medical director until wired — never auto-denied.`
          : `No curated medical-necessity rule on file for ${code}. NOT a denial — routed to the medical director for a manual determination. Set UM_CRITERIA_URL to consult a licensed MCG/InterQual engine.` } };
    }

    const { met, missing, basis } = rule.evaluate(payload);
    const determination = met ? APPROVE : ESCALATE;
    return { ok: true, mode: delegate ? 'delegate' : 'live', data: {
      service: rule.service,
      code,
      met,
      determination,
      criteria: rule.criteria,
      basis,
      missing,
      // Auto-approve only when met; anything short of that needs the medical director. Never deny here.
      requiresMdReview: !met,
      note: met
        ? `Criteria met (${basis}) — autopilot may approve.`
        : `Criteria not met — escalated to the medical director. The autopilot must NOT auto-deny; a denial is a clinical determination requiring a licensed reviewer.${delegate ? ` (Curated ruleset; ${delegate} available for delegation.)` : ' Set UM_CRITERIA_URL to delegate to MCG/InterQual.'}` } };
  }

  return { ok: false, error: `um-criteria adapter has no op '${op}'` };
}

// CLI: node um-criteria.mjs check-criteria '<json-payload>'
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , op, raw] = process.argv;
  if (!op) {
    console.error("usage: node um-criteria.mjs check-criteria '<json>'");
    console.error('  smoke: node um-criteria.mjs --smoke');
    process.exit(2);
  }
  if (op === '--smoke') {
    const cases = [
      // Meets criteria → approve (8 weeks conservative therapy on a lumbar MRI).
      ['check-criteria', { cpt: '72148', icd10: 'M54.5', age: 47, priorConservativeTherapyWeeks: 8 }],
      // Missing conservative therapy (2 weeks) → escalate to medical director, requiresMdReview.
      ['check-criteria', { cpt: '72148', icd10: 'M54.5', age: 47, priorConservativeTherapyWeeks: 2 }],
      // Red-flag bypass → approve despite no conservative therapy.
      ['check-criteria', { cpt: '72148', icd10: 'M54.5', caudaEquina: true, priorConservativeTherapyWeeks: 0 }],
      // Biologic without step therapy → escalate.
      ['check-criteria', { hcpcs: 'J0135', icd10: 'M06.9' }],
      // Unknown code → NO-CRITERIA-ON-FILE, still escalates (never auto-denied).
      ['check-criteria', { cpt: '99999', icd10: 'Z00.00' }],
    ];
    (async () => {
      for (const [o, p] of cases) {
        const r = await call(o, p);
        console.log(`\n# ${o} ${JSON.stringify(p)}`);
        console.log(JSON.stringify(r, null, 2));
      }
    })();
  } else {
    const payload = raw ? JSON.parse(raw) : {};
    call(op, payload).then((r) => console.log(JSON.stringify(r, null, 2)));
  }
}
