"use strict";
// great_cto for Cursor — VS Code / Cursor extension stub.
//
// All four commands shell out to the npm CLI (npx great-cto@latest …) so the
// extension stays a thin wrapper. The real logic lives in great-cto, which
// the extension intentionally does NOT bundle to ensure version freshness.
//
// Build: npm run compile  → out/extension.js
// Package: npm run package → great-cto-cursor-X.Y.Z.vsix
// Publish: npm run publish (requires vsce login)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function getCmd() {
    return vscode.workspace.getConfiguration("greatCto").get("npmCommand") ?? "npx great-cto@latest";
}
function workspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function runInTerminal(name, args) {
    const term = vscode.window.terminals.find(t => t.name === name)
        ?? vscode.window.createTerminal({ name });
    term.show();
    const cmd = getCmd();
    term.sendText(`${cmd} ${args.join(" ")}`);
}
async function runAdaptCursor() {
    const cwd = workspaceRoot();
    if (!cwd) {
        vscode.window.showErrorMessage("great_cto: no workspace open.");
        return;
    }
    if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(cwd, ".great_cto", "PROJECT.md"))) {
        const choice = await vscode.window.showWarningMessage("great_cto isn't initialized in this workspace. Run `great-cto init` first?", "Run init", "Cancel");
        if (choice === "Run init")
            runInTerminal("great_cto", ["init"]);
        return;
    }
    runInTerminal("great_cto", ["adapt", "--platform", "cursor"]);
}
async function runScan() {
    const cwd = workspaceRoot();
    if (!cwd) {
        vscode.window.showErrorMessage("great_cto: no workspace open.");
        return;
    }
    const sev = vscode.workspace.getConfiguration("greatCto").get("scanSeverity") ?? "high";
    runInTerminal("great_cto", ["scan", ".", "--severity", sev]);
}
async function runCi() {
    const cwd = workspaceRoot();
    if (!cwd) {
        vscode.window.showErrorMessage("great_cto: no workspace open.");
        return;
    }
    runInTerminal("great_cto", ["ci", "."]);
}
async function runReport() {
    const cwd = workspaceRoot();
    if (!cwd) {
        vscode.window.showErrorMessage("great_cto: no workspace open.");
        return;
    }
    // Run report and write to .great_cto/cost-report.html, then open it
    const cmd = getCmd();
    const outPath = (0, node_path_1.join)(cwd, ".great_cto", "cost-report.html");
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)("sh", ["-c", `${cmd} report cost --period 30d > ${JSON.stringify(outPath)}`], { cwd });
        child.on("exit", code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
        child.on("error", reject);
    }).catch(err => {
        vscode.window.showErrorMessage(`great_cto report failed: ${err.message}`);
        return;
    });
    if ((0, node_fs_1.existsSync)(outPath)) {
        const uri = vscode.Uri.file(outPath);
        await vscode.commands.executeCommand("vscode.open", uri);
    }
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("greatCto.adaptCursor", runAdaptCursor), vscode.commands.registerCommand("greatCto.scan", runScan), vscode.commands.registerCommand("greatCto.ci", runCi), vscode.commands.registerCommand("greatCto.report", runReport));
    // Status bar entry — quick access to scan
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.text = "$(shield) great_cto";
    item.tooltip = "great_cto — click to scan";
    item.command = "greatCto.scan";
    item.show();
    context.subscriptions.push(item);
}
function deactivate() {
    // Nothing to clean up — all child processes are terminal-owned.
}
//# sourceMappingURL=extension.js.map