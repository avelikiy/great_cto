#!/usr/bin/env node
/**
 * subagent-row — the row Claude Code's agent panel shows for a running
 * great_cto stage.
 *
 * Wired in by `subagentStatusLine` in the plugin's settings.json. The host runs
 * this once per refresh tick with every visible subagent as `tasks` on stdin,
 * and renders `{"id", "content"}` lines as the row bodies. A task this prints
 * nothing for keeps the host's default row.
 *
 * Why it exists. The default row is `name · description · token count`, and in
 * a real session two things about great_cto were invisible in it: one agent
 * answered to two names (`senior-dev` and `great-cto:senior-dev`), and forty
 * `general-purpose` translators looked exactly like pipeline stages.
 *
 * What it will not do is the whole design:
 *
 *   - It does not claim a stage it cannot find. Only a name in `agents/*.md`
 *     gets the ◆ row; anything else keeps the default, rather than being
 *     dressed up as part of the pipeline.
 *   - It does not print a value that was not reported. A missing model,
 *     start time or token count is left out — never rendered as `undefined`,
 *     `NaN` or `0k`. A token count of zero that WAS reported is shown, because
 *     a measured zero and an absent measurement are different facts.
 *   - It does not break the panel. Input it cannot read produces no overrides
 *     and exit 0; the host falls back to its own rows.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Agent names shipped in `agents/`. Shared prompt fragments are not agents. */
export function greatCtoAgents(dir) {
  try {
    return new Set(readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => f.slice(0, -3)));
  } catch { return new Set(); }
}

/** One agent, one name: the host prefixes plugin agents with the plugin's name. */
export function normalizeType(type) {
  return String(type ?? '').replace(/^great[-_]cto:/i, '').trim();
}

// East Asian wide and fullwidth ranges occupy two terminal columns. Counting
// them as one lets a row of CJK text overrun the width the host allotted.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const colsOf = (ch) => (WIDE.test(ch) ? 2 : 1);

/** Terminal columns a string occupies. */
export function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += colsOf(ch);
  return w;
}

function fit(s, columns) {
  if (!Number.isFinite(columns) || columns <= 0 || displayWidth(s) <= columns) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    if (w + colsOf(ch) > columns - 1) break;
    out += ch;
    w += colsOf(ch);
  }
  return `${out}…`;
}

/** Epoch milliseconds from epoch ms, epoch seconds, or an ISO string — or null. */
function startMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

function compact(n) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// A running stage's status is what the panel already implies; repeating it is
// noise. Anything else — completed, failed, a value we have not seen — is news.
const SILENT = /^(running|in[_-]?progress|active)$/i;

/**
 * The row body for one task, or null to keep the host's default row.
 *
 * @param {object} task    one entry of the host's `tasks` array
 * @param {{agents: Set<string>, columns?: number, now?: number}} opts
 * @returns {string|null}
 */
export function rowContent(task, { agents, columns, now = Date.now() } = {}) {
  if (!task || typeof task !== 'object') return null;
  const name = normalizeType(task.type || task.name);
  if (!name || !agents?.has(name)) return null;

  const meta = [];
  if (typeof task.model === 'string' && task.model) meta.push(task.model.replace(/^claude-/, ''));
  const start = startMs(task.startTime);
  const elapsed = start == null ? null : duration(now - start);
  if (elapsed) meta.push(elapsed);
  if (Number.isFinite(task.tokenCount)) {
    const window = task.contextWindowSize;
    meta.push(Number.isFinite(window) && window > 0
      ? `${compact(task.tokenCount)}/${compact(window)}`
      : compact(task.tokenCount));
  }
  if (typeof task.status === 'string' && task.status && !SILENT.test(task.status)) meta.push(task.status);

  const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const desc = pick(task.description) || pick(task.label);

  let s = `◆ ${name}`;
  if (meta.length) s += `  ${meta.join(' · ')}`;
  if (desc) s += `${meta.length ? ' · ' : '  '}${desc}`;
  return fit(s, columns);
}

/** Override lines for the whole panel: one JSON line per great_cto task. */
export function render(input, { agents, now = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.tasks)) return [];
  const columns = Number(input.columns);
  const out = [];
  for (const t of input.tasks) {
    if (!t || typeof t !== 'object' || t.id == null) continue;
    const content = rowContent(t, { agents, columns, now });
    if (content != null) out.push(JSON.stringify({ id: t.id, content }));
  }
  return out;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  const agents = greatCtoAgents(resolve(dirname(fileURLToPath(import.meta.url)), '../../agents'));
  const lines = render(input, { agents });
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
}

// Compared through realpath: on macOS /tmp is a symlink to /private/tmp, and a
// plain string comparison silently skips main() when invoked through the link.
const invokedDirectly = (() => {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
})();
if (invokedDirectly) main();
