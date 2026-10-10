#!/usr/bin/env node
/**
 * run-learner — run continuous-learner once, for the session that just ended, and
 * record what actually happened.
 *
 * Why this exists
 * ---------------
 * SessionEnd used to spawn `claude --agent continuous-learner` detached, with no
 * prompt and no `-p`, and write `ran` to `.great_cto/.last-auto-learn` the moment
 * the process started. The CLI exits 1 at once without a prompt ("Input must be
 * provided either through stdin or as a prompt argument"), so the learner never
 * ran — and the marker said it had. Across the 28 projects registered on the
 * measuring machine (2026-09-21) not one `lessons.md` had a single entry.
 *
 * The hook cannot wait for a paid agent run, so it starts THIS script detached,
 * and this script waits: it builds a digest of the session, runs the learner in
 * print mode with a budget cap, and rewrites the marker with the outcome —
 * `done` with how many lessons were added, `failed` with the exit code and the
 * first line of error, never `ran` on the strength of a spawn.
 *
 * The digest is what the learner could not otherwise see: the operator's own
 * messages, which agents were dispatched, and which tool calls failed — read from
 * the transcript Claude Code names in the SessionEnd payload. Secrets are
 * redacted with the same patterns the secret scanner uses, the digest lives in a
 * private temp directory (0600) outside the project, and it is removed after the
 * run. The learner's own session sets GREAT_CTO_DISABLE_SESSION_LEARNING=1, so
 * its SessionEnd does not start another learner.
 *
 * Usage (from session-end.mjs): node run-learner.mjs '<json {cwd, transcript, reason}>'
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS } from './secret-patterns.mjs';
import { parseLessons } from './lessons-write.mjs';

export const DEFAULT_BUDGET_USD = 0.5;
export const MIN_OPERATOR_MESSAGES = 2;
export const MIN_CONCLUSIONS = 5;
const MAX_TRANSCRIPT_TAIL = 8 * 1024 * 1024; // the last 8 MB of a transcript is the session that matters
const MAX_DIGEST_CHARS = 60_000;
// The assistant's conclusions get their own budget, filled newest-first: on
// 2026-10-01 a 270 MB session ended "lessons+0" because its lessons were found in
// these conclusions and the digest carried only 19 operator messages.
const MAX_CONCLUSION_CHARS = 30_000;
const MAX_CONCLUSION_EACH = 500;

/** The Luhn checksum a payment card number carries. */
function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// 13-19 digits, optionally grouped by spaces or dashes. Only a run that passes
// Luhn is a card: a long id, a millisecond timestamp or a primary key that fails
// it stays in the digest as evidence (idea from autoharness #180). Here and not
// in secret-patterns: the secret-scan guard would then block Stripe's test cards
// in every fintech project's fixtures.
const CARD_RUN = /\b\d(?:[ -]?\d){12,18}\b/g;

/** Every secret-shaped string, and every card number, replaced by its kind. Never returns the value. */
export function redact(text) {
  let out = String(text ?? '');
  for (const { name, regex } of PATTERNS) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    out = out.replace(new RegExp(regex.source, flags), `[REDACTED ${name}]`);
  }
  return out.replace(CARD_RUN, (m) => (luhnValid(m.replace(/[ -]/g, '')) ? '[REDACTED card number]' : m));
}

const WRAPPER = /^\s*<(command-name|command-message|command-args|local-command-stdout|system-reminder|task-notification)/;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
}

/**
 * A transcript (JSONL text) → what a learner needs from it: the operator's
 * messages, agent dispatches, and tool calls that failed.
 */
