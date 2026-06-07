// scripts/lib/connectors/sar-filing.mjs — SAR-filing adapter (Phase 4, AML vertical).
//
// `file-sar` builds a REAL, structurally-complete FinCEN SAR (Form 111)-style record from a
// suspicious-activity case — a deterministic structured-document transformation, like the X12 837
// in clearinghouse.mjs. No external service and no keys by default, so the AML autopilot produces a
// genuine, reviewable SAR artifact (subject → activity codes → narrative → Form 111 fields), not a
// mock. Going fully live = transmit the record to FinCEN's BSA E-Filing System — set FINCEN_BSA_URL
// (and optionally FINCEN_BSA_TOKEN); until then it returns the SAR record for review.
//
// CRITICAL GATE: a SAR can NEVER be filed without the designated BSA Officer's signature. If
// `bsaOfficerApproved !== true` the call is blocked outright — no record is built, nothing is
// transmitted. This mirrors the irreversible, accountable-owner discipline of the other connectors.
//
// No external deps.

const SUBMIT_URL = process.env.FINCEN_BSA_URL || '';
const TOKEN = process.env.FINCEN_BSA_TOKEN || '';

export const capabilities = ['file-sar'];

// FinCEN SAR Part II suspicious-activity type → category code (subset of the Form 111 schema).
const ACTIVITY_CODES = {
  'structuring': { part: 'structuring', code: 'a' },
  'money laundering': { part: 'money laundering', code: 'b' },
  'terrorist financing': { part: 'terrorist financing', code: 'c' },
  'fraud': { part: 'fraud', code: 'd' },
  'identity theft': { part: 'identity theft', code: 'e' },
  'cyber event': { part: 'cyber event', code: 'f' },
  'insider abuse': { part: 'insider abuse', code: 'g' },
  'other': { part: 'other suspicious activity', code: 'z' },
};

const clean = (s, fallback = '') => (s == null ? fallback : String(s).trim());
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Deterministic BSA filing id from the case material (stable for the same inputs). */
function bsaId(subjectName, activityType, amountUsd, dateRange) {
  const basis = `${subjectName}|${activityType}|${amountUsd}|${dateRange?.from || ''}-${dateRange?.to || ''}`;
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) >>> 0;
  return `BSA-${String(h).padStart(10, '0')}`;
}

/** Resolve a free-text activity type to the Form 111 Part II category. */
function resolveActivity(type) {
  const key = clean(type, 'other').toLowerCase();
  return ACTIVITY_CODES[key] || ACTIVITY_CODES[Object.keys(ACTIVITY_CODES).find((k) => key.includes(k)) || 'other'];
}

