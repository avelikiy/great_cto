// Atomic, compare-and-swap merge of enabledPlugins into ~/.claude/settings.json.
// Preserves all other keys. Backup-aware.
//
// The write is: read -> digest -> build next -> write a private temp file in the same
// directory -> re-read the original and confirm its digest is unchanged -> rename. A host
// write between the first read and the rename is therefore refused, never lost.
// (ARCH-plugin-activation Q2 step 8, ADR-050 decision 4.)
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { dim, success, warn } from "./ui.js";
/** A named, expected refusal. Nothing was written to the settings file when this is thrown. */
export class SettingsRefusal extends Error {
    reason;
    settingsPath;
    constructor(reason, settingsPath, message) {
        super(message);
        this.name = "SettingsRefusal";
        this.reason = reason;
        this.settingsPath = settingsPath;
    }
}
export function getSettingsPath() {
    return join(homedir(), ".claude", "settings.json");
}
// ── helpers ───────────────────────────────────────────────────────────────────────────
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Real plugin keys look like `name@marketplace`. The class is deliberately small so a key can
// never be a prototype-pollution vector or carry control characters into a terminal.
const KEY_RE = /^[A-Za-z0-9._@-]{1,200}$/;
const validKey = (key) => typeof key === "string" && KEY_RE.test(key) && key !== "__proto__";
const handEdit = (key) => `enabledPlugins["${key}"] = true`;
function errCode(e) {
    return typeof e === "object" && e !== null ? e.code : undefined;
}
function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/**
 * Read the settings file without following a symlink. `null` means the file does not exist.
 * Any other failure to read is a refusal: a file we could not read is never an empty file.
 */
