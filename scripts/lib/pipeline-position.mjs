#!/usr/bin/env node
/**
 * pipeline-position — the pull view over the state pipeline-dispatcher.mjs
 * pushes.
 *
 * Why this exists
 * ---------------
 * `pipeline-dispatcher.mjs` computes "what runs next" but only as a
 * PostToolUse hook, the instant a subagent finishes. There is no way to
 * *ask* "where are we?" at an arbitrary moment — after a compaction, at
 * session start, or when a run stalled hours ago. This module answers that,
 * from the exact same state: `shared/pipeline.toml`, the verdict logs, and
 * the project's active gates.
 *
 * It never disagrees with the dispatcher's directive because it never
 * re-derives the transition decision — `pipelinePosition()` delegates the
 * blocked / gate / next / join-wait / done question to the dispatcher's own
 * exported `decideNext`, and only translates its `kind` into a position
 * report (ARCH-pipeline-position.md, D1; ADR-010).
 *
 * Two things this lib does differently from the dispatcher on purpose:
 *
 *  1. It reads EVERY known agent's latest verdict regardless of age, and
 *     labels each fresh/stale, instead of reusing the dispatcher's 30-min
 *     `latestVerdict` filter. A 3-day-old `architect` verdict with nothing
 *     after it is the true position ("stalled at architect for 3 days") —
 *     hiding it would answer "nothing is happening" (D2).
 *
 *  2. It reads the agent identity from the verdict LINE, not the log
 *     filename. A real `.great_cto/verdicts/` holds `2026-06-27.log`
 *     carrying a `project-auditor` verdict and an empty `senior-dev.log`;
 *     trusting the filename would treat a date as an agent and mask the
 *     stage that actually ran (mirrors `newestStage()` in
 *     `scripts/hooks/pipeline-stall-guard.mjs`).
 *
 * Read-only: no writes, no spawns, no network (ARCH Safeguards S2). It only
 * reads `shared/pipeline.toml`, `<dir>/verdicts/*.log`, and `<dir>/PROJECT.md`.
 *
 * I/O:
 *   node scripts/lib/pipeline-position.mjs [--json] [--dir <projdir>] [--exit-code]
 *   default: human table + one-line summary, exit 0.
 *   --json: the structured object documented below, exit 0.
 *   --dir: project dir for verdicts/ and PROJECT.md (default .great_cto).
 *   --exit-code: exit 2 when position === 'blocked', else 0 (off by default —
 *     this tool stays purely informational unless asked to gate a script).
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePipelineToml, parseVerdictLine, normalizeAgent, decideNext, FRESH_MS,
} from '../hooks/pipeline-dispatcher.mjs';
import { gatesForApprovalLevel, levelFromProjectMd } from './approval-level.mjs';

// Any verdict of BLOCKED / FAIL / REJECTED halts the chain at that stage —
// documented in shared/pipeline.toml's own header comment and pinned by
// tests/hooks/pipeline-dispatcher.test.mjs. Not exported from the dispatcher
// today (only `FRESH_MS` is, per this task's scope), so this is a small,
// stable, tested-for-parity copy used for DISPLAY (stage status, pending join
// partners) — decideNext remains the sole authority on `kind` (S3).
const BLOCKED_TOKENS = new Set(['BLOCKED', 'FAIL', 'FAILED', 'REJECTED']);

// decideNext's own fallback rule for an unmapped "*-reviewer" agent (see
// "unmapped *-reviewer falls back to sign-off → senior-dev rule" in
// tests/hooks/pipeline-dispatcher.test.mjs). Mirrored here only to read
// `.next` for the `next` display field when `transitions` has no entry for
// the agent; decideNext applies the identical fallback internally for `kind`,
// so the two cannot disagree (pinned by the S3 tests in this module's suite).
const REVIEWER_FALLBACK_RULE = { on: ['APPROVED', 'SIGNED-OFF', 'DONE'], next: ['senior-dev'] };

/**
 * Which of a rule's declared gate(s) are active at this project's approval
 * level. Mirrors decideNext's own gate-name matching (gate: prefix optional,
 * `activeGates == null` means "honour every declared gate") — the same
 * public contract `gateApplies()` in approval-level.mjs exposes for a single
 * gate; this is the array form over data already computed by the caller.
 */
