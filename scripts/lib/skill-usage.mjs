#!/usr/bin/env node
/**
 * skill-usage — which great_cto skills (skills/<name>/SKILL.md) are really used,
 * read from Claude Code's own session logs (`~/.claude/projects/<p>/<s>.jsonl`
 * and `<p>/<s>/subagents/*.jsonl`). The skill counterpart of agent-usage.mjs:
 * agents had a usage count, a lint and a retire loop; skills had none of the three.
 *
 * Per skill, three ways a skill reaches a model:
 *   invoked    a `Skill` tool_use whose input.skill names it
 *   preloaded  a subagent's `skills:` preload — an isMeta user message carrying
 *              `<command-name>NAME</command-name>` before the subagent's first model
 *              turn (see agent-speed.mjs for the subagent transcript layout)
 *   read       a Read of `skills/NAME/SKILL.md`, or a Bash cat/head/tail/sed/less of it
 *
 * `great-cto:NAME`, `great_cto:NAME` and bare `NAME` are the same skill; another
 * plugin's `superpowers:brainstorming` is not ours even though the bare name is.
 *
 * Rules:
 *  - Read-only on the logs, streamed line by line (they are gigabytes); only lines
 *    that mention `"Skill"`, `command-name` or `SKILL.md` are parsed, and a file
 *    last modified before --since is not opened.
 *  - Scripted sessions (project dir under a temp directory: benchmarks, eval
 *    sandboxes, `claude -p` probes) are excluded unless includeScripted — the same
 *    rule as request-quality.mjs.
 *  - Output is numbers and skill names only: never message text, paths or project names.
 *  - `unavailable` when the logs directory cannot be read — never zeros that read as disuse.
 *  - Local only: no network, no telemetry event.
 *
 * Usage:
 *   node scripts/lib/skill-usage.mjs [--since 2026-08-27] [--until 2026-09-26] [--include-scripted] [--json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = path.join(os.homedir(), '.claude', 'projects');

// Same rule as request-quality.mjs: sessions started in a temp directory are scripted.
const SCRIPTED = /^-(private-tmp|private-var-folders|tmp|var-folders)-/;
const OUR_PREFIX = /^(great-cto|great_cto):/;
const READER = /(^|[\s;&|(])(cat|head|tail|sed|less|more|bat|awk)\s/;
const SKILL_PATH = /(?:^|[\s"'`=/(])skills\/([A-Za-z0-9_.-]+)\/SKILL\.md\b/g;

const ts = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

/** Map a raw skill reference to one of ours, or null. */
export function skillOf(raw, known) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^\//, '');
  if (s.includes(':')) {
    if (!OUR_PREFIX.test(s)) return null;
    s = s.replace(OUR_PREFIX, '');
  }
  return known.has(s) ? s : null;
}

function transcripts(root, includeScripted) {
  const out = [];
  let projects = [];
  try { projects = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    if (!includeScripted && SCRIPTED.test(p.name)) continue;
    const pdir = path.join(root, p.name);
    let entries = [];
    try { entries = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push({ file: path.join(pdir, e.name), subagent: false });
      else if (e.isDirectory()) {
        const sdir = path.join(pdir, e.name, 'subagents');
        let subs = [];
        try { subs = fs.readdirSync(sdir); } catch { continue; }
        for (const f of subs) if (f.endsWith('.jsonl')) out.push({ file: path.join(sdir, f), subagent: true });
      }
    }
  }
  return out;
}

/**
 * Skills whose SKILL.md `text` names, when the path sits in a great_cto tree: an
 * absolute path must itself run through one (repo, worktree or plugin cache); a
 * relative one counts only when the session ran in a great_cto checkout.
 */
