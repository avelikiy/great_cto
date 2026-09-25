#!/usr/bin/env node
/**
 * request-quality — how often the operator has to correct the work, measured
 * from their own Claude Code sessions. The baseline the request brief
 * (PLAN-2026-09-25-request-brief) is judged against: a brief that does not
 * lower the correction rate, or raises the turns it takes, is not taken.
 *
 * Why this exists
 * ---------------
 * Sixty days of one operator's sessions: a median opener of seven words, a
 * third of all messages one to three words long, and 3% of openers saying how
 * the work counts as done. "It doesn't work" reports the operator found
 * themself: 87. That study was a pile of one-off scripts; this is it kept, so
 * the number can be taken again after a change.
 *
 * What it counts (per window, optionally one project):
 *   requests           operator messages of 4+ words that are not themselves corrections
 *   correctedWithin3   requests followed by a correction in the next three operator messages
 *   corrections        messages that reject, re-explain or report the work broken
 *   brokenReports      the subset saying something does not work
 *   approvals          short go-aheads ("да", "делай", "ok")
 *   briefedApprovals   approvals whose preceding agent message carried a "Done when" line
 *
 * Heuristic, and says so: regex over the first 400 characters (the operator's
 * own words usually come first, pasted material after). Russian and English.
 *
 * Privacy: local and read-only. The report is numbers only — never message
 * text, never project names — so it can be pasted into an issue as it is.
 *
 * Usage: node scripts/lib/request-quality.mjs [--since 2026-09-01] [--until …] [--project <substr>] [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = join(homedir(), '.claude', 'projects');

// Wrappers the harness puts in the user role. None of them is the operator typing.
const NOT_OPERATOR = /^\s*(<(command-|system-reminder|task-notification|local-command|bash-|user-prompt-submit-hook|teammate-message|scheduled-task|artifact-)|This session is being continued|Caveat:|\[Request interrupted|Base directory for this skill|\[Image)/;

// JS \b is ASCII-only, so a Cyrillic word boundary is spelled out.
const END = '(?=[\\s,.!?:;—-]|$)';
const CORRECTION = new RegExp([
  `^\\s*(нет|не надо|не нужно|стоп|не то)${END}`,
  'я (же |ведь )?(имел в виду|говорил|просил|сказал)', 'я тебе такого не', 'зачем ты', 'почему ты',
  'ты (не |посмел|уверен|проверил|протестировал)',
  '(по-?прежнему|вс[её] ещ[её]|вс[её] равно|опять|снова|до сих пор)[^.\\n]{0,30}(не |нет)',
  'не работает', 'не открывается', 'не грузит', 'сломал', 'падает', 'откат', 'верни ', 'убери это', 'не трогай', 'что это за', 'не понял',
  "that'?s not what", 'not what i (asked|meant|said|wanted)', 'i (already )?(said|told you)', 'why did you', 'why are you',
  "still (not|broken|failing|doesn'?t)", "does(n'?t| not) work", 'is broken', '\\brevert', '\\bundo\\b', 'roll (it )?back',
  "that'?s wrong", "you'?re wrong", 'wrong (file|repo|project|branch)',
].join('|'), 'i');

const BROKEN = /не работает|не открывается|не грузит|сломал|падает|does(n'?t| not) work|is broken|still (broken|failing|doesn'?t)/i;
const APPROVAL = new RegExp(`^\\s*(да|делай|делай дальше|продолжай|приступай|давай|ок|ok|okay|yes|go|go ahead|continue)${END}`, 'i');
const DONE_WHEN = /done when|definition of done|acceptance criteria|готово,? когда|критери[йи] (при[её]мки|готовности)/i;

const words = (t) => (String(t).match(/[\p{L}\p{N}_]+/gu) || []).length;
const head = (t) => String(t).slice(0, 400);

export const isCorrection = (text) => CORRECTION.test(head(text));
export const hasDoneWhen = (text) => DONE_WHEN.test(String(text));

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  if (content.some((b) => b && b.type === 'tool_result')) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
}

/** One session transcript → what the operator typed, each with the agent text just before it. */
export function operatorMessages(jsonl) {
  const out = []; let lastAgent = '';
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.isSidechain) continue;
    if (d.type === 'assistant') {
      const t = textOf(d.message?.content).trim();
      if (t) lastAgent = t;
      continue;
    }
    if (d.type !== 'user' || d.isMeta) continue;
    const text = textOf(d.message?.content).trim();
    if (!text || NOT_OPERATOR.test(text)) continue;
    out.push({ ts: d.timestamp || '', text, prevAgent: lastAgent });
    lastAgent = '';
  }
  return out;
}

// Sessions started in a temp directory are scripted — benchmarks, eval sandboxes,
// `claude -p` probes — and their "operator" is a script. Counted only when asked for.
const SCRIPTED = /^-(private-tmp|private-var-folders|tmp|var-folders)-/;

function sessionFiles(root, project) {
  const files = [];
  let dirs = [];
  try { dirs = readdirSync(root); } catch { return files; }
  for (const p of dirs) {
    if (project ? !p.includes(project) : SCRIPTED.test(p)) continue;
    let names = [];
    try { names = readdirSync(join(root, p)); } catch { continue; }
    for (const n of names) {
      const f = join(root, p, n);
      if (n.endsWith('.jsonl')) { try { if (statSync(f).isFile()) files.push(f); } catch { /* raced with deletion */ } }
    }
  }
  return files;
}

export function requestQuality({ root = DEFAULT_ROOT, since = null, until = null, project = null } = {}) {
  const r = { sessions: 0, operatorMessages: 0, shortMessages: 0, requests: 0, correctedWithin3: 0,
    corrections: 0, brokenReports: 0, approvals: 0, briefedApprovals: 0 };
  for (const f of sessionFiles(root, project)) {
    let msgs;
    try { msgs = operatorMessages(readFileSync(f, 'utf8')); } catch { continue; }
    msgs = msgs.filter((m) => (!since || m.ts >= since) && (!until || m.ts < until));
    if (!msgs.length) continue;
    r.sessions++;
    msgs.forEach((m, i) => {
      r.operatorMessages++;
      const n = words(m.text);
      const corr = isCorrection(m.text);
      if (n <= 3) r.shortMessages++;
      if (corr) { r.corrections++; if (BROKEN.test(head(m.text))) r.brokenReports++; }
      if (n <= 3 && APPROVAL.test(m.text)) { r.approvals++; if (hasDoneWhen(m.prevAgent)) r.briefedApprovals++; }
      if (n >= 4 && !corr) {
        r.requests++;
        if (msgs.slice(i + 1, i + 4).some((x) => isCorrection(x.text))) r.correctedWithin3++;
      }
    });
  }
  return r;
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');

export function formatReport(r) {
  return [
    `sessions ${r.sessions} · operator messages ${r.operatorMessages} · 1–3 words ${pct(r.shortMessages, r.operatorMessages)}`,
    `requests ${r.requests} · corrected within 3 turns ${r.correctedWithin3} (${pct(r.correctedWithin3, r.requests)})`,
    `corrections ${r.corrections} · "it doesn't work" ${r.brokenReports}`,
    `approvals ${r.approvals} · of a proposal with "Done when" ${r.briefedApprovals} (${pct(r.briefedApprovals, r.approvals)})`,
    'Heuristic (regex over the first 400 chars, ru+en) — compare windows, do not quote it to a decimal.',
  ].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const r = requestQuality({ since: opt('--since'), until: opt('--until'), project: opt('--project') });
  process.stdout.write(a.includes('--json') ? `${JSON.stringify(r, null, 2)}\n` : `${formatReport(r)}\n`);
}