function activeGatesOf(gateField, activeGates) {
  const list = Array.isArray(gateField) ? gateField : gateField ? [gateField] : [];
  return list
    .filter((g) => {
      if (!activeGates) return true;
      const bare = String(g).replace(/^gate:/, '');
      return activeGates.includes(bare) || activeGates.includes(g);
    })
    .map((g) => String(g).replace(/^gate:/, ''));
}

/** Join partners not yet satisfied — mirrors decideNext's own pendingJoin filter. */
function pendingJoinPartners(join, verdicts) {
  return (join || []).filter((j) => {
    const v = verdicts[j];
    return !v || BLOCKED_TOKENS.has(v.verdict);
  });
}

/**
 * Read every known agent's latest verdict from a verdicts directory,
 * regardless of age (D2 — this lib shows stale, it does not hide it).
 *
 * An agent is "known" if it's a key in `transitions`, or its name (from the
 * LINE, not the filename) ends in "-reviewer" — matching decideNext's own
 * fallback so a reviewer's verdict is never treated as a stray log.
 *
 * @param {string} dir - path to the verdicts directory
 * @param {{transitions?: object, now?: number, freshMs?: number}} opts
 * @returns {Object<string, {agent,verdict,ts,ageMs,fresh,canonical,hasCost}>}
 */
export function readAllVerdicts(dir, { transitions = {}, now = Date.now(), freshMs = FRESH_MS } = {}) {
  const out = {};
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log')); } catch { return out; }

  for (const f of files) {
    let body;
    try { body = readFileSync(join(dir, f), 'utf8').trim(); } catch { continue; }
    if (!body) continue; // e.g. an empty senior-dev.log — nothing recorded yet

    const lastLine = body.split('\n').pop();
    const parsed = parseVerdictLine(lastLine);
    if (!parsed) continue;

    // Agent identity comes from the LINE, not the filename.
    const agent = normalizeAgent(parsed.agent || f.replace(/\.log$/, ''));
    if (!agent) continue;

    const known = Boolean(transitions[agent]) || agent.endsWith('-reviewer');
    if (!known) continue; // stray log (e.g. a date-named file) — ignored

    let mtimeMs = now;
    try { mtimeMs = statSync(join(dir, f)).mtimeMs; } catch { /* fall back to now */ }

    const parsedTsMs = parsed.ts && !Number.isNaN(Date.parse(parsed.ts)) ? Date.parse(parsed.ts) : null;
    const effectiveMs = parsedTsMs ?? mtimeMs;
    const ageMs = now - effectiveMs;

    const entry = {
      agent,
      verdict: parsed.verdict,
      ts: new Date(effectiveMs).toISOString(),
      ageMs,
      fresh: ageMs <= freshMs,
      canonical: parsed.canonical,
      hasCost: parsed.hasCost,
    };

    // Two files resolving to the same agent (rare) — keep the newer event.
    if (!out[agent] || effectiveMs > Date.parse(out[agent].ts)) out[agent] = entry;
  }
  return out;
}

/**
 * The pipeline's stage order: a BFS from `product-owner` (the one agent
 * never named in another agent's `next`) following `next` edges — this is
 * the main chain. Off-chain contract-stage specialists (ai-prompt-architect,
 * db-migration-reviewer, design-advisor, performance-engineer,
 * growth-engineer — also never named in anyone's `next`, but not part of the
 * main chain) are appended only when they have a recorded verdict, per
 * ARCH-pipeline-position.md.
 *
 * @param {object} transitions
 * @param {object} [verdicts] - keyed by agent; presence gates off-chain nodes
 * @returns {string[]} agent names in pipeline order
 */
