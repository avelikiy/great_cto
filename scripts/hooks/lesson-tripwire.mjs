#!/usr/bin/env node
// lesson-tripwire — PreToolUse (Bash, Edit | Write | MultiEdit): when a tool call
// touches what a recorded lesson is about, put that lesson in front of the model.
//
// Lessons are loaded whole at session start (read-global-memory), which is exactly
// when nobody needs them: forty entries in, the one about `release.sh` pushing the
// local main ref is not what the model is thinking about when it runs release.sh on
// a release branch three hours later. A tripwire fires at the moment of the call.
//
// Keys come from the lesson itself: the files in its Evidence, and the paths, flags
// and identifiers it names in backticks. A key that appears in many lessons says
// nothing about any one of them and is dropped (the IDF idea), as are generic names.
// A match is a key equal to the file being edited (path or basename), a key among the
// words of the shell command, or an identifier present in the text being written.
// At most two lessons, 700 characters, each lesson once per session. Never blocks.
// Opt out: GREAT_CTO_DISABLE_LESSON_TRIPWIRES=1.
//
// Idea from agentlas-ai/Agentlas-OS (tripwire lessons), rebuilt; see NOTICE.md.

import { PASS, emit, readStdinOnce } from '../lib/guard-result.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleCommands, base } from '../lib/shell-commands.mjs';
import { appendEvent } from '../lib/agent-events.mjs';

const MAX_LESSONS = 2;
const MAX_CHARS = 700;
const GENERIC = new Set([
  'readme.md', 'package.json', 'changelog.md', 'claude.md', 'agents.md', 'index.html', 'index.js', 'index.ts',
  'main', 'src', 'docs', 'tests', 'test', 'scripts', 'lib', 'true', 'false', 'null', 'node', 'npm', 'git',
  '.great_cto', 'project.md', 'lessons.md', '--help', '--version', '--yes', '--force',
]);

/** Split a lessons file into `## ` sections: { title, text }. */
export function splitLessons(md) {
  const out = [];
  let cur = null;
  for (const line of String(md ?? '').split('\n')) {
    const h = /^##\s+(?:pattern:\s*)?(.+?)\s*$/.exec(line);
    if (h && !line.startsWith('###')) { if (cur) out.push(cur); cur = { title: h[1], text: '' }; continue; }
    if (cur) cur.text += line + '\n';
  }
  if (cur) out.push(cur);
  return out.filter((l) => l.text.trim());
}

/** A lesson's one-line gist: its Decision/Pattern (or Lesson/Rule) section, else its first prose line. */
export function gist(text) {
  const m = /\*\*(?:Decision\/Pattern|Pattern|Lesson|Rule|Decision):\*\*\s*(.+)/i.exec(text);
  const line = m ? m[1] : (String(text).split('\n').find((l) => l.trim() && !/^(---|[a-z-]+:\s|\*\*[A-Z])/i.test(l.trim())) || '');
  return line.replace(/\s+/g, ' ').trim();
}

