// Install the great_cto plugin into ~/.claude/plugins/cache/local/great_cto/<version>/.
// Uses git clone. Falls back to tarball fetch if git is unavailable.
import { spawnSync, execFileSync } from "node:child_process";
import { cpSync } from "node:fs";
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log, success, warn, dim } from "./ui.js";
const REPO_URL = "https://github.com/avelikiy/great_cto.git";
export function hasGit() {
    try {
        execFileSync("git", ["--version"], { stdio: "pipe", timeout: 5_000 });
        return true;
    }
    catch {
        return false;
    }
}
export function detectLatestVersion() {
    try {
        const out = execFileSync("git", ["ls-remote", "--tags", REPO_URL], {
            encoding: "utf-8",
            timeout: 15_000,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const tags = out
            .split("\n")
            .map((line) => line.match(/refs\/tags\/v?([0-9]+\.[0-9]+\.[0-9]+)(?!\^)/)?.[1])
            .filter((t) => !!t)
            .sort((a, b) => cmpSemver(b, a));
        return tags[0] ?? null;
    }
    catch {
        return null;
    }
}
function cmpSemver(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
export function getPluginBaseDir() {
    return join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
}
export function findInstalledVersions() {
    const base = getPluginBaseDir();
    if (!existsSync(base))
        return [];
    try {
        return readdirSync(base).filter((name) => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(name)).sort(cmpSemver);
    }
    catch {
        return [];
    }
}
export function install(opts = {}) {
    if (!hasGit()) {
        throw new Error("git is required to install great_cto. Install git first: https://git-scm.com/downloads");
    }
    // Resolve version
    let version = opts.version;
    if (!version) {
        const latest = detectLatestVersion();
        if (!latest) {
            warn("Could not detect latest version from GitHub tags — falling back to main branch.");
            version = "main";
        }
        else {
            version = latest;
        }
    }
    const pluginDir = join(getPluginBaseDir(), version);
    if (existsSync(pluginDir)) {
        const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
        const looksValid = existsSync(manifest);
        if (looksValid && !opts.force) {
            return { installed: false, pluginDir, version, alreadyInstalled: true };
        }
        // Either corrupted, or --force: wipe and reinstall
        if (!looksValid) {
            warn(`Previous install at ${pluginDir} looks corrupted — reinstalling.`);
        }
        rmSync(pluginDir, { recursive: true, force: true });
    }
    mkdirSync(getPluginBaseDir(), { recursive: true });
    log(dim(`  cloning ${REPO_URL} into ${pluginDir}`));
    const ref = /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) ? `v${version}` : version;
    const result = spawnSync("git", ["clone", "--depth=1", "--branch", ref, REPO_URL, pluginDir], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
    });
    if (result.status !== 0) {
        const stderr = result.stderr?.toString() ?? "";
        // If branch/tag doesn't exist, try plain clone of main
        if (stderr.includes("not found") || stderr.includes("Remote branch")) {
            warn(`Tag ${ref} not found — cloning default branch.`);
            rmSync(pluginDir, { recursive: true, force: true });
            const r2 = spawnSync("git", ["clone", "--depth=1", REPO_URL, pluginDir], {
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 120_000,
            });
            if (r2.status !== 0) {
                throw new Error(`git clone failed: ${r2.stderr?.toString() ?? "unknown error"}`);
            }
            // Re-read version from actual plugin.json
            version = readPluginVersion(pluginDir) ?? "main";
        }
        else {
            throw new Error(`git clone failed: ${stderr}`);
        }
    }
    // A clone carries sources; the plugin runs on the build. Supply it from this
    // CLI's own dist before checking whether the result can run.
    const supplied = supplyBuiltDist(pluginDir);
    if (supplied != null)
        log(dim(`  supplied ${supplied} built file(s) into packages/cli/dist/`));
    // Sanity check: can it RUN, not merely "did files arrive".
    const missing = missingRuntimeParts(pluginDir);
    if (missing.length) {
        throw new Error(`Install appeared to succeed but the plugin cannot run — missing:\n` +
            missing.map((m) => `  - ${m}`).join("\n") +
            `\nThis is an install bug, not a configuration problem. Please report it with this list.`);
    }
    success(`plugin installed at ${pluginDir}`);
    return { installed: true, pluginDir, version, alreadyInstalled: false };
}
/**
 * The plugin needs BUILT JavaScript, and a git clone does not contain any.
 *
 * `packages/cli/dist/` is a build artefact. Five of its thirty-two files are in
 * git by accident; the rest, including `archetypes.js`, are not. So a cloned
 * plugin gets 5 of 32, and `scripts/lib/gate-plan.mjs` — which the board's
 * project reader imports — dies on
 *
 *     ERR_MODULE_NOT_FOUND … packages/cli/dist/archetypes.js
 *
 * The board therefore did not start for anyone installing this the documented
 * way. It started for the author, whose plugin cache is populated by
 * `install-local.sh` from a working tree with a full local build, and it started
 * from the npm tarball, which ships all 32. It failed on exactly one path: the
 * one a new user takes.
 *
 * The build is not fetched or rebuilt — it is already here. This CLI IS the
 * published package, so the version being installed and the version doing the
 * installing are the same artefacts. Copying them across is both the cheapest
 * source and the only one that cannot drift.
 *
 * @returns how many files were supplied, or null when this CLI has no dist of
 *   its own to give (running from source in the monorepo, where the clone is
 *   not what gets used anyway).
 */
function supplyBuiltDist(pluginDir) {
    const here = dirname(fileURLToPath(import.meta.url)); // …/dist
    const target = join(pluginDir, "packages", "cli", "dist");
    try {
        if (!existsSync(join(here, "archetypes.js")))
            return null;
        mkdirSync(target, { recursive: true });
        cpSync(here, target, { recursive: true });
        return readdirSync(target).length;
    }
    catch {
        return null;
    }
}
/**
 * Can the plugin actually run, or did we merely receive files?
 *
 * The check this replaces asked whether `.claude-plugin/plugin.json` exists —
 * "did we get a plugin?" — which a clone always satisfies while the board is
 * still unable to start. A sanity check that a broken install passes is not a
 * sanity check.
 *
 * @returns a list of what is missing; empty means runnable.
 */
export function missingRuntimeParts(pluginDir) {
    const required = [
        [".claude-plugin/plugin.json", "the plugin manifest"],
        ["packages/board/server.mjs", "the board server"],
        ["packages/cli/dist/archetypes.js", "the built archetype table the board imports"],
        ["scripts/lib/gate-plan.mjs", "the gate planner"],
    ];
    return required
        .filter(([rel]) => !existsSync(join(pluginDir, rel)))
        .map(([rel, what]) => `${rel} (${what})`);
}
function readPluginVersion(pluginDir) {
    try {
        const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
        const pkg = JSON.parse(readFileSync(manifest, "utf-8"));
        return pkg.version ?? null;
    }
    catch {
        return null;
    }
}
