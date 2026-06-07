// scripts/lib/connectors/meddra-code.mjs — MedDRA adverse-event coding adapter (pharmacovigilance).
//
// code-term maps a clinician's verbatim adverse-event term (free text on a case report — e.g.
// "bad headache", "throwing up", "heart attack") onto the MedDRA hierarchy:
//   verbatim → Lowest Level Term (LLT) → Preferred Term (PT) → System Organ Class (SOC)
// plus a seriousness hint (Important Medical Event flag). This is the autocoding step in the
// pharmacovigilance case-intake flow.
//
// CRITICAL SAFETY RULE: autocoding NEVER decides seriousness on its own. When the match is weak,
// no match is found, or the term is a potential Important Medical Event (IME), the result carries
// requiresMedicalReview=true — a drug-safety physician must confirm the code and the seriousness.
// We never auto-downgrade a serious term to non-serious.
//
// Deterministic + network-free by default over a curated MedDRA dictionary slice. MedDRA is
// proprietary (licensed from MSSO/ICH) so only a representative public-knowledge slice is embedded;
// set MEDDRA_URL to delegate to a real licensed MedDRA Browser/WebService.

export const capabilities = ['code-term'];

// Curated MedDRA dictionary slice. Each entry:
//   syn   — verbatim / synonym tokens that map to this concept
//   llt   — a representative Lowest Level Term
//   pt    — the Preferred Term
//   soc   — the System Organ Class (primary)
//   ptCode— illustrative PT code (real MedDRA codes are licensed; these are placeholders)
//   ime   — Important Medical Event (potentially serious; physician must confirm seriousness)
const DICT = [
  { syn: ['headache', 'head ache', 'bad headache', 'sore head', 'head pain', 'migraine'],
    llt: 'Headache', pt: 'Headache', soc: 'Nervous system disorders', ptCode: '10019211', ime: false },
  { syn: ['nausea', 'queasy', 'feeling sick', 'sick to stomach'],
    llt: 'Nausea', pt: 'Nausea', soc: 'Gastrointestinal disorders', ptCode: '10028813', ime: false },
  { syn: ['vomiting', 'throwing up', 'threw up', 'vomit', 'puking', 'being sick'],
    llt: 'Vomiting', pt: 'Vomiting', soc: 'Gastrointestinal disorders', ptCode: '10047700', ime: false },
  { syn: ['diarrhea', 'diarrhoea', 'loose stools', 'runny stool', 'the runs'],
    llt: 'Diarrhoea', pt: 'Diarrhoea', soc: 'Gastrointestinal disorders', ptCode: '10012735', ime: false },
  { syn: ['rash', 'rash on arms', 'skin rash', 'red spots', 'hives', 'breaking out'],
    llt: 'Rash', pt: 'Rash', soc: 'Skin and subcutaneous tissue disorders', ptCode: '10037844', ime: false },
  { syn: ['dizzy', 'dizziness', 'lightheaded', 'light headed', 'woozy'],
    llt: 'Dizziness', pt: 'Dizziness', soc: 'Nervous system disorders', ptCode: '10013573', ime: false },
  { syn: ['tired', 'fatigue', 'exhausted', 'worn out', 'no energy'],
    llt: 'Fatigue', pt: 'Fatigue', soc: 'General disorders and administration site conditions', ptCode: '10016256', ime: false },
  { syn: ['fever', 'high temperature', 'temperature', 'pyrexia', 'feverish'],
    llt: 'Fever', pt: 'Pyrexia', soc: 'General disorders and administration site conditions', ptCode: '10037660', ime: false },
  { syn: ['itching', 'itchy', 'pruritus'],
    llt: 'Itching', pt: 'Pruritus', soc: 'Skin and subcutaneous tissue disorders', ptCode: '10037087', ime: false },
  { syn: ['cough', 'coughing'],
    llt: 'Cough', pt: 'Cough', soc: 'Respiratory, thoracic and mediastinal disorders', ptCode: '10011224', ime: false },
  // --- Important Medical Events (potentially serious — physician must confirm seriousness) ---
  { syn: ['heart attack', 'mi', 'myocardial infarction', 'cardiac arrest', 'coronary'],
    llt: 'Heart attack', pt: 'Myocardial infarction', soc: 'Cardiac disorders', ptCode: '10028596', ime: true },
  { syn: ['stroke', 'cva', 'brain bleed', 'cerebrovascular accident'],
    llt: 'Stroke', pt: 'Cerebrovascular accident', soc: 'Nervous system disorders', ptCode: '10008190', ime: true },
  { syn: ['anaphylaxis', 'anaphylactic', 'severe allergic reaction', 'throat closing', 'allergic shock'],
    llt: 'Anaphylactic reaction', pt: 'Anaphylactic reaction', soc: 'Immune system disorders', ptCode: '10002218', ime: true },
  { syn: ['seizure', 'convulsion', 'fit', 'epileptic fit'],
    llt: 'Seizure', pt: 'Seizure', soc: 'Nervous system disorders', ptCode: '10039906', ime: true },
  { syn: ['trouble breathing', 'shortness of breath', 'cant breathe', 'short of breath', 'breathless', 'dyspnoea', 'dyspnea'],
    llt: 'Shortness of breath', pt: 'Dyspnoea', soc: 'Respiratory, thoracic and mediastinal disorders', ptCode: '10013968', ime: true },
  { syn: ['liver failure', 'hepatic failure', 'jaundice', 'yellow skin'],
    llt: 'Liver failure', pt: 'Hepatic failure', soc: 'Hepatobiliary disorders', ptCode: '10019663', ime: true },
  { syn: ['gi bleed', 'bleeding stomach', 'blood in stool', 'black stool', 'vomiting blood', 'gastrointestinal haemorrhage'],
    llt: 'GI bleed', pt: 'Gastrointestinal haemorrhage', soc: 'Gastrointestinal disorders', ptCode: '10017955', ime: true },
  { syn: ['suicidal', 'suicidal ideation', 'thoughts of self harm', 'wanting to die'],
    llt: 'Suicidal thoughts', pt: 'Suicidal ideation', soc: 'Psychiatric disorders', ptCode: '10042458', ime: true },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Score a verbatim against one dictionary entry's synonym set.
// Exact synonym phrase match -> 1.0; otherwise best token-overlap (Jaccard-ish) over the synonyms.
function scoreEntry(verbatim, entry) {
  const v = norm(verbatim);
  const vTokens = new Set(v.split(' ').filter(Boolean));
  let best = 0;
  for (const raw of entry.syn) {
    const s = norm(raw);
    if (!s) continue;
    if (v === s) return 1;            // exact phrase
    if (v.includes(s) || s.includes(v)) best = Math.max(best, 0.9); // substring/phrase containment
    const sTokens = new Set(s.split(' ').filter(Boolean));
    let common = 0;
    for (const t of sTokens) if (vTokens.has(t)) common++;
    if (sTokens.size) best = Math.max(best, common / Math.max(vTokens.size, sTokens.size));
  }
  return +best.toFixed(2);
}

async function liveCode(verbatim) {
  // Delegate to a licensed MedDRA service when configured. Shape is intentionally tolerant.
  const url = process.env.MEDDRA_URL.replace(/\/$/, '') + '/code-term';
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verbatim }),
  });
  if (!res.ok) throw new Error(`MedDRA service ${res.status}`);
  return res.json();
}

