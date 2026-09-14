// Gate approval tokens (ADR-024 §1).
//
// POST /api/gates/:id closed a gate, logged it, woke the pipeline and, with sharing
// on, republished the public report — guarded by the Host allowlist and the Origin
// check alone. The controlled Codex host already refused an approval without the
// token issued for that pending gate, or after the tree changed; the board did not.
//
// A token here is minted when the board lists a pending gate, is single-use,
// expires, and is bound to the project tree OUTSIDE .great_cto/ as it was when the
// board first showed the gate. .great_cto/ is excluded because an approval writes
// the pipeline's own files there (gate row, decision log, wake record, this store),
// and `init` does not gitignore it: bound to the whole tree, the first approval
// would invalidate every other open gate though no reviewed code moved.
//
// Every check fails closed and says why. A store that cannot be read issues no
// tokens and accepts none — it is never silently overwritten.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { treeReceipt, receiptHash, compareReceipts } from '../../../scripts/lib/receipt.mjs';

export const TOKENS_FILE = 'gate-tokens.json';
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
// Why .great_cto/ is outside the binding: it is the pipeline's own state, and the
// approval itself writes there (gate row, decision log, wake, this store). Counting
// it would let one approval refuse every other open gate as "changed".
export const BINDING_EXCLUDE = Object.freeze(['.great_cto']);

/** Test seam: GREAT_CTO_GATE_TOKEN_TTL_MS; production is 24 h. */
export function tokenTtlMs(env = process.env) {
  const n = Number(env.GREAT_CTO_GATE_TOKEN_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

const storePath = (cwd) => path.join(cwd, '.great_cto', TOKENS_FILE);

/** @returns {{state:'none'|'ok'|'unreadable', tokens:object, why?:string}} */
export function readTokens(cwd) {
  let raw;
  try { raw = fs.readFileSync(storePath(cwd), 'utf8'); }
  catch (err) {
    if (err?.code === 'ENOENT') return { state: 'none', tokens: {} };
    return { state: 'unreadable', tokens: {}, why: String(err?.code || err?.message || err) };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('not an object');
    return { state: 'ok', tokens: parsed };
  } catch (err) {
    return { state: 'unreadable', tokens: {}, why: `the token store could not be parsed: ${err.message}` };
  }
}

function writeTokens(cwd, tokens) {
  fs.mkdirSync(path.join(cwd, '.great_cto'), { recursive: true });
  const file = storePath(cwd);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The tree a token is bound to: the project outside .great_cto/. Null outside git. */
export function bindingReceipt(cwd) {
  return treeReceipt(cwd, { exclude: BINDING_EXCLUDE });
}

/**
 * Tokens for the pending gates, minting what is missing or expired.
 *
 * `gates` is the FULL pending list — entries for gates no longer pending are
 * dropped. At most one receipt is computed per call (about 300 ms on a real tree),
 * and only when something has to be minted.
 *
 * @param {{id:string, gate?:string, guarded?:boolean}[]} gates
 * @returns {{state:'ok'|'unreadable', tokens:Record<string,string>, why?:string}}
 */
export function issueTokens(cwd, gates, { now = Date.now(), env = process.env } = {}) {
  const store = readTokens(cwd);
  if (store.state === 'unreadable') return { state: 'unreadable', tokens: {}, why: store.why };
  const ttl = tokenTtlMs(env);
  const pending = new Map((gates || []).filter((g) => g && typeof g.id === 'string' && g.id).map((g) => [g.id, g]));
  const next = {};
  const toMint = [];
  for (const [id, g] of pending) {
    const e = store.tokens[id];
    if (e && typeof e.token === 'string' && Number.isFinite(e.firstSeenAt) && now - e.firstSeenAt <= ttl) next[id] = e;
    else toMint.push(g);
  }
  if (toMint.length) {
    const receipt = bindingReceipt(cwd);
    const hash = receiptHash(receipt);
    for (const g of toMint) {
      next[g.id] = {
        token: randomUUID(), firstSeenAt: now, receiptHash: hash, receipt,
        gate: typeof g.gate === 'string' ? g.gate : '', guarded: g.guarded === true,
      };
    }
  }
  const changed = toMint.length || Object.keys(store.tokens).some((id) => !pending.has(id));
  if (changed) writeTokens(cwd, next);
  return { state: 'ok', tokens: Object.fromEntries(Object.entries(next).map(([id, e]) => [id, e.token])) };
}

/**
 * Is `token` the live token for gate `id`?
 * @returns {{ok:true, entry:object} | {ok:false, status:number, outcome:string, why:string}}
 */
export function checkToken(cwd, id, token, { now = Date.now(), env = process.env } = {}) {
  const store = readTokens(cwd);
  if (store.state === 'unreadable') {
    return { ok: false, status: 403, outcome: 'refused-unreadable', why: `approval tokens could not be read: ${store.why}` };
  }
  const entry = store.tokens[id];
  if (!entry || typeof token !== 'string' || !token || token !== entry.token) {
    return { ok: false, status: 403, outcome: 'refused-token', why: 'no valid approval token for this gate — reload the inbox and try again' };
  }
  if (!Number.isFinite(entry.firstSeenAt) || now - entry.firstSeenAt > tokenTtlMs(env)) {
    return { ok: false, status: 403, outcome: 'refused-expired', why: 'this approval token has expired — reload the inbox to see the gate as it is now' };
  }
  return { ok: true, entry };
}

/**
 * Is the tree outside .great_cto/ still the one the gate was shown with?
 * @returns {{ok:true, bound:boolean} | {ok:false, status:409, outcome:'refused-stale', why:string, changed:string[]}}
 */
export function checkBinding(cwd, entry) {
  const current = bindingReceipt(cwd);
  if (!entry.receipt && !current) return { ok: true, bound: false };   // not a git repository: nothing to bind to, and said so
  if (receiptHash(current) === entry.receiptHash) return { ok: true, bound: true };
  const cmp = compareReceipts(entry.receipt, current, { cwd });
  const changed = [...(cmp.changed || []), ...(cmp.removed || []), ...(cmp.added || [])];
  return {
    ok: false, status: 409, outcome: 'refused-stale', changed,
    why: changed.length
      ? `the project changed since this gate was shown: ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ` and ${changed.length - 10} more` : ''}`
      : 'the project changed since this gate was shown (a commit or an unreadable tree)',
  };
}

/** Single use: drop the gate's token once it has been decided. */
export function consumeToken(cwd, id) {
  const store = readTokens(cwd);
  if (store.state !== 'ok' || !(id in store.tokens)) return;
  const next = { ...store.tokens };
  delete next[id];
  writeTokens(cwd, next);
}
