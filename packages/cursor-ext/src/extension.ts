// great_cto for Cursor — VS Code / Cursor extension stub.
//
// All four commands shell out to the npm CLI (npx great-cto@latest …) so the
// extension stays a thin wrapper. The real logic lives in great-cto, which
// the extension intentionally does NOT bundle to ensure version freshness.
//
// Build: npm run compile  → out/extension.js
// Package: npm run package → great-cto-cursor-X.Y.Z.vsix
// Publish: npm run publish (requires vsce login)

import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function getCmd(): string {
  return vscode.workspace.getConfiguration("greatCto").get<string>("npmCommand") ?? "npx great-cto@latest";
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function runInTerminal(name: string, args: string[]): void {
  const term = vscode.window.terminals.find(t => t.name === name)
            ?? vscode.window.createTerminal({ name });
  term.show();
  const cmd = getCmd();
  term.sendText(`${cmd} ${args.join(" ")}`);
}

async function runAdaptCursor(): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) {
    vscode.window.showErrorMessage("great_cto: no workspace open.");
    return;
  }
  if (!existsSync(join(cwd, ".great_cto", "PROJECT.md"))) {
    const choice = await vscode.window.showWarningMessage(
      "great_cto isn't initialized in this workspace. Run `great-cto init` first?",
      "Run init",
      "Cancel",
    );
    if (choice === "Run init") runInTerminal("great_cto", ["init"]);
    return;
  }
  runInTerminal("great_cto", ["adapt", "--platform", "cursor"]);
}

async function runScan(): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) { vscode.window.showErrorMessage("great_cto: no workspace open."); return; }
  const sev = vscode.workspace.getConfiguration("greatCto").get<string>("scanSeverity") ?? "high";
  runInTerminal("great_cto", ["scan", ".", "--severity", sev]);
}

async function runCi(): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) { vscode.window.showErrorMessage("great_cto: no workspace open."); return; }
  runInTerminal("great_cto", ["ci", "."]);
}

async function runReport(): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) { vscode.window.showErrorMessage("great_cto: no workspace open."); return; }
  // Run report and write to .great_cto/cost-report.html, then open it
  const cmd = getCmd();
  const outPath = join(cwd, ".great_cto", "cost-report.html");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sh", ["-c", `${cmd} report cost --period 30d > ${JSON.stringify(outPath)}`], { cwd });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    child.on("error", reject);
  }).catch(err => {
    vscode.window.showErrorMessage(`great_cto report failed: ${err.message}`);
    return;
  });
  if (existsSync(outPath)) {
    const uri = vscode.Uri.file(outPath);
    await vscode.commands.executeCommand("vscode.open", uri);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("greatCto.adaptCursor", runAdaptCursor),
    vscode.commands.registerCommand("greatCto.scan", runScan),
    vscode.commands.registerCommand("greatCto.ci", runCi),
    vscode.commands.registerCommand("greatCto.report", runReport),
  );

  // Status bar entry — quick access to scan
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = "$(shield) great_cto";
  item.tooltip = "great_cto — click to scan";
  item.command = "greatCto.scan";
  item.show();
  context.subscriptions.push(item);
}

export function deactivate(): void {
  // Nothing to clean up — all child processes are terminal-owned.
}
