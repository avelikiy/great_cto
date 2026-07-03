// Zero-dep structured logger for great_cto scripts/hooks internal diagnostics.
//
// This is a standalone copy of packages/board/lib/log.mjs — scripts/ must not
// import from packages/board (separate distribution boundary: scripts run as
// Claude Code hooks/utilities, board ships as part of the npm package).
//
// Design:
//   - Levels: debug < info < warn < error. Threshold read once from
//     GREAT_CTO_LOG_LEVEL (default 'info'); unrecognized values fall back to 'info'.
//   - Output: single-line `<ISO timestamp> <LEVEL> <message>` per call.
//   - Routing: error → stderr; debug/info/warn → stdout. This matches Unix
//     convention (stdout = normal operation, stderr = attention-worthy).
//   - No external deps, ESM only, node: prefix for built-ins.
//
// IMPORTANT for hook authors: this logger is ONLY for internal diagnostics
// (caught-error dumps, debug traces). Never route a hook's protocol JSON,
// pass/fail decision, or deliberate user-facing CLI text through this —
// those must keep using console.log/console.error directly so the harness
// / human reading the terminal sees them unconditionally.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold() {
  const raw = (process.env.GREAT_CTO_LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

function format(level, args) {
  const ts = new Date().toISOString();
  const msg = args
    .map(a => (typeof a === 'string' ? a : a instanceof Error ? (a.stack || a.message) : JSON.stringify(a)))
    .join(' ');
  return `${ts} ${level.toUpperCase()} ${msg}`;
}

function emit(level, args) {
  if (LEVELS[level] < currentThreshold()) return;
  const line = format(level, args);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const log = {
  debug: (...args) => emit('debug', args),
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
};

export default log;
