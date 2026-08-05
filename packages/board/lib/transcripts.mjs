// Session transcripts — what the agent actually did, as opposed to what it
// concluded.
//
// The board reports outcomes: verdicts, gates, cost, tasks. It has never touched
// the 2 GB of session transcripts sitting in ~/.claude/projects, which are the
// only record of HOW an outcome was reached — the tool calls, the retries, the
// edits, the turn where it went wrong.
//
// The value of that record was demonstrated the hard way this week. Three
// separate times a low eval score was read as an agent gap and turned out to be
// the harness: a token cap that truncated every answer, a one-shot actor that
// could not look anything up, a fixture with no approved gate. Each was found by
// reading what the agent did, and each cost a day of the wrong repair first.
//
// Deliberately narrow, and deliberately read-only:
//
//   - one format, ours. agentsview parses fifty; we have Claude Code's JSONL and
//     no reason to guess at the others.
//   - no index, no database. A session file is read when someone opens it. The
//     board is zero-dependency and stays that way.
//   - nothing is written back. A transcript is evidence; a tool that edits
//     evidence is not one.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Claude Code's per-project session directory, keyed by a slugified cwd. */
export function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * cwd → the directory name Claude Code derives from it.
 *
 * Every character outside [A-Za-z0-9-] becomes a hyphen, underscores included:
 * `/Users/x/development/Personal/great_cto` is stored as
 * `-Users-x-development-Personal-great-cto`. Deriving this from the observed
 * directory names rather than guessing, because a slug that is nearly right
 * silently lists zero sessions and looks like a project with no history.
 */
export function slugForCwd(cwd) {
  return String(cwd || '').replace(/[^A-Za-z0-9-]/g, '-');
}

function readJsonl(file, { limit = Infinity } = {}) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (out.length >= limit) break;
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    // A truncated append is the normal state of a file being written to right
    // now. Skipping the line is right; failing the read is not.
    try { out.push(JSON.parse(t)); } catch { /* partial write */ }
  }
  return out;
}

/**
 * Sessions for a project, newest first.
 *
 * Metadata only — each entry costs one stat and a bounded head-read, so listing
 * a project with a hundred sessions does not read a hundred megabytes.
 */
export function listSessions(cwd, { root = projectsRoot() } = {}) {
  const dir = path.join(root, slugForCwd(cwd));
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { return []; }

  return files.map((f) => {
    const full = path.join(dir, f);
    let stat;
    try { stat = fs.statSync(full); } catch { return null; }

    // The title lives in a `custom-title` record that can appear anywhere, and
    // rewriting it appends a new one — so the LAST is current. Read a bounded
    // head and accept not finding it rather than scanning a 40 MB file for a
    // label.
    const head = readJsonl(full, { limit: 400 });
    const titles = head.filter((r) => r.type === 'custom-title' && r.customTitle);
    const firstUser = head.find((r) => r.type === 'user' && !r.isCompactSummary);

    return {
      id: f.replace(/\.jsonl$/, ''),
      file: full,
      title: titles.length ? titles[titles.length - 1].customTitle : null,
      // Falling back to the opening prompt: a session with no title is still
      // recognisable by what it was asked to do.
      opened_with: firstUser ? messageText(firstUser).slice(0, 120) : null,
      size_bytes: stat.size,
      modified: stat.mtime.toISOString(),
    };
  }).filter(Boolean).sort((a, b) => b.modified.localeCompare(a.modified));
}

/** A message record → plain text, whatever content shape it carries. */
export function messageText(rec) {
  const c = rec?.message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n').trim();
}

/** Tool calls in an assistant record, as {name, input}. */
export function toolCalls(rec) {
  const c = rec?.message?.content;
  if (!Array.isArray(c)) return [];
  return c.filter((b) => b?.type === 'tool_use').map((b) => ({ name: b.name, input: b.input ?? {} }));
}

/**
 * One session as a readable turn list.
 *
 * Bookkeeping records — `mode`, `queue-operation`, `last-prompt`, `custom-title`
 * — are dropped: they describe the client's state, not the work. `system` is
 * kept, because a compaction or an error is part of how the session went.
 */
export function readSession(file, { limit = 2000 } = {}) {
  const KEEP = new Set(['user', 'assistant', 'system']);
  const turns = [];
  for (const rec of readJsonl(file)) {
    if (!KEEP.has(rec.type)) continue;
    const tools = toolCalls(rec);
    const text = messageText(rec);
    if (!text && !tools.length && rec.type !== 'system') continue;
    turns.push({
      role: rec.type,
      ts: rec.timestamp ?? null,
      text,
      tools: tools.map((t) => t.name),
      // The whole input is not carried — a file write's content can be
      // megabytes, and the panel wants to show what was called, not replay it.
      tool_detail: tools.map((t) => ({ name: t.name, target: t.input?.file_path ?? t.input?.path ?? t.input?.command ?? null })),
      subtype: rec.subtype ?? null,
    });
    if (turns.length >= limit) break;
  }
  return turns;
}

/**
 * Files this session edited, newest first.
 *
 * Read from the Edit/Write tool calls rather than from git, so it shows what the
 * agent touched even when nothing was committed — which is exactly the case
 * where a reader is trying to work out what happened.
 */
export function editedFiles(file) {
  const EDIT = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
  const seen = new Map();
  for (const rec of readJsonl(file)) {
    if (rec.type !== 'assistant') continue;
    for (const t of toolCalls(rec)) {
      if (!EDIT.has(t.name)) continue;
      const p = t.input?.file_path ?? t.input?.path;
      if (!p) continue;
      const prev = seen.get(p);
      seen.set(p, { path: p, tool: t.name, edits: (prev?.edits ?? 0) + 1, last: rec.timestamp ?? prev?.last ?? null });
    }
  }
  return [...seen.values()].sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

/**
 * Search a project's transcripts for a string.
 *
 * Plain substring, case-insensitive, capped. No index and no embedding: the
 * question this answers is "where did I see that", and grep answers it at a
 * scale of gigabytes without a database to keep in sync.
 */
export function searchSessions(cwd, query, { root = projectsRoot(), limit = 50 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 3) return { query: q, hits: [], note: 'a query under 3 characters matches everything' };

  const hits = [];
  for (const s of listSessions(cwd, { root })) {
    for (const rec of readJsonl(s.file)) {
      if (hits.length >= limit) break;
      const text = messageText(rec);
      if (!text) continue;
      const at = text.toLowerCase().indexOf(q);
      if (at === -1) continue;
      hits.push({
        session: s.id,
        title: s.title,
        role: rec.type,
        ts: rec.timestamp ?? null,
        // A window around the match, not the whole turn — a turn can be a
        // thousand lines and the reader wants to know whether to open it.
        excerpt: text.slice(Math.max(0, at - 60), at + q.length + 120).replace(/\s+/g, ' ').trim(),
      });
    }
    if (hits.length >= limit) break;
  }
  return { query: q, hits, truncated: hits.length >= limit };
}
