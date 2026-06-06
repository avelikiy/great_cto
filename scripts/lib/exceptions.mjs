// scripts/lib/exceptions.mjs — signed gate-exception registry (NaCl-inspired governance).
//
// Replaces ad-hoc `--admin` / `--no-verify` bypasses with an AUDITABLE, SIGNED, EXPIRING
// record. To override a gate you create a signed exception: who, why, which gate, scope,
// and an expiry. Gates check the registry — a bypass is sanctioned only if a valid active
// exception covers it, and every bypass leaves a tamper-evident trail.
//
// Store: <project>/.great_cto/exceptions/EXC-*.json  (JSON — no YAML dependency).
//
// The signature is a sha256 over the IMMUTABLE fields, so editing reason/scope/expiry after
// signing invalidates it. `status` is mutable (active → revoked) and is NOT signed.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function exceptionsRoot(opts = {}) {
  return opts.root || process.env.GREAT_CTO_EXCEPTIONS_ROOT || join(process.cwd(), '.great_cto', 'exceptions');
}

// Fields covered by the signature (order fixed → deterministic).
const SIGNED_FIELDS = ['id', 'created_at', 'created_by', 'gate', 'scope', 'reason', 'expires_at', 'risk'];

/** Deterministic canonical string of the signed fields. */
export function canonicalString(exc) {
  return JSON.stringify(SIGNED_FIELDS.map((k) => [k, exc[k] ?? null]));
}

/** sha256 signature over the immutable fields. */
export function computeSignature(exc) {
  return createHash('sha256').update(canonicalString(exc), 'utf8').digest('hex');
}

function slug(s) {
  return String(s || 'exception').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'exception';
}

/**
 * Build a signed exception object (no I/O). Pass `now` (ISO string) for deterministic tests.
 * @returns {object} the exception incl. `signature` and `status: 'active'`.
 */
export function create({ gate, scope = '', reason, createdBy, expiresInDays = 30, risk = 'medium', id, now } = {}) {
  if (!gate) throw new Error('exception requires a gate (e.g. "gate:ship", "ci", "pre-push", or "*")');
  if (!reason) throw new Error('exception requires a reason');
  const nowDate = now ? new Date(now) : new Date();
  const created_at = nowDate.toISOString();
  const expires_at = new Date(nowDate.getTime() + expiresInDays * 86400000).toISOString();
  const exc = {
    id: id || `EXC-${created_at.slice(0, 10)}-${slug(scope || reason)}`,
    created_at,
    created_by: createdBy || process.env.USER || 'unknown',
    gate,
    scope,
    reason,
    expires_at,
    risk,
    status: 'active',
  };
  exc.signature = computeSignature(exc);
  return exc;
}

/**
 * Verify an exception: signature integrity + active + not expired + required fields.
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function verify(exc, { now } = {}) {
  const reasons = [];
  if (!exc || typeof exc !== 'object') return { valid: false, reasons: ['not an object'] };
  for (const f of SIGNED_FIELDS) if (exc[f] === undefined || exc[f] === null || exc[f] === '') {
    if (f === 'scope') continue; // scope may be empty (whole-gate exception)
    reasons.push(`missing ${f}`);
  }
  if (exc.signature !== computeSignature(exc)) reasons.push('signature mismatch (tampered or unsigned)');
  if (exc.status && exc.status !== 'active') reasons.push(`status is ${exc.status}`);
  const nowMs = now ? new Date(now).getTime() : Date.now();
  if (exc.expires_at && new Date(exc.expires_at).getTime() <= nowMs) reasons.push('expired');
  return { valid: reasons.length === 0, reasons };
}

// ── registry I/O ──────────────────────────────────────────────────────────────

export function write(exc, opts = {}) {
  const root = exceptionsRoot(opts);
  mkdirSync(root, { recursive: true });
  const path = join(root, `${exc.id}.json`);
  writeFileSync(path, JSON.stringify(exc, null, 2));
  return path;
}

/** Read all exception records. Skips unparseable files. */
export function list({ root } = {}) {
  const dir = exceptionsRoot({ root });
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.startsWith('EXC-') && f.endsWith('.json'))) {
    try { out.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* skip */ }
  }
  return out;
}

/**
 * Find a VALID active exception covering `gate` (and, if given, whose scope substring-matches).
 * A stored gate of "*" matches any gate. Returns the exception or null.
 */
export function find(gate, { scope, root, now } = {}) {
  for (const exc of list({ root })) {
    if (!(exc.gate === gate || exc.gate === '*')) continue;
    if (scope && exc.scope && !String(scope).includes(exc.scope) && !exc.scope.includes(String(scope))) continue;
    if (verify(exc, { now }).valid) return exc;
  }
  return null;
}

/** Is `gate` covered by a valid signed exception? */
export function isCovered(gate, opts = {}) {
  return find(gate, opts) !== null;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else if (!o._cmd) o._cmd = a;
    else if (!o._arg) o._arg = a;
  }
  return o;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._cmd;
  if (cmd === 'create') {
    if (!a.gate || !a.reason) { process.stderr.write('Usage: exceptions.mjs create --gate <g> --reason "<why>" [--scope S] [--days N] [--risk low|medium|high]\n'); process.exit(2); }
    const exc = create({ gate: a.gate, scope: a.scope || '', reason: a.reason, expiresInDays: a.days ? parseInt(a.days, 10) : 30, risk: a.risk || 'medium' });
    const p = write(exc);
    process.stdout.write(`signed exception created: ${exc.id}\n  gate=${exc.gate} expires=${exc.expires_at} by=${exc.created_by}\n  ${p}\n`);
  } else if (cmd === 'list') {
    const rows = list();
    for (const e of rows) {
      const v = verify(e);
      process.stdout.write(`${v.valid ? '✓' : '✗'} ${e.id}  gate=${e.gate}  expires=${(e.expires_at || '').slice(0, 10)}  ${v.valid ? '' : '(' + v.reasons.join('; ') + ')'}\n`);
    }
    if (rows.length === 0) process.stdout.write('(no exceptions)\n');
  } else if (cmd === 'verify') {
    const dir = exceptionsRoot({});
    const e = a._arg ? JSON.parse(readFileSync(join(dir, `${a._arg}.json`), 'utf8')) : null;
    const v = e ? verify(e) : { valid: false, reasons: ['not found'] };
    process.stdout.write(`${v.valid ? 'VALID' : 'INVALID'}${v.valid ? '' : ' — ' + v.reasons.join('; ')}\n`);
    process.exit(v.valid ? 0 : 1);
  } else if (cmd === 'check') {
    // check <gate> [--scope S] → exit 0 if covered (prints id), exit 1 if not
    const exc = find(a._arg, { scope: a.scope });
    if (exc) { process.stdout.write(`covered by ${exc.id} (expires ${exc.expires_at.slice(0, 10)})\n`); process.exit(0); }
    process.stdout.write(`NOT covered — gate "${a._arg}" has no valid signed exception\n`); process.exit(1);
  } else {
    process.stderr.write('Usage: exceptions.mjs <create|list|verify <id>|check <gate>> [flags]\n');
    process.exit(2);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
