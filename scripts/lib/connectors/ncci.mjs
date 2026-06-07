// scripts/lib/connectors/ncci.mjs — NCCI / MUE adapter (Phase 4 Wave 4).
//
// Real National Correct Coding Initiative logic over a curated sample of CMS public edit data:
//   - check-ptp: is a code pair a Procedure-to-Procedure edit? (i.e. can't be billed together)
//     Returns the column-1 / column-2 designation + the modifier indicator (0 = never allowed,
//     1 = allowed only with an appropriate modifier). This is the upcoding/unbundling guardrail.
//   - check-mue: the Medically Unlikely Edit — the max units of a code that are plausible on one
//     line for one patient/day.
//
// Deterministic, no keys, no network. The embedded tables are a representative slice of the
// official CMS quarterly files; point GREAT_CTO_NCCI_PATH at the full CSVs to load all edits.
// (Code data is public domain; CPT descriptors are AMA-licensed and are not reproduced here.)

import { readFileSync } from 'node:fs';

export const capabilities = ['check-ptp', 'check-mue'];

// PTP edits — { 'col1|col2': modifierIndicator }. col1 is the comprehensive/payable code; col2 is
// the component that is bundled and not separately payable (0) or payable only with a modifier (1).
const PTP = {
  '80053|80048': 0, // comprehensive metabolic panel includes basic metabolic panel — never separate
  '80053|82565': 0, // CMP includes creatinine
  '93000|93005': 0, // ECG complete includes the tracing-only component
  '93000|93010': 0, // ECG complete includes the interpretation-only component
  '99213|36415': 1, // office visit + venipuncture — separately payable only with a modifier
  '45380|45378': 1, // colonoscopy with biopsy + diagnostic colonoscopy — modifier required
  '11042|97597': 1, // debridement edits — modifier required
  '36415|36416': 0, // venipuncture vs capillary draw — not both
};

// MUE — max units per code per day (sample of CMS practitioner-services MUEs).
const MUE = {
  '99213': 1, '99214': 1, '99215': 1, '36415': 1, '80053': 1, '80048': 1,
  '93000': 1, '45380': 1, '45378': 1, '11042': 4, '97597': 1, '82565': 1,
};

let LOADED = null;
function tables() {
  if (LOADED) return LOADED;
  LOADED = { ptp: { ...PTP }, mue: { ...MUE } };
  // Optional: load the full CMS quarterly CSVs (col1,col2,modifier) if a path is provided.
  const path = process.env.GREAT_CTO_NCCI_PATH;
  if (path) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const [c1, c2, mi] = line.split(',').map((s) => s && s.trim());
        if (c1 && c2 && mi != null) LOADED.ptp[`${c1}|${c2}`] = Number(mi);
      }
    } catch { /* keep the embedded sample */ }
  }
  return LOADED;
}

const norm = (c) => String(c || '').toUpperCase().replace(/\./g, '').trim();

export async function call(op, payload = {}) {
  const { ptp, mue } = tables();

  if (op === 'check-ptp') {
    const a = norm(payload.code1 || payload.a);
    const b = norm(payload.code2 || payload.b);
    if (!a || !b) return { ok: false, error: 'check-ptp needs { code1, code2 }' };
    // PTP is directional (col1|col2); check both orderings.
    const fwd = ptp[`${a}|${b}`], rev = ptp[`${b}|${a}`];
    const mi = fwd !== undefined ? fwd : rev;
    if (mi === undefined) {
      return { ok: true, mode: 'live', data: { code1: a, code2: b, edit: false, message: 'no PTP edit in the loaded set — billable together' } };
    }
    const col1 = fwd !== undefined ? a : b, col2 = fwd !== undefined ? b : a;
    return { ok: true, mode: 'live', data: { edit: true, column1: col1, column2: col2, modifierIndicator: mi,
      allowedWithModifier: mi === 1,
      message: mi === 0 ? `${col2} is bundled into ${col1} — never separately payable (unbundling)` : `${col2} is payable with ${col1} only with an appropriate modifier` } };
  }

  if (op === 'check-mue') {
    const c = norm(payload.code);
    const units = Number(payload.units || 1);
    if (!c) return { ok: false, error: 'check-mue needs { code }' };
    const max = mue[c];
    if (max === undefined) return { ok: true, mode: 'live', data: { code: c, mue: null, message: 'no MUE in the loaded set' } };
    return { ok: true, mode: 'live', data: { code: c, mue: max, units, exceeds: units > max,
      message: units > max ? `${units} units exceeds the MUE of ${max} for ${c}` : `within MUE (${max})` } };
  }

  return { ok: false, error: `ncci adapter has no op '${op}'` };
}
