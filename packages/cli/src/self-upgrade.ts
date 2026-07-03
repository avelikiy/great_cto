/**
 * self-upgrade.ts — `great-cto upgrade --self` (and `great-cto upgrade self`).
 *
 * Upgrades the great-cto CLI itself, in place, by detecting HOW the running
 * binary was installed and running the matching package-manager command.
 *
 * Detection is driven entirely by the resolved (symlinks-followed) path to
 * the currently-running binary — never by "which npm is on PATH" or similar,
 * because a machine can have multiple package managers and multiple install
 * prefixes at once (e.g. a Volta-style toolchain manager alongside a plain
 * nvm-style Node version manager). The whole point of resolving from
 * process.argv[1] is to upgrade the exact binary that is actually running,
 * not just "some" great-cto install found elsewhere on the machine.
 *
 * Detection is a pure function (binaryPath: string -> Plan) so it's fully
 * unit-testable without spawning any process or touching the filesystem.
 */

import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { sep } from "node:path";

export type InstallManager = "npx" | "volta" | "pnpm" | "npm";

export interface SelfUpgradePlan {
  manager: InstallManager;
  /** Install prefix (e.g. npm global prefix) the binary was resolved into. Null when not applicable (npx). */
  prefix: string | null;
  /** argv for the install command, or null when no install should run (npx case). */
  command: string[] | null;
}

/**
 * Pure function: given the resolved path to the running binary, decide which
 * package manager "owns" it and what command would upgrade it in place.
 *
 * Resolution order (first match wins):
 *   1. npx / npm exec cache            -> no-op (npx always runs latest already)
 *   2. Volta shim/install directory    -> `volta install great-cto@latest`
 *   3. pnpm global install directory   -> `pnpm add -g great-cto@latest`
 *   4. anything else (plain npm/nvm)   -> `npm install -g great-cto@latest --prefix <prefix>`
 *
 * `pathSep` is injectable purely so tests can exercise POSIX-style paths
 * deterministically regardless of the host OS running the test.
 */
export function detectInstall(binaryPath: string, pathSep: string = sep): SelfUpgradePlan {
  const normalized = binaryPath.split("\\").join("/");

  // 1. npx / npm exec cache — npx always fetches+runs the latest version on
  //    every invocation, so there is nothing to "upgrade": the next `npx
  //    great-cto` already gets the newest release. Installing here would be
  //    a no-op at best and would litter the npx cache at worst.
  if (normalized.includes("/_npx/") || normalized.includes("/.npm/_npx/") || /\/\.npm\/[^/]*_cacache/.test(normalized)) {
    return { manager: "npx", prefix: null, command: null };
  }

  // 2. Volta — toolchain manager that shims global installs under ~/.volta
  //    (real-world installs use the dotfile form ".volta"; match both so the
  //    detector works against the actual directory Volta creates).
  if (normalized.includes("/volta/") || normalized.includes("/.volta/")) {
    return { manager: "volta", prefix: null, command: ["volta", "install", "great-cto@latest"] };
  }

  // 3. pnpm — global installs live under a pnpm-managed store/bin directory
  //    (real-world installs use the dotfile form ".pnpm"/".local/share/pnpm";
  //    match both bare and dotfile forms for the same reason as Volta above).
  if (normalized.includes("/pnpm/") || normalized.includes("/.pnpm/")) {
    return { manager: "pnpm", prefix: null, command: ["pnpm", "add", "-g", "great-cto@latest"] };
  }

  // 4. Plain npm (including nvm-style per-version prefixes, and custom
  //    prefixes like a dotfile-managed toolchain directory). Derive the
  //    global prefix from the binary path: a global npm bin shim always
  //    lives at "<prefix>/bin/<name>", so the prefix is the parent of the
  //    "bin" directory. For nvm-style layouts (~/.nvm/versions/node/vX.Y.Z/bin/great-cto)
  //    that parent *is* the version's own prefix, which is exactly right —
  //    npm install -g scoped with --prefix installs into that same version's
  //    global node_modules, so the binary that's running gets upgraded, not
  //    some other prefix on the machine.
  const prefix = derivePrefixFromBinPath(normalized, pathSep);
  if (prefix) {
    return { manager: "npm", prefix, command: ["npm", "install", "-g", "great-cto@latest", "--prefix", prefix] };
  }

  // Derivation failed (e.g. binary isn't inside a "bin" dir at all) — fall
  // back to a plain global install and let npm pick whatever prefix is
  // currently configured (npm config get prefix / NPM_CONFIG_PREFIX).
  return { manager: "npm", prefix: null, command: ["npm", "install", "-g", "great-cto@latest"] };
}

