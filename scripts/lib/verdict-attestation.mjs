/**
 * verdict-attestation — the harness's record of which subagent wrote a verdict line
 * (ADR-051, slice 2).
 *
 * A verdict's seal (ADR-046) proves the line came out of the writer. It does not say
 * who ran the writer: the main session, a subagent of another role going round the
 * slice-1 guard, or the role itself. This module adds the missing fact, recorded by
 * hooks rather than by the agent:
 *
 *   PreToolUse  (bash-guards, inside a subagent) notes how long the subagent's own
 *               verdict log is before the call: `notePre`.
 *   PostToolUse (verdict-attest.mjs) reads what the call appended to that log, and for
 *               each sealed line of that role appends an attestation
 *               `{ts, role, agent_id, agent_type, line}` sealed with the same key under
 *               its own domain tag: `attestAfter`.
 *
 * A line is attested only when the call's own output carries the writer's
 * `verdict-recorded <role> <seal>` for it: landing in the shared log during the call is
 * not enough, since the main session or another subagent of the role may write there
 * meanwhile, and a writer that never ran printed nothing. A line nobody attested reads
 * as `self-reported`: written by the main session, by a subagent of another role,
 * before this slice, or on Codex (no agent identity in its payloads).
 *
 * Limits, said rather than implied: the agent and the hooks run as the same OS user.
 * The snapshot in the temp directory and the attestation log can be written by an
 * agent that sets out to; the guard refuses the obvious shell and edit-tool routes to
 * the attestation log and refuses running the attest hook by hand. A lock needs a
 * human-presence primitive (ADR-046).
 *
 * Local only: nothing here is sent anywhere.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sealAttestation, checkAttestationSeal, checkVerdictSeal } from './verdict-seal.mjs';

export const ATTESTATIONS_FILE = 'verdict-attestations.jsonl';
const PRE_DIR = 'great_cto-verdict-pre';
const PRE_TTL_MS = 60 * 60 * 1000;
const ROLE = /^[a-z0-9][a-z0-9-]*$/;

/** `great-cto:qa-engineer`, `great_cto-qa-engineer` and `qa-engineer` are one role. */
export function roleOf(agentType) {
  return String(agentType ?? '').trim().replace(/^great[-_]cto[:-]/, '');
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}

/** The digest an attestation binds to: every field of the verdict, its seal included. */
export function lineDigest(rec) {
  return createHash('sha256').update(JSON.stringify(canonical(rec))).digest('hex');
}

const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || '_';
const keyOf = (command) => createHash('sha256').update(String(command ?? '')).digest('hex').slice(0, 16);
function prePath({ session, agentId, tmp = os.tmpdir() }) {
  return path.join(tmp, PRE_DIR, `${safe(session)}-${safe(agentId)}.json`);
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function sizeOf(p) { try { return fs.statSync(p).size; } catch (e) { return e.code === 'ENOENT' ? 0 : null; } }

/**
 * Before a subagent's shell call: remember the length of its own role's verdict log.
 * Never throws; a snapshot that cannot be taken only means no attestation follows.
 */
export function notePre({ stateDir, agentType, agentId, session, command, now = Date.now(), tmp } = {}) {
  try {
    const role = roleOf(agentType);
    if (!role || !ROLE.test(role) || !agentId || !stateDir) return { ok: false, why: 'not a subagent call' };
    const log = path.join(stateDir, 'verdicts', `${role}.log`);
    const size = sizeOf(log);
    if (size === null) return { ok: false, why: 'log unreadable' };
    const p = prePath({ session, agentId, tmp });
    const held = readJson(p) || {};
    for (const [k, v] of Object.entries(held)) if (!(now - Number(v?.at) < PRE_TTL_MS)) delete held[k];
    held[keyOf(command)] = { log, size, at: now };
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(held), { mode: 0o600 });
    return { ok: true, log, size };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  }
}

/**
 * After the call: attest each sealed line of the subagent's own role that the call
 * appended. Returns the attestations written. Never throws.
 */
