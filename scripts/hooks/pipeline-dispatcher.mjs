#!/usr/bin/env node
/**
 * pipeline-dispatcher — PostToolUse hook (matcher: Task|Agent) that turns the
 * pipeline's prose handoffs into a machine directive.
 *
 * Why this exists
 * ---------------
 * Every agent→agent transition in great_cto was prompt-driven: SKILL.md says
 * "Spawn great_cto-pm after gate:arch" and the orchestrating model has to
 * remember to do it. Context compaction, a user tangent, or a long session
 * silently stalls the pipeline after any agent. All the state needed to
 * compute "what runs next" already exists (verdicts/*.log, shared/pipeline.toml,
 * Beads gates) — this hook computes it and injects a PIPELINE-NEXT directive
 * into the main-loop context right after the subagent's Task/Agent call
 * completes.
 *
 * The dispatcher NEVER approves gates and NEVER spawns anything itself — it
 * only tells the orchestrator what the transition map says should happen.
 * Human gates stay human.
 *
 * I/O (Claude Code PostToolUse):
 *   stdin:  { tool_name, tool_input: { subagent_type, ... }, ... }
 *   stdout: {"hookSpecificOutput":{"hookEventName":"PostToolUse",
 *            "additionalContext":"<directive>"}}   (silent when nothing to say)
 *   exit:   always 0 (advisory — dispatch must never break the tool call)
 *
 * Opt out: GREAT_CTO_DISABLE_DISPATCHER=1
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ_DIR = process.env.GREAT_CTO_DIR || '.great_cto';
const PIPELINE_PATH = join('shared', 'pipeline.toml');
const VERDICT_DIR = join(PROJ_DIR, 'verdicts');
// A verdict is "fresh" if written in the last 30 min — long enough for a slow
// subagent's closing writes, short enough not to resurrect yesterday's run.
const FRESH_MS = 30 * 60 * 1000;
// Join-quorum partner verdicts may be hours old (parallel branches).
const JOIN_MS = 24 * 60 * 60 * 1000;

const BLOCKED_TOKENS = new Set(['BLOCKED', 'FAIL', 'FAILED', 'REJECTED']);

/** Minimal TOML-subset parser for pipeline.toml:
 *  [transitions.<name>] sections with string / string-array values. */
export function parsePipelineToml(text) {
  const transitions = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[transitions\.([\w.-]+)\]$/);
    if (sec) { cur = transitions[sec[1]] = {}; continue; }
    if (/^\[/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const kv = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv;
    if (valRaw.startsWith('[')) {
      const items = valRaw.replace(/^\[|\]$/g, '').split(',')
        .map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      cur[key] = items;
    } else {
      cur[key] = valRaw.trim().replace(/^"|"$/g, '');
    }
  }
  return transitions;
}

/** Normalize "great_cto-architect" → "architect". */
export function normalizeAgent(subagentType) {
  return String(subagentType || '').replace(/^great_cto-/, '').trim();
}

/** Parse a verdict log line (pipe- or space-separated) → {agent, verdict}. */
export function parseVerdictLine(line) {
  if (!line) return null;
  const parts = line.includes('|')
    ? line.split('|').map(s => s.trim())
    : line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  return { ts: parts[0], agent: parts[1], verdict: (parts[2] || '').toUpperCase() };
}

/** Read the agent's latest verdict if the log was touched within `withinMs`. */
export function latestVerdict(dir, agent, withinMs, now) {
  const fp = join(dir, `${agent}.log`);
  try {
    if (!existsSync(fp)) return null;
    if (now - statSync(fp).mtimeMs > withinMs) return null;
    const lines = readFileSync(fp, 'utf8').trim().split('\n');
    return parseVerdictLine(lines[lines.length - 1]);
  } catch { return null; }
}

/**
 * Parse a reviewer's `<!-- HANDOFF -->` YAML block (archetype-review-base) out
 * of a TM file's text. Returns {agent, verdict} or null. Used as fallback when
 * a *-reviewer wrote its TM + HANDOFF but forgot the verdict log line.
 */
export function parseHandoffVerdict(text, agent) {
  const blocks = String(text).split('<!-- HANDOFF -->');
  if (blocks.length < 2) return null;
  // Scan newest-last: reviewers append; take the LAST block with THIS agent's
  // key. Strictly agent-specific — a generic `*-verdict:` fallback would
  // attribute another reviewer's verdict on a shared multi-reviewer TM.
  const rx = new RegExp(`^\\s*${agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-verdict:\\s*(signed-off|blocked)`, 'm');
  for (let i = blocks.length - 1; i >= 1; i--) {
    const m = blocks[i].match(rx);
    if (m) return { ts: '', agent, verdict: m[1] === 'signed-off' ? 'APPROVED' : 'BLOCKED' };
  }
  return null;
}

