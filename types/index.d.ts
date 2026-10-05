/** A gate as the board's /api/inbox serves it, cut to what the pane draws. */
export type Gate = {
  id: string;
  title: string;
  /** `gate:ship`, `gate:plan`, … — what the board's typed-name ritual asks for. */
  gate: string;
  /** Expensive to undo, or unclassified: the board asks for the typed name. */
  guarded: boolean;
  /** ADR-024 token bound to the project as it is now; null when none was issued. */
  token: string | null;
};

/** What the board said, never collapsed: "no gates" and "could not ask" differ. */
export type View =
  | { state: 'loading' }
  | { state: 'ok'; project: string; gates: Gate[]; at: string }
  | { state: 'board-down'; why: string }
  | { state: 'not-on-board'; project: string }
  | { state: 'error'; why: string };

declare module 'claude-code' {
  interface PluginState {
    'great-cto': { view: View; busy: string | null; seen: number };
  }
}