export function pipelineOrder(transitions, verdicts = {}) {
  const agents = Object.keys(transitions);
  const referenced = new Set();
  for (const a of agents) for (const n of (transitions[a]?.next || [])) referenced.add(n);
  const roots = agents.filter((a) => !referenced.has(a));
  const mainRoots = roots.includes('product-owner') ? ['product-owner'] : roots;
  const offChainRoots = roots.filter((r) => !mainRoots.includes(r));

  const order = [];
  const visited = new Set();
  const walk = (start, { onlyIfVerdict = false } = {}) => {
    const queue = [...start];
    while (queue.length) {
      const a = queue.shift();
      if (visited.has(a)) continue;
      if (onlyIfVerdict && !verdicts[a]) continue;
      visited.add(a);
      order.push(a);
      for (const n of (transitions[a]?.next || [])) queue.push(n);
    }
  };
  walk(mainRoots);
  for (const r of offChainRoots) walk([r], { onlyIfVerdict: true });
  return order;
}

/**
 * The pure position computation (ARCH-pipeline-position.md algorithm,
 * steps 4-8). No IO — `transitions`/`verdicts`/`activeGates` are supplied by
 * the caller (the CLI's `main()` below does the reading).
 *
 * @param {{transitions?: object, verdicts?: object, activeGates?: string[]|null, now?: number}} args
 * @returns {{
 *   cursor: {agent,verdict,ts,ageMs,fresh,canonical,hasCost} | null,
 *   position: 'blocked'|'awaiting-gate'|'ready-to-dispatch'|'join-wait'|'complete'|'no-verdict'|'idle',
 *   next: string[],
 *   gates: string[],
 *   stages: Array<{agent,status,verdict,ts,ageMs,fresh}>,
 *   summary: string,
 * }}
 */
export function pipelinePosition({ transitions = {}, verdicts = {}, activeGates = null, now = Date.now() } = {}) {
  // Cursor = the verdict entry with the newest event timestamp (D2).
  let cursor = null;
  for (const agent of Object.keys(verdicts)) {
    const v = verdicts[agent];
    if (!cursor || v.ts > cursor.ts) cursor = v;
  }

  let position;
  let next = [];
  let gates = [];
  let summary;

  if (!cursor) {
    position = 'idle';
    summary = 'Position: idle — no verdicts recorded yet.';
  } else {
    const rule = transitions[cursor.agent]
      || (cursor.agent.endsWith('-reviewer') ? REVIEWER_FALLBACK_RULE : null);

    const joinVerdicts = {};
    for (const j of (rule?.join || [])) joinVerdicts[j] = verdicts[j] || null;

    // The sole source of transition truth (S3) — this lib never re-decides
    // blocked/gate/next/join-wait/done itself.
    const decision = decideNext({
      agent: cursor.agent,
      transitions,
      verdict: { agent: cursor.agent, verdict: cursor.verdict, canonical: cursor.canonical, hasCost: cursor.hasCost },
      joinVerdicts,
      activeGates,
    });
    // decideNext returns null for an unrecognized verdict token (not blocked,
    // not in the rule's `on` list) — that is functionally "nothing to act
    // on", which is what `no-verdict` means from this lib's perspective too.
    const kind = decision?.kind ?? 'no-verdict';

    switch (kind) {
      case 'blocked':
        position = 'blocked';
        summary = `Position: blocked — ${cursor.agent} returned ${cursor.verdict}.`;
        break;
      case 'gate':
        position = 'awaiting-gate';
        next = rule?.next || [];
        gates = activeGatesOf(rule?.gate, activeGates);
        summary = `Position: awaiting-gate — ${cursor.agent} succeeded; `
          + `${next.join(', ')} behind ${gates.map((g) => `gate:${g}`).join(' + ')}.`;
        break;
      case 'next':
        position = 'ready-to-dispatch';
        next = rule?.next || [];
        summary = `Position: ready-to-dispatch — ${cursor.agent} succeeded; spawn ${next.join(', ')}.`;
        break;
      case 'join-wait':
        position = 'join-wait';
        next = pendingJoinPartners(rule?.join, verdicts);
        gates = activeGatesOf(rule?.gate, activeGates);
        summary = `Position: join-wait — ${cursor.agent} succeeded; waiting on ${next.join(', ')}.`;
        break;
      case 'done':
        position = 'complete';
        summary = `Position: complete — ${cursor.agent} succeeded; end of chain.`;
        break;
      case 'no-verdict':
      default:
        position = 'no-verdict';
        summary = `Position: no-verdict — ${cursor.agent}'s recorded verdict ("${cursor.verdict}") is not actionable.`;
        break;
    }

    // Surfaced beyond the ARCH's minimal cursor shape on purpose: a JSON
    // verdict line reads fine but silently zeroes /api/cost and stalls the
    // pipeline exactly like a missing verdict — the pull-view exists to
    // reveal that, not just echo decideNext's embedded prose note.
    if (cursor.canonical === false) {
      summary += ` NOTE: ${cursor.agent} wrote a non-canonical verdict line — cost tracking may be broken for this stage.`;
    }
  }

  const order = pipelineOrder(transitions, verdicts);
  const stages = order.map((agent) => {
    const v = verdicts[agent] || null;
    let status;
    if (v && BLOCKED_TOKENS.has(v.verdict)) status = 'blocked';
    else if (cursor && agent === cursor.agent) status = 'current';
    else if (next.includes(agent)) status = 'next';
    else if (v) status = 'done';
    else status = 'pending';
    return {
      agent, status,
      verdict: v?.verdict ?? null,
      ts: v?.ts ?? null,
      ageMs: v?.ageMs ?? null,
      fresh: v?.fresh ?? false,
    };
  });

  return { cursor, position, next, gates, stages, summary };
}

