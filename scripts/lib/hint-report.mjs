#!/usr/bin/env node
// hint-report — how often the context hooks spoke, and on what.
//
// edit-impact and lesson-tripwire put text in front of the model before a call. A
// hint that fires on every other call is noise the model learns to skip; one that
// never fires is dead weight. Neither is visible from inside a session, so each hint
// is recorded as a `hint` event (agent-events.mjs: which hook, which file, how long,
// which host — never what it said) and this reads them back.
//
// Reads <project>/.great_cto/events.jsonl (and the rotated events.1.jsonl) for every
// project in ~/.great_cto/projects.json plus the current directory. Local, read-only,
// numbers and paths only.
//
// Usage: node scripts/lib/hint-report.mjs [--since 2026-09-28] [--json]

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every hint event in these projects' logs, newest window only. */
export function collectHints(projectDirs, { since = null } = {}) {
  const out = [];
  const floor = since ? Date.parse(since) : -Infinity;
  for (const dir of new Set(projectDirs.map((d) => resolve(d)))) {
    for (const f of ['events.1.jsonl', 'events.jsonl']) {
      let text = '';
      try { text = readFileSync(join(dir, '.great_cto', f), 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"hint"')) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.kind !== 'hint' || !(Date.parse(e.ts) >= floor)) continue;
        out.push({ ...e, project: dir });
      }
    }
  }
  return out;
}

/** Per hook: fires, sessions, fires per session, mean length, top files, hosts. */
export function summarize(hints) {
  const by = new Map();
  for (const h of hints) {
    const k = h.hook || 'unknown';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(h);
  }
  const hooks = {};
  for (const [hook, xs] of by) {
    const sessions = new Set(xs.map((x) => x.session).filter(Boolean));
    const files = new Map();
    for (const x of xs) for (const p of x.paths || []) files.set(p, (files.get(p) || 0) + 1);
    const hosts = {};
    for (const x of xs) hosts[x.host || 'claude'] = (hosts[x.host || 'claude'] || 0) + 1;
    hooks[hook] = {
      fires: xs.length,
      sessions: sessions.size,
      perSession: sessions.size ? Math.round((xs.length / sessions.size) * 10) / 10 : null,
      meanChars: Math.round(xs.reduce((a, x) => a + (x.chars || 0), 0) / xs.length),
      topFiles: [...files].sort((a, b) => b[1] - a[1]).slice(0, 5),
      hosts,
    };
  }
  return { total: hints.length, hooks };
}

export function formatReport(s, since) {
  if (!s.total) return `hint-report${since ? ` since ${since}` : ''}: no hints recorded yet — they are logged from 3.45.0 on, in projects with a .great_cto directory.`;
  const lines = [`hint-report${since ? ` since ${since}` : ''}: ${s.total} hint(s)`];
  for (const [hook, h] of Object.entries(s.hooks)) {
    lines.push(`  ${hook}: ${h.fires} in ${h.sessions} session(s) · ${h.perSession ?? '—'} per session · ${h.meanChars} chars on average · ${Object.entries(h.hosts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    for (const [f, n] of h.topFiles) lines.push(`      ${n}× ${f}`);
  }
  lines.push('Read it as: many per session = narrow the keys; one file dominating = check that lesson or import graph; none = the hook may be dead.');
  return lines.join('\n');
}

function registeredProjects() {
  try {
    const reg = JSON.parse(readFileSync(join(homedir(), '.great_cto', 'projects.json'), 'utf8'));
    return (reg.projects || []).map((p) => p.path).filter((p) => typeof p === 'string' && existsSync(p));
  } catch { return []; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const since = a.includes('--since') ? a[a.indexOf('--since') + 1] : null;
  const s = summarize(collectHints([...registeredProjects(), process.cwd()], { since }));
  process.stdout.write(a.includes('--json') ? `${JSON.stringify(s, null, 2)}\n` : `${formatReport(s, since)}\n`);
}
