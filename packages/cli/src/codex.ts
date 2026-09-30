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
      "six safety guards as Codex plugin hooks (destructive commands, gate bypasses, a neighbour session's work, secrets in files, frozen gates, weakened checks) and two hints that never block (edit-impact, lesson-tripwire) — Codex asks you to review them once on the next interactive `codex` start; they do not run until you do. Codex does not update great_cto by itself — `great-cto upgrade` (or `great-cto upgrade codex`) does",
    ],
    // Codex runs plugin hooks (verified 2026-09-28, codex-cli 0.153.4) but has no
    // plugin surface for commands or role agents. Saying "installed" without saying
    // this would promise a pipeline the host cannot run.
    notSupported: [
      "the rest of the Claude Code hooks — pipeline dispatch, cost guard, write log, format and type checks — only the safety guards and the two edit hints are ported",
      "slash commands — no plugin surface",
      "native role agents — Codex plugins carry interface metadata; controlled roles run only through `npx --yes great-cto codex-host`",
    ],
  };
}

// ── Keeping the Codex install current ────────────────────────────────────────
//
// Codex installs great_cto from a Git marketplace snapshot and never refreshes it on
// its own. `release.sh` and `install-local` update the Claude Code plugin only, so on
// the maintainer's machine Codex sat at 3.37.0 while 3.45.0 shipped — every Codex
// guard released in between (3.42–3.45) had never reached it. Measured 2026-09-30:
// `codex plugin marketplace upgrade great-cto` refreshes the snapshot AND the installed
// plugin cache in one step. `great-cto upgrade` now runs it when Codex has the
// great-cto marketplace configured.

import { existsSync as fsExists, readdirSync, readFileSync as fsRead } from "node:fs";
import { homedir as home } from "node:os";
import { join as pjoin } from "node:path";
import { execFileSync } from "node:child_process";

/** A usable `codex` binary: PATH first, then nvm installs, then the desktop app. Null when none. */
export function findCodexBinary(env: NodeJS.ProcessEnv = process.env, h: string = home()): string | null {
  for (const dir of String(env.PATH || "").split(":")) {
    if (dir && fsExists(pjoin(dir, "codex"))) return pjoin(dir, "codex");
  }
  // A shell that did not load nvm (a conda base, a login shell without .nvmrc) cannot
  // see an npm-installed codex; look where nvm puts it.
  const nvm = pjoin(h, ".nvm", "versions", "node");
  let versions: string[] = [];
  try { versions = readdirSync(nvm).sort().reverse(); } catch { /* no nvm */ }
  for (const v of versions) {
    const p = pjoin(nvm, v, "bin", "codex");
    if (fsExists(p)) return p;
  }
  const app = "/Applications/Codex.app/Contents/Resources/codex";
  return fsExists(app) ? app : null;
}

/** Does Codex have great_cto's marketplace configured? Read from its config.toml. */
export function codexHasGreatCtoMarketplace(codexHome: string = pjoin(home(), ".codex")): boolean {
  try { return /^\s*\[marketplaces\.(?:"great-cto"|great-cto)\]\s*$/m.test(fsRead(pjoin(codexHome, "config.toml"), "utf8")); }
  catch { return false; }
}

/** The newest great_cto version in Codex's plugin cache, or null. */
export function installedCodexVersion(codexHome: string = pjoin(home(), ".codex")): string | null {
  const cache = pjoin(codexHome, "plugins", "cache");
  let markets: string[] = [];
  try { markets = readdirSync(cache); } catch { return null; }
  const versions: string[] = [];
  for (const m of markets) {
    try { versions.push(...readdirSync(pjoin(cache, m, "great-cto")).filter((v) => /^\d+\.\d+\.\d+/.test(v))); } catch { /* not this market */ }
  }
  const key = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  versions.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!; return 0; });
  return versions.at(-1) ?? null;
}

export interface CodexUpgradeResult {
  status: "upgraded" | "already_latest" | "skipped" | "failed";
  fromVersion: string | null;
  toVersion: string | null;
  reason?: string;
}

/** Refresh great_cto in Codex. Skips, with the reason, when Codex or the marketplace is absent. */
export function upgradeCodexPlugin(opts: { codexHome?: string; bin?: string | null } = {}): CodexUpgradeResult {
  const codexHome = opts.codexHome ?? pjoin(home(), ".codex");
  if (!codexHasGreatCtoMarketplace(codexHome)) {
    return { status: "skipped", fromVersion: null, toVersion: null, reason: "great_cto is not installed for Codex" };
  }
  const from = installedCodexVersion(codexHome);
  const bin = opts.bin === undefined ? findCodexBinary() : opts.bin;
  if (!bin) {
    return { status: "skipped", fromVersion: from, toVersion: from, reason: "codex not found on PATH or under ~/.nvm — run: codex plugin marketplace upgrade great-cto" };
  }
  try {
    execFileSync(bin, ["plugin", "marketplace", "upgrade", "great-cto"], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 180_000, env: { ...process.env, CODEX_HOME: codexHome },
    });
  } catch (e) {
    return { status: "failed", fromVersion: from, toVersion: from, reason: String((e as Error).message).split("\n")[0] };
  }
  const to = installedCodexVersion(codexHome);
  return { status: to && to !== from ? "upgraded" : "already_latest", fromVersion: from, toVersion: to };
}