function skillPaths(text, cwd, known) {
  const out = [];
  const str = String(text);
  for (const m of str.matchAll(SKILL_PATH)) {
    const name = m[1];
    if (!known.has(name)) continue;
    const at = m.index + m[0].indexOf('skills/');
    const head = str.slice(0, at).split(/[\s"'`=(]/).pop(); // the path before `skills/`
    const ours = head.startsWith('/') || head.startsWith('~') ? /great[-_]cto/.test(head) : /great[-_]cto/.test(String(cwd || ''));
    if (ours) out.push(name);
  }
  return out;
}

/** Stream one transcript; call `hit(name, kind, timestamp)` for each skill event. */
async function readTranscript({ file, subagent }, known, hit) {
  let leading = subagent; // preloads sit before a subagent's first model turn
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (leading && line.includes('"type":"assistant"')) {
      try { if (JSON.parse(line).type === 'assistant') leading = false; } catch { /* not JSON */ }
    }
    if (!line.includes('"Skill"') && !line.includes('command-name') && !line.includes('SKILL.md')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const t = typeof d.timestamp === 'string' ? d.timestamp : null;
    const content = d?.message?.content;
    if (d.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (c?.type !== 'tool_use') continue;
        if (c.name === 'Skill') {
          const s = skillOf(c.input?.skill, known);
          if (s) hit(s, 'invoked', t);
        } else if (c.name === 'Read' && typeof c.input?.file_path === 'string') {
          for (const s of skillPaths(c.input.file_path, d.cwd, known)) hit(s, 'read', t);
        } else if (c.name === 'Bash' && typeof c.input?.command === 'string' && READER.test(c.input.command)) {
          for (const s of new Set(skillPaths(c.input.command, d.cwd, known))) hit(s, 'read', t);
        }
      }
    } else if (d.type === 'user' && leading && d.isMeta === true) {
      const parts = Array.isArray(content) ? content : [{ type: 'text', text: content }];
      for (const p of parts) {
        const m = typeof p?.text === 'string' ? p.text.match(/<command-name>([^<]+)<\/command-name>/) : null;
        const s = m ? skillOf(m[1], known) : null;
        if (s) hit(s, 'preloaded', t);
      }
    }
  }
}

/**
 * @param {{root?:string, skills:string[], since?:string|null, until?:string|null, includeScripted?:boolean}} opts
 * @returns {Promise<{state:'counted'|'unavailable', why?:string, transcripts:number,
 *   window:{since:string|null,until:string|null},
 *   skills:Record<string,{invoked:number,preloaded:number,read:number,lastSeen:string|null}>, never:string[]}>}
 */
export async function skillUsage({ root = DEFAULT_ROOT, skills = [], since = null, until = null, includeScripted = false } = {}) {
  let isDir = false;
  try { isDir = fs.statSync(root).isDirectory(); } catch { /* absent */ }
  if (!isDir) {
    return { state: 'unavailable', why: 'no Claude Code session logs on this machine', transcripts: 0, window: { since, until }, skills: {}, never: [] };
  }
  const lo = since ? ts(since) : null;
  const hi = until ? ts(until) : null;
  const known = new Set(skills);
  const out = {};
  for (const s of skills) out[s] = { invoked: 0, preloaded: 0, read: 0, lastSeen: null };
  const hit = (s, kind, t) => {
    const at = t ? ts(t) : null;
    if ((lo !== null || hi !== null) && at === null) return;
    if (lo !== null && at < lo) return;
    if (hi !== null && at >= hi) return;
    out[s][kind]++;
    if (t && (!out[s].lastSeen || t > out[s].lastSeen)) out[s].lastSeen = t;
  };
  let n = 0;
  for (const tr of transcripts(root, includeScripted)) {
    if (lo !== null) {
      try { if (fs.statSync(tr.file).mtimeMs < lo) continue; } catch { continue; }
    }
    n++;
    try { await readTranscript(tr, known, hit); } catch { /* unreadable transcript: skipped, not counted as empty */ }
  }
  const never = skills.filter((s) => out[s].invoked + out[s].preloaded + out[s].read === 0);
  return { state: 'counted', transcripts: n, window: { since, until }, skills: out, never };
}

/** The repo's skills: directories under skills/ that hold a SKILL.md. */
export function repoSkills(repoRoot) {
  try {
    return fs.readdirSync(path.join(repoRoot, 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(repoRoot, 'skills', e.name, 'SKILL.md')))
      .map((e) => e.name).sort();
  } catch { return []; }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const u = await skillUsage({ skills: repoSkills(repoRoot), since: opt('--since'), until: opt('--until'), includeScripted: a.includes('--include-scripted') });
  if (a.includes('--json')) { process.stdout.write(`${JSON.stringify(u, null, 2)}\n`); process.exit(0); }
  if (u.state !== 'counted') { process.stdout.write(`skill-usage: ${u.why}\n`); process.exit(0); }
  const total = (v) => v.invoked + v.preloaded + v.read;
  const rows = Object.entries(u.skills).filter(([, v]) => total(v) > 0).sort((x, y) => total(y[1]) - total(x[1]) || x[0].localeCompare(y[0]));
  process.stdout.write(`skill-usage: ${rows.length} of ${Object.keys(u.skills).length} skills seen · ${u.transcripts} transcripts · window ${u.window.since ?? 'all'} → ${u.window.until ?? 'now'}\n`);
  process.stdout.write(`${'skill'.padEnd(32)}${'invoked'.padStart(8)}${'preload'.padStart(8)}${'read'.padStart(6)}  last seen\n`);
  for (const [k, v] of rows) {
    process.stdout.write(`${k.padEnd(32)}${String(v.invoked).padStart(8)}${String(v.preloaded).padStart(8)}${String(v.read).padStart(6)}  ${v.lastSeen ? v.lastSeen.slice(0, 10) : '—'}\n`);
  }
  process.stdout.write(`never seen in window (${u.never.length}): ${u.never.join(', ') || '—'}\n`);
}