export async function call(op, payload = {}) {
  if (op !== 'code-term') return { ok: false, error: `meddra-code adapter has no op '${op}'` };

  const verbatim = payload.verbatim || payload.term || payload.text;
  if (!verbatim) return { ok: false, error: 'code-term needs { verbatim }' };

  if (process.env.MEDDRA_URL) {
    try {
      const data = await liveCode(verbatim);
      return { ok: true, mode: 'live', data };
    } catch (e) {
      return { ok: false, error: `MedDRA service error: ${e.message}` };
    }
  }

  // Offline curated dictionary slice.
  let bestEntry = null, bestScore = 0;
  for (const entry of DICT) {
    const sc = scoreEntry(verbatim, entry);
    if (sc > bestScore) { bestScore = sc; bestEntry = entry; }
  }

  const CONFIDENT = 0.6; // below this we treat the autocode as not trustworthy
  const matched = bestEntry && bestScore >= 0.34;

  if (!matched) {
    // No usable match — must NOT silently drop; physician codes it manually.
    return { ok: true, mode: 'dictionary', data: {
      verbatim,
      llt: null, pt: null, soc: null, ptCode: null,
      isImportantMedicalEvent: false,
      confidence: +bestScore.toFixed(2),
      requiresMedicalReview: true,
      note: 'No confident MedDRA match in the curated slice — a drug-safety physician must code this term and assign seriousness. Set MEDDRA_URL for a full licensed MedDRA dictionary.',
    } };
  }

  const ime = !!bestEntry.ime;
  const lowConfidence = bestScore < CONFIDENT;
  // requiresMedicalReview is true whenever the term is an IME OR confidence is low. Never auto-downgrade.
  const requiresMedicalReview = ime || lowConfidence;

  return { ok: true, mode: 'dictionary', data: {
    verbatim,
    llt: bestEntry.llt,
    pt: bestEntry.pt,
    soc: bestEntry.soc,
    ptCode: bestEntry.ptCode,
    isImportantMedicalEvent: ime,
    confidence: bestScore,
    requiresMedicalReview,
    note: ime
      ? 'Potential Important Medical Event — autocode is provisional; a drug-safety physician must confirm the coding and seriousness (never auto-downgrade).'
      : lowConfidence
        ? 'Low-confidence autocode — physician review required to confirm the MedDRA term.'
        : 'Curated MedDRA slice; set MEDDRA_URL for the full licensed dictionary.',
  } };
}

// --- CLI -------------------------------------------------------------------
// Usage: node meddra-code.mjs "bad headache"
if (import.meta.url === `file://${process.argv[1]}`) {
  const verbatim = process.argv.slice(2).join(' ') || 'bad headache';
  call('code-term', { verbatim }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