export function attestAfter({ stateDir, agentType, agentId, session, command, output = '', now = Date.now(), tmp, seal = sealAttestation, checkSeal = checkVerdictSeal } = {}) {
  try {
    const role = roleOf(agentType);
    if (!role || !ROLE.test(role) || !agentId || !stateDir) return [];
    const p = prePath({ session, agentId, tmp });
    const held = readJson(p);
    const key = keyOf(command);
    const pre = held?.[key];
    if (!pre) return [];
    delete held[key];
    try { fs.writeFileSync(p, JSON.stringify(held), { mode: 0o600 }); } catch { /* a stale entry ages out */ }
    const log = path.join(stateDir, 'verdicts', `${role}.log`);
    if (pre.log !== log) return [];
    let buf;
    try { buf = fs.readFileSync(log); } catch { return []; }
    if (!(Number(pre.size) >= 0) || buf.length <= pre.size) return [];
    const appended = buf.subarray(pre.size).toString('utf8');
    // A role's log is shared — the main session, another subagent of the role, a
    // worktree — so landing in the log during the call is not authorship. The writer
    // prints `verdict-recorded <role> <seal>` for the line it wrote, in this call's own
    // output; only those lines are this call's. A writer that did not run printed
    // nothing (Codex review on #290: `sleep 10`, then `false && log-verdict.sh …`,
    // were each credited with a verdict the main session wrote meanwhile).
    const printed = writtenSeals(output, role);
    if (!printed.size) return [];
    const out = [];
    for (const line of appended.split('\n')) {
      if (!line.startsWith('{')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec?.agent !== role || !printed.has(rec.seal)) continue;
      // A hand-written (unsealed or mis-sealed) line is never attested into looking like the writer's.
      if (checkSeal(rec) !== 'valid') continue;
      const att = { ts: new Date(now).toISOString(), role, agent_id: String(agentId), agent_type: String(agentType), line: lineDigest(rec) };
      const s = seal(att);
      if (!s) continue; // no key on this machine: nothing to attest with
      att.seal = s;
      fs.mkdirSync(stateDir, { recursive: true });
      fs.appendFileSync(path.join(stateDir, ATTESTATIONS_FILE), JSON.stringify(att) + '\n', { mode: 0o600 });
      out.push(att);
    }
    return out;
  } catch {
    return [];
  }
}

/** The seals the writer printed for `role` in a call's output: `verdict-recorded <role> <seal>`. */
export function writtenSeals(output, role) {
  const out = new Set();
  const re = /^verdict-recorded ([a-z0-9][a-z0-9-]*) (v1:[0-9a-f]{64})\s*$/gm;
  for (const m of String(output ?? '').matchAll(re)) if (m[1] === role) out.add(m[2]);
  return out;
}

/** Valid attestations by line digest, plus how many lines failed their seal. */
export function readAttestations(stateDir, { checkSeal = checkAttestationSeal } = {}) {
  const byLine = new Map();
  let invalid = 0;
  let raw;
  try { raw = fs.readFileSync(path.join(stateDir, ATTESTATIONS_FILE), 'utf8'); }
  catch (e) { return e.code === 'ENOENT' ? { byLine, invalid, readable: true } : { byLine, invalid, readable: false }; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let att;
    try { att = JSON.parse(line); } catch { invalid++; continue; }
    if (checkSeal(att) !== 'valid') { invalid++; continue; }
    if (typeof att.line === 'string' && !byLine.has(att.line)) byLine.set(att.line, att);
  }
  return { byLine, invalid, readable: true };
}

/**
 * 'attested' — a subagent of the line's own role wrote it, seen by the harness;
 * 'self-reported' — no valid attestation; 'unreadable' — the attestation log could not be read.
 */
export function attestationOf(rec, stateDir, opts = {}) {
  const { byLine, readable } = readAttestations(stateDir, opts);
  if (!readable) return { state: 'unreadable' };
  const att = rec ? byLine.get(lineDigest(rec)) : null;
  if (att && att.role === rec.agent) return { state: 'attested', att };
  return { state: 'self-reported' };
}
