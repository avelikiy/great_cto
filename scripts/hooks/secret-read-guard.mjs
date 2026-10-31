#!/usr/bin/env node
/**
 * secret-read-guard — PreToolUse for Read, Grep and Bash: an agent does not print
 * a secret file into its own transcript.
 *
 * secret-scan.mjs stops a key being WRITTEN into a file. Nothing stopped one being
 * READ: `cat .env`, `Read ~/.great_cto/secrets.env`, `head -3 id_ed25519`. What a
 * tool prints is the transcript — stored on disk, sent to the model provider,
 * summarised into session logs and carried into the next context. A key in one
 * context file on this machine reached 605 transcripts before anyone noticed, and
 * the only fix for that was revoking it (secrets-never-in-context-files).
 * agent-posture.mjs labelled `cat` as `credential.read` and decided nothing.
 *
 * Refused: printing a secret file —
 *   Read          file_path is a secret file
 *   Grep          path is a secret file, or glob targets one (`.env*`, `*.pem`)
 *   Bash          a reader (cat, head, tail, less, sed, awk, grep, base64, xxd, …)
 *                 given a secret file as an operand or as `< file`
 *
 * Allowed: using one without printing it —
 *   `source .env` / `. .env` / `set -a; source .env; set +a`   environment, not output
 *   `grep -q '^KEY=' .env` (also -c, -l, -L)                  answers yes/no, prints no value
 *   cp, mv, chmod, test -f, ls                               the file moves; nothing is shown
 *   `.env.example`, `.env.sample`, `.env.template`, `*.pub`  meant to be read
 *
 * A secret file is: `.env`, `.env.<anything>` (but not example/sample/template/
 * dist/defaults), `.envrc`, `secrets.env` (and `<x>.secrets.env`), `*.pem`,
 * `*.key`, and an SSH private key `id_rsa` / `id_dsa` / `id_ecdsa` / `id_ed25519`
 * (`_sk` too; never the `.pub`).
 *
 * Not covered, said rather than implied: a Grep over a DIRECTORY. ripgrep skips
 * hidden files, so `.env` is not searched, but a `.pem` in the tree can be. A
 * guard that refused every directory search would be switched off in a day.
 *
 * The sanctioned way past a refusal is a signed, expiring exception for gate
 * `secret-read` (`/exception`). Opt out for a session in the operator's own
 * environment: GREAT_CTO_DISABLE_SECRET_READ_GUARD=1.
 */
import { PASS, deny, emit, readStdinOnce } from '../lib/guard-result.mjs';
import { simpleCommands, base } from '../lib/shell-commands.mjs';
import { isCovered } from '../lib/exceptions.mjs';

const GATE = 'secret-read';

const MEANT_TO_BE_READ = /\.(example|sample|template|dist|defaults?)$/i;

/** Is this path a file whose content is a secret? Judged by its name only. */
export function isSecretPath(p) {
  if (typeof p !== 'string' || !p) return false;
  const b = base(p.replace(/\/+$/, ''));
  if (!b || b.endsWith('.pub')) return false;
  if (/^\.env(\..+)?$/i.test(b)) return !MEANT_TO_BE_READ.test(b);
  if (b === '.envrc') return true;
  if (/(^|\.)secrets\.env$/i.test(b)) return true;
  if (/\.(pem|key)$/i.test(b)) return true;
  return /^id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/.test(b);
}

/** A Grep glob that selects secret files — `.env*`, `*.pem`, `**\/secrets.env`. */
export function globTargetsSecret(glob) {
  if (typeof glob !== 'string' || !glob) return false;
  return glob.split(/[,{}]/).some((g) => {
    const b = base(g.trim());
    if (/^\.env[*.]?/i.test(b) && !MEANT_TO_BE_READ.test(b.replace(/\*+$/, ''))) return true;
    return isSecretPath(b.replace(/^\*+/, 'x').replace(/\*+$/, ''));
  });
}

