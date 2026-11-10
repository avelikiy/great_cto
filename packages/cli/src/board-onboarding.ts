// What `init` offers about the board once the project is set up — the pure,
// unit-testable part. No prompt, no file write and no process spawn happens here;
// main.ts owns those, the same split board-daemon.ts uses.
//
// Two things a new user otherwise has to discover on their own:
//   1. the board dies with the terminal unless `board install-daemon` was run
//      (ADR-007 shipped the command; nothing ever offered it);
//   2. the board can be installed as an app with its own window and Dock icon.

export type AlwaysOnSkip =
  | "ci"
  | "not-a-tty"
  | "yes-flag"
  | "opted-out"
  | "unsupported-platform"
  | "already-installed"
  | "already-decided";

export type AlwaysOnVerdict = { ask: true } | { ask: false; reason: AlwaysOnSkip };

export interface AlwaysOnInput {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  /** `--yes`: the user asked not to be prompted. */
  yes: boolean;
  /** This platform has a supervisor integration (launchd / systemd / schtasks). */
  supported: boolean;
  /** The supervisor unit is already on disk. */
  installed: boolean;
  /** A previous run recorded the user's answer, either way. */
  decided: boolean;
}

/**
 * Ask "keep the board always on?" or stay quiet, and why.
 *
 * A login item is persistent state on the user's machine, so it is only ever
 * installed on an explicit answer at a terminal. `--yes` means "do not prompt
 * me", not "install a service" — it skips, and init prints the command instead.
 */
export function alwaysOnVerdict(i: AlwaysOnInput): AlwaysOnVerdict {
  const skip = (reason: AlwaysOnSkip): AlwaysOnVerdict => ({ ask: false, reason });
  if (i.env.CI || i.env.GITHUB_ACTIONS || i.env.NODE_TEST_CONTEXT) return skip("ci");
  if (i.env.GREAT_CTO_NO_BOARD) return skip("opted-out");
  if (!i.supported) return skip("unsupported-platform");
  if (i.installed) return skip("already-installed");
  if (i.decided) return skip("already-decided");
  if (i.yes) return skip("yes-flag");
  if (!i.isTTY) return skip("not-a-tty");
  return { ask: true };
}

/** Open a browser window only for a person at a terminal who did not opt out. */
export function shouldOpenBoard(i: {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  noOpen: boolean;
}): boolean {
  if (i.noOpen) return false;
  if (i.env.CI || i.env.GITHUB_ACTIONS || i.env.NODE_TEST_CONTEXT) return false;
  if (i.env.GREAT_CTO_NO_BOARD) return false;
  return i.isTTY;
}

export interface AlwaysOnState {
  decision: "yes" | "no";
  decided_at: string;
}

/** Parse the recorded answer. Anything that is not a clear answer reads as "not decided". */
export function parseAlwaysOnState(text: string): AlwaysOnState | null {
  try {
    const v = JSON.parse(text) as Partial<AlwaysOnState>;
    if ((v.decision === "yes" || v.decision === "no") && typeof v.decided_at === "string") {
      return { decision: v.decision, decided_at: v.decided_at };
    }
  } catch { /* malformed — not a decision */ }
  return null;
}

export function renderAlwaysOnState(decision: "yes" | "no", now: Date = new Date()): string {
  return JSON.stringify({ decision, decided_at: now.toISOString() }, null, 2) + "\n";
}

/** The lines init prints so the app install is not something to stumble on. */
export function installAppHint(port: number): string[] {
  return [
    `Board: http://localhost:${port}`,
    `Install it as an app (own window, Dock icon, notifications):`,
    `  Chrome / Edge — click "Install app" in the board header`,
    `  Safari        — File → Add to Dock`,
  ];
}
