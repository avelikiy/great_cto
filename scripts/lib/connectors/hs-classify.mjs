// scripts/lib/connectors/hs-classify.mjs — HS/HTSUS classification adapter (customs vertical).
//
// classify-hs maps a goods description to a Harmonized Tariff Schedule code over a curated table of
// common imports — chapter/heading + the general (Column 1) duty rate. Deterministic, keyless,
// network-free by default: it is a keyword/token match against the embedded table, returning a
// confidence score and the runner-up candidates.
//
// CRITICAL: tariff classification carries legal liability. A misclassified entry exposes the importer
// to penalties under 19 U.S.C. §1592 (negligence / gross negligence / fraud). When confidence is low
// or candidates straddle multiple chapters, this adapter sets requiresBrokerReview=true and the
// customs autopilot must escalate to a licensed customs broker — NEVER guess a code into an entry.
//
// To consult real CBP CROSS binding rulings instead of the embedded table, set CBP_CROSS_URL.
// (HTSUS codes/duty rates are public USITC data; this is a representative slice, not the full 99-ch
// schedule. Always confirm against the current HTSUS and any applicable Ch.99 / Section 301 measures.)

export const capabilities = ['classify-hs'];

// Curated goods → HTSUS table. Each entry: keywords to match, the 10-digit-ish HS/HTSUS code,
// chapter, heading, the general duty rate (%), and a human basis note.
const TABLE = [
  { keywords: ['cotton', 't-shirt', 'tshirt', 't shirt', 'tee', 'shirt', 'knit', 'apparel', 'clothing'],
    hsCode: '6109.10.00', chapter: 61, heading: '6109', dutyRatePct: 16.5,
    basis: "T-shirts, singlets and other vests, knitted/crocheted, of cotton" },
  { keywords: ['laptop', 'notebook computer', 'computer', 'portable computer', 'pc', 'data processing', 'macbook'],
    hsCode: '8471.30.01', chapter: 84, heading: '8471', dutyRatePct: 0,
    basis: "Portable automatic data-processing machines (laptops) — Free" },
  { keywords: ['screw', 'screws', 'bolt', 'fastener', 'steel screw', 'wood screw', 'self-tapping'],
    hsCode: '7318.15.20', chapter: 73, heading: '7318', dutyRatePct: 8.5,
    basis: "Screws and bolts of iron or steel, threaded" },
  { keywords: ['handbag', 'leather bag', 'purse', 'leather handbag', 'pocketbook', 'satchel'],
    hsCode: '4202.21.60', chapter: 42, heading: '4202', dutyRatePct: 10,
    basis: "Handbags with outer surface of leather" },
  { keywords: ['mug', 'ceramic mug', 'coffee mug', 'cup', 'ceramic cup', 'stoneware', 'porcelain mug'],
    hsCode: '6912.00.48', chapter: 69, heading: '6912', dutyRatePct: 9.8,
    basis: "Ceramic (non-porcelain) tableware/kitchenware — mugs" },
  { keywords: ['lithium', 'battery', 'batteries', 'lithium-ion', 'li-ion', 'cell', 'rechargeable battery'],
    hsCode: '8507.60.00', chapter: 85, heading: '8507', dutyRatePct: 3.4,
    basis: "Lithium-ion accumulators (batteries)" },
  { keywords: ['wooden furniture', 'wood furniture', 'furniture', 'cabinet', 'dresser', 'wooden table', 'bedroom furniture'],
    hsCode: '9403.60.80', chapter: 94, heading: '9403', dutyRatePct: 0,
    basis: "Other wooden furniture — Free" },
];

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'with', 'made', 'new', 'used', 'set']);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

// Score an entry against the input text + tokens. Phrase keywords (containing a space) that appear
// verbatim score higher than single-token hits.
function scoreEntry(entry, text, tokens) {
  const tset = new Set(tokens);
  let score = 0;
  let hits = 0;
  for (const kw of entry.keywords) {
    if (kw.includes(' ') || kw.includes('-')) {
      if (text.includes(kw)) { score += 2.5; hits += 1; }
    } else if (tset.has(kw)) {
      score += 1; hits += 1;
    }
  }
  return { score, hits };
}

