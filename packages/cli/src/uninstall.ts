// `great-cto uninstall` — remove what great_cto installed, keep what the user made.
//
// Plan first, act on --yes (ADR-009: expensive to undo means a human decision,
// and "delete things under ~" is the textbook case). The plan is a pure function of
// the filesystem so tests run it against a temporary HOME.
//
// Three classes, never mixed:
//   artefacts  — what an install wrote: plugin versions, managed agents/commands,
//                plugin keys in settings, the board service, clones and caches.
//                Removed on --yes.
//   user data  — ~/.great_cto lessons, decisions, verdicts, cost history, secrets.
//                Kept. --purge-data MOVES the directory aside (reversible), it does
//                not delete it: secrets.env may hold the only copy of a key.
//   host-owned — marketplace registrations, the npm package running this code,
//                companion plugins other tools may use. Listed with the command
//                that removes them; not edited from here.

import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, rmSync, statSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

/** Appended to every agent and command great_cto installs (scripts/lib/sync-managed.mjs). */
export const MANAGED_MARKER = "<!-- great_cto-managed -->";
/** The first comment line of the pre-push hook `init` copies into a project. */
export const PRE_PUSH_HEADER = "# pre-push.sh — block pushes that contain private project name leaks";

export const PLUGIN_KEYS = ["great_cto@local", "great_cto@great-cto"];
const COMPANION_KEYS = ["superpowers@local", "beads@local"];

/** Re-creatable: git clones, registries, copies, update/quota caches, runtime files. */
const CACHE_ENTRIES = [
  "catalog", "anthropic-skills", "personal-skills", "skills-registry.json",
  "update-check.json", ".last-version-check", "quota-cache.json",
  "SKILL.md", "ARCHETYPES.md", "env.sh",
  "board.pid", "console.pid", "board.log", "board.err", "worker.lock", "leash-proxy.pid",
];
const CACHE_PREFIXES = [".welcomed-"];

export interface KeptVersion { dir: string; why: string }
export interface UninstallPlan {
  home: string;
  pluginVersions: string[];          // plugins/cache/<market>/great_cto/<ver>
  keptVersions: KeptVersion[];       // a live session runs from it
  agents: string[];
  commands: string[];
  settingsKeys: string[];            // enabledPlugins keys to drop
  installedKeys: string[];           // installed_plugins.json keys to drop
  daemonUnits: string[];             // service files that exist
  caches: string[];                  // ~/.great_cto entries that are caches
  projectHooks: string[];            // pre-push hooks great_cto wrote (only with --projects)
  userData: string[];                // ~/.great_cto entries kept unless --purge-data
  projects: string[];                // registered project paths (their .great_cto/ is theirs)
  companions: string[];              // companion plugin keys still enabled
  marketplaces: string[];            // host-owned registrations to remove with the host CLI
}

const readJson = (p: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>; } catch { return null; }
};
const ls = (d: string): string[] => { try { return readdirSync(d); } catch { return []; } };
const isDir = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };
const norm = (p: string): string => p.replace(/\/+$/, "");

/** Plugin roots named in process environments (`ps eww` output) — the same rule as prune-versions.mjs. */
export function liveRootsFromPs(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/CLAUDE_PLUGIN_ROOT=(.+?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\s*$)/gm)) {
    const root = norm(m[1]!);
    if (!out.includes(root)) out.push(root);
  }
  return out;
}

