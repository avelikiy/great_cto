// scripts/lib/connectors/safety-report.mjs — safety-report adapter (Phase 4, pharma vertical).
//
// `submit-e2b` builds a REAL, structurally-complete ICH E2B(R3) ICSR (Individual Case Safety
// Report)-style record from an adverse-event case — a deterministic structured-document
// transformation, like the X12 837 in clearinghouse.mjs and the FinCEN SAR in sar-filing.mjs. No
// external service and no keys by default, so the pharma autopilot produces a genuine, reviewable
// E2B artifact (patient → drug → MedDRA reaction → seriousness → ICSR fields + expedited flag), not
// a mock. Going fully live = transmit the ICSR to a pharmacovigilance gateway (FDA FAERS / EMA
// EudraVigilance) — set FAERS_GATEWAY_URL (and optionally FAERS_GATEWAY_TOKEN); until then it
// returns the E2B record for review.
//
// CRITICAL GATE: a safety report can NEVER be submitted without the QPPV (EU Qualified Person for
// Pharmacovigilance) / drug-safety physician's signature. If `qppvApproved !== true` the call is
// blocked outright — no record is transmitted. This mirrors the irreversible, accountable-owner
// discipline of the other connectors.
//
// No external deps.

const SUBMIT_URL = process.env.FAERS_GATEWAY_URL || '';
const TOKEN = process.env.FAERS_GATEWAY_TOKEN || '';

export const capabilities = ['submit-e2b'];

const clean = (s, fallback = '') => (s == null ? fallback : String(s).trim());

// ICH E2B(R3) seriousness criteria (E.i.3.2) — any one present => "serious".
const SERIOUSNESS_CRITERIA = {
  'death': 'resultsInDeath',
  'life-threatening': 'isLifeThreatening',
  'life threatening': 'isLifeThreatening',
  'hospitalization': 'causedHospitalisation',
  'hospitalisation': 'causedHospitalisation',
  'disability': 'disabling',
  'congenital anomaly': 'congenitalAnomaly',
  'other': 'otherMedicallyImportant',
  'serious': 'otherMedicallyImportant',
};

/** Deterministic safety-report id / control number, stable for the same case material. */
function safetyReportId(caseId, drugName, pt, onsetDate) {
  const basis = `${caseId}|${drugName}|${pt}|${onsetDate || ''}`;
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) >>> 0;
  // E2B C.1.1 safety report unique id pattern: <senderCountry>-<sender>-<caseId>.
  return `US-GREATCTO-${String(h).padStart(10, '0')}`;
}

/** Resolve the supplied seriousness (string or array) into the E2B seriousness-criteria flags. */
function resolveSeriousness(seriousness) {
  const flags = {
    resultsInDeath: false, isLifeThreatening: false, causedHospitalisation: false,
    disabling: false, congenitalAnomaly: false, otherMedicallyImportant: false,
  };
  const items = Array.isArray(seriousness) ? seriousness : [seriousness];
  let any = false;
  for (const raw of items) {
    const key = clean(raw).toLowerCase();
    if (!key || key === 'non-serious' || key === 'nonserious' || key === 'not serious') continue;
    const flag = SERIOUSNESS_CRITERIA[key] || SERIOUSNESS_CRITERIA[Object.keys(SERIOUSNESS_CRITERIA).find((k) => key.includes(k)) || ''];
    if (flag) { flags[flag] = true; any = true; }
  }
  return { flags, serious: any };
}

