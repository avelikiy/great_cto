// Tests for great_cto-d94: structured logger for the board server.
//
// Verifies: level filtering via GREAT_CTO_LOG_LEVEL, stdout/stderr routing
// (error → stderr, everything else → stdout), and single-line ISO-prefixed
// output format.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Capture stdout/stderr writes without actually printing during the test run.
function captureStreams(fn) {
  const out = [];
  const err = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...rest) => { out.push(String(chunk)); return true; };
  process.stderr.write = (chunk, ...rest) => { err.push(String(chunk)); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
  return { out, err };
}

test('default level (info): debug is suppressed, info/warn/error pass', async () => {
  delete process.env.GREAT_CTO_LOG_LEVEL;
  const { log } = await import(`./lib/log.mjs?t=${Date.now()}-1`);
  const { out, err } = captureStreams(() => {
    log.debug('should not appear');
    log.info('info line');
    log.warn('warn line');
    log.error('error line');
  });
  assert.equal(out.length, 2, 'debug suppressed, info+warn on stdout');
  assert.ok(out[0].includes('info line'));
  assert.ok(out[1].includes('warn line'));
  assert.equal(err.length, 1, 'error goes to stderr');
  assert.ok(err[0].includes('error line'));
});

test('GREAT_CTO_LOG_LEVEL=debug shows debug lines', async () => {
  process.env.GREAT_CTO_LOG_LEVEL = 'debug';
  const { log } = await import(`./lib/log.mjs?t=${Date.now()}-2`);
  const { out } = captureStreams(() => {
    log.debug('debug line');
  });
  delete process.env.GREAT_CTO_LOG_LEVEL;
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('debug line'));
  assert.ok(out[0].includes('DEBUG'));
});

test('GREAT_CTO_LOG_LEVEL=error hides info/warn/debug', async () => {
  process.env.GREAT_CTO_LOG_LEVEL = 'error';
  const { log } = await import(`./lib/log.mjs?t=${Date.now()}-3`);
  const { out, err } = captureStreams(() => {
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
  });
  delete process.env.GREAT_CTO_LOG_LEVEL;
  assert.equal(out.length, 0, 'nothing below error reaches stdout');
  assert.equal(err.length, 1);
  assert.ok(err[0].includes('e'));
});

test('output is a single line with ISO timestamp + level prefix', async () => {
  delete process.env.GREAT_CTO_LOG_LEVEL;
  const { log } = await import(`./lib/log.mjs?t=${Date.now()}-4`);
  const { out } = captureStreams(() => {
    log.info('hello world');
  });
  assert.equal(out.length, 1);
  const line = out[0];
  // Single line: exactly one trailing newline, no embedded newlines.
  assert.equal((line.match(/\n/g) || []).length, 1);
  assert.ok(line.endsWith('\n'));
  // ISO timestamp prefix + level + message.
  assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO hello world\n$/);
});

test('unrecognized GREAT_CTO_LOG_LEVEL falls back to info threshold', async () => {
  process.env.GREAT_CTO_LOG_LEVEL = 'not-a-real-level';
  const { log } = await import(`./lib/log.mjs?t=${Date.now()}-5`);
  const { out } = captureStreams(() => {
    log.debug('d');
    log.info('i');
  });
  delete process.env.GREAT_CTO_LOG_LEVEL;
  assert.equal(out.length, 1, 'debug still suppressed under an invalid level value');
  assert.ok(out[0].includes('i'));
});
