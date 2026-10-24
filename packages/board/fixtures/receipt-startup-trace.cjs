// Test-only preload inherited by the receipt supervisor, worker and held Git.
// No arguments, environment values, paths, output or error text enter the trace.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const root = process.env.GCTO_RECEIPT_CONTROL_ROOT;
if (root && path.isAbsolute(root)) {
  let fd;
  try {
    if (fs.lstatSync(root).isDirectory()) {
      fd = fs.openSync(path.join(root, 'receipt-startup-trace.jsonl'),
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600);
    }
  } catch { /* Diagnostics must never change a receipt operation. */ }
  if (fd !== undefined) install(fd);
}

function install(fd) {
  const append = fs.appendFileSync, held = path.join(root, 'git-held');
  const errors = new Set(['ENOENT', 'EACCES', 'EPERM', 'ESRCH', 'ETIMEDOUT', 'EINVAL', 'EPIPE', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'UNKNOWN']);
  const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 0]);
  const pid = value => Number.isSafeInteger(value) && value > 0 ? value : null;
  const signal = value => signals.has(value) ? value : null;
  const errorCode = error => errors.has(error?.code) ? error.code : null;
  const role = process.argv[1] === path.resolve(__dirname, '../lib/bd-read-worker.mjs') ? 'supervisor'
    : process.argv[1] === path.resolve(__dirname, '../lib/receipt-read-worker.mjs') ? 'receipt-worker'
      : process.argv[1] === path.join(root, 'bin', 'git') ? 'git-fixture' : 'other';
  let records = 0, disabled = false;
  function record(event, data = {}) {
    if (disabled || records >= 64) return;
    try {
      const row = {
        event, role, atMs: Date.now(), pid: process.pid, ppid: process.ppid,
        childPid: null, targetPid: null, group: null, exitCode: null, errorCode: null, signal: null,
        ...data,
      };
      const line = JSON.stringify(row) + '\n';
      if (fs.fstatSync(fd).size + Buffer.byteLength(line) > 64 * 1024) { disabled = true; return; }
      append(fd, line); records++;
    } catch { disabled = true; }
  }
  // Keep all observation, including getters on emitted objects, best effort.
  function observe(fn) { try { fn(); } catch { /* Original operations still run. */ } }
  record('process-entry');
  for (const method of ['spawn', 'fork']) {
    const original = cp[method];
    cp[method] = function (...args) {
      record(method + '-start');
      let child;
      try { child = Reflect.apply(original, this, args); }
      catch (error) { observe(() => record(method + '-error', { errorCode: errorCode(error) })); throw error; }
      observe(() => {
        record(method + '-return', { childPid: pid(child.pid) });
        const emit = child.emit;
        // Listening for 'error' would swallow an otherwise unhandled error.
        child.emit = function (event, ...values) {
          observe(() => {
            const data = { childPid: pid(child.pid) };
            if (event === 'spawn') record('child-spawn', data);
            else if (event === 'error') record('child-error', { ...data, errorCode: errorCode(values[0]) });
            else if (event === 'exit' || event === 'close') record('child-' + event, {
              ...data,
              exitCode: Number.isSafeInteger(values[0]) && values[0] >= 0 ? values[0] : null,
              signal: signal(values[1]),
            });
          });
          return Reflect.apply(emit, this, [event, ...values]);
        };
      });
      return child;
    };
  }
  const exec = cp.execFileSync;
  cp.execFileSync = function (...args) {
    record('exec-start');
    try {
      const value = Reflect.apply(exec, this, args);
      record('exec-end'); return value;
    } catch (error) {
      observe(() => record('exec-error', { errorCode: errorCode(error), signal: signal(error?.signal) }));
      throw error;
    }
  };
  const kill = process.kill;
  process.kill = function (...args) {
    observe(() => record('kill-start', {
      targetPid: typeof args[0] === 'number' ? pid(Math.abs(args[0])) : null,
      group: typeof args[0] === 'number' ? args[0] < 0 : null,
      signal: signal(args.length < 2 ? 'SIGTERM' : args[1]),
    }));
    try {
      const value = Reflect.apply(kill, this, args);
      record('kill-end'); return value;
    } catch (error) { observe(() => record('kill-error', { errorCode: errorCode(error) })); throw error; }
  };
  fs.appendFileSync = function (...args) {
    const value = Reflect.apply(append, this, args);
    if (args[0] === held) record('git-held-written');
    return value;
  };
  // Only these preloaded subprocesses are patched, never the test runner.
  syncBuiltinESMExports();
}