/** …/bin/great-cto -> prefix is the directory above "bin". Returns null if no "bin" segment is found. */
function derivePrefixFromBinPath(normalizedPath: string, _pathSep: string): string | null {
  const parts = normalizedPath.split("/").filter((p) => p !== "");
  const binIdx = parts.lastIndexOf("bin");
  if (binIdx <= 0) return null; // no "bin" dir, or "bin" is the root itself
  const prefixParts = parts.slice(0, binIdx);
  const isAbsolute = normalizedPath.startsWith("/");
  return (isAbsolute ? "/" : "") + prefixParts.join("/");
}

export interface SelfUpgradeResult {
  exitCode: number;
  manager: InstallManager;
  prefix: string | null;
  oldVersion: string;
  newVersion: string | null;
  message: string;
}

/**
 * Resolve the real (symlinks-followed) path to the currently-running binary.
 * Exported so callers/tests can compute it once and pass it through.
 */
export function resolveRunningBinaryPath(argv1: string = process.argv[1] ?? ""): string {
  try {
    return realpathSync(argv1);
  } catch {
    return argv1;
  }
}

/**
 * Perform the actual self-upgrade: run the install command synchronously
 * with inherited stdio, then verify by spawning the SAME binary path with
 * --version.
 *
 * Never throws — all failure modes are captured in the returned result so
 * callers can decide the process exit code themselves.
 */
export function performSelfUpgrade(opts: {
  currentVersion: string;
  binaryPath?: string;
  spawnFn?: typeof spawnSync;
}): SelfUpgradeResult {
  const binaryPath = opts.binaryPath ?? resolveRunningBinaryPath();
  const spawnFn = opts.spawnFn ?? spawnSync;
  const plan = detectInstall(binaryPath);

  if (plan.manager === "npx" || plan.command === null) {
    return {
      exitCode: 0,
      manager: "npx",
      prefix: null,
      oldVersion: opts.currentVersion,
      newVersion: opts.currentVersion,
      message: "running via npx — npx always fetches the latest release on every run, nothing to upgrade.",
    };
  }

  const [cmd, ...cmdArgs] = plan.command;
  const installRun = spawnFn(cmd as string, cmdArgs, { stdio: "inherit" });

  if (installRun.error) {
    return {
      exitCode: 1,
      manager: plan.manager,
      prefix: plan.prefix,
      oldVersion: opts.currentVersion,
      newVersion: null,
      message: `self-upgrade failed: could not run '${plan.command.join(" ")}' — ${installRun.error.message}`,
    };
  }

  const installExitCode = installRun.status ?? 1;
  if (installExitCode !== 0) {
    return {
      exitCode: installExitCode,
      manager: plan.manager,
      prefix: plan.prefix,
      oldVersion: opts.currentVersion,
      newVersion: null,
      message: `self-upgrade failed: '${plan.command.join(" ")}' exited with code ${installExitCode}`,
    };
  }

  // Verify: spawn the SAME binary path with --version and report old -> new.
  const verifyRun = spawnFn(process.execPath, [binaryPath, "--version"], { encoding: "utf8" });
  const newVersion = verifyRun.status === 0 ? (verifyRun.stdout ?? "").trim() || null : null;

  const prefixNote = plan.prefix ? ` (prefix: ${plan.prefix})` : "";
  return {
    exitCode: 0,
    manager: plan.manager,
    prefix: plan.prefix,
    oldVersion: opts.currentVersion,
    newVersion,
    message: newVersion
      ? `upgraded via ${plan.manager}${prefixNote}: ${opts.currentVersion} → ${newVersion}`
      : `install via ${plan.manager}${prefixNote} succeeded, but could not verify the new version (--version check failed)`,
  };
}

// Re-export for callers that only need the prefix-derivation logic directly.
export { derivePrefixFromBinPath as _derivePrefixFromBinPath };