/** Fallback for reviewers: read the freshest TM-*.md and parse its HANDOFF. */
export function handoffFallback(agent, withinMs, now, { readdir, stat, read }) {
  try {
    const dir = join('docs', 'sec-threats');
    const files = readdir(dir).filter(f => /^TM-.*\.md$/.test(f));
    let newest = null, newestM = 0;
    for (const f of files) {
      const m = stat(join(dir, f)).mtimeMs;
      if (m > newestM) { newestM = m; newest = f; }
    }
    if (!newest || now - newestM > withinMs) return null;
    return parseHandoffVerdict(read(join(dir, newest)), agent);
  } catch { return null; }
}

/**
 * Pure transition decision.
 * @returns {{kind:string, text:string}|null} null = nothing to inject
 */
export function decideNext({ agent, transitions, verdict, joinVerdicts }) {
  const rule = transitions[agent] ||
    (agent.endsWith('-reviewer') ? { on: ['APPROVED', 'SIGNED-OFF', 'DONE'], next: ['senior-dev'] } : null);
  if (!rule) return null;

  if (!verdict) {
    return {
      kind: 'no-verdict',
      text: `PIPELINE: ${agent} finished but recorded no verdict line in ${VERDICT_DIR}/${agent}.log. ` +
        `Three-state completion requires it (shared/orchestrator.toml [completion]). ` +
        `Ask the agent (or run yourself): bash scripts/log-verdict.sh ${agent} <VERDICT> auto — then continue the pipeline.`,
    };
  }

  if (BLOCKED_TOKENS.has(verdict.verdict)) {
    return {
      kind: 'blocked',
      text: `PIPELINE: ${agent} returned ${verdict.verdict} — the pipeline is halted at this stage. ` +
        `Surface the blocking findings to the CTO. Do NOT spawn ${((rule.next || []).join(', ')) || 'downstream agents'} until resolved.`,
    };
  }

  const onTokens = (rule.on || []).map(t => t.toUpperCase());
  if (!onTokens.includes(verdict.verdict)) return null; // unknown token — stay silent

  // Join quorum: partner branches must also have succeeded.
  const pendingJoin = (rule.join || []).filter(j => {
    const v = joinVerdicts?.[j];
    return !v || BLOCKED_TOKENS.has(v.verdict);
  });
  if (pendingJoin.length > 0) {
    return {
      kind: 'join-wait',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}), but the parallel branch ` +
        `[${pendingJoin.join(', ')}] has not recorded a success verdict yet. ` +
        `If not already running, spawn it now (subagent_type: ${pendingJoin[0]}). ` +
        `Only after the full quorum: ${rule.gate ? `surface ${rule.gate} to the CTO, then ` : ''}spawn ${(rule.next || []).join(' + ')}.`,
    };
  }

  const nexts = rule.next || [];
  if (nexts.length === 0) {
    return { kind: 'done', text: `PIPELINE: ${agent} succeeded (${verdict.verdict}) — end of chain. Report the outcome to the CTO.` };
  }

  if (rule.gate) {
    return {
      kind: 'gate',
      text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}). Next stage [${nexts.join(', ')}] is behind ${rule.gate} (human approval). ` +
        `Ensure the ${rule.gate} Beads task exists (bd list --label gate --status open), show the CTO the gate summary with artifact links, and WAIT for approval. ` +
        `After the CTO approves: close the gate bead and spawn ${nexts.map(n => `subagent_type: ${n}`).join(', then ')}. Do not auto-approve.`,
    };
  }

  return {
    kind: 'next',
    text: `PIPELINE-NEXT: ${agent} succeeded (${verdict.verdict}) → spawn ${nexts.map(n => `Agent(subagent_type: ${n})`).join(' and ')} now ` +
      `(parallel is safe — no gate between these stages). Include the feature slug and artifact paths from ${agent}'s output in the brief. Do not stop the turn before dispatching.`,
  };
}

function emit(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
  }) + '\n');
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_DISPATCHER === '1') return process.exit(0);
  if (!existsSync(PROJ_DIR) || !existsSync(PIPELINE_PATH)) return process.exit(0);

  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return process.exit(0); }
  const toolInput = payload.tool_input || {};
  const agent = normalizeAgent(toolInput.subagent_type);
  if (!agent || agent === 'general-purpose' || agent === 'Explore' || agent === 'Plan') return process.exit(0);

  let transitions;
  try { transitions = parsePipelineToml(readFileSync(PIPELINE_PATH, 'utf8')); } catch { return process.exit(0); }

  const now = Date.now();
  let verdict = latestVerdict(VERDICT_DIR, agent, FRESH_MS, now);
  if (!verdict && agent.endsWith('-reviewer')) {
    // Reviewer wrote its TM + HANDOFF but skipped the verdict log — the
    // archetype-review-base HANDOFF block is an equally authoritative signal.
    verdict = handoffFallback(agent, FRESH_MS, now, {
      readdir: (d) => readdirSync(d),
      stat: (f) => statSync(f),
      read: (f) => readFileSync(f, 'utf8'),
    });
  }
  const rule = transitions[agent];
  const joinVerdicts = {};
  for (const j of (rule?.join || [])) {
    joinVerdicts[j] = latestVerdict(VERDICT_DIR, j, JOIN_MS, now);
  }

  const decision = decideNext({ agent, transitions, verdict, joinVerdicts });
  if (decision) emit(decision.text);
  return process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