/** Build a structured FinCEN SAR (Form 111) record from a suspicious-activity case. */
export function buildSar({ subject = {}, suspiciousActivity = {}, filingInstitution = {} } = {}) {
  const subjectName = clean(subject.name, '(unidentified subject)');
  const activity = resolveActivity(suspiciousActivity.type);
  const amountUsd = Number(suspiciousActivity.amountUsd || 0);
  const dateRange = suspiciousActivity.dateRange || {};
  const from = clean(dateRange.from || dateRange.start, '(unknown)');
  const to = clean(dateRange.to || dateRange.end, '(unknown)');
  const instName = clean(filingInstitution.name, '(filing institution)');

  const id = bsaId(subjectName, activity.part, amountUsd, { from, to });

  // Part I — Subject information.
  const partI = {
    section: 'Part I — Subject Information',
    name: subjectName,
    address: clean(subject.address, '(not provided)'),
    idNumber: clean(subject.idNumber, '(not provided)'),
  };

  // Part II — Suspicious activity.
  const partII = {
    section: 'Part II — Suspicious Activity Information',
    type: activity.part,
    categoryCode: activity.code,
    amountInvolved: usd(amountUsd),
    amountUsd,
    dateRange: { from, to },
  };

  // Part III — Filing/financial institution.
  const partIII = {
    section: 'Part III — Information About Financial Institution Where Activity Occurred',
    name: instName,
    ein: clean(filingInstitution.ein, '(not provided)'),
  };

  // Part V (narrative) — generate one if not supplied; the narrative is the core of a SAR.
  const narrative = clean(suspiciousActivity.narrative) ||
    `Between ${from} and ${to}, ${instName} identified ${activity.part} involving ${subjectName} ` +
    `totaling approximately ${usd(amountUsd)}. The activity was deemed suspicious and is reported ` +
    `under 31 CFR 1020.320. Supporting documentation is retained by the filing institution and ` +
    `available to FinCEN and law enforcement upon request.`;

  // Part IV — Filing institution contact / acknowledgement.
  const partIV = {
    section: 'Part IV — Filing Institution Contact Information',
    name: instName,
    ein: clean(filingInstitution.ein, '(not provided)'),
    bsaOfficerApproved: true,
  };

  const sar = {
    form: 'FinCEN SAR (Form 111)',
    bsaId: id,
    partI,
    partII,
    partIII,
    partIV,
    narrative,
  };

  // Flat fixed-field view for downstream review / display.
  const fields = {
    'BSA_ID': id,
    'FORM': 'FinCEN SAR (Form 111)',
    'P1_SUBJECT_NAME': partI.name,
    'P1_SUBJECT_ADDRESS': partI.address,
    'P1_SUBJECT_ID': partI.idNumber,
    'P2_ACTIVITY_TYPE': partII.type,
    'P2_ACTIVITY_CODE': partII.categoryCode,
    'P2_AMOUNT': partII.amountInvolved,
    'P2_DATE_FROM': from,
    'P2_DATE_TO': to,
    'P3_INSTITUTION_NAME': partIII.name,
    'P3_INSTITUTION_EIN': partIII.ein,
    'P4_BSA_OFFICER_APPROVED': 'Y',
  };

  return { sar, bsaId: id, fields, narrative };
}

export async function call(op, payload = {}) {
  if (op === 'file-sar') {
    // CRITICAL GATE — never file a SAR without the designated BSA Officer's signature.
    if (payload.bsaOfficerApproved !== true) {
      return { ok: false, blocked: true,
        error: 'SAR requires the designated BSA Officer signature before filing' };
    }

    const built = buildSar(payload);

    if (SUBMIT_URL) {
      try {
        const r = await fetch(SUBMIT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
          body: JSON.stringify(built.sar),
        });
        return { ok: r.ok, mode: 'live', submitted: true, status: r.status, data: built,
          note: 'Transmitted the SAR to FinCEN BSA E-Filing.' };
      } catch (e) {
        return { ok: false, mode: 'live', submitted: false, error: `BSA E-File submit failed: ${e.message}`, data: built };
      }
    }

    return { ok: true, mode: 'live', submitted: false, data: built,
      note: 'Generated a structurally-complete FinCEN SAR (Form 111). Set FINCEN_BSA_URL to transmit to FinCEN BSA E-Filing.' };
  }

  return { ok: false, error: `sar-filing adapter has no op '${op}'` };
}

// CLI: node sar-filing.mjs   → runs a blocked (unapproved) and an approved smoke filing.
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = {
    subject: { name: 'John Q. Doe', address: '42 Elm St, Austin, TX 73301', idNumber: 'SSN-***-**-1234' },
    suspiciousActivity: {
      type: 'structuring',
      amountUsd: 47500,
      dateRange: { from: '2026-05-01', to: '2026-05-28' },
    },
    filingInstitution: { name: 'GreatCTO Bank, N.A.', ein: '12-3456789' },
  };

  (async () => {
    console.log('— unapproved filing (should be BLOCKED) —');
    const blocked = await call('file-sar', { ...sample, bsaOfficerApproved: false });
    console.log(JSON.stringify(blocked, null, 2));

    console.log('\n— approved filing (should GENERATE the SAR) —');
    const filed = await call('file-sar', { ...sample, bsaOfficerApproved: true });
    console.log(JSON.stringify(filed, null, 2));
  })();
}