function readTarget(path, key) {
    let st;
    try {
        st = lstatSync(path);
    }
    catch (e) {
        if (errCode(e) === "ENOENT")
            return null;
        throw new SettingsRefusal("settings-unreadable", path, `could not read ${path} (${errCode(e) ?? "error"}), so great_cto did not change it. ` +
            `Fix the permissions, or add ${handEdit(key)} to it by hand.`);
    }
    const notRegular = () => new SettingsRefusal("target-not-regular-file", path, `${path} is a symlink or not a regular file, so great_cto did not rewrite it. ` +
        `Add ${handEdit(key)} to the file it points at by hand.`);
    if (st.isSymbolicLink() || !st.isFile())
        throw notRegular();
    let fd;
    try {
        // O_NOFOLLOW closes the window between the lstat above and this open.
        fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        if (!fstatSync(fd).isFile())
            throw notRegular();
        const bytes = readFileSync(fd);
        return { bytes, digest: sha256(bytes) };
    }
    catch (e) {
        if (e instanceof SettingsRefusal)
            throw e;
        const code = errCode(e);
        if (code === "ELOOP")
            throw notRegular();
        if (code === "ENOENT") {
            throw new SettingsRefusal("settings-changed-concurrently", path, `${path} disappeared while great_cto was reading it; nothing was written — retry after the host update.`);
        }
        throw new SettingsRefusal("settings-unreadable", path, `could not read ${path} (${code ?? "error"}), so great_cto did not change it. ` +
            `Fix the permissions, or add ${handEdit(key)} to it by hand.`);
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
const DEFAULT_STYLE = { indent: "  ", eol: "\n", trailingNewline: true };
/** Reproduce the file's own indentation, line endings and trailing newline. */
function detectStyle(raw) {
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const trailingNewline = raw.endsWith("\n");
    if (!raw.trim().includes("\n"))
        return { indent: "", eol, trailingNewline };
    const indented = /^([ \t]+)"/m.exec(raw);
    return { indent: indented ? indented[1].slice(0, 10) : DEFAULT_STYLE.indent, eol, trailingNewline };
}
function render(value, style) {
    let text = JSON.stringify(value, null, style.indent);
    if (style.eol !== "\n")
        text = text.replace(/\n/g, style.eol);
    return style.trailingNewline ? text + style.eol : text;
}
function parseSettings(snap, path, key) {
    if (!snap)
        return { root: {}, style: DEFAULT_STYLE, reformatted: false };
    const raw = snap.bytes.toString("utf8");
    if (raw.trim() === "")
        return { root: {}, style: DEFAULT_STYLE, reformatted: false };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new SettingsRefusal("settings-unparseable", path, `${path} is not valid JSON, so great_cto did not change it. ` +
            `Fix the file, or add ${handEdit(key)} to it by hand.`);
    }
    if (!isPlainObject(parsed)) {
        throw new SettingsRefusal("settings-not-object", path, `${path} does not hold a JSON object, so great_cto did not change it. ` +
            `Fix the file, or add ${handEdit(key)} to it by hand.`);
    }
    const plugins = parsed["enabledPlugins"];
    if (plugins !== undefined && plugins !== null && !isPlainObject(plugins)) {
        throw new SettingsRefusal("enabled-plugins-not-object", path, `"enabledPlugins" in ${path} is not an object, so great_cto did not change it. ` +
            `Fix the file, or add ${handEdit(key)} to it by hand.`);
    }
    const style = detectStyle(raw);
    return { root: parsed, style, reformatted: render(parsed, style) !== raw };
}
function syncDir(dir) {
    try {
        const fd = openSync(dir, constants.O_RDONLY);
        try {
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        // Directory fsync is unsupported on some platforms. The rename has already happened, so
        // this only narrows a crash window; it must not turn a completed write into a failure.
    }
}
function applyEnable(pluginKey, path, backupTarget, onPhase) {
    if (!validKey(pluginKey)) {
        throw new SettingsRefusal("invalid-plugin-key", path, `refusing plugin key ${JSON.stringify(String(pluginKey))}: expected something like "name@marketplace".`);
    }
    const key = pluginKey;
    const original = readTarget(path, key);
    onPhase?.("read");
    const previousDigest = original ? original.digest : null;
    const { root, style, reformatted } = parseSettings(original, path, key);
    const current = root["enabledPlugins"];
    if (isPlainObject(current) && current[key] === true) {
        return { settingsPath: path, enabled: false, alreadyEnabled: true, backupPath: null,
            previousDigest, writtenDigest: null, reformatted: false };
    }
    // A snapshot taken earlier in the transaction must still describe this file.
    if (backupTarget && existsSync(backupTarget)) {
        const snapshot = readFileSync(backupTarget);
        if (!original || !snapshot.equals(original.bytes)) {
            throw new SettingsRefusal("changed-since-snapshot", path, `${path} no longer matches the snapshot in ${backupTarget}; nothing was written — ` +
                `retry after the host update.`);
        }
    }
    const nextRoot = {
        ...root,
        enabledPlugins: { ...(isPlainObject(current) ? current : {}), [key]: true },
    };
    const text = render(nextRoot, style);
    mkdirSync(dirname(path), { recursive: true });
    let backupPath = null;
    let createdBackup = false;
    if (original && backupTarget) {
        backupPath = backupTarget;
        if (!existsSync(backupTarget)) {
            mkdirSync(dirname(backupTarget), { recursive: true, mode: 0o700 });
            writeFileSync(backupTarget, original.bytes, { flag: "wx", mode: 0o600 });
            createdBackup = true;
        }
    }
    const temp = `${path}.great-cto-${randomUUID()}.tmp`;
    try {
        const fd = openSync(temp, "wx", 0o600);
        try {
            writeFileSync(fd, text);
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        onPhase?.("staged");
        const staged = JSON.parse(readFileSync(temp, "utf8"));
        if (staged.enabledPlugins?.[key] !== true) {
            throw new SettingsRefusal("staged-readback-mismatch", path, `the staged copy of ${path} did not read back with ${handEdit(key)}; nothing was written.`);
        }
        // The compare in compare-and-swap: the original must be exactly what we built from.
        const again = readTarget(path, key);
        if ((again ? again.digest : null) !== previousDigest) {
            throw new SettingsRefusal("settings-changed-concurrently", path, `${path} changed while great_cto was updating it; nothing was written — ` +
                `retry after the host update.`);
        }
        renameSync(temp, path);
        syncDir(dirname(path));
    }
    catch (e) {
        if (createdBackup && backupPath)
            rmSync(backupPath, { force: true });
        throw e;
    }
    finally {
        rmSync(temp, { force: true });
    }
    onPhase?.("renamed");
    return { settingsPath: path, enabled: true, alreadyEnabled: false, backupPath,
        previousDigest, writtenDigest: sha256(text), reformatted };
}
// ── public API ────────────────────────────────────────────────────────────────────────
/**
 * Enable a plugin key in settings.json with compare-and-swap semantics.
 *
 * Throws {@link SettingsRefusal} (nothing written) when the file is unparseable, not a plain
 * regular file, unreadable, or changed between the read and the rename. Idempotent: a key that
 * is already enabled writes nothing, not even a backup.
 *
 * `writtenDigest` is null when nothing was written, so a caller restoring on rollback has
 * nothing to restore in the `alreadyEnabled` case.
 */
export function enablePluginCas(pluginKey, options = {}) {
    const path = options.settingsPath ?? getSettingsPath();
    const backupTarget = options.backupDir ? join(options.backupDir, basename(path)) : null;
    return applyEnable(pluginKey, path, backupTarget, options.onPhase);
}
/**
 * Enable a plugin key in ~/.claude/settings.json.
 * Idempotent — no-op (and no backup) if the key is already present.
 * Backs up the existing file beside it before writing.
 *
 * Legacy contract, kept for current callers: a file we must not touch is reported through
 * `refusal` plus a warning rather than thrown. Managed activation should call
 * {@link enablePluginCas}, which throws.
 */
export function enablePlugin(pluginKey) {
    const path = getSettingsPath();
    try {
        const result = applyEnable(pluginKey, path, `${path}.bak-${Date.now()}`, undefined);
        if (result.enabled) {
            if (result.backupPath) {
                success(`enabled ${pluginKey} in ~/.claude/settings.json ${dim(`(backup: ${result.backupPath})`)}`);
            }
            else {
                success(`created ~/.claude/settings.json with ${pluginKey} enabled`);
            }
        }
        return result;
    }
    catch (e) {
        if (e instanceof SettingsRefusal) {
            warn(e.message);
            return {
                settingsPath: path, enabled: false, alreadyEnabled: false, backupPath: null,
                previousDigest: null, writtenDigest: null,
                refusal: { reason: e.reason, message: e.message },
            };
        }
        throw e;
    }
}
/** Convenience alias — kept for backward compatibility with existing callers. */
export function enableGreatCto() {
    return enablePlugin("great_cto@local");
}
