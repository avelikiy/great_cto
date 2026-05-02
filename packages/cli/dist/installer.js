// Install the great_cto plugin into ~/.claude/plugins/cache/local/great_cto/<version>/.
// Uses git clone. Falls back to tarball fetch if git is unavailable.
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
    // Sanity check: did we get a plugin?
    const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifest)) {
        throw new Error(`Install appeared to succeed but ${manifest} is missing. Repo layout may have changed.`);
    }
    success(`plugin installed at ${pluginDir}`);
    return { installed: true, pluginDir, version, alreadyInstalled: false };
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
