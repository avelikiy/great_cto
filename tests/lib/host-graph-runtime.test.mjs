import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHostGraphRuntime, auditHostGraphRuntimes } from '../../scripts/lib/host-graph-runtime.mjs';

function commandFixture(outputs) {
  const calls = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args, options });
    return outputs[args.join(' ')] ?? { status: 1, stdout: '', stderr: 'unavailable' };
  };
  return { run, calls };
}

test('Codex audit requires exec help evidence separately from numeric version', () => {
  const fixture = commandFixture({ '--version': { status: 0, stdout: 'codex-cli 0.153.4' }, 'exec --help': { status: 0, stdout: 'Usage: codex exec --json --sandbox read-only' } });
  const result = auditHostGraphRuntime({ host: 'codex', run: fixture.run });
  assert.equal(result.state, 'available'); assert.equal(result.sourceVersion, '0.153.4');
  assert.equal(result.controlled.streamEvents, true); assert.equal(result.native.hookEvents, null);
  assert.equal(result.liveAcceptance, 'not-checked');
  assert.deepEqual(fixture.calls.map(c => c.args), [['--version'], ['exec', '--help']]);
  for (const call of fixture.calls) { assert.equal(call.options.timeout, 10000); assert.equal(call.options.maxBuffer, 1024 * 1024); }
});

test('Claude audit requires structured streaming output evidence in help', () => {
  const fixture = commandFixture({ '--version': { status: 0, stdout: '2.1.3 (Claude Code)' }, '--help': { status: 0, stdout: '--output-format <format> json stream-json --verbose' } });
  const result = auditHostGraphRuntime({ host: 'claude-code', run: fixture.run });
  assert.equal(result.controlled.streamEvents, true); assert.equal(result.sourceVersion, '2.1.3');
  assert.equal(result.native.hookEvents, null); assert.equal(result.liveAcceptance, 'not-checked');
});

test('version alone never establishes streaming support', () => {
  for (const host of ['codex', 'claude-code']) {
    const fixture = commandFixture({ '--version': { status: 0, stdout: '9.9.9' }, [host === 'codex' ? 'exec --help' : '--help']: { status: 0, stdout: 'ordinary help without stream support' } });
    const result = auditHostGraphRuntime({ host, run: fixture.run });
    assert.equal(result.state, 'unsupported'); assert.equal(result.controlled.streamEvents, false);
  }
});

test('failed commands and exceptions expose no raw diagnostic paths', () => {
  const absent = auditHostGraphRuntime({ host: 'codex', bin: '/private/local/bin', run: () => ({ error: { code: 'ENOENT', message: '/private/local/bin' }, status: null, stderr: 'SECRET' }) });
  assert.equal(absent.state, 'absent'); assert.equal(absent.controlled.streamEvents, null);
  assert(!JSON.stringify(absent).includes('/private')); assert(!JSON.stringify(absent).includes('SECRET'));
  const broken = auditHostGraphRuntime({ host: 'claude-code', run: () => { throw Error('/private/path TOKEN'); } });
  assert.equal(broken.state, 'unreadable'); assert(!JSON.stringify(broken).includes('TOKEN'));
});

test('failed help keeps support unknown even with a valid version', () => {
  const fixture = commandFixture({ '--version': { status: 0, stdout: 'codex-cli 1.2.3' }, 'exec --help': { status: null, error: { code: 'ETIMEDOUT' }, stdout: '--json' } });
  const result = auditHostGraphRuntime({ host: 'codex', run: fixture.run });
  assert.equal(result.state, 'unreadable'); assert.equal(result.sourceVersion, '1.2.3'); assert.equal(result.controlled.streamEvents, null);
});

test('aggregate provider-free audit checks both hosts and no auth or provider commands', () => {
  const calls = [];
  const result = auditHostGraphRuntimes({ run: (bin, args) => { calls.push(args); return { status: 0, stdout: args[0] === '--version' ? '1.2.3' : '--json --output-format stream-json --verbose' }; } });
  assert.equal(result.length, 2); assert.deepEqual(result.map(r => r.host), ['codex', 'claude-code']);
  assert(calls.every(args => args.includes('--help') || args.includes('--version')));
});

test('unrecognized hosts are rejected without launching a process', () => {
  let launched = false;
  assert.throws(() => auditHostGraphRuntime({ host: 'other', run: () => { launched = true; } }), /host/);
  assert.equal(launched, false);
});

test('unrelated JSON schema flag does not establish Codex event streaming', () => {
  const fixture = commandFixture({ '--version': { status: 0, stdout: '1.2.3' }, 'exec --help': { status: 0, stdout: '--json-schema <schema>' } });
  assert.equal(auditHostGraphRuntime({ host: 'codex', run: fixture.run }).controlled.streamEvents, false);
});
