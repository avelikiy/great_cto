// Things this repository declares that nothing reads.
//
// `guard-parity.mjs` asks one question — does a guard wired into a workflow run
// anywhere CI actually runs? It was bought by finding a check that had not
// executed in nineteen days. This asks the sibling question, which turned out to
// cover more of the same day's findings:
//
//   **Something is declared. Does anything consume it?**
//
// Every one of these was found by hand, one at a time, by noticing:
//
//   - `l3-support` is instructed to write `INCIDENT`. No transition matched the
//     token, and the dispatcher returns null for a token it does not recognise —
//     so production broke, the agent said so in the verdict log, and nothing
//     happened. Not a halt. Silence.
//   - Eight agents had no edge in `pipeline.toml` and were reachable only
//     through routing prose, so the chain stopped after them. Two of them were
//     authentication and billing.
//   - `gate:import` existed as a sentence in an agent's prompt asking an
//     operator to confirm a dry-run, with nothing tracking it.
//   - Two shared scripts the board imports were never copied into the npm
//     bundle, so a feature worked in the repo and not in what users install.
//
// Noticing does not scale, and the noticing is what failed each time. These are
// mechanical comparisons over files already in the repository, so they cost
// nothing to run and cannot get bored.
//
// Reported, never inferred: each finding names the declaration, where it is, and
// what would have to exist for it to be consumed.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Agents that legitimately have no transition edge, with the reason each.
 *
 * An explicit list with a stated reason, exactly like `guard-parity`'s
 * remote-by-design: "it is fine" has to be written down and attributable, or the
 * check degrades into a list of things people got used to seeing.
 */
export const NO_EDGE_BY_DESIGN = Object.freeze([
  { agent: 'project-auditor', why: 'entered by /audit on an existing codebase, not mid-pipeline' },
  { agent: 'coordinator', why: 'a meta-orchestrator — it dispatches via shared/orchestrator.toml rather than being a node in the map' },
  { agent: 'continuous-learner', why: 'runs at session end from a hook, outside any chain' },
  { agent: 'knowledge-extractor', why: 'spawned by /crystallize, which has its own gate' },
  { agent: 'decision-scorer', why: 'called by architect to score alternatives; its output feeds that agent, not a next stage' },
  { agent: 'app-scaffolder', why: 'runs once at project start, before there is a pipeline to be in' },
  { agent: 'claude', why: 'the catch-all for work that matched no specialist' },
]);

/**
 * Verdict tokens every agent is instructed to write, read from its own prompt.
 *
 * Matches `log-verdict.sh <agent> <A|B>` and `log-verdict.sh <agent> TOKEN`.
 * A token an agent is told to write is a declaration; whether anything acts on
 * it is the question.
 */
export function declaredVerdicts(agentsDir = join(REPO, 'agents')) {
  const out = new Map();
  let files;
  try { files = readdirSync(agentsDir).filter((f) => f.endsWith('.md')); }
  catch { return null; }

  for (const f of files) {
    const agent = f.replace(/\.md$/, '');
    let text;
    try { text = readFileSync(join(agentsDir, f), 'utf8'); } catch { continue; }
    const tokens = new Set();
    // Two characters, not three. The first version required three and silently
    // dropped `OK` — l3-support's own success token — so the check would have
    // reported a clean sweep while not looking at part of what it audits. A
    // blind spot that passes is worse than a check that fails.
    for (const m of text.matchAll(/log-verdict\.sh\s+([a-z0-9-]+)\s+(<[^>]+>|[A-Z][A-Z0-9_-]+)/g)) {
      // Only the agent's own line. A prompt quoting another agent's verdict as
      // an example declares nothing about itself.
      if (m[1] !== agent) continue;
      for (const t of m[2].replace(/^<|>$/g, '').split('|')) {
        const tok = t.trim().toUpperCase();
        // Placeholders like <VERDICT> describe the shape, not a token.
        if (/^[A-Z][A-Z0-9_-]+$/.test(tok) && tok !== 'VERDICT') tokens.add(tok);
      }
    }
    if (tokens.size) out.set(agent, tokens);
  }
  return out;
}

/** Tokens the map acts on for one agent: its own `on`, plus any verdict branch. */
export function consumedVerdicts(agent, transitions) {
  const acted = new Set((transitions?.[agent]?.on || []).map((t) => String(t).toUpperCase()));
  const prefix = `${agent}.`;
  for (const key of Object.keys(transitions || {})) {
    if (!key.startsWith(prefix)) continue;
    acted.add(key.slice(prefix.length).toUpperCase());
    for (const t of (transitions[key].on || [])) acted.add(String(t).toUpperCase());
  }
  return acted;
}

/**
 * Tokens an agent is told to write that nothing would act on.
 *
 * A token that halts the chain counts as consumed — being stopped by BLOCKED is
 * a reaction. Silence is not.
 */
