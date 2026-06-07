// scripts/lib/connectors/carrier-vet.mjs — carrier-vetting adapter (freight vertical).
//
// vet-carrier applies the standard broker carrier-vetting gate a TMS must clear BEFORE tendering a
// load: active operating authority, insurance (BIPD/cargo) on file, a safety rating that is not
// 'Unsatisfactory', and a scan for obvious double-brokering / identity red flags. A failed check is
// a BLOCK — the freight autopilot must not tender to a carrier that fails the gate (cargo theft and
// double-brokering are strict-liability exposures for the broker).
//
// Deterministic + network-free by default: it decides from the input fields. Only when env
// FMCSA_WEBKEY is set does it query the REAL FMCSA QCMobile / SAFER API by DOT number
// (GET https://mobile.fmcsa.dot.gov/qc/services/carriers/<dot>?webKey=...) and vet the live record.

export const capabilities = ['vet-carrier'];

// Map an FMCSA QCMobile carrier record onto the fields vet() expects.
function fromFmcsa(c = {}) {
  // QCMobile: allowedToOperate 'Y'/'N', bipdInsuranceOnFile / cargoInsuranceOnFile (amounts as strings),
  // safetyRating like 'S'(Satisfactory)/'C'(Conditional)/'U'(Unsatisfactory), statusCode 'A'(active).
  const ratingMap = { S: 'Satisfactory', C: 'Conditional', U: 'Unsatisfactory' };
  const insured = Number(c.bipdInsuranceOnFile || 0) > 0 || Number(c.cargoInsuranceOnFile || 0) > 0;
  return {
    dotNumber: c.dotNumber,
    mcNumber: c.mcNumber,
    authorityStatus: c.allowedToOperate === 'Y' ? 'active' : 'inactive',
    operatingStatus: c.statusCode === 'A' ? 'active' : (c.statusCode || 'unknown'),
    insuranceOnFile: insured,
    safetyRating: ratingMap[c.safetyRating] || c.safetyRating || 'None',
  };
}

async function fetchFmcsa(dot, webKey) {
  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(webKey)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`FMCSA QCMobile HTTP ${res.status}`);
  const body = await res.json();
  const carrier = body?.content?.carrier || body?.content?.[0]?.carrier;
  if (!carrier) throw new Error('FMCSA QCMobile: carrier not found');
  return carrier;
}

// The core deterministic vetting gate. Returns the vetting decision object.
function vet(input = {}, note) {
  const dotNumber = input.dotNumber ?? null;
  const mcNumber = input.mcNumber ?? null;
  const flags = [];

  // Check 1 — active operating authority (not revoked / inactive / out-of-service).
  const authRaw = String(input.authorityStatus ?? '').toLowerCase();
  const opRaw = String(input.operatingStatus ?? '').toLowerCase();
  const badAuthority = /revok|inactive|none|not authorized|pending/.test(authRaw);
  const badOperating = /out.?of.?service|inactive|revok/.test(opRaw);
  const authorityActive = authRaw ? !badAuthority : (opRaw ? !badOperating : false);
  const authority = authorityActive && !badOperating;
  if (!authority) flags.push('operating authority not active (revoked / inactive / OOS)');

  // Check 2 — insurance (BIPD / cargo) on file.
  const insurance = input.insuranceOnFile === true || /^(y|yes|true|on.?file|active)$/i.test(String(input.insuranceOnFile ?? ''));
  if (!insurance) flags.push('no insurance (BIPD/cargo) on file');

  // Check 3 — safety rating not 'Unsatisfactory'.
  const rating = String(input.safetyRating ?? 'None');
  const safety = !/unsat/i.test(rating);
  if (!safety) flags.push(`safety rating '${rating}' is Unsatisfactory`);

  // Red flags — obvious double-brokering / identity signals.
  if (input.mcDotMismatch === true || input.identityMismatch === true) {
    flags.push('MC/DOT identity mismatch — possible double-brokering / identity theft');
  }
  if (input.authorityGrantedAt) {
    const days = Math.floor((Date.now() - new Date(input.authorityGrantedAt).getTime()) / 86400000);
    if (Number.isFinite(days) && days >= 0 && days < 30) {
      flags.push(`operating authority granted ${days}d ago (very recent — heightened double-brokering risk)`);
    }
  }
  if (input.authorityAgeDays != null && Number(input.authorityAgeDays) < 30) {
    flags.push(`operating authority ${Number(input.authorityAgeDays)}d old (very recent — heightened double-brokering risk)`);
  }

  const checks = { authority, insurance, safety };
  const vetted = authority && insurance && safety && flags.length === 0;
  const decision = vetted ? 'CLEAR-TO-TENDER' : 'BLOCK';
  const out = { dotNumber, mcNumber, vetted, decision, flags, checks };
  if (note) out.note = note;
  return out;
}

export async function call(op, payload = {}) {
  if (op === 'vet-carrier') {
    if (payload.dotNumber == null && payload.mcNumber == null) {
      return { ok: false, error: 'vet-carrier needs { dotNumber } (or mcNumber)' };
    }

    const webKey = process.env.FMCSA_WEBKEY;
    if (webKey && payload.dotNumber != null) {
      try {
        const carrier = await fetchFmcsa(payload.dotNumber, webKey);
        // Merge live FMCSA record with any caller-supplied red-flag hints.
        const merged = { ...fromFmcsa(carrier), ...{ mcDotMismatch: payload.mcDotMismatch, identityMismatch: payload.identityMismatch, authorityGrantedAt: payload.authorityGrantedAt, authorityAgeDays: payload.authorityAgeDays } };
        return { ok: true, mode: 'live', data: vet(merged) };
      } catch (e) {
        return { ok: false, error: `FMCSA QCMobile lookup failed: ${e.message}` };
      }
    }

    const note = webKey
      ? 'FMCSA_WEBKEY set but no dotNumber to query — vetted from supplied fields.'
      : 'Deterministic vetting from supplied fields — set FMCSA_WEBKEY to vet against the live FMCSA QCMobile/SAFER record by DOT number.';
    return { ok: true, mode: 'deterministic', data: vet(payload, note) };
  }

  return { ok: false, error: `carrier-vet adapter has no op '${op}'` };
}

// --- CLI -------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const op = process.argv[2] || 'vet-carrier';
  const payload = process.argv[3] ? JSON.parse(process.argv[3]) : {
    dotNumber: '1234567', mcNumber: 'MC-987654', authorityStatus: 'active',
    insuranceOnFile: true, safetyRating: 'Satisfactory', operatingStatus: 'active',
  };
  call(op, payload).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
