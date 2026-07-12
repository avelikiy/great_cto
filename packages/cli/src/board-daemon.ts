// OS-supervisor units + the `board ensure` decision — the pure, unit-testable
// core of ADR-007. No process is spawned and no file is written here; main.ts
// owns the side effects (spawn / launchctl / systemctl / writing the unit).
//
// Kept dependency-free and string-only so the renderers can be asserted directly,
// the same way board-path.ts isolates resolution from the spawn in main.ts.

export type Platform = "darwin" | "linux" | "win32";

export const DEFAULT_LABEL = "co.greatcto.board";

export interface DaemonRenderOpts {
  /** Absolute path to the node binary that will run the board. */
  nodePath: string;
  /** Absolute path to the CLI entry (index.mjs). */
  cliPath: string;
  /** Port the board listens on. */
  port: number;
  /** User home dir — used for the unit path and log destinations. */
  home: string;
  /** launchd Label / systemd-ish identity. Defaults to co.greatcto.board. */
  label?: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** launchd LaunchAgent plist: RunAtLoad + KeepAlive = "always on" across reboots/crashes. */
export function renderLaunchdPlist(o: DaemonRenderOpts): string {
  const label = o.label ?? DEFAULT_LABEL;
  const args = [o.nodePath, o.cliPath, "board", "--no-open"];
  const argXml = args.map(a => `    <string>${xmlEscape(a)}</string>`).join("\n");
  const logDir = `${o.home}/.great_cto`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BOARD_PORT</key>
    <string>${o.port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logDir)}/board.log</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logDir)}/board.err</string>
</dict>
</plist>
`;
}

/** systemd --user service: Restart=always + WantedBy=default.target = "always on" per login session. */
export function renderSystemdUnit(o: DaemonRenderOpts): string {
  const execStart = `${o.nodePath} ${o.cliPath} board --no-open`;
  return `[Unit]
Description=great_cto board (Kanban + CTO Dashboard)
After=network.target

[Service]
Type=simple
Environment=BOARD_PORT=${o.port}
ExecStart=${execStart}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
}

/** Windows Task Scheduler command that (re)creates an at-logon task for the board. */
export function renderSchtasksCommand(o: DaemonRenderOpts): string {
  const label = o.label ?? DEFAULT_LABEL;
  const tr = `"${o.nodePath}" "${o.cliPath}" board --no-open`;
  return `schtasks /create /tn "${label}" /sc onlogon /rl limited /f /tr "${tr}"`;
}

export interface DaemonSpec {
  platform: Platform;
  supported: boolean;
  kind: "launchd" | "systemd" | "schtasks" | "none";
  label: string;
  /** Where to write the unit file (empty for win32, which uses schtasks). */
  unitPath: string;
  /** Render the unit/service file body. */
  render(): string;
  /** argv arrays to run after writing the unit, in order. */
  installCmds: string[][];
  /** argv arrays to tear the service down. */
  uninstallCmds: string[][];
}

/** Map a platform to its supervisor: where the unit goes and how to (de)activate it. */
export function daemonSpec(platform: Platform, o: DaemonRenderOpts): DaemonSpec {
  const label = o.label ?? DEFAULT_LABEL;

  if (platform === "darwin") {
    const unitPath = `${o.home}/Library/LaunchAgents/${label}.plist`;
    return {
      platform,
      supported: true,
      kind: "launchd",
      label,
      unitPath,
      render: () => renderLaunchdPlist(o),
      // unload first (ignore failure) so re-install is idempotent, then load with -w (persist).
      installCmds: [
        ["launchctl", "unload", unitPath],
        ["launchctl", "load", "-w", unitPath],
      ],
      uninstallCmds: [["launchctl", "unload", "-w", unitPath]],
    };
  }

  if (platform === "linux") {
    const unitPath = `${o.home}/.config/systemd/user/greatcto-board.service`;
    return {
      platform,
      supported: true,
      kind: "systemd",
      label,
      unitPath,
      render: () => renderSystemdUnit(o),
      installCmds: [
        ["systemctl", "--user", "daemon-reload"],
        ["systemctl", "--user", "enable", "--now", "greatcto-board.service"],
      ],
      uninstallCmds: [["systemctl", "--user", "disable", "--now", "greatcto-board.service"]],
    };
  }

  if (platform === "win32") {
    return {
      platform,
      supported: true,
      kind: "schtasks",
      label,
      unitPath: "", // no separate file — the task IS the config
      render: () => renderSchtasksCommand(o),
      installCmds: [["cmd", "/c", renderSchtasksCommand(o)]],
      uninstallCmds: [["cmd", "/c", `schtasks /delete /tn "${label}" /f`]],
    };
  }

  // Unknown platform — degrade safely rather than throw.
  return {
    platform,
    supported: false,
    kind: "none",
    label,
    unitPath: "",
    render: () => "",
    installCmds: [],
    uninstallCmds: [],
  };
}

export type EnsureAction = "noop" | "start" | "restart";

export interface EnsureState {
  /** PID from board.pid, or null if the file is missing/garbage. */
  pid: number | null;
  /** Is that PID a live process? */
  alive: boolean;
  /** Does the port answer HTTP? */
  healthy: boolean;
}

/**
 * Decide what `board ensure` should do:
 *   - no live process              → start
 *   - live process, port hung      → restart (the case a liveness supervisor misses)
 *   - live process, port answering → noop (never kill a healthy board)
 */
export function decideEnsureAction(s: EnsureState): EnsureAction {
  if (s.pid === null || !s.alive) return "start";
  if (!s.healthy) return "restart";
  return "noop";
}