async function classifyLive(description) {
  const text = String(description || '').toLowerCase();
  const tokens = tokenize(description);
  if (!tokens.length) {
    return { description, hsCode: null, requiresBrokerReview: true, confidence: 0,
      candidates: [], note: 'empty/insufficient description — escalate to broker' };
  }

  const scored = TABLE
    .map((e) => ({ entry: e, ...scoreEntry(e, text, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { description, hsCode: null, chapter: null, heading: null, dutyRatePct: null,
      basis: null, confidence: 0, candidates: [], requiresBrokerReview: true,
      note: 'no curated match — escalate to a licensed customs broker' };
  }

  const top = scored[0];
  const second = scored[1];
  // Confidence: top score normalized, penalized when the runner-up is close (ambiguous) or when
  // the runner-up sits in a different chapter (multi-chapter plausibility).
  const total = scored.reduce((s, x) => s + x.score, 0);
  let confidence = top.score / total; // share of total mass on the leader
  const margin = second ? top.score - second.score : top.score;
  const crossChapter = second && second.entry.chapter !== top.entry.chapter && second.score > 0;
  if (margin < 1.5) confidence *= 0.6;       // near-tie → less certain
  if (top.hits === 1) confidence *= 0.85;    // matched on a single keyword
  confidence = Math.max(0, Math.min(1, +confidence.toFixed(2)));

  const candidates = scored.slice(0, 3).map((s) => ({
    hsCode: s.entry.hsCode, chapter: s.entry.chapter, heading: s.entry.heading,
    dutyRatePct: s.entry.dutyRatePct, score: +s.score.toFixed(2),
  }));

  // Escalate when confidence is low OR multiple chapters plausibly match.
  const requiresBrokerReview = confidence < 0.6 || (crossChapter && margin < 2.5);

  return {
    description,
    hsCode: top.entry.hsCode,
    chapter: top.entry.chapter,
    heading: top.entry.heading,
    dutyRatePct: top.entry.dutyRatePct,
    basis: top.entry.basis,
    confidence,
    candidates,
    requiresBrokerReview,
    note: requiresBrokerReview
      ? 'low confidence or multi-chapter ambiguity — escalate to a licensed customs broker (19 U.S.C. §1592)'
      : 'curated match',
  };
}

async function classifyFromCross(description, url) {
  // Query a real CBP CROSS rulings endpoint. We treat the response loosely: expect a JSON array of
  // rulings with { hsCode/htsCode, description, dutyRatePct? }. On any failure, fall back to the
  // curated table so the adapter stays usable.
  try {
    const q = encodeURIComponent(description);
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}q=${q}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`CROSS HTTP ${res.status}`);
    const body = await res.json();
    const rulings = Array.isArray(body) ? body : (body.results || body.rulings || []);
    if (!rulings.length) throw new Error('no rulings');
    const top = rulings[0];
    const hsCode = top.hsCode || top.htsCode || top.tariff || null;
    if (!hsCode) throw new Error('ruling missing HS code');
    const chapter = Number(String(hsCode).replace(/\D/g, '').slice(0, 2)) || null;
    const heading = String(hsCode).replace(/\D/g, '').slice(0, 4) || null;
    return {
      description, hsCode, chapter, heading,
      dutyRatePct: top.dutyRatePct ?? null,
      basis: top.description || top.title || 'CBP CROSS ruling',
      confidence: rulings.length > 1 ? 0.7 : 0.85,
      candidates: rulings.slice(0, 3).map((r) => ({ hsCode: r.hsCode || r.htsCode || r.tariff, ruling: r.rulingNumber || r.id })),
      // Even a CROSS hit is advisory — a binding ruling is keyed to a specific importer/product.
      requiresBrokerReview: rulings.length > 1,
      note: 'matched against live CBP CROSS rulings — confirm the ruling applies to this exact good',
      source: 'cbp-cross',
    };
  } catch (err) {
    const fallback = await classifyLive(description);
    fallback.note = `CBP CROSS query failed (${err.message}) — fell back to curated table; ${fallback.note}`;
    fallback.source = 'curated-fallback';
    return fallback;
  }
}

export async function call(op, payload = {}) {
  if (op === 'classify-hs') {
    const description = payload.description || payload.desc || '';
    if (!description) return { ok: false, error: 'classify-hs needs { description }' };
    // material/use are accepted to enrich the matched text (e.g. "bag" + material "leather").
    const enriched = [description, payload.material, payload.use].filter(Boolean).join(' ');

    const crossUrl = process.env.CBP_CROSS_URL;
    const data = crossUrl
      ? await classifyFromCross(enriched, crossUrl)
      : await classifyLive(enriched);
    // Preserve the original description for the caller.
    data.description = description;
    return { ok: true, mode: crossUrl ? 'live' : 'curated', data };
  }

  return { ok: false, error: `hs-classify adapter has no op '${op}'` };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , op = 'classify-hs', ...rest] = process.argv;
  const description = rest.join(' ') || 'cotton t-shirt';
  call(op, { description }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
