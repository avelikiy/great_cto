// scripts/lib/connectors/fhir.mjs — LIVE adapter for the ehr-fhir connector (Phase 4 Wave 1).
//
// This is a real, working FHIR R4 client — the first stub→live connector. It defaults to the
// public HAPI FHIR test server (no auth, free), so the rcm autopilot can read a real clinical
// note end to end in a sandbox. Point GREAT_CTO_FHIR_BASE + GREAT_CTO_FHIR_TOKEN at a production
// FHIR server (Epic / Cerner / athenahealth) to go live — same code, real data.
//
// Capabilities: fetch-note, fetch-patient (matches the ehr-fhir catalog entry).
// No external deps — uses global fetch (Node 18+).

const BASE = (process.env.GREAT_CTO_FHIR_BASE || 'https://hapi.fhir.org/baseR4').replace(/\/$/, '');
const TOKEN = process.env.GREAT_CTO_FHIR_TOKEN || '';
const TIMEOUT_MS = Number(process.env.GREAT_CTO_FHIR_TIMEOUT || 15000);

async function fhirGet(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/fhir+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`FHIR ${r.status} ${path}: ${(await r.text()).slice(0, 160)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const decodeB64 = (s) => { try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return ''; } };
const stripTags = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Extract readable text from a DocumentReference's attachment (inline base64 or a Binary/url). */
async function noteTextFrom(docRef) {
  for (const c of docRef.content || []) {
    const att = c.attachment || {};
    if (att.data) {
      const txt = decodeB64(att.data);
      return /text\/html/i.test(att.contentType || '') ? stripTags(txt) : txt;
    }
    if (att.url) {
      // url may be absolute or a relative Binary reference (e.g. "Binary/123")
      const path = att.url.startsWith('http') ? att.url.replace(BASE, '') : `/${att.url.replace(/^\//, '')}`;
      try {
        const bin = await fhirGet(path);
        if (bin.data) {
          const txt = decodeB64(bin.data);
          return /text\/html/i.test(bin.contentType || att.contentType || '') ? stripTags(txt) : txt;
        }
      } catch { /* fall through */ }
    }
  }
  return '';
}

export const capabilities = ['fetch-note', 'fetch-patient'];

/**
 * @param {string} op  one of capabilities
 * @param {object} payload  { patient?: id, document?: id }
 */
export async function call(op, payload = {}) {
  if (op === 'fetch-patient') {
    if (!payload.patient) return { ok: false, error: 'fetch-patient needs { patient }' };
    const p = await fhirGet(`/Patient/${encodeURIComponent(payload.patient)}`);
    const name = (p.name && p.name[0]) ? [...(p.name[0].given || []), p.name[0].family].filter(Boolean).join(' ') : '(unnamed)';
    return { ok: true, mode: 'live', source: BASE, data: { id: p.id, name, gender: p.gender, birthDate: p.birthDate } };
  }

  if (op === 'fetch-note') {
    let bundle;
    if (payload.document) {
      const d = await fhirGet(`/DocumentReference/${encodeURIComponent(payload.document)}`);
      bundle = { entry: [{ resource: d }] };
    } else {
      const q = payload.patient ? `?patient=${encodeURIComponent(payload.patient)}&_count=5` : '?_count=10&_sort=-_lastUpdated';
      bundle = await fhirGet(`/DocumentReference${q}`);
    }
    for (const e of bundle.entry || []) {
      const note = await noteTextFrom(e.resource || {});
      if (note && note.length > 20) {
        return { ok: true, mode: 'live', source: BASE, data: { documentId: e.resource.id, patient: e.resource.subject?.reference, note } };
      }
    }
    return { ok: false, mode: 'live', source: BASE, error: 'no readable clinical note found in the FHIR server (try { patient } or { document })' };
  }

  return { ok: false, error: `ehr-fhir live adapter has no op '${op}'` };
}