/** Commands whose job is to show a file's bytes (or a transform of them). */
const READERS = new Set([
  'cat', 'tac', 'head', 'tail', 'less', 'more', 'most', 'bat', 'batcat', 'nl', 'view',
  'strings', 'xxd', 'od', 'hexdump', 'hd', 'base64', 'base32', 'basenc', 'uuencode',
  'sed', 'awk', 'gawk', 'cut', 'sort', 'uniq', 'paste', 'column', 'fold', 'rev', 'tr', 'pr',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'jq', 'yq', 'diff', 'sdiff', 'colordiff',
  'openssl', 'iconv', 'dos2unix', 'expand', 'fmt',
]);

const GREP_LIKE = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack']);
/** Flags after which grep prints no matched text — a yes/no, a count or a file name. */
const QUIET = /^-(?:[A-Za-z]*[qcLl][A-Za-z]*)$|^--(?:quiet|silent|count|files-with(?:out)?-match(?:es)?)$/;

/** The secret file a shell command would print, or null. */
export function secretReadInCommand(cmd) {
  for (const c of simpleCommands(cmd)) {
    const w = c.words;
    if (!w.length) continue;
    const name = base(w[0]);
    if (!READERS.has(name)) continue;
    if (GREP_LIKE.has(name) && w.slice(1).some((a) => QUIET.test(a))) continue;
    // openssl prints a key only when asked to show it; `openssl x509 -noout -fingerprint` does not.
    if (name === 'openssl' && w.includes('-noout') && !w.includes('-text')) continue;
    // `sed -i` edits the file in place and prints nothing.
    if (name === 'sed' && w.slice(1).some((a) => /^-[A-Za-z]*i|^--in-place/.test(a))) continue;
    const args = w.slice(1);
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (/^\d*>>?$|^&>$/.test(args[i - 1] || '')) continue;   // a redirect target is written, not read
      const value = a.startsWith('-') ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : null) : a;
      if (value && isSecretPath(value)) return { file: value, command: name };
    }
  }
  return null;
}

/** The secret file a Read / Grep / Bash call would print, or null. */
export function findSecretRead(d) {
  const tool = d.tool_name;
  const input = d.tool_input || d.toolInput || {};
  if (tool === 'Read') return isSecretPath(input.file_path) ? { file: input.file_path, command: 'Read' } : null;
  if (tool === 'Grep') {
    if (isSecretPath(input.path)) return { file: input.path, command: 'Grep' };
    if (globTargetsSecret(input.glob)) return { file: input.glob, command: 'Grep' };
    return null;
  }
  if (tool === 'Bash' || (!tool && typeof d.command === 'string')) {
    const cmd = input.command || d.command;
    return typeof cmd === 'string' && cmd.trim() ? secretReadInCommand(cmd) : null;
  }
  return null;
}

export function blockReason(hit) {
  return `${hit.command} would print ${hit.file} into the transcript. A transcript is stored, sent to the ` +
    'model provider and carried into later sessions, so a secret printed once is spent — revoking it is ' +
    'the only fix. Use it without printing it: `set -a; source <file>; set +a` to load it into the ' +
    "environment, or `grep -q '^NAME=' <file>` to check a key is there. If the operator needs the file " +
    'shown, they open it themselves, or grant a signed exception for gate `secret-read`.';
}

/** The decision for one tool-call payload, as a value (scripts/lib/guard-result.mjs). */
export function run(raw, env = process.env) {
  if (env.GREAT_CTO_DISABLE_SECRET_READ_GUARD === '1') return PASS;
  let d;
  try { d = JSON.parse(raw || '{}'); } catch { return PASS; }
  const hit = findSecretRead(d);
  if (!hit) return PASS;
  if (isCovered(GATE)) return PASS;
  return deny({ guard: 'secret-read', tag: 'secret-read', reason: blockReason(hit),
                what: hit.command === 'Read' || hit.command === 'Grep' ? 'read' : 'command' });
}

if (import.meta.url === `file://${process.argv[1]}`) emit(run(readStdinOnce()));
