#!/usr/bin/env node
// Bootstraps an isolated bd-fixture project + spawns the board server on port 3146.
// Used by playwright.config.mjs as `webServer.command`.
//
// Why a fresh fixture: tests need predictable task counts and a known gate to
// click. We don't want to mutate the user's real project state.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX_DIR = path.join(os.tmpdir(), 'gct-ui-fixture');
const PORT = 3146;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function bd(args, opts = {}) {
  const r = spawnSync('bd', args, {
    cwd: opts.cwd || FIX_DIR,
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
  });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`bd ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r;
}

function setupFixture() {
  rmSync(FIX_DIR, { recursive: true, force: true });
  mkdirSync(FIX_DIR, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: FIX_DIR });

  // Init bd
  spawnSync('bd', ['init'], { cwd: FIX_DIR, stdio: 'pipe' });

  // Create predictable test tasks
  // 2 gate tasks
  const r1 = spawnSync('bd', [
    'create', 'gate:arch — test feature', '-p', '0',
    '-d', 'Architecture review for the test feature. Approve to proceed.',
    '-l', 'gate', '--silent', '-q',
  ], { cwd: FIX_DIR, encoding: 'utf8' });
  spawnSync('bd', [
    'create', 'gate:ship — release v1.0', '-p', '1',
    '-d', 'Final ship gate. QA passed, security clean.',
    '-l', 'gate', '--silent', '-q',
  ], { cwd: FIX_DIR, encoding: 'utf8' });

  // 1 P0 in-progress
  const ip1 = spawnSync('bd', [
    'create', 'P0 incident — db connection pool exhausted', '-p', '0',
    '-d', 'Active incident: production DB hitting connection limit.',
    '--silent', '-q',
  ], { cwd: FIX_DIR, encoding: 'utf8' }).stdout.trim();
  if (ip1) bd(['update', ip1, '--status', 'in_progress', '-q'], { cwd: FIX_DIR, allowFail: true });

  // 3 backlog
  spawnSync('bd', ['create', 'Add OpenAPI docs', '-p', '2', '-d', 'Generate spec from existing routes.', '--silent', '-q'], { cwd: FIX_DIR });
  spawnSync('bd', ['create', 'Migrate to OpenTelemetry', '-p', '2', '-d', 'Replace winston transports.', '--silent', '-q'], { cwd: FIX_DIR });
  spawnSync('bd', ['create', 'Storybook coverage 95%', '-p', '3', '-d', 'Visual regression budget.', '--silent', '-q'], { cwd: FIX_DIR });

  // 2 closed (history)
  const c1 = spawnSync('bd', ['create', 'OAuth2 token refresh', '-p', '1', '-d', 'Background refresh + 401 retry.', '--silent', '-q'], { cwd: FIX_DIR, encoding: 'utf8' }).stdout.trim();
  if (c1) bd(['close', c1, '-r', 'shipped', '--session', 'ui-test', '--force', '-q'], { cwd: FIX_DIR, allowFail: true });
  const c2 = spawnSync('bd', ['create', 'Stripe webhook signature check', '-p', '1', '-d', 'Reject stale > 5min.', '--silent', '-q'], { cwd: FIX_DIR, encoding: 'utf8' }).stdout.trim();
  if (c2) bd(['close', c2, '-r', 'shipped', '--session', 'ui-test', '--force', '-q'], { cwd: FIX_DIR, allowFail: true });

  // PROJECT.md so /api/projects works
  mkdirSync(path.join(FIX_DIR, '.great_cto'), { recursive: true });
  writeFileSync(path.join(FIX_DIR, '.great_cto', 'PROJECT.md'),
`# UI Test Fixture

project: ui-test
archetype: web-service
description: Playwright e2e fixture
monthly-budget: $50
`);

  // Seed brain.md so memory tab has content
  writeFileSync(path.join(FIX_DIR, '.great_cto', 'brain.md'),
`# Brain — UI Test Fixture

## Patterns in use
- pgBouncer pool size 50 with circuit breaker
- 12-angle review gate before merge

## What failed
- Connection pool exhaustion on Q1 — fixed via pgBouncer migration
`);
}

setupFixture();

// Spawn the server. Use the LIVE source from this repo (not the npm cache).
const serverPath = path.join(REPO_ROOT, 'packages', 'board', 'server.mjs');
if (!existsSync(serverPath)) {
  console.error('server.mjs not found at', serverPath);
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath, '--no-open'], {
  cwd: FIX_DIR,
  env: { ...process.env, BOARD_PORT: String(PORT) },
  stdio: 'inherit',
});

const cleanup = () => {
  child.kill();
  rmSync(FIX_DIR, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('exit', cleanup);
