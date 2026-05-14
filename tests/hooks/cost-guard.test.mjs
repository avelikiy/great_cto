// Tests for scripts/hooks/cost-guard.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/cost-guard.mjs');

function run(prompt, { homeDir, projectDir, env = {} } = {}) {
  const finalEnv = {
    ...process.env,
    GREAT_CTO_DISABLE_COST_GUARD: '',
    ...env,
  };
  if (homeDir) finalEnv.HOME = homeDir;
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    env: finalEnv,
    cwd: projectDir || process.cwd(),
  });
  return { exit: r.status, stderr: r.stderr };
}

// ─── Sandbox: isolated $HOME with config + cost log ──────────────────────
function sandbox({ config = null, costLog = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cost-guard-'));
  const homeDir = join(root, 'home');
  const projectDir = join(root, 'project');
  mkdirSync(join(homeDir, '.great_cto'), { recursive: true });
  mkdirSync(join(projectDir, '.great_cto'), { recursive: true });

  if (config) {
    writeFileSync(join(homeDir, '.great_cto', 'config.json'), JSON.stringify(config));
  }
  if (costLog) {
    writeFileSync(join(projectDir, '.great_cto', 'cost-history.log'), costLog);
  }
  return {
    homeDir, projectDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Basic behavior — backward compatibility with v0
// ═══════════════════════════════════════════════════════════════════════════

test('cheap prompt is silent', () => {
  const r = run('add a comment to foo.ts');
  assert.equal(r.exit, 0);
  assert.equal(r.stderr, '');
});

test('/start triggers cost warning (range syntax)', () => {
  const r = run('/start build me a fintech app');
  assert.equal(r.exit, 0);
  // Accept either hyphen or em-dash
  assert.match(r.stderr, /\$5[-–]\$15/);
});

test('/audit triggers cost warning', () => {
  const r = run('/audit the entire codebase');
  assert.equal(r.exit, 0);
  assert.match(r.stderr, /\$3[-–]\$10/);
});

test('"architect this" matches', () => {
  const r = run('please architect this new system');
  assert.equal(r.exit, 0);
  assert.match(r.stderr, /architect/);
});

test('opt-out env var works', () => {
  const r = run('/start neobank', { env: { GREAT_CTO_DISABLE_COST_GUARD: '1' } });
  assert.equal(r.exit, 0);
  assert.equal(r.stderr, '');
});

test('empty stdin passes silently', () => {
  const r = spawnSync('node', [HOOK], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// NEW v1 — Daily cap, hard enforcement, bump
// ═══════════════════════════════════════════════════════════════════════════

test('no caps configured → nag-free hint, exit 0', () => {
  const sb = sandbox({});
  try {
    const r = run('/start anything', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    assert.equal(r.exit, 0);
    assert.match(r.stderr, /no caps configured/);
  } finally { sb.cleanup(); }
});

test('daily_max_usd shows today vs cap', () => {
  const sb = sandbox({
    config: { daily_max_usd: 5 },
    costLog: `${new Date().toISOString()} agent=senior-dev cost_usd=1.20\n` +
             `${new Date().toISOString()} agent=qa cost_usd=0.80\n`,
  });
  try {
    const r = run('/start small feature', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    assert.equal(r.exit, 0);
    assert.match(r.stderr, /today:\s+\$2\.00\s*\/\s*\$5/);
  } finally { sb.cleanup(); }
});

test('enforce=block exits 2 when cap would be exceeded', () => {
  const sb = sandbox({
    config: { daily_max_usd: 5, enforce: 'block' },
    costLog: `${new Date().toISOString()} agent=senior-dev cost_usd=3.50\n`,  // $3.50 spent → $1.50 left
  });
  try {
    // /start estimated at $8 — over $1.50 remaining
    const r = run('/start big feature', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    assert.equal(r.exit, 2);
    assert.match(r.stderr, /🛑 BLOCKED/);
    assert.match(r.stderr, /cheap mode/);
    assert.match(r.stderr, /GREAT_CTO_BUMP_CAP/);
  } finally { sb.cleanup(); }
});

test('enforce=warn (default) returns exit 0 even when over cap', () => {
  const sb = sandbox({
    config: { daily_max_usd: 5 },  // enforce defaults to "warn"
    costLog: `${new Date().toISOString()} agent=senior-dev cost_usd=4.50\n`,
  });
  try {
    const r = run('/start anything', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    assert.equal(r.exit, 0);
    assert.match(r.stderr, /may exceed cap/);
  } finally { sb.cleanup(); }
});

test('GREAT_CTO_BUMP_CAP lifts cap for one prompt', () => {
  const sb = sandbox({
    config: { daily_max_usd: 5, enforce: 'block' },
    costLog: `${new Date().toISOString()} agent=senior-dev cost_usd=4.00\n`,
  });
  try {
    // /start est $8 — without bump would block. With +$10 bump, total $15 - $4 = $11 left.
    const r = run('/start feature', {
      homeDir: sb.homeDir, projectDir: sb.projectDir,
      env: { GREAT_CTO_BUMP_CAP: '10' },
    });
    assert.equal(r.exit, 0);   // not blocked
    assert.doesNotMatch(r.stderr, /BLOCKED/);
  } finally { sb.cleanup(); }
});

test('monthly_max_usd is also honored', () => {
  const sb = sandbox({
    config: { monthly_max_usd: 50, enforce: 'block' },
    costLog: `${new Date().toISOString()} agent=senior-dev cost_usd=48.00\n`,
  });
  try {
    const r = run('/start big', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    assert.equal(r.exit, 2);
    assert.match(r.stderr, /month:\s+\$48\.00\s*\/\s*\$50/);
  } finally { sb.cleanup(); }
});

test('past-day spend does NOT count toward today', () => {
  // Yesterday's spend should not pollute today's cap
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const sb = sandbox({
    config: { daily_max_usd: 5, enforce: 'block' },
    costLog: `${yesterday} agent=senior-dev cost_usd=10.00\n`,
  });
  try {
    // Yesterday spent $10, but today's bucket is fresh → $0 spent today
    const r = run('/start feature', { homeDir: sb.homeDir, projectDir: sb.projectDir });
    // /start est $8 > today's $5 remaining → still blocks, but for fresh cap
    assert.match(r.stderr, /today:\s+\$0\.00\s*\/\s*\$5/);
  } finally { sb.cleanup(); }
});