export function unconsumedVerdicts({ declared, transitions, blockedTokens }) {
  const findings = [];
  for (const [agent, tokens] of declared) {
    // A `*-reviewer` with no entry falls back to a rule that accepts
    // APPROVED / SIGNED-OFF / DONE — real handling, so not a finding.
    const hasRule = !!transitions[agent] || agent.endsWith('-reviewer');
    const acted = hasRule
      ? (transitions[agent] ? consumedVerdicts(agent, transitions) : new Set(['APPROVED', 'SIGNED-OFF', 'DONE']))
      : new Set();
    for (const tok of tokens) {
      if (blockedTokens.has(tok)) continue;
      if (acted.has(tok)) continue;
      if (!hasRule) continue;    // reported separately as a missing edge
      findings.push({
        kind: 'verdict-token',
        subject: `${agent} → ${tok}`,
        why: `agents/${agent}.md tells it to write ${tok}, and shared/pipeline.toml neither lists it in \`on\` nor declares a [transitions.${agent}.${tok}] branch — the dispatcher returns null for an unrecognised token, so this verdict produces silence`,
      });
    }
  }
  return findings;
}

/** Agents with no transition edge and no stated reason to lack one. */
export function unroutedAgents({ agentsDir = join(REPO, 'agents'), transitions, byDesign = NO_EDGE_BY_DESIGN }) {
  const excused = new Set(byDesign.map((r) => r.agent));
  const findings = [];
  let files;
  try { files = readdirSync(agentsDir).filter((f) => f.endsWith('.md')); }
  catch { return null; }

  for (const f of files) {
    const agent = f.replace(/\.md$/, '');
    if (transitions[agent] || agent.endsWith('-reviewer') || excused.has(agent)) continue;
    findings.push({
      kind: 'unrouted-agent',
      subject: agent,
      why: `agents/${agent}.md exists and shared/pipeline.toml has no [transitions.${agent}] — its verdict names no next stage, so the chain stops after it. Add an edge, or add it to NO_EDGE_BY_DESIGN with the reason`,
    });
  }
  return findings;
}

/** Gates declared on an edge that no approval level can ever activate. */
export function unreachableGates({ transitions, levelGates }) {
  const findings = [];
  const declared = new Set();
  for (const rule of Object.values(transitions || {})) {
    const g = rule?.gate;
    for (const one of (Array.isArray(g) ? g : g ? [g] : [])) declared.add(String(one).replace(/^gate:/, ''));
  }
  for (const g of declared) {
    if (levelGates.has(g)) continue;
    findings.push({
      kind: 'unreachable-gate',
      subject: `gate:${g}`,
      why: `shared/pipeline.toml declares gate:${g} on an edge, and no approval level in scripts/lib/approval-level.mjs can activate it — the edge looks guarded and never pauses`,
    });
  }
  return findings;
}

/**
 * Everything at once.
 *
 * @returns {{state:'clean'|'findings'|'unreadable', why:string, findings:object[]}}
 */
export async function auditDeclarations({ repo = REPO } = {}) {
  let transitions, blockedTokens, levelGates;
  try {
    const { parsePipelineToml, BLOCKED_TOKENS } = await import(join(repo, 'scripts', 'hooks', 'pipeline-dispatcher.mjs'));
    const { APPROVAL_LEVELS, gatesForApprovalLevel } = await import(join(repo, 'scripts', 'lib', 'approval-level.mjs'));
    transitions = parsePipelineToml(readFileSync(join(repo, 'shared', 'pipeline.toml'), 'utf8'));
    blockedTokens = BLOCKED_TOKENS;
    // Every gate any level can produce, over every archetype that changes the
    // answer — a gate reachable only for regulated projects is still reachable.
    levelGates = new Set();
    for (const lvl of APPROVAL_LEVELS) {
      for (const a of [undefined, 'fintech']) for (const g of gatesForApprovalLevel(lvl, { archetype: a })) levelGates.add(g);
    }
  } catch (e) {
    return { state: 'unreadable', why: `could not read the declarations: ${String(e?.message || e)}`, findings: [] };
  }

  const agentsDir = join(repo, 'agents');
  const declared = declaredVerdicts(agentsDir);
  const unrouted = unroutedAgents({ agentsDir, transitions });
  if (declared === null || unrouted === null) {
    return { state: 'unreadable', why: `could not read ${agentsDir} — an unread declaration is not a consumed one`, findings: [] };
  }

  const findings = [
    ...unconsumedVerdicts({ declared, transitions, blockedTokens }),
    ...unrouted,
    ...unreachableGates({ transitions, levelGates }),
  ];
  return findings.length
    ? { state: 'findings', why: `${findings.length} declaration(s) that nothing consumes`, findings }
    : { state: 'clean', why: 'every declared verdict, agent and gate has something that acts on it', findings: [] };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/declared-consumed.mjs [--strict] [--json]

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await auditDeclarations();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(r.state === 'findings' ? 1 : 0); }

  console.log(`declared-consumed: ${r.why}`);
  for (const f of r.findings) {
    console.log(`\n  ${f.kind}  ${f.subject}`);
    console.log(`    ${f.why}`);
  }
  // `unreadable` fails under --strict too: a check that could not look must not
  // report the same exit code as one that looked and found nothing.
  process.exit(process.argv.includes('--strict') && r.state !== 'clean' ? 1 : 0);
}