/** The keys a lesson names: evidence files, backticked paths, flags and identifiers. */
export function keysOf(text) {
  const keys = new Set();
  for (const m of String(text).matchAll(/^\s*-\s*file:\s*([^\s(]+)/gim)) keys.add(m[1].replace(/[`'"]/g, '').replace(/:\d+(-\d+)?$/, ''));
  for (const m of String(text).matchAll(/`([^`\n]{3,80})`/g)) {
    for (const w of m[1].split(/\s+/)) {
      const k = w.replace(/^[('"]+|[)'",.:;]+$/g, '').replace(/:\d+(-\d+)?$/, ''); // `file.mjs:162` names the file
      if (/^--?[a-z][\w-]{2,}$/i.test(k)) keys.add(k);                        // a flag
      else if (/[\w-]+\.[a-z]{1,5}$/i.test(k) || /\//.test(k)) keys.add(k);    // a file or path
      else if (/^[A-Za-z_][\w]*[A-Z_][\w]*$/.test(k) && k.length >= 6) keys.add(k); // camelCase / snake_case identifier
    }
  }
  return [...keys].filter((k) => !GENERIC.has(k.toLowerCase()) && k.length >= 4);
}

/** Index lessons; drop keys that appear in more than `share` of them (and in ≥3) — they point at nothing. */
export function buildIndex(lessons, share = 0.3) {
  const withKeys = lessons.map((l) => ({ ...l, keys: keysOf(l.text), gist: gist(l.text) }));
  const df = new Map();
  for (const l of withKeys) for (const k of new Set(l.keys)) df.set(k, (df.get(k) || 0) + 1);
  const cap = Math.max(3, Math.floor(withKeys.length * share));
  return withKeys.map((l) => ({ ...l, keys: l.keys.filter((k) => (df.get(k) || 0) < cap) })).filter((l) => l.keys.length);
}

/** Which key of which lesson this call touches. */
export function matchCall(index, call) {
  const hits = [];
  const rel = call.file ? call.file.replace(/\\/g, '/') : null;
  const words = new Set(call.words || []);
  const text = call.text || '';
  for (const l of index) {
    const key = l.keys.find((k) => {
      if (rel) {
        if (k.includes('/') ? (rel === k || rel.endsWith('/' + k) || k.endsWith('/' + rel)) : basename(rel) === k) return true;
      }
      if (words.has(k) || [...words].some((w) => w.includes('/') && (w === k || w.endsWith('/' + k)))) return true;
      if (/^[A-Za-z_]\w+$/.test(k) && text && new RegExp(`\\b${k}\\b`).test(text)) return true;
      return false;
    });
    if (key) hits.push({ lesson: l, key });
  }
  return hits;
}

// Commands that only read. Their arguments are not what the call is about: a `grep`
// over the board's index.html tripped the lesson about the board's blocked-session
// view (2026-09-28, the first noise the tripwire produced).
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'grep', 'rg', 'ag', 'ls', 'find', 'wc', 'stat',
  'file', 'diff', 'cmp', 'jq', 'awk', 'sort', 'uniq', 'cut', 'echo', 'printf', 'which', 'readlink', 'realpath', 'du', 'tree']);
const GIT_READERS = new Set(['log', 'show', 'diff', 'grep', 'blame', 'status', 'ls-files', 'rev-parse', 'cat-file']);

/** The words of a shell command that act on something — reads contribute none. */
export function shellActionWords(command) {
  const out = [];
  for (const c of simpleCommands(command)) {
    const w = c.words.map((x) => x.replace(/^\.\//, ''));
    const cmd = base(w[0] || '');
    if (READERS.has(cmd)) continue;
    if (cmd === 'sed' && !w.some((x) => /^-[A-Za-z]*i|^--in-place/.test(x))) continue;
    if (cmd === 'git' && w.slice(1).some((x) => GIT_READERS.has(x)) && !w.some((x) => ['checkout', 'restore', 'reset', 'rm', 'mv'].includes(x))) continue;
    out.push(...w);
  }
  return out;
}

export function formatHits(hits) {
  if (!hits.length) return '';
  const parts = hits.slice(0, MAX_LESSONS).map(({ lesson, key }) =>
    `- "${lesson.title}" (touches \`${key}\`): ${lesson.gist.length > 280 ? lesson.gist.slice(0, 279) + '…' : lesson.gist}`);
  const text = `great_cto lesson-tripwire — a recorded lesson is about what this call touches:\n${parts.join('\n')}`;
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 1) + '…' : text;
}

function projectRoot(from) {
  let d = resolve(from);
  for (;;) {
    if (existsSync(join(d, '.great_cto'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** Lessons already shown this session, and a way to record the ones shown now. */
function seenStore(session) {
  const f = session ? join(tmpdir(), `great_cto-lesson-tripwire-${String(session).replace(/[^A-Za-z0-9_-]/g, '')}.json`) : null;
  let seen = [];
  if (f) { try { seen = JSON.parse(readFileSync(f, 'utf8')); } catch { /* first */ } }
  return {
    has: (id) => seen.includes(id),
    add: (ids) => { if (f) { try { writeFileSync(f, JSON.stringify([...seen, ...ids].slice(-200))); } catch { /* best effort */ } } },
  };
}

/**
 * The reminder for one tool-call payload, as a value (scripts/lib/guard-result.mjs):
 * never blocks, at most adds context. Wrapped so a broken lessons file costs the
 * reminder, not the call.
 */
export function run(raw, env = process.env) {
  try { return remind(raw, env) || PASS; } catch { return PASS; }
}

function remind(raw, env) {
  if (env.GREAT_CTO_DISABLE_LESSON_TRIPWIRES === '1') return null;
  let p;
  try { p = JSON.parse(raw || '{}'); } catch { return null; }
  const cwd = p.cwd || process.cwd();
  const root = projectRoot(cwd) || cwd;
  const sources = [join(root, '.great_cto', 'lessons.md'), join(homedir(), '.great_cto', 'lessons.md')];
  const lessons = sources.flatMap((f) => { try { return splitLessons(readFileSync(f, 'utf8')); } catch { return []; } });
  if (!lessons.length) return null;
  const index = buildIndex(lessons);

  const ti = p.tool_input || {};
  let call;
  if (p.tool_name === 'Bash') {
    call = { words: shellActionWords(String(ti.command || '')) };
  } else if (['Edit', 'Write', 'MultiEdit'].includes(p.tool_name) && ti.file_path) {
    const abs = isAbsolute(ti.file_path) ? ti.file_path : resolve(cwd, ti.file_path);
    const text = [ti.new_string, ti.content, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string) : [])].filter(Boolean).join('\n');
    call = { file: relative(root, abs), text };
  } else return null;

  const seen = seenStore(p.session_id);
  const fresh = matchCall(index, call).filter((h) => !seen.has(h.lesson.title)).slice(0, MAX_LESSONS);
  const out = formatHits(fresh);
  if (!out) return null;
  seen.add(fresh.map((h) => h.lesson.title));
  if (existsSync(join(root, '.great_cto'))) {
    appendEvent(join(root, '.great_cto'), { kind: 'hint', hook: 'lesson-tripwire', session: p.session_id, tool: p.tool_name,
      paths: call.file ? [call.file] : [], chars: out.length, host: env.GREAT_CTO_HOST === 'codex' ? 'codex' : 'claude' });
  }
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: out } }), stderr: '' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  emit({ ...run(readStdinOnce()), code: 0 });
}
