#!/usr/bin/env node
/**
 * verdict-record — one schema for the lines agents write and the board reads.
 *
 * Why this exists
 * ---------------
 * Verdicts were free text in two dialects:
 *
 *   "<ts> <verdict> <details> cost=$X"
 *   "<ts> | <agent> | <verdict> | <details> | cost=$X"
 *
 * The reader chose between them by asking whether the line contained ' | '.
 * Agents write prose in the details field and prose contains pipes, so
 * "BLOCKED 3 findings | all in the auth path" was read as the second dialect and
 * the verdict came back as "all in the auth path" — which the board then showed
 * as the agent's verdict. That was fixed by guessing more carefully. This
 * removes the guess: a line is JSON, the fields are named, and no amount of
 * punctuation in a human sentence can move one field into another.
 *
 * The format carries its own version. A reader that meets a version it does not
 * know says so instead of interpreting the fields it happens to recognise —
 * silently half-reading a newer record is how a format change becomes a data
 * bug six weeks later.
 *
 * Reading stays permissive: the two legacy dialects are still parsed, because
 * every verdict log written before today is in them and a reader that drops
 * history to enforce a schema has destroyed the thing the schema protects.
 * Writing is strict: everything new is v1 NDJSON.
 */

export const VERDICT_FORMAT_VERSION = 1;

/** Verdict values with a defined meaning. Anything else is kept but flagged. */
export const KNOWN_VERDICTS = Object.freeze([
  'APPROVED', 'BLOCKED', 'DONE', 'FAIL', 'PASS', 'REJECTED', 'SKIPPED', 'ESCALATED',
  // REWORK — independent verification found the stage incomplete and the agent
  // that ran it can fix that itself. Distinct from BLOCKED, which means a human
  // must decide. Without it here the verifier could reach its conclusion and not
  // be able to write it down, which is the same as not reaching it.
  'REWORK',
]);

/**
 * The v1 record. Every field is either present and typed, or absent — there is
 * no "empty string means unknown", because that is the ambiguity the text
 * format had.
 *
 * @typedef {object} VerdictRecord
 * @property {number} v         format version
 * @property {string} ts        ISO-8601 UTC
 * @property {string} agent     agent slug
 * @property {string} verdict   see KNOWN_VERDICTS
 * @property {string} [project] project slug the run belongs to
 * @property {number} [cost_usd]
 * @property {object} [meta]    free-form key/value from the caller
 */

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Is this a well-formed v1 record?
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateVerdict(rec) {
  const errors = [];
  if (!rec || typeof rec !== 'object') return { valid: false, errors: ['not an object'] };
  if (rec.v !== VERDICT_FORMAT_VERSION) errors.push(`v must be ${VERDICT_FORMAT_VERSION}, got ${JSON.stringify(rec.v)}`);
  if (typeof rec.ts !== 'string' || !ISO.test(rec.ts)) errors.push('ts must be an ISO-8601 UTC timestamp');
  if (typeof rec.agent !== 'string' || !rec.agent) errors.push('agent is required');
  if (typeof rec.verdict !== 'string' || !rec.verdict) errors.push('verdict is required');
  if ('cost_usd' in rec && (typeof rec.cost_usd !== 'number' || !Number.isFinite(rec.cost_usd) || rec.cost_usd < 0)) {
    errors.push('cost_usd must be a non-negative number');
  }
  if ('project' in rec && typeof rec.project !== 'string') errors.push('project must be a string');
  if ('meta' in rec && (typeof rec.meta !== 'object' || rec.meta === null || Array.isArray(rec.meta))) {
    errors.push('meta must be an object');
  }
  return { valid: errors.length === 0, errors };
}

/** Build a v1 record, normalising what the caller passed. Throws if unusable. */
export function makeVerdict({ ts, agent, verdict, project, cost_usd, meta, receipt } = {}) {
  const rec = {
    v: VERDICT_FORMAT_VERSION,
    ts: String(ts ?? '').trim(),
    agent: String(agent ?? '').trim(),
    verdict: String(verdict ?? '').trim().toUpperCase(),
  };
  if (project) rec.project = String(project).trim();
  if (cost_usd !== undefined && cost_usd !== null && cost_usd !== '') rec.cost_usd = Number(cost_usd);
  if (meta && Object.keys(meta).length) rec.meta = meta;
  // The fingerprint of the tree this verdict was formed over — see receipt.mjs.
  // Optional by design: every log written before this existed still validates,
  // and a verdict whose receipt could not be built is still a verdict. Absent
  // means "no receipt", which the checker reports as its own state rather than
  // as a match.
  if (receipt && typeof receipt === 'object' && receipt.head) rec.receipt = receipt;

  const { valid, errors } = validateVerdict(rec);
  // Refusing here is the point: a malformed record that reaches the log is read
  // by something later, and by then nobody knows which agent wrote it.
  if (!valid) throw new Error(`invalid verdict record: ${errors.join('; ')}`);
  return rec;
}

/** A receipt from the environment, or nothing. Never throws — an unparseable
 * receipt must not stop a verdict from being recorded. */
export function parseReceiptEnv(raw) {
  if (!raw || !String(raw).trim()) return undefined;
  try {
    const r = JSON.parse(raw);
    return r && r.head ? r : undefined;
  } catch { return undefined; }
}

/** One record → one NDJSON line (no trailing newline). */
export function formatVerdict(rec) {
  return JSON.stringify(rec);
}

