// Installing great_cto for OpenAI Codex.
//
// The first version of this wrote hook scripts into `~/.codex/skills/great_cto/`,
// emitted a TOML fragment for the user to merge by hand, and set
// `[features] hooks = true` alongside `[hooks_files]`. Phase 0 checked every one
// of those against a real codex-cli 0.153.4
// (docs/analysis/2026-09-05-codex-phase0-findings.md):
//
//   ~/.codex/skills/   does not exist on a working install
//   [hooks_files]      is used by no shipped plugin
//   hooks on Codex     unverified — the config key parses, and that is all
//
// None of it was covered by a test, so it had shipped as a working feature while
// writing to a path nothing reads.
//
// Codex ships `codex plugin marketplace add`, taking a local or Git source, and
// that path was verified end to end: the plugin reports `installed, enabled
// 3.23.0` with all 40 skills present. So this emits the supported commands and,
// as importantly, says what does not come with them.

export interface CodexInstallPlan {
  ok: boolean;
  why: string;
  commands: string[];
  supported: string[];
  notSupported: string[];
}

/**
 * What installing for Codex means, decided separately from doing it.
 *
 * Pure so the decision can be tested without touching a real Codex install —
 * the previous version was untestable by construction and therefore untested.
 */
export function codexInstallPlan(
  { repoDir, codexOnPath }: { repoDir: string; codexOnPath: boolean },
): CodexInstallPlan {
  if (!codexOnPath) {
    // Refuse rather than write half of it. Config for a CLI that is not present
    // leaves the user with files and no way to use them, which is how the old
    // path failed by construction.
    return {
      ok: false,
      why: "codex is not on PATH — install it first: npm i -g @openai/codex",
      commands: [],
      supported: [],
      notSupported: [],
    };
  }

  return {
    ok: true,
    why: "",
    commands: [
      `codex plugin marketplace add ${repoDir}`,
      `codex plugin add great-cto@great-cto`,
    ],
    // Verified present after install, not assumed.
    supported: [
      "skills — all of them, the same tree Claude Code reads",
      "the MCP server (great_cto), resolved from npm",
      "the controlled role pipeline — run `npx --yes great-cto codex-host doctor` then `npx --yes great-cto codex-host start`",
      "six safety guards as Codex plugin hooks (destructive commands, gate bypasses, a neighbour session's work, secrets in files, frozen gates, weakened checks) — Codex asks you to review them once on the next interactive `codex` start; they do not run until you do",
    ],
    // Codex runs plugin hooks (verified 2026-09-28, codex-cli 0.153.4) but has no
    // plugin surface for commands or role agents. Saying "installed" without saying
    // this would promise a pipeline the host cannot run.
    notSupported: [
      "the rest of the Claude Code hooks — pipeline dispatch, cost guard, write log, format and type checks — only the safety guards are ported",
      "slash commands — no plugin surface",
      "native role agents — Codex plugins carry interface metadata; controlled roles run only through `npx --yes great-cto codex-host`",
    ],
  };
}