export function digestTranscript(jsonl) {
  const operator = [];
  const dispatches = [];
  const failures = [];
  const conclusions = [];
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const content = d?.message?.content;
    if (d?.type === 'user') {
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === 'tool_result' && c.is_error) {
            const first = textOf(c.content).split('\n').find((l) => l.trim()) || String(c.content || '').split('\n')[0] || '';
            failures.push(first.slice(0, 200));
          }
        }
      }
      const t = textOf(content).trim();
      if (t && !WRAPPER.test(t) && !(Array.isArray(content) && content.some((c) => c?.type === 'tool_result'))) {
        operator.push(t.length > 600 ? `${t.slice(0, 600)} …` : t);
      }
    } else if (d?.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task') && c.input?.subagent_type) {
          dispatches.push(`${c.input.subagent_type}: ${String(c.input.description || '').slice(0, 80)}`);
        }
        if (c?.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
          const t = c.text.trim().replace(/\n+/g, ' ⏎ ');
          conclusions.push(t.length > MAX_CONCLUSION_EACH ? `${t.slice(0, MAX_CONCLUSION_EACH)} …` : t);
        }
      }
    }
  }
  const parts = [
    '# Session digest (redacted)',
    '',
    `## Operator messages (${operator.length})`,
    ...operator.map((m) => `- ${m.replace(/\n+/g, ' ⏎ ')}`),
    '',
    `## Agent dispatches (${dispatches.length})`,
    ...dispatches.map((x) => `- ${x}`),
    '',
    `## Failed tool calls (${failures.length})`,
    ...failures.map((x) => `- ${x}`),
  ];
  // Newest conclusions first into the budget, then back in session order.
  const kept = [];
  let used = 0;
  for (let i = conclusions.length - 1; i >= 0; i--) {
    if (used + conclusions[i].length > MAX_CONCLUSION_CHARS) break;
    kept.unshift(conclusions[i]); used += conclusions[i].length + 3;
  }
  const tail = [
    '',
    `## What the assistant concluded (${kept.length} of ${conclusions.length}, newest kept)`,
    ...kept.map((x) => `- ${x}`),
  ];
  let out = redact(parts.join('\n'));
  // Keep the END when it is too long: the last part of a session is the part that
  // has not been compacted away and is most likely to hold the correction.
  const room = MAX_DIGEST_CHARS - MAX_CONCLUSION_CHARS;
  if (out.length > room) out = `${out.slice(0, 2000)}\n\n… (middle cut) …\n\n${out.slice(-(room - 2100))}`;
  out += redact(tail.join('\n'));
  return { text: out, counts: { operator: operator.length, dispatches: dispatches.length, failures: failures.length, conclusions: conclusions.length } };
}

function readTail(file, max) { return readWindow(file, 0, max); }

/**
 * The transcript from `from` to its end, at most `max` bytes (the newest kept).
 * A window run passes the offset where the previous window ended, so a long
 * session is read once, in pieces, instead of only its last 8 MB.
 */
export function readWindow(file, from, max) {
  const size = statSync(file).size;
  const start = Math.max(0, Number(from) || 0, size - max);
  if (start >= size) return '';
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const s = buf.toString('utf8');
    // Drop a partial first line — unless the read starts exactly at a line start.
    if (start === 0 || start === Number(from)) return s;
    return s.slice(s.indexOf('\n') + 1);
  } finally { closeSync(fd); }
}

export function lessonCount(cwd) {
  try { return parseLessons(readFileSync(join(cwd, '.great_cto', 'lessons.md'), 'utf8')).entries.length; } catch { return 0; }
}

export function learnerPrompt({ digestPath, reason }) {
  return [
    `The session in this project just ended (reason: ${reason || 'unknown'}).`,
    digestPath
      ? `A redacted digest of it — the operator's messages, agent dispatches, failed tool calls, and what the assistant concluded — is at ${digestPath}. Read it first; it is the transcript you would otherwise not have.${reason === 'window' ? ' It covers one window of a longer session, not all of it.' : ''}`
      : 'No transcript was available for this session; work from git, verdicts and .great_cto/logs.',
    'Follow your contract: extract 0-3 evidence-backed lessons into .great_cto/lessons.md and write your verdict line.',
    'A correction the operator had to make (a step redone, a claim that proved false, "still broken") is the strongest evidence there is.',
    'This is an unattended run: do not ask questions, and write nothing outside .great_cto/ and ~/.great_cto/.',
  ].join('\n');
}

/** The argv for the learner run — print mode, a prompt, and a spending cap. */
export function learnerArgs({ prompt, budgetUsd = DEFAULT_BUDGET_USD, addDir } = {}) {
  const args = ['-p', prompt, '--agent', 'continuous-learner', '--permission-mode', 'acceptEdits', '--max-budget-usd', String(budgetUsd)];
  if (addDir) args.push('--add-dir', addDir);
  return args;
}