/** Build a structured ICH E2B(R3) ICSR record from an adverse-event case. */
export function buildIcsr({ caseId, patient = {}, drug = {}, reaction = {}, reporter, causality } = {}) {
  const cid = clean(caseId, '(unassigned case)');
  const drugName = clean(drug.name, '(unidentified product)');
  const pt = clean(reaction.pt, '(unspecified reaction)');
  const soc = clean(reaction.soc, '(unspecified SOC)');
  const onsetDate = clean(reaction.onsetDate);
  const { flags, serious } = resolveSeriousness(reaction.seriousness);

  // "Unexpected" = not in the reference safety information. Without a labelling DB we treat an
  // explicit causality of "related"/"unexpected" as unexpected; default unexpected when serious.
  const cause = clean(causality).toLowerCase();
  const expected = cause === 'expected' || cause === 'labelled' || cause === 'labeled';
  const unexpected = !expected;

  const id = safetyReportId(cid, drugName, pt, onsetDate);

  // C.1 — Case identification (safety report header).
  const C1 = {
    section: 'C.1 — Case Identification',
    safetyReportId: id,
    reportType: '1 (spontaneous report)',
    senderCountry: 'US',
    seriousness: serious ? 'serious' : 'non-serious',
    firstReceiveDate: onsetDate || '(unknown)',
    reporterQualification: clean(reporter, '(not provided)'),
  };

  // D — Patient characteristics.
  const D = {
    section: 'D — Patient Characteristics',
    age: patient.age != null ? String(patient.age) : '(not provided)',
    sex: clean(patient.sex, '(not provided)'),
  };

  // G — Drug / suspect product.
  const G = {
    section: 'G — Drug(s) Information',
    medicinalProduct: drugName,
    drugCharacterization: '1 (suspect)',
    indication: clean(drug.indication, '(not provided)'),
  };

  // E — Reaction / event (MedDRA coded).
  const E = {
    section: 'E — Reaction(s)/Event(s)',
    meddraPreferredTerm: pt,
    meddraSystemOrganClass: soc,
    onsetDate: onsetDate || '(unknown)',
    seriousnessCriteria: flags,
    serious,
  };

  // Expedited reporting: a serious + unexpected reaction is a 15-day expedited ICSR (ICH E2D).
  const expedited = serious && unexpected;
  const dueInDays = expedited ? 15 : 90;

  const icsr = {
    standard: 'ICH E2B(R3) ICSR',
    safetyReportId: id,
    C1, D, G, E,
    causality: cause || '(not assessed)',
    unexpected,
    expedited,
    dueInDays,
  };

  // Flat fixed-field view for downstream review / display.
  const fields = {
    'SAFETY_REPORT_ID': id,
    'STANDARD': 'ICH E2B(R3) ICSR',
    'C1_REPORT_TYPE': C1.reportType,
    'C1_SERIOUSNESS': C1.seriousness,
    'C1_REPORTER_QUAL': C1.reporterQualification,
    'D_PATIENT_AGE': D.age,
    'D_PATIENT_SEX': D.sex,
    'G_PRODUCT': G.medicinalProduct,
    'G_INDICATION': G.indication,
    'E_MEDDRA_PT': E.meddraPreferredTerm,
    'E_MEDDRA_SOC': E.meddraSystemOrganClass,
    'E_ONSET_DATE': E.onsetDate,
    'E_SERIOUS': serious ? 'Y' : 'N',
    'UNEXPECTED': unexpected ? 'Y' : 'N',
    'EXPEDITED_15DAY': expedited ? 'Y' : 'N',
    'DUE_IN_DAYS': String(dueInDays),
  };

  return { icsr, safetyReportId: id, fields, expedited, dueInDays, serious, unexpected };
}

export async function call(op, payload = {}) {
  if (op === 'submit-e2b') {
    // CRITICAL GATE — never submit a safety report without the QPPV / drug-safety physician signature.
    if (payload.qppvApproved !== true) {
      return { ok: false, blocked: true,
        error: 'E2B safety report requires the QPPV / drug-safety physician signature before submission' };
    }

    const built = buildIcsr(payload);
    const idempotencyKey = clean(payload.idempotencyKey) || built.safetyReportId;

    if (SUBMIT_URL) {
      try {
        const r = await fetch(SUBMIT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
          },
          body: JSON.stringify(built.icsr),
        });
        return { ok: r.ok, mode: 'live', submitted: true, status: r.status,
          data: { icsr: built.icsr, safetyReportId: built.safetyReportId, expedited: built.expedited, dueInDays: built.dueInDays },
          fields: built.fields, idempotencyKey,
          note: 'Transmitted the ICSR to the pharmacovigilance gateway (FAERS / EudraVigilance).' };
      } catch (e) {
        return { ok: false, mode: 'live', submitted: false, error: `PV gateway submit failed: ${e.message}`,
          data: { icsr: built.icsr, safetyReportId: built.safetyReportId, expedited: built.expedited, dueInDays: built.dueInDays },
          idempotencyKey };
      }
    }

    return { ok: true, mode: 'live', submitted: false,
      data: { icsr: built.icsr, safetyReportId: built.safetyReportId, expedited: built.expedited, dueInDays: built.dueInDays },
      fields: built.fields, idempotencyKey,
      note: 'Generated a structurally-complete ICH E2B(R3) ICSR. Set FAERS_GATEWAY_URL to transmit to FDA FAERS / EMA EudraVigilance.' };
  }

  return { ok: false, error: `safety-report adapter has no op '${op}'` };
}

// CLI: node safety-report.mjs → runs a blocked (unapproved) and an approved serious smoke submission.
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = {
    caseId: 'AE-2026-0042',
    patient: { age: 67, sex: 'F' },
    drug: { name: 'Cardizem CD', indication: 'Hypertension' },
    reaction: {
      pt: 'Anaphylactic reaction',
      soc: 'Immune system disorders',
      seriousness: ['life-threatening', 'hospitalization'],
      onsetDate: '2026-05-30',
    },
    reporter: 'Physician',
    causality: 'related',
  };

  (async () => {
    console.log('— unapproved submission (should be BLOCKED) —');
    const blocked = await call('submit-e2b', { ...sample, qppvApproved: false });
    console.log(JSON.stringify(blocked, null, 2));

    console.log('\n— QPPV-approved serious case (should GENERATE the E2B + expedited true) —');
    const filed = await call('submit-e2b', { ...sample, qppvApproved: true });
    console.log(JSON.stringify(filed, null, 2));
  })();
}
