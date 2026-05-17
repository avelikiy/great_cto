#!/usr/bin/env node
/**
 * great-cto postinstall — best-effort one-time setup that runs when the npm
 * package is installed globally or as a dependency.
 *
 * Currently does one thing: install llm-leash (https://github.com/avelikiy/llm-leash)
 * for runtime governance — budget caps, audit log, kill switch, HITL gates.
 *
 * Design rules:
 *   - NEVER fail the npm install. All errors swallowed.
 *   - Idempotent — skips if ~/.great_cto/llm-leash already cloned.
 *   - Honors GREAT_CTO_SKIP_LEASH=1 to opt out (CI envs, restricted machines).
 *   - Skips on CI by default unless GREAT_CTO_FORCE_LEASH=1 — npm install in
 *     CI shouldn't trigger 30s of git clone + pip install per build.
 *   - Skips if `npm install` was invoked with --ignore-scripts (npm sets
 *     `npm_config_ignore_scripts=true` — actually no, it just doesn't run
 *     scripts; we can't detect it from inside).
 *   - Detached output — postinstall noise is intentional and short.
 *
 * The "real" install path remains `great-cto leash install`. This hook just
 * makes the common case (one-shot `npm install -g great-cto`) feel zero-config.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const INSTALL_ROOT = path.join(homedir(), '.great_cto', 'llm-leash');

function main() {
  // ── opt-outs ─────────────────────────────────────────────────────────────
  if (process.env.GREAT_CTO_SKIP_LEASH === '1') {
    return; // silent
  }

  // Skip in CI unless explicitly forced — CI builds get no benefit from
  // having leash installed in the runner's home dir, and the latency hurts.
  const inCI = process.env.CI === 'true' || process.env.CI === '1';
  if (inCI && process.env.GREAT_CTO_FORCE_LEASH !== '1') {
    return;
  }

  // Already installed — fast exit
  if (existsSync(INSTALL_ROOT)) {
    return;
  }

  // Need git + python3 — bail silently if either is missing
  if (!hasCommand('git') || !hasCommand('python3')) {
    console.log('[great-cto] llm-leash skipped — git or python3 not on PATH');
    console.log('[great-cto] run `great-cto leash install` later to enable runtime governance');
    return;
  }

  // Locate the bundled dist/main.js — postinstall runs with cwd=package root
  const here = path.dirname(new URL(import.meta.url).pathname);
  const cli = path.join(here, 'dist', 'main.js');
  if (!existsSync(cli)) {
    return; // package built incorrectly — fail-safe
  }

  console.log('[great-cto] installing llm-leash for runtime governance (~30s) …');
  console.log('[great-cto] opt out next time: GREAT_CTO_SKIP_LEASH=1 npm install -g great-cto');

  const result = spawnSync(process.execPath, [cli, 'leash', 'install'], {
    stdio: 'inherit',
    timeout: 300_000,
    env: { ...process.env, NO_COLOR: process.env.NO_COLOR || '1' },
  });

  if (result.status !== 0) {
    console.log('[great-cto] llm-leash install hit an issue — run `great-cto leash install` later');
  }
}

function hasCommand(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 3000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

try { main(); } catch { /* never fail npm install */ }