// ── CLI ──────────────────────────────────────────────────────────────────

const STAGE_ICON = { current: '▶', done: '✓', blocked: '✗', next: '→', pending: ' ' };

function renderHuman(result, { label, level }) {
  const lines = [`Pipeline: ${label}   (approval-level: ${level})`, ''];
  for (const s of result.stages) {
    const icon = STAGE_ICON[s.status] ?? ' ';
    const verdictCol = s.verdict ?? '—';
    const ageCol = s.ts ? `${Math.round(s.ageMs / 60000)}m ago${s.fresh ? '' : ' (stale)'}` : 'pending';
    const marker = s.status === 'current' ? '  ← current' : '';
    lines.push(`  ${icon} ${s.agent.padEnd(20)} ${String(verdictCol).padEnd(12)} ${ageCol}${marker}`);
  }
  lines.push('', result.summary);
  return lines.join('\n');
}

function readProjectLabel(projDir) {
  try {
    const text = readFileSync(join(projDir, 'PROJECT.md'), 'utf8');
    const m = text.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return 'project';
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const exitCodeMode = argv.includes('--exit-code');
  const dirFlagIdx = argv.indexOf('--dir');
  const projDir = dirFlagIdx > -1 ? argv[dirFlagIdx + 1] : (process.env.GREAT_CTO_DIR || '.great_cto');

  const pipelinePath = join('shared', 'pipeline.toml');
  if (!existsSync(pipelinePath)) {
    process.stderr.write(`pipeline-position: ${pipelinePath} not found — not a great_cto project.\n`);
    process.exit(1);
  }

  let transitions;
  try {
    transitions = parsePipelineToml(readFileSync(pipelinePath, 'utf8'));
  } catch (e) {
    process.stderr.write(`pipeline-position: failed to read ${pipelinePath}: ${e.message}\n`);
    process.exit(1);
  }

  const now = Date.now();
  const verdicts = readAllVerdicts(join(projDir, 'verdicts'), { transitions, now });

  let level = 'gates-only';
  let activeGates = null;
  try {
    const pm = readFileSync(join(projDir, 'PROJECT.md'), 'utf8');
    const archetype = (pm.match(/^archetype:\s*(\S+)/m) || [])[1];
    level = levelFromProjectMd(pm);
    activeGates = gatesForApprovalLevel(level, { archetype });
  } catch { /* no PROJECT.md — honour every declared gate, matches dispatcher's own fallback */ }

  const result = pipelinePosition({ transitions, verdicts, activeGates, now });

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(renderHuman(result, { label: readProjectLabel(projDir), level }) + '\n');
  }

  if (exitCodeMode && result.position === 'blocked') process.exit(2);
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
