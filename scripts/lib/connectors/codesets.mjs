// scripts/lib/connectors/codesets.mjs — LIVE adapter for the code-sets connector (Phase 4 Wave 2).
//
// Real medical code lookup against the NLM Clinical Table Search Service — a free, no-auth public
// API over the official ICD-10-CM and HCPCS code sets. This makes the rcm autopilot's "assign
// codes" step genuinely live: it looks up and validates real diagnosis/procedure codes, not mocks.
//
// CPT is proprietary (AMA) and has no free API — `lookup-code`/`validate-code` default to ICD-10-CM
// and also support HCPCS; pass { system:'cpt' } and the adapter returns a clear "needs AMA license"
// note rather than a wrong answer. Point GREAT_CTO_CODESETS_BASE at a licensed CPT service to extend.
//
// No external deps — global fetch (Node 18+).

const BASE = (process.env.GREAT_CTO_CODESETS_BASE || 'https://clinicaltables.nlm.nih.gov/api').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.GREAT_CTO_CODESETS_TIMEOUT || 12000);

const SYSTEMS = { icd10cm: 'icd10cm/v3', 'icd10-cm': 'icd10cm/v3', icd10: 'icd10cm/v3', hcpcs: 'hcpcs/v3' };

async function nlm(systemPath, params) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ sf: 'code,name', df: 'code,name', ...params }).toString();
    const r = await fetch(`${BASE}/${systemPath}/search?${qs}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`NLM ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return await r.json(); // [count, [codes], extra, [[code,name],...]]
  } finally {
    clearTimeout(t);
  }
}

function resolveSystem(system) {
  const key = String(system || 'icd10cm').toLowerCase();
  return SYSTEMS[key] || null;
}

export const capabilities = ['lookup-code', 'validate-code'];

/**
 * @param {string} op  'lookup-code' | 'validate-code'
 * @param {object} payload  { q?, code?, system? }   system: icd10cm (default) | hcpcs | cpt
 */
export async function call(op, payload = {}) {
  const system = String(payload.system || 'icd10cm').toLowerCase();
  if (system === 'cpt') {
    return { ok: false, mode: 'live', system: 'cpt',
      error: 'CPT is AMA-licensed — no free API. Set GREAT_CTO_CODESETS_BASE to a licensed CPT service.' };
  }
  const systemPath = resolveSystem(system);
  if (!systemPath) return { ok: false, error: `unknown code system: ${system}` };

  if (op === 'lookup-code') {
    const term = payload.q || payload.term;
    if (!term) return { ok: false, error: 'lookup-code needs { q }' };
    const [count, , , pairs] = await nlm(systemPath, { terms: term, maxList: payload.limit || 7 });
    return { ok: true, mode: 'live', source: BASE, system,
      data: { query: term, total: count, matches: (pairs || []).map(([code, name]) => ({ code, name })) } };
  }

  if (op === 'validate-code') {
    if (!payload.code) return { ok: false, error: 'validate-code needs { code }' };
    const [, codes, , pairs] = await nlm(systemPath, { terms: payload.code, maxList: 5 });
    const hit = (pairs || []).find(([c]) => c.toUpperCase() === String(payload.code).toUpperCase());
    return { ok: true, mode: 'live', source: BASE, system,
      data: { code: payload.code, valid: !!hit, name: hit ? hit[1] : null, candidates: (codes || []).slice(0, 5) } };
  }

  return { ok: false, error: `code-sets live adapter has no op '${op}'` };
}
