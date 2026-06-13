// tests/telemetry.test.mjs — privacy invariants for the opt-IN CLI telemetry.
//
// The contract (docs/PRIVACY.md): default OFF, honors DO_NOT_TRACK, skips CI,
// no PII, anon_id is a stable non-reversible 8-hex digest. These tests lock it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOD = '../packages/cli/dist/telemetry.js';

// Each test runs with an isolated HOME so the real ~/.great_cto isn't touched,
// and a clean env. We re-import with a cache-busting query so module-level env
// reads (none here, but defensive) and config reads pick up the fresh HOME.
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-tel-'));
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  const saved = { HOME: process.env.HOME, ...pickEnv() };
  process.env.HOME = home;
  // wipe every telemetry env knob to a known-clean baseline
  for (const k of ENV_KEYS) delete process.env[k];
  return {
    home,
    restore() {
      rmSync(home, { recursive: true, force: true });
      process.env.HOME = saved.HOME;
      for (const k of ENV_KEYS) { if (saved[k] != null) process.env[k] = saved[k]; else delete process.env[k]; }
    },
  };
}
const ENV_KEYS = ['DO_NOT_TRACK', 'GREAT_CTO_TELEMETRY', 'GREAT_CTO_DISABLE_TELEMETRY',
  'GREATCTO_NO_TELEMETRY', 'CI', 'GITHUB_ACTIONS', 'GREAT_CTO_TELEMETRY_DRYRUN'];
function pickEnv() { const o = {}; for (const k of ENV_KEYS) o[k] = process.env[k]; return o; }
const fresh = () => import(`${MOD}?t=${Math.random()}`);

test('default is OFF (opt-in)', async () => {
  const s = sandbox();
  try {
    const { isTelemetryEnabled } = await fresh();
    assert.equal(isTelemetryEnabled(), false, 'telemetry must be disabled by default');
  } finally { s.restore(); }
});

test('env opt-in turns it on; DO_NOT_TRACK overrides it', async () => {
  const s = sandbox();
  try {
    const { isTelemetryEnabled } = await fresh();
    process.env.GREAT_CTO_TELEMETRY = 'on';
    assert.equal(isTelemetryEnabled(), true, 'GREAT_CTO_TELEMETRY=on enables');
    process.env.DO_NOT_TRACK = '1';
    assert.equal(isTelemetryEnabled(), false, 'DO_NOT_TRACK=1 wins over opt-in');
  } finally { s.restore(); }
});

test('CI environment disables telemetry even if opted in', async () => {
  const s = sandbox();
  try {
    const { isTelemetryEnabled } = await fresh();
    process.env.GREAT_CTO_TELEMETRY = 'on';
    process.env.GITHUB_ACTIONS = 'true';
    assert.equal(isTelemetryEnabled(), false, 'CI must suppress sends');
  } finally { s.restore(); }
});

test('config file opt-in is honored', async () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.home, '.great_cto', 'telemetry.json'), JSON.stringify({ enabled: true }));
    const { isTelemetryEnabled } = await fresh();
    assert.equal(isTelemetryEnabled(), true);
  } finally { s.restore(); }
});

test('anon_id is a stable, non-reversible 8-hex digest with no PII', async () => {
  const s = sandbox();
  try {
    const { computeAnonId } = await fresh();
    const id = computeAnonId();
    assert.match(id, /^[0-9a-f]{8}$/, 'anon_id must be 8 lowercase hex chars');
    assert.equal(computeAnonId(), id, 'anon_id must be stable across calls');
    // It must not leak username/hostname verbatim.
    const { userInfo, hostname } = await import('node:os');
    assert.ok(!id.includes(userInfo().username || 'x'), 'anon_id must not contain the username');
    assert.ok(!id.includes(hostname() || 'x'), 'anon_id must not contain the hostname');
  } finally { s.restore(); }
});

test('DRYRUN emits exactly the allowlisted fields and nothing else', async () => {
  const s = sandbox();
  try {
    process.env.GREAT_CTO_TELEMETRY = 'on';
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = '1';
    const { sendUsagePing } = await fresh();
    // Capture stderr.
    const lines = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
    try {
      await sendUsagePing({ cliVersion: '2.69.0', subcommand: 'init', exitCode: 0, durationMs: 12, archetype: 'fintech' });
    } finally { process.stderr.write = orig; }
    const m = lines.join('').match(/would-send: (\{.*\})/);
    assert.ok(m, 'DRYRUN should print a would-send payload');
    const evt = JSON.parse(m[1]);
    const allowed = ['ts', 'version', 'command', 'archetype', 'node', 'os', 'exit_code', 'duration_ms', 'anon_id'];
    assert.deepEqual(Object.keys(evt).sort(), [...allowed].sort(), 'payload must carry ONLY the allowlisted fields (no PII smuggling)');
    assert.equal(evt.command, 'init');
    assert.equal(evt.archetype, 'fintech');
    assert.match(evt.anon_id, /^[0-9a-f]{8}$/);
  } finally { s.restore(); }
});

test('a non-allowlisted command is dropped (never sent)', async () => {
  const s = sandbox();
  try {
    process.env.GREAT_CTO_TELEMETRY = 'on';
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = '1';
    const { sendUsagePing } = await fresh();
    const lines = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
    try {
      await sendUsagePing({ cliVersion: '2.69.0', subcommand: 'rm-rf-secret', exitCode: 0, durationMs: 1 });
    } finally { process.stderr.write = orig; }
    assert.equal(lines.join('').includes('would-send'), false, 'unknown command must be dropped before send');
  } finally { s.restore(); }
});
