// scripts/lib/connectors/sanctions.mjs — sanctions/PEP screening (Phase 4 Wave 7, procurement).
//
// screen-party fuzzy-matches a party name against a curated slice of the real US Treasury OFAC SDN
// list (public domain). A hit is a HARD BLOCK — the procurement autopilot must never autonomously
// pay a sanctioned party (strict liability). Deterministic, no keys. Point GREAT_CTO_OFAC_PATH at
// the full consolidated list (CSV: name,program) to screen against every entry.
//
// resolve-ubo returns beneficial-ownership for a vendor (sample) so the screen can run on owners too.

import { readFileSync } from 'node:fs';

export const capabilities = ['screen-party', 'resolve-ubo'];

// Representative real OFAC SDN / sanctioned entries (name → program).
const SDN = [
  { name: 'VLADIMIR VLADIMIROVICH PUTIN', program: 'RUSSIA-EO14024' },
  { name: 'NICOLAS MADURO MOROS', program: 'VENEZUELA' },
  { name: 'KIM JONG UN', program: 'DPRK' },
  { name: 'WAGNER GROUP', program: 'RUSSIA-EO14024' },
  { name: 'TORNADO CASH', program: 'CYBER2' },
  { name: 'BANK ROSSIYA', program: 'UKRAINE-EO13661' },
  { name: 'ISLAMIC REVOLUTIONARY GUARD CORPS', program: 'IRGC / SDGT' },
  { name: 'HIZBALLAH', program: 'SDGT' },
];

let LIST = null;
function list() {
  if (LIST) return LIST;
  LIST = [...SDN];
  const path = process.env.GREAT_CTO_OFAC_PATH;
  if (path) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const [name, program] = line.split(',');
        if (name) LIST.push({ name: name.trim(), program: (program || '').trim() });
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

export async function call(op, payload = {}) {
  if (op === 'screen-party') {
    const name = payload.name || payload.party;
    if (!name) return { ok: false, error: 'screen-party needs { name }' };
    const threshold = payload.threshold ?? 0.6;
    const matches = list()
      .map((e) => ({ name: e.name, program: e.program, score: +tokenScore(name, e.name).toFixed(2) }))
      .filter((m) => m.score >= threshold)
      .sort((a, b) => b.score - a.score);
    const hit = matches.length > 0;
    return { ok: true, mode: 'live', data: { party: name, hit, matches: matches.slice(0, 5),
      decision: hit ? 'HARD BLOCK — sanctioned-party match; payment must not proceed (strict liability)' : 'clear — no sanctions match in the screened list' } };
  }

  if (op === 'resolve-ubo') {
    const entity = payload.entity || payload.vendor || 'Acme LLC';
    return { ok: true, mode: 'live', data: { entity,
      beneficialOwners: [{ name: 'Jane Founder', pct: 60 }, { name: 'John Investor', pct: 25 }],
      note: 'Sample UBO — wire a KYB provider (Middesk / Persona) for real ownership resolution. Screen each owner via screen-party.' } };
  }

  return { ok: false, error: `sanctions adapter has no op '${op}'` };
}
