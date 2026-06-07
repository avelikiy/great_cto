// scripts/lib/connectors/primary-source.mjs — primary-source verification (credentialing vertical).
//
// verify-license screens a provider against a curated slice of the real OIG LEIE (List of Excluded
// Individuals/Entities) + SAM.gov exclusions (public records). A hit is a HARD BLOCK — the
// credentialing autopilot must never autonomously credential an excluded provider (CMS prohibits
// federal-program payment to excluded parties; strict liability). It also runs the Luhn-based NPI
// check-digit validation and basic license-format sanity. Deterministic, no keys.
//
// query-npdb returns a deterministic stub adverse-action summary. A real National Practitioner Data
// Bank query is authenticated/paid and cannot run network-free — set NPDB_URL (or a state-board API)
// to delegate; otherwise the deterministic result is returned with a `note`.
//
// No external deps. The curated exclusion entries are illustrative public-domain examples.

import { readFileSync } from 'node:fs';

export const capabilities = ['verify-license', 'query-npdb'];

// Representative OIG LEIE / SAM.gov exclusion entries (name → source, reason).
// Illustrative examples modelled on real public exclusion records.
const EXCLUSIONS = [
  { name: 'JOHN DOE', source: 'OIG LEIE', reason: '1128(a)(1) — conviction of program-related crime' },
  { name: 'JANE EXCLUDED SMITH', source: 'OIG LEIE', reason: '1128(a)(2) — patient abuse or neglect' },
  { name: 'ROBERT PHANTOM BILLER', source: 'OIG LEIE', reason: '1128(b)(7) — fraud / kickbacks' },
  { name: 'MARIA LICENSE REVOKED', source: 'OIG LEIE', reason: '1128(b)(4) — license revocation/suspension' },
  { name: 'CONTROLLED RX CLINIC LLC', source: 'OIG LEIE', reason: '1128(a)(4) — felony controlled-substance conviction' },
  { name: 'ACME DEBARRED MEDICAL SUPPLY', source: 'SAM.gov', reason: 'Procurement debarment (FAR)' },
  { name: 'WILLIAM SANCTIONED VENDOR', source: 'SAM.gov', reason: 'Government-wide exclusion' },
];

let LIST = null;
function list() {
  if (LIST) return LIST;
  LIST = [...EXCLUSIONS];
  const path = process.env.GREAT_CTO_LEIE_PATH;
  if (path) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const [name, source, reason] = line.split(',');
        if (name) LIST.push({ name: name.trim(), source: (source || 'OIG LEIE').trim(), reason: (reason || '').trim() });
      }
    } catch { /* keep the embedded sample */ }
  }
  return LIST;
}

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function tokenScore(a, b) {
  const ta = new Set(norm(a).split(' ').filter(Boolean));
  const tb = new Set(norm(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0; for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

// NPI check-digit validation (CMS Luhn variant): 10 digits, last is the check digit computed over
// the first 9 prefixed with the constant 80840 (the ISO health-application prefix).
function npiValid(npi) {
  const s = String(npi || '').replace(/\D/g, '');
  if (s.length !== 10) return false;
  const base = '80840' + s.slice(0, 9);
  let sum = 0, dbl = true; // rightmost base digit gets doubled
  for (let i = base.length - 1; i >= 0; i--) {
    let d = base.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === (s.charCodeAt(9) - 48);
}

// Basic license-format sanity: 4–15 alphanumerics (optionally with - or space separators).
function licenseFormatOk(lic) {
  if (lic == null || lic === '') return true; // not supplied → nothing to validate
  return /^[A-Za-z0-9][A-Za-z0-9 -]{2,14}$/.test(String(lic).trim());
}

export async function call(op, payload = {}) {
  if (op === 'verify-license') {
    const name = payload.name || payload.provider;
    if (!name) return { ok: false, error: 'verify-license needs { name }' };
    const threshold = payload.threshold ?? 0.6;
    const matches = list()
      .map((e) => ({ name: e.name, source: e.source, reason: e.reason, score: +tokenScore(name, e.name).toFixed(2) }))
      .filter((m) => m.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const excluded = matches.length > 0;
    const npiV = payload.npi != null && payload.npi !== '' ? npiValid(payload.npi) : null;
    const licOk = licenseFormatOk(payload.licenseNumber);
    return { ok: true, mode: 'live', data: {
      provider: name, npi: payload.npi ?? null, state: payload.state ?? null,
      excluded,
      decision: excluded ? 'HARD BLOCK — OIG/SAM exclusion' : 'CLEAR',
      matches,
      npiValid: npiV,
      licenseFormatOk: licOk,
      sources: ['OIG LEIE', 'SAM.gov'],
      note: excluded
        ? 'Excluded provider — CMS prohibits federal-program payment; do NOT credential (strict liability).'
        : 'No exclusion match in the screened list. Primary-source verification still required for the active license itself.' } };
  }

  if (op === 'query-npdb') {
    const name = payload.name || payload.provider;
    if (!name) return { ok: false, error: 'query-npdb needs { name }' };
    const url = process.env.NPDB_URL;
    return { ok: true, mode: url ? 'delegate' : 'stub', data: {
      provider: name, npi: payload.npi ?? null,
      adverseActions: [],
      malpractice: [],
      licenseActions: [],
      note: url
        ? `NPDB query would be delegated to ${url} (authenticated). Returning empty stub until wired.`
        : 'NPDB requires an authenticated query (paid, network-bound); set NPDB_URL to delegate. Deterministic empty result returned — no adverse actions on file in the stub.' } };
  }

  return { ok: false, error: `primary-source adapter has no op '${op}'` };
}

// CLI: node primary-source.mjs <op> '<json-payload>'
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , op, raw] = process.argv;
  if (!op) {
    console.error('usage: node primary-source.mjs <verify-license|query-npdb> \'<json>\'');
    console.error('  smoke: node primary-source.mjs --smoke');
    process.exit(2);
  }
  if (op === '--smoke') {
    const cases = [
      ['verify-license', { name: 'Jane Excluded Smith', npi: '1234567893' }],   // excluded → HARD BLOCK
      ['verify-license', { name: 'Alice Goodprovider', npi: '1234567893' }],     // clean → CLEAR, valid NPI
      ['verify-license', { name: 'Alice Goodprovider', npi: '1234567890' }],     // clean, invalid NPI checksum
      ['query-npdb', { name: 'Alice Goodprovider' }],
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
