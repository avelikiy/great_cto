// `great-cto statusline install | uninstall | status`
//
// Claude Code gives the status line command its plan usage (`rate_limits`: the
// 5-hour window, the week, per-model weeks) and gives it to nothing else. This
// installs a small status line (assets/statusline.mjs → ~/.great_cto/statusline.mjs)
// that records those numbers for the board and then prints the status line the
// user already had. Opt-in, reversible: the previous setting is kept and put back.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getSettingsPath } from "./settings.js";
import { dim, success, warn } from "./ui.js";

export interface StatuslinePaths {
  settings: string;
  gctoDir: string;
  script: string;
  conf: string;
  log: string;
  asset: string;
}

export function statuslinePaths(home: string = homedir()): StatuslinePaths {
  const gctoDir = process.env["GREAT_CTO_HOME"] || join(home, ".great_cto");
  return {
    settings: process.env["GREAT_CTO_HOME"] ? join(home, ".claude", "settings.json") : getSettingsPath(),
    gctoDir,
    script: join(gctoDir, "statusline.mjs"),
    conf: join(gctoDir, "statusline.json"),
    log: join(gctoDir, "claude-limits.jsonl"),
    asset: resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets", "statusline.mjs"),
  };
}

type Json = Record<string, unknown>;

function readJson(path: string): Json | null | "invalid" {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return raw.trim() ? (JSON.parse(raw) as Json) : {};
  } catch {
    return "invalid";
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf-8");
  renameSync(tmp, path);
}

export function ourCommand(p: StatuslinePaths): string {
  return `node "${p.script}"`;
}

function isOurs(statusLine: unknown, p: StatuslinePaths): boolean {
  const cmd = (statusLine as { command?: unknown } | undefined)?.command;
  return typeof cmd === "string" && cmd.includes(p.script);
}

export type StatuslineResult = { ok: boolean; message: string; backup?: string | null };

export function installStatusline(p: StatuslinePaths = statuslinePaths()): StatuslineResult {
  const settings = readJson(p.settings);
  if (settings === "invalid") return { ok: false, message: `${p.settings} is not valid JSON — left alone` };
  const s: Json = settings ?? {};
  if (!existsSync(p.asset)) return { ok: false, message: `the status line script is missing from this install (${p.asset})` };
  mkdirSync(p.gctoDir, { recursive: true });
  copyFileSync(p.asset, p.script);

  const current = s["statusLine"];
  if (!isOurs(current, p)) {
    // What the user had is kept twice: run by ours on every refresh (chain), and
    // stored whole so uninstall can put it back exactly.
    const chain = typeof (current as { command?: unknown } | undefined)?.command === "string"
      ? String((current as { command: string }).command) : null;
    writeJsonAtomic(p.conf, { chain, previous: current ?? null, installedAt: new Date().toISOString() });
  }
  let backup: string | null = null;
  if (existsSync(p.settings)) {
    backup = `${p.settings}.bak-${Date.now()}`;
    copyFileSync(p.settings, backup);
  }
  const prevPadding = (current as { padding?: unknown } | undefined)?.padding;
  s["statusLine"] = { type: "command", command: ourCommand(p), ...(typeof prevPadding === "number" ? { padding: prevPadding } : {}) };
  writeJsonAtomic(p.settings, s);
  return { ok: true, message: isOurs(current, p) ? "status line script refreshed" : "status line installed", backup };
}

export function uninstallStatusline(p: StatuslinePaths = statuslinePaths()): StatuslineResult {
  const settings = readJson(p.settings);
  if (settings === "invalid") return { ok: false, message: `${p.settings} is not valid JSON — left alone` };
  const s: Json = settings ?? {};
  if (!isOurs(s["statusLine"], p)) return { ok: true, message: "the great_cto status line is not installed — nothing changed" };
  const conf = readJson(p.conf);
  const previous = conf && conf !== "invalid" ? conf["previous"] : null;
  let backup: string | null = null;
  if (existsSync(p.settings)) {
    backup = `${p.settings}.bak-${Date.now()}`;
    copyFileSync(p.settings, backup);
  }
  if (previous && typeof previous === "object") s["statusLine"] = previous;
  else delete s["statusLine"];
  writeJsonAtomic(p.settings, s);
  return { ok: true, message: previous ? "your previous status line is back" : "status line removed", backup };
}

export function statuslineStatus(p: StatuslinePaths = statuslinePaths()): { installed: boolean; chain: string | null; lastReading: unknown } {
  const settings = readJson(p.settings);
  const installed = !!settings && settings !== "invalid" && isOurs(settings["statusLine"], p);
  const conf = readJson(p.conf);
  const chain = conf && conf !== "invalid" && typeof conf["chain"] === "string" ? String(conf["chain"]) : null;
  let lastReading: unknown = null;
  try {
    const lines = readFileSync(p.log, "utf-8").trim().split("\n");
    lastReading = JSON.parse(lines[lines.length - 1] || "null");
  } catch { /* nothing recorded yet */ }
  return { installed, chain, lastReading };
}

export function runStatuslineCommand(argv: string[]): number {
  const sub = argv[0] || "status";
  if (sub === "install") {
    const r = installStatusline();
    if (!r.ok) { warn(r.message); return 1; }
    success(`${r.message} ${dim(r.backup ? `(settings backup: ${r.backup})` : "")}`);
    console.log("  Claude's plan use is recorded on the next status line refresh; the board shows it under Usage → Limits.");
    console.log("  Readings come from `claude` in a terminal: the desktop app's Code tab does not draw a status line.");
    console.log(`  Undo: ${dim("great-cto statusline uninstall")}`);
    return 0;
  }
  if (sub === "uninstall") {
    const r = uninstallStatusline();
    if (!r.ok) { warn(r.message); return 1; }
    success(`${r.message} ${dim(r.backup ? `(settings backup: ${r.backup})` : "")}`);
    return 0;
  }
  if (sub === "status") {
    const st = statuslineStatus();
    console.log(`installed: ${st.installed ? "yes" : "no"}`);
    if (st.chain) console.log(`your status line (shown through it): ${st.chain}`);
    console.log(`last reading: ${st.lastReading ? JSON.stringify(st.lastReading) : "none yet"}`);
    if (st.installed && !st.lastReading) console.log("  (readings come from `claude` in a terminal; the desktop app's Code tab does not draw a status line)");
    return 0;
  }
  warn(`unknown: great-cto statusline ${sub} — use install, uninstall or status`);
  return 1;
}