/**
 * `k=v k2=v2` → object. Values may not contain spaces; that is what the text
 * format allowed and all it ever allowed.
 */
function parseMetaPairs(s) {
  const meta = {};
  for (const m of String(s ?? '').matchAll(/(^|\s)([A-Za-z_][\w-]*)=([^\s|]*)/g)) meta[m[2]] = m[3];
  return meta;
}

/**
 * One log line → a record, whatever dialect it is in.
 *
 * @returns {{ok: true, rec: VerdictRecord, legacy: boolean} | {ok: false, reason: string, line: string}}
 */
export function parseVerdictLine(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return { ok: false, reason: 'blank', line: raw };

  if (raw.startsWith('{')) {
    let obj;
    try { obj = JSON.parse(raw); } catch { return { ok: false, reason: 'malformed JSON', line: raw }; }
    // A version we do not know: report it rather than reading the fields we
    // happen to recognise and pretending we understood the record.
    if (obj && obj.v !== VERDICT_FORMAT_VERSION) {
      return { ok: false, reason: `unsupported format version ${JSON.stringify(obj.v)} (this reader knows ${VERDICT_FORMAT_VERSION})`, line: raw };
    }
    const { valid, errors } = validateVerdict(obj);
    if (!valid) return { ok: false, reason: errors[0], line: raw };
    return { ok: true, rec: obj, legacy: false };
  }

  // ── legacy ────────────────────────────────────────────────────────────────
  // Pipe form is recognised by SHAPE — a timestamp, a separator, then fields —
  // not by containing ' | ' anywhere, which ordinary prose does.
  const cost = raw.match(/\bcost=\$?(\d+\.?\d*)/i);
  const project = raw.match(/\bproject=([^\s|]+)/);
  const piped = raw.match(/^(\S+)\s+\|\s+(.*)$/);

  let ts, agent, verdict;
  if (piped) {
    const fields = piped[2].split('|').map((s) => s.trim());
    ts = piped[1];
    agent = fields.length >= 2 ? fields[0] : '';
    verdict = fields.length >= 2 ? fields[1] : fields[0];
  } else {
    const parts = raw.split(/\s+/);
    ts = parts[0] || '';
    verdict = parts[1] || '';
    agent = '';           // the space form never carried one; the filename did
  }

  const rec = { v: VERDICT_FORMAT_VERSION, ts, agent, verdict: String(verdict || '').toUpperCase() };
  if (project) rec.project = project[1];
  if (cost) rec.cost_usd = parseFloat(cost[1]);
  const meta = parseMetaPairs(raw);
  delete meta.cost; delete meta.project;
  if (Object.keys(meta).length) rec.meta = meta;

  return { ok: true, rec, legacy: true };
}

/**
 * A whole log file → records, plus the lines that could not be read.
 *
 * Unreadable lines are RETURNED, not skipped. A parser that silently drops what
 * it cannot understand reports a clean file and a short list, and the gap
 * between them is invisible.
 */
export function parseVerdictLog(text, { agent } = {}) {
  const records = [];
  const rejected = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    const r = parseVerdictLine(line);
    if (!r.ok) { rejected.push({ line: line.trim(), reason: r.reason }); continue; }
    // The space dialect carried the agent in the filename, not the line.
    if (!r.rec.agent && agent) r.rec.agent = agent;
    records.push(r.rec);
  }
  return { records, rejected };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const { basename } = await import('node:path');
  // `--emit` builds one line from the environment. It exists so log-verdict.sh
  // can produce a valid record without embedding a JSON writer in shell, where
  // quoting a user-supplied meta value correctly is a losing game.
  if (argv.includes('--emit')) {
    const meta = {};
    for (const kv of String(process.env.META || '').split(/\s+/).filter(Boolean)) {
      const i = kv.indexOf('=');
      if (i > 0) meta[kv.slice(0, i)] = kv.slice(i + 1);
    }
    try {
      process.stdout.write(formatVerdict(makeVerdict({
        ts: process.env.TS,
        agent: process.env.AGENT,
        verdict: process.env.VERDICT,
        project: process.env.PROJECT_SLUG || undefined,
        cost_usd: process.env.COST === '' || process.env.COST === undefined ? undefined : Number(process.env.COST),
        meta,
        receipt: parseReceiptEnv(process.env.RECEIPT),
      })) + '\n');
      return 0;
    } catch (e) {
      console.error(`verdict-record: ${e.message}`);
      return 1;
    }
  }

  const files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: verdict-record.mjs <verdicts/*.log>... [--json] [--strict]');
    console.error('       verdict-record.mjs --emit    (fields from TS/AGENT/VERDICT/COST/PROJECT_SLUG/META)');
    return 2;
  }
  let bad = 0;
  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { console.error(`cannot read ${f}`); bad++; continue; }
    const { records, rejected } = parseVerdictLog(text, { agent: basename(f).replace(/\.log$/, '') });
    all.push(...records);
    for (const r of rejected) { bad++; console.error(`${f}: ${r.reason} — ${r.line.slice(0, 80)}`); }
  }
  if (argv.includes('--json')) console.log(JSON.stringify(all, null, 2));
  else {
    const legacyish = all.filter((r) => !r.agent).length;
    console.log(`${all.length} record(s), ${bad} unreadable line(s)${legacyish ? `, ${legacyish} without an agent` : ''}`);
  }
  return argv.includes('--strict') && bad ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
