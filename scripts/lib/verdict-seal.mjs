/**
 * Seals on verdict lines and receipt acceptances — tamper-evidence, not a lock.
 *
 * great_cto-dv3b. A deploy trusts the newest approving verdict in
 * .great_cto/verdicts/<agent>.log and an operator's acceptance in
 * .great_cto/.receipt-accept. Both were plain JSON: a line appended with `echo`,
 * or a field edited by hand, read exactly like one log-verdict.sh wrote.
 *
 * Each now carries an HMAC-SHA256 over the fields that matter, keyed by
 * ~/.great_cto/keys/verdict-seal.key (0600, created on first use). The writers
 * — log-verdict.sh via verdict-record.mjs, and `receipt.mjs --accept` — seal what
 * they write; `receipt.mjs --verify --require` checks before it trusts.
 *
 * What it does NOT do, said rather than implied (ADR-046). Every agent runs as the
 * same OS user as the operator, so no file on this machine is out of an agent's
 * reach: code that imports this module can seal anything. What the seal changes:
 * a hand-written or hand-edited line no longer passes, and getting a valid one
 * means running the writer or reading the key — and a direct read of a `*.key`
 * file is refused by the secret-read guard. A lock would need a human-presence
 * primitive (a hardware key, an OS confirmation) this machine does not have.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = 'v1';

export function sealKeyPath(env = process.env) {
  if (env.GREAT_CTO_SEAL_KEY) return env.GREAT_CTO_SEAL_KEY;
  let home;
  try { home = os.userInfo().homedir; } catch { home = os.homedir(); }
  return path.join(home, '.great_cto', 'keys', 'verdict-seal.key');
}

/** The key, or null. `create` makes one (0600, in a 0700 directory) when there is none. */
export function loadSealKey({ create = false, env = process.env } = {}) {
  const p = sealKeyPath(env);
  try {
    const hex = fs.readFileSync(p, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
    // A damaged key is not "no key": say so, every time, rather than unseal quietly.
    process.stderr.write(`verdict-seal: ${p} is not a valid key — verdicts go unsealed until it is removed and recreated\n`);
    return null;
  } catch (e) {
    if (e.code !== 'ENOENT' || !create) return null;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  // Written whole to a temporary name and linked into place: two first-time writers,
  // or a crash mid-write, must never leave an empty key that silently unseals
  // every later verdict.
  const tmp = `${p}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.linkSync(tmp, p); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }   // another writer made it first: use theirs
  finally { fs.rmSync(tmp, { force: true }); }
  return loadSealKey({ create: false, env });
}

/** Every field but the seal, keys sorted at every depth — so editing any of them
 *  (meta.need routes the pipeline, cost_usd feeds the spend view) breaks it. */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter((k) => k !== 'seal').map((k) => [k, canonical(v[k])]));
  return v;
}
const VERDICT_FIELDS = (r) => ['verdict', canonical(r)];
const ACCEPT_FIELDS = (a) => ['accept', canonical(a)];

function mac(key, fields) {
  return `${VERSION}:${createHmac('sha256', key).update(JSON.stringify(fields)).digest('hex')}`;
}

function check(key, fields, seal) {
  if (typeof seal !== 'string' || !seal) return 'unsealed';
  if (!key) return 'unknown';
  const want = Buffer.from(mac(key, fields));
  const got = Buffer.from(seal);
  return want.length === got.length && timingSafeEqual(want, got) ? 'valid' : 'invalid';
}

export function sealVerdict(rec, { key = loadSealKey({ create: true }) } = {}) {
  return key ? mac(key, VERDICT_FIELDS(rec)) : null;
}
/** 'valid' | 'invalid' (written or edited outside the writer) | 'unsealed' (older, or never sealed) | 'unknown' (no key here). */
export function checkVerdictSeal(rec, { key = loadSealKey() } = {}) {
  return check(key, VERDICT_FIELDS(rec || {}), rec?.seal);
}

export function sealAcceptance(acc, { key = loadSealKey({ create: true }) } = {}) {
  return key ? mac(key, ACCEPT_FIELDS(acc)) : null;
}
export function checkAcceptanceSeal(acc, { key = loadSealKey() } = {}) {
  return check(key, ACCEPT_FIELDS(acc || {}), acc?.seal);
}
