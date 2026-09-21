/**
 * ship-evidence — what the verdict logs say about whether gate:ship may pass.
 *
 * Read across the 16 projects with verdicts on the measuring machine (2026-09-21):
 *
 *  - a healthcare-reviewer BLOCKED was never followed by a later verdict of its
 *    own, and the task it blocked was closed an hour later;
 *  - 11 of the 16 had no qa-engineer verdict at all;
 *  - great_cto's own last QA verdict was three weeks older than its last ship.
 *
 * gate-check read Beads task states and required domain reviewers; it read no
 * verdict's VALUE. This does, three rules:
 *
 *  1. An agent whose LATEST verdict is negative (BLOCKED, FAIL, REJECTED, REWORK)
 *     has an open finding. A later positive verdict from the same agent closes it.
 *  2. qa-engineer and security-officer must each have a positive latest verdict.
 *  3. QA's must be newer than the last commit that changed code — a QA verdict
 *     from before the change it is supposed to cover is not evidence about it.
 *
 * Agent names are read from the log's file name and normalised: the same agent
 * was found logged as `code-reviewer`, `great-cto:code-reviewer`,
 * `great_cto:code-reviewer`, and QA as both `qa` and `qa-engineer`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseVerdictLog } from './verdict-record.mjs';

export const MANDATORY_FOR_SHIP = ['qa-engineer', 'security-officer'];

const ALIASES = { qa: 'qa-engineer', security: 'security-officer', sec: 'security-officer' };

/** `great-cto:qa`, `great_cto:qa-engineer`, `qa` → `qa-engineer`. */
export function canonicalAgent(name) {
  const bare = String(name || '').trim().toLowerCase().replace(/^.*:/, '').replace(/\.log$/, '');
  return ALIASES[bare] || bare;
}

/** negative | positive | neutral, from a verdict value in any dialect written so far. */
export function verdictKind(v) {
  const s = String(v || '').toUpperCase();
  if (/^(BLOCKED|FAIL|FAILED|REJECTED|REWORK)\b/.test(s)) return 'negative';
  // `APPROVED_WITH_DEFERRED_CRITICALS` and friends are approvals that name open
  // criticals; they are not a clean pass and are read as negative.
  if (/^APPROVED.*(DEFERRED|CRITICAL)/.test(s)) return 'negative';
  if (/^(APPROVED|PASS|PASSED|DONE|OK)\b/.test(s)) return 'positive';
  return 'neutral';
}

const tsOf = (ts) => { const t = Date.parse(ts); return Number.isFinite(t) ? t : null; };

/**
 * The latest verdict per agent in `<dir>/.great_cto/verdicts/`.
 * `gate:*.log` files record gate decisions, not an agent's verdict, and are skipped.
 * @returns {Map<string, {verdict:string, ts:string, kind:string}>}
 */
export function latestVerdicts(projectDir) {
  const dir = join(projectDir, '.great_cto', 'verdicts');
  const out = new Map();
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log') && !f.startsWith('gate')); } catch { return out; }
  for (const f of files) {
    const agent = canonicalAgent(f);
    let text = '';
    try { text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    for (const rec of parseVerdictLog(text, { agent }).records) {
      const t = tsOf(rec.ts);
      if (t === null) continue;
      const prev = out.get(agent);
      if (!prev || t >= tsOf(prev.ts)) out.set(agent, { verdict: rec.verdict, ts: rec.ts, kind: verdictKind(rec.verdict) });
    }
  }
  return out;
}

/** ISO time of the last commit that changed something other than docs and pipeline records. */
export function lastCodeChange(projectDir) {
  const r = spawnSync('git', ['log', '-1', '--format=%cI', '--', '.',
    ':(exclude).great_cto', ':(exclude)docs', ':(exclude)*.md', ':(exclude).beads'],
  { cwd: projectDir, encoding: 'utf8', timeout: 10_000 });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/**
 * @param {Map} latest            from latestVerdicts()
 * @param {string|null} lastChange from lastCodeChange()
 * @param {{as?: string}} opts    `as`: the agent running this check about its own
 *                                verdict — its own latest is not held against it.
 * @returns {{agent:string, why:string}[]} what blocks gate:ship, each with its reason
 */
export function shipBlockers(latest, lastChange, { as } = {}) {
  const self = as ? canonicalAgent(as) : null;
  const out = [];
  for (const [agent, v] of latest) {
    if (agent === self || v.kind !== 'negative') continue;
    out.push({ agent, why: `latest verdict ${v.verdict} (${v.ts}) — no later verdict from ${agent} closes it` });
  }
  for (const agent of MANDATORY_FOR_SHIP) {
    if (agent === self) continue;
    const v = latest.get(agent);
    if (!v) { out.push({ agent, why: 'no verdict in this project' }); continue; }
    if (v.kind === 'neutral') out.push({ agent, why: `latest verdict ${v.verdict} is not a pass` });
  }
  const qa = latest.get('qa-engineer');
  if (self !== 'qa-engineer' && qa && qa.kind === 'positive' && lastChange && tsOf(qa.ts) !== null && tsOf(qa.ts) < tsOf(lastChange)) {
    out.push({ agent: 'qa-engineer', why: `QA verdict ${qa.ts} predates the last code change ${lastChange} — re-run QA on what ships` });
  }
  return out;
}