function writeMarker(cwd, line) {
  try {
    mkdirSync(join(cwd, '.great_cto'), { recursive: true });
    writeFileSync(join(cwd, '.great_cto', '.last-auto-learn'), `${new Date().toISOString()} ${line}\n`);
  } catch { /* the marker is a report, never a reason to fail */ }
}

/**
 * Run the learner once and record the outcome.
 * @returns {{state:'done'|'failed'|'skipped', exit:number|null, added:number, detail?:string}}
 */
export function runLearner({ cwd, transcript, reason, fromOffset = 0, claude = 'claude', budgetUsd, timeoutMs = 300_000, env = process.env, home = homedir() } = {}) {
  // Home is not a project: ~/.great_cto is the global layer that read-global-memory
  // injects into every session of every project. A session that ended in ~ once
  // wrote a lesson naming private projects there (2026-10-05). Every path to the
  // learner — session end and learn windows — comes through here.
  if (resolve(cwd) === resolve(home)) {
    writeMarker(cwd, 'skipped: the home directory is not a project — its .great_cto is the global layer');
    return { state: 'skipped', exit: null, added: 0, detail: 'the home directory is not a project' };
  }
  const before = lessonCount(cwd);
  let dir = null;
  let digestPath = null;
  let counts = null;
  if (transcript && existsSync(transcript)) {
    try {
      const d = digestTranscript(readWindow(transcript, fromOffset, MAX_TRANSCRIPT_TAIL));
      counts = d.counts;
      dir = mkdtempSync(join(tmpdir(), 'gcto-learn-'));
      digestPath = join(dir, 'session-digest.md');
      writeFileSync(digestPath, d.text, { mode: 0o600 });
    } catch { digestPath = null; }
  }
  // Nothing to learn from is not a reason to pay for a run. A `claude -p` probe, a
  // script's one-shot call, a session that ended before its first message: each
  // fired SessionEnd and would have started a paid learner with only git to read.
  // The first one after this was switched on was exactly that.
  // A long autonomous stretch has few operator messages and many conclusions;
  // either is something to learn from.
  if (!counts || (counts.operator < MIN_OPERATOR_MESSAGES && (counts.conclusions ?? 0) < MIN_CONCLUSIONS)) {
    if (dir) rmSync(dir, { recursive: true, force: true });
    const why = !counts ? 'no transcript' : `${counts.operator} operator message(s), ${counts.conclusions ?? 0} conclusion(s)`;
    writeMarker(cwd, `skipped: ${why} — nothing to learn from`);
    return { state: 'skipped', exit: null, added: 0, detail: why };
  }
  let r;
  try {
    r = spawnSync(claude, learnerArgs({ prompt: learnerPrompt({ digestPath, reason }), budgetUsd, addDir: dir }), {
      cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, GREAT_CTO_DISABLE_SESSION_LEARNING: '1' },
    });
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  const added = lessonCount(cwd) - before;
  const seen = counts ? ` digest=${counts.operator}msg/${counts.dispatches}agents/${counts.failures}fail/${counts.conclusions ?? 0}concl` : ' digest=none';
  if (r.error || r.status !== 0) {
    const why = r.error ? (r.error.code || r.error.message) : (`${r.stderr || ''}${r.stdout || ''}`.split('\n').find((l) => l.trim()) || 'no output');
    const out = { state: 'failed', exit: r.status ?? null, added, detail: redact(String(why)).slice(0, 200) };
    writeMarker(cwd, `failed: exit=${out.exit} ${out.detail}${seen}`);
    return out;
  }
  writeMarker(cwd, `done: lessons+${added}${seen}`);
  return { state: 'done', exit: 0, added };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  let opts = {};
  try { opts = JSON.parse(process.argv[2] || '{}'); } catch { /* defaults */ }
  runLearner({ cwd: opts.cwd || process.cwd(), transcript: opts.transcript, reason: opts.reason, fromOffset: opts.fromOffset, budgetUsd: opts.budgetUsd });
}