/** Where git reads hooks from: core.hooksPath wins over .git/hooks. Null when not a repository. */
function gitHooksDir(projectDir: string): string | null {
  const git = (args: string[]): string => {
    try { return execFileSync("git", args, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return ""; }
  };
  const top = git(["rev-parse", "--show-toplevel"]);
  if (!top) return null;
  const configured = git(["config", "--get", "core.hooksPath"]);
  if (configured) return resolve(top, configured);
  const common = git(["rev-parse", "--git-common-dir"]);
  return join(common ? resolve(top, common) : join(top, ".git"), "hooks");
}

export function planUninstall(o: { home: string; psText?: string; daemonUnitPaths?: string[]; includeProjects?: boolean }): UninstallPlan {
  const { home } = o;
  const claude = join(home, ".claude");
  const gdir = join(home, ".great_cto");

  const live = liveRootsFromPs(o.psText ?? "");
  const pluginVersions: string[] = [];
  const keptVersions: KeptVersion[] = [];
  const cache = join(claude, "plugins", "cache");
  for (const market of ls(cache)) {
    const root = join(cache, market, "great_cto");
    for (const v of ls(root)) {
      const dir = join(root, v);
      if (!isDir(dir)) continue;
      if (live.some((r) => norm(r) === dir || norm(r).startsWith(dir + "/"))) {
        keptVersions.push({ dir, why: "a running Claude Code session loads it — close that session and run uninstall again" });
      } else pluginVersions.push(dir);
    }
  }

  const marked = (d: string, pick: (f: string) => boolean): string[] =>
    ls(d).filter((f) => f.endsWith(".md") && pick(f)).map((f) => join(d, f))
      .filter((p) => { try { return readFileSync(p, "utf8").includes(MANAGED_MARKER); } catch { return false; } });
  const agents = marked(join(claude, "agents"), () => true);
  const commands = marked(join(claude, "commands"), () => true);

  const settings = readJson(join(claude, "settings.json"));
  const enabled = (settings?.enabledPlugins ?? {}) as Record<string, unknown>;
  const settingsKeys = PLUGIN_KEYS.filter((k) => k in enabled);
  const companions = COMPANION_KEYS.filter((k) => k in enabled);

  const installed = readJson(join(claude, "plugins", "installed_plugins.json"));
  const installedPlugins = (installed?.plugins ?? {}) as Record<string, unknown>;
  const installedKeys = PLUGIN_KEYS.filter((k) => k in installedPlugins);

  const known = readJson(join(claude, "plugins", "known_marketplaces.json")) ?? {};
  const marketplaces = Object.keys(known).filter((k) => /great[-_]cto/i.test(k));

  const daemonUnits = (o.daemonUnitPaths ?? []).filter((p) => p && existsSync(p));

  const caches: string[] = [];
  const userData: string[] = [];
  for (const e of ls(gdir)) {
    const isCache = CACHE_ENTRIES.includes(e) || CACHE_PREFIXES.some((p) => e.startsWith(p));
    (isCache ? caches : userData).push(join(gdir, e));
  }

  const reg = readJson(join(gdir, "projects.json"));
  const projects = Array.isArray(reg?.projects)
    ? (reg!.projects as Array<{ path?: string }>).map((p) => p.path).filter((p): p is string => typeof p === "string" && existsSync(p))
    : [];

  const projectHooks: string[] = [];
  if (o.includeProjects) {
    for (const p of projects) {
      const dir = gitHooksDir(p);
      const hook = dir ? join(dir, "pre-push") : "";
      try { if (hook && readFileSync(hook, "utf8").includes(PRE_PUSH_HEADER)) projectHooks.push(hook); } catch { /* none */ }
    }
  }

  return { home, pluginVersions, keptVersions, agents, commands, settingsKeys, installedKeys, daemonUnits,
    caches, projectHooks, userData, projects, companions, marketplaces };
}

/** Drop keys from one object inside a JSON file: backup, then write to a temp file and rename. */
function dropKeys(file: string, field: string, keys: string[], stamp: string): string | null {
  if (!keys.length || !existsSync(file)) return null;
  const data = readJson(file);
  if (!data) return null; // unparseable: not ours to rewrite
  const obj = (data[field] ?? {}) as Record<string, unknown>;
  for (const k of keys) delete obj[k];
  data[field] = obj;
  const backup = `${file}.bak-${stamp}`;
  copyFileSync(file, backup);
  const tmp = `${file}.tmp-${stamp}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
  return backup;
}

export interface ApplyResult { removed: string[]; backups: string[]; movedData: string | null; failed: string[] }

/** Carry out a plan. Board processes and service unloads are the caller's (they need the platform). */
export function applyUninstall(plan: UninstallPlan, o: { purgeData?: boolean; stamp?: string } = {}): ApplyResult {
  const stamp = o.stamp ?? new Date().toISOString().replace(/[:.]/g, "-");
  const removed: string[] = []; const failed: string[] = []; const backups: string[] = [];
  const rm = (p: string) => { try { rmSync(p, { recursive: true, force: true }); removed.push(p); } catch { failed.push(p); } };

  for (const p of [...plan.agents, ...plan.commands, ...plan.pluginVersions, ...plan.daemonUnits, ...plan.projectHooks]) rm(p);
  // `<market>/great_cto/` and then `<market>/` itself, each only when emptied: a market
  // that still holds a live version, or another plugin, is not empty.
  for (const dir of new Set(plan.pluginVersions.map((v) => resolve(v, "..")))) {
    for (const d of [dir, resolve(dir, "..")]) {
      try { if (ls(d).length === 0) rmdirSync(d); } catch { /* keep */ }
    }
  }

  const claude = join(plan.home, ".claude");
  const b1 = dropKeys(join(claude, "settings.json"), "enabledPlugins", plan.settingsKeys, stamp);
  const b2 = dropKeys(join(claude, "plugins", "installed_plugins.json"), "plugins", plan.installedKeys, stamp);
  for (const b of [b1, b2]) if (b) backups.push(b);

  for (const p of plan.caches) rm(p);

  let movedData: string | null = null;
  const gdir = join(plan.home, ".great_cto");
  if (o.purgeData && existsSync(gdir)) {
    const aside = `${gdir}.removed-${stamp}`;
    try { renameSync(gdir, aside); movedData = aside; } catch { failed.push(gdir); }
  }
  return { removed, backups, movedData, failed };
}
