/**
 * router-key — the OpenRouter key's presence, and setting it, without ever
 * reading it back out.
 *
 * A user who installs the plugin has no way to discover that a key exists. The
 * README mentions OpenRouter once and never says where the key goes; postinstall
 * says nothing; the router's own hint names `.env.local` while it actually reads
 * three places in order. Nothing breaks without a key — every stage comes back
 * `unverifiable`, honestly — but "the judge is not connected" and "the judge
 * found nothing to check" look identical from the board.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * There is no read path for the key. `status()` answers whether one is present,
 * which of the three locations it came from, and what it looks like at four
 * characters — never the value. A board endpoint that could return the secret
 * would make every future XSS in a 7,600-line single-page app a key disclosure,
 * and the convenience it buys is zero: nobody needs to read back a key they
 * already have.
 *
 * WRITING
 * -------
 * The file is `~/.great_cto/secrets.env`, which holds other keys. It is
 * REWRITTEN IN FULL from a parsed copy, never appended to blindly and never
 * truncated: an earlier `cat >` against this file destroyed a stored key, and
 * that is the failure this module is shaped to avoid. A timestamped backup is
 * taken before every write, and the write is atomic — temp file, then rename —
 * so an interrupted write cannot leave a half-file where a key used to be.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const KEY_NAME = 'OPENROUTER_API_KEY';
export const MODEL_NAME = 'GREAT_CTO_ROUTER_MODEL';

/** Where the router looks, in the order it looks. */
export function keyLocations(cwd = process.cwd()) {
  return [
    { where: 'environment', kind: 'env' },
    { where: path.join(cwd, '.env.local'), kind: 'file' },
    { where: path.join(os.homedir(), '.great_cto', 'secrets.env'), kind: 'file' },
  ];
}

/** Parse `KEY=value` lines. Comments and blanks are preserved by the writer, not here. */
export function parseEnv(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return out;
}

/** `sk-or-v1-…abcd` — enough to tell two keys apart, not enough to use one. */
export function fingerprint(key) {
  const s = String(key || '');
  if (s.length < 8) return null;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

/**
 * Is a key reachable, and from where?
 *
 * Three states, and the third is why this exists: `present` | `absent` |
 * `unreadable`. A secrets file that exists and cannot be read is not the same as
 * no key, and telling the operator "no key" when the answer is "I could not
 * look" sends them to set a key they already have.
 */
export function status({ cwd = process.cwd(), env = process.env } = {}) {
  const problems = [];
  for (const loc of keyLocations(cwd)) {
    if (loc.kind === 'env') {
      if (env[KEY_NAME]) {
        return { state: 'present', from: 'environment', fingerprint: fingerprint(env[KEY_NAME]),
                 model: env[MODEL_NAME] || null, problems };
      }
      continue;
    }
    if (!existsSync(loc.where)) continue;
    let text;
    try { text = readFileSync(loc.where, 'utf8'); }
    catch (e) { problems.push(`${loc.where} exists and could not be read: ${e.code || e.message}`); continue; }
    const vars = parseEnv(text);
    if (vars.get(KEY_NAME)) {
      return { state: 'present', from: loc.where, fingerprint: fingerprint(vars.get(KEY_NAME)),
               model: vars.get(MODEL_NAME) || null, problems };
    }
  }
  return {
    state: problems.length ? 'unreadable' : 'absent',
    from: null,
    fingerprint: null,
    model: env[MODEL_NAME] || null,
    problems,
  };
}

/** Shape check only — this cannot know whether a key is live, and does not pretend to. */
export function looksLikeKey(key) {
  const s = String(key || '').trim();
  if (!s) return { ok: false, why: 'empty' };
  if (/\s/.test(s)) return { ok: false, why: 'contains whitespace — a pasted key should be one token' };
  if (!/^sk-or-/.test(s)) return { ok: false, why: 'OpenRouter keys begin with `sk-or-`' };
  if (s.length < 20) return { ok: false, why: 'too short to be a key' };
  return { ok: true };
}

/**
 * Write the key, preserving everything else in the file.
 *
 * @returns {{ok:boolean, backup:string|null, replaced:boolean, error?:string}}
 */
export function writeKey(key, { home = os.homedir(), now = () => new Date() } = {}) {
  const shape = looksLikeKey(key);
  if (!shape.ok) return { ok: false, backup: null, replaced: false, error: shape.why };

  const dir = path.join(home, '.great_cto');
  const file = path.join(dir, 'secrets.env');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  let before = '';
  let backup = null;
  if (existsSync(file)) {
    try { before = readFileSync(file, 'utf8'); }
    catch (e) { return { ok: false, backup: null, replaced: false, error: `could not read ${file}: ${e.code || e.message}` }; }
    // Backup BEFORE touching anything. This file has been destroyed once by a
    // careless write, and a key that is gone cannot be recovered from anywhere.
    const stamp = now().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
    backup = `${file}.bak-${stamp}`;
    try { copyFileSync(file, backup); }
    catch (e) { return { ok: false, backup: null, replaced: false, error: `could not back up ${file}: ${e.code || e.message}` }; }
  }

  // Replace the line in place if it exists, so comments and ordering survive.
  const lines = before ? before.split('\n') : [];
  let replaced = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (new RegExp(`^\\s*${KEY_NAME}\\s*=`).test(lines[i])) {
      lines[i] = `${KEY_NAME}=${key.trim()}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`# Set from the board on ${now().toISOString().slice(0, 10)}.`);
    lines.push(`${KEY_NAME}=${key.trim()}`);
    lines.push('');
  }

  // Atomic: an interrupted write must not leave a half-file where a key was.
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, lines.join('\n'), { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  } catch (e) {
    return { ok: false, backup, replaced, error: `could not write ${file}: ${e.code || e.message}` };
  }
  return { ok: true, backup, replaced };
}
