// Zero-dep structured logger for the great_cto board server.
//
// Design:
//   - Levels: debug < info < warn < error. Threshold read once from
//     GREAT_CTO_LOG_LEVEL (default 'info'); unrecognized values fall back to 'info'.
//   - Output: single-line `<ISO timestamp> <LEVEL> <message>` per call.
//   - Routing: error → stderr; debug/info/warn → stdout. This matches Unix
//     convention (stdout = normal operation, stderr = attention-worthy) and
//     keeps the board's stdout free of interleaved error noise.
//   - No external deps, ESM only, node: prefix for built-ins.

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
