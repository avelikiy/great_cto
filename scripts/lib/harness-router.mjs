// scripts/lib/harness-router.mjs — harness detection + capability registry
// (AgentSpace #1, first slice). Inspired by AgentSpace's AgentRouter: an agent's
// identity is stable; only the *harness binding* changes. great_cto agents are
// already portable markdown — what's missing is one place to reason about which
// harness we're running under and what it can do, so behaviour degrades gracefully
// off Claude Code (e.g. our hooks/subagents are Claude-Code-specific).
//
// SCOPE: this slice is detect + capability registry. Full cross-harness EXECUTION
// (launching codex/opencode CLIs, normalizing their stream-json events) is deferred
// — see ADR-006.
//
// Usage:
//   node scripts/lib/harness-router.mjs detect      # current harness + capabilities
//   node scripts/lib/harness-router.mjs harnesses   # list the registry

import { fileURLToPath } from 'node:url';

/**
 * Capability flags are best-effort (mark unknowns conservatively false). The value
 * is a single source of truth great_cto code can branch on instead of scattered
 * env sniffing. Override detection with GREAT_CTO_HARNESS=<id>.
 */
export const HARNESSES = Object.freeze({
  'claude-code': {
    name: 'Claude Code', cli: 'claude',
    envSignals: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'],
    capabilities: { hooks: true, mcp: true, subagents: true, slashCommands: true, toolApproval: true, streamJson: true },
  },
  'codex': {
    name: 'OpenAI Codex', cli: 'codex',
    envSignals: ['CODEX', 'CODEX_SANDBOX', 'CODEX_HOME'],
    // subagents: true since 2026-09-05. It read `false` from June until a Phase 0
    // check compared the registry to a real install: codex-cli 0.153.4 reports
    // `subagent:thread_spawn=3` and a stock config carries `[features]
    // multi_agent = true`. We were degrading a capability the harness has.
    //
    // hooks: FALSE, and the road here is worth writing down because I got it
    // wrong twice, in opposite directions.
    //
    //   1. false — because no shipped plugin declares a hook. That is absence
    //      of USE read as absence of support. Wrong reasoning.
    //   2. true — because the binary carries the whole schema: our wire format,
    //      our permissionDecision values (allow|deny|ask), a superset of our
    //      events, and `hooks` as a manifest key. Wrong conclusion.
    //   3. false — because it was RUN. codex-cli 0.153.4 fires no hook at all:
    //      not from the plugin manifest, not from ~/.codex/hooks.json, not with
    //      --dangerously-bypass-hook-trust. A probe hook that only appends a
    //      line to a file never ran, while the tool call it guarded went through
    //      and wrote an API key to disk.
    //
    // A schema in a binary is not a working feature. secret-scan is wired and
    // correct — fed the payload by hand it denies and exits 2 — and on this
    // build it is never called, which is precisely the shape of a guard that
    // cannot fail. Absent until a run proves otherwise.
    // See docs/analysis/2026-09-05-codex-phase0-findings.md.
    capabilities: { hooks: false, mcp: true, subagents: true, slashCommands: true, toolApproval: true, streamJson: true },
  },
  'opencode': {
    name: 'OpenCode', cli: 'opencode',
    envSignals: ['OPENCODE', 'OPENCODE_BIN'],
    capabilities: { hooks: false, mcp: true, subagents: false, slashCommands: false, toolApproval: true, streamJson: true },
  },
});

/** Detect the current harness from env signals (GREAT_CTO_HARNESS overrides). */
export function detectHarness(env = process.env) {
  if (env.GREAT_CTO_HARNESS && HARNESSES[env.GREAT_CTO_HARNESS]) return env.GREAT_CTO_HARNESS;
  for (const [id, h] of Object.entries(HARNESSES)) {
    if (h.envSignals.some(s => env[s])) return id;
  }
  return 'unknown';
}

/** Capability map for a harness id, or null if unknown. */
export function capabilities(id) {
  return HARNESSES[id]?.capabilities ?? null;
}

/** Does `id` support `cap`? Unknown harness / unknown cap → false (degrade safe). */
export function hasCapability(id, cap) {
  return capabilities(id)?.[cap] === true;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const cmd = argv[0] || 'detect';
  if (cmd === 'harnesses') {
    for (const [id, h] of Object.entries(HARNESSES)) {
      const caps = Object.entries(h.capabilities).filter(([, v]) => v).map(([k]) => k).join(', ');
      console.log(`${id.padEnd(14)} ${h.name.padEnd(16)} caps: ${caps}`);
    }
    return;
  }
  // detect
  const id = detectHarness();
  console.log(`harness: ${id}${HARNESSES[id] ? ` (${HARNESSES[id].name})` : ''}`);
  const caps = capabilities(id);
  if (caps) {
    for (const [k, v] of Object.entries(caps)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
    if (!caps.hooks) console.log('  ⓘ no hooks on this harness — great_cto SessionStart/PreToolUse context injection won\'t fire; agents must self-load context.');
  } else {
    console.log('  unknown harness — assuming no Claude-Code-specific capabilities (hooks/subagents). Set GREAT_CTO_HARNESS to override.');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
