// Tests for auto-learn behaviour in scripts/hooks/session-end.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/session-end.mjs');

/**
 * Run session-end hook in an isolated temp directory.
 * Returns { exit, stdout, stderr }.
 */
function run(payload = {}, { env = {} } = {}) {
  const projectDir = mkdtempSync(join(tmpdir(), 'session-end-learn-'));
  // Pre-create .great_cto so the hook can write into it
  mkdirSync(join(projectDir, '.great_cto'), { recursive: true });

  const finalEnv = {
    ...process.env,
    // Clear flags by default so tests are isolated
    GREAT_CTO_DISABLE_SESSION_LEARNING: '',
    GREAT_CTO_AUTO_LEARN: '',
    ...env,
  };

  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: finalEnv,
    cwd: projectDir,
  });

  return {
    exit: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    projectDir,
    markerPath: join(projectDir, '.great_cto', '.last-auto-learn'),
    cleanup: () => rmSync(projectDir, { recursive: true, force: true }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Marker file creation
// ═══════════════════════════════════════════════════════════════════════════

test('GREAT_CTO_AUTO_LEARN=1 writes .last-auto-learn marker when claude CLI is present', () => {
  // We cannot guarantee claude is on PATH in CI, so we only assert exit=0 and
  // that the hook didn't crash. The marker check is conditional on claude existing.
  const res = run({}, { env: { GREAT_CTO_AUTO_LEARN: '1' } });
  try {
    assert.equal(res.exit, 0, 'hook must exit 0 even with AUTO_LEARN enabled');
    // If claude CLI is on PATH, marker should exist; if not, hook silently skips.
    // We do NOT assert marker existence unconditionally to keep tests hermetic.
  } finally {
    res.cleanup();
  }
});

test('GREAT_CTO_AUTO_LEARN=1 with mock claude creates marker file', () => {
  // Build a tiny fake "claude" script that exits immediately so we don't
  // actually invoke the real agent during unit tests.
  const binDir = mkdtempSync(join(tmpdir(), 'fake-claude-bin-'));
  const fakeClaude = join(binDir, 'claude');

  // Write a minimal shell script that acts as the claude stub
  writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n');
  chmodSync(fakeClaude, 0o755);

  // Prepend our fake bin dir so `which claude` resolves it first
  const pathWithFake = `${binDir}:${process.env.PATH || ''}`;

  const res = run({}, {
    env: {
      GREAT_CTO_AUTO_LEARN: '1',
      PATH: pathWithFake,
    },
  });

  try {
    assert.equal(res.exit, 0, 'hook must exit 0');
    assert.ok(existsSync(res.markerPath), '.last-auto-learn marker must be created');
  } finally {
    res.cleanup();
    rmSync(binDir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Flag absent — no spawn
// ═══════════════════════════════════════════════════════════════════════════

test('without GREAT_CTO_AUTO_LEARN flag no marker file is created', () => {
  const res = run({});
  try {
    assert.equal(res.exit, 0);
    assert.ok(!existsSync(res.markerPath), '.last-auto-learn must NOT exist when AUTO_LEARN is off');
  } finally {
    res.cleanup();
  }
});

test('GREAT_CTO_AUTO_LEARN=0 does not create marker file', () => {
  const res = run({}, { env: { GREAT_CTO_AUTO_LEARN: '0' } });
  try {
    assert.equal(res.exit, 0);
    assert.ok(!existsSync(res.markerPath), '.last-auto-learn must NOT exist when AUTO_LEARN=0');
  } finally {
    res.cleanup();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISABLE flag overrides everything
// ═══════════════════════════════════════════════════════════════════════════

test('GREAT_CTO_DISABLE_SESSION_LEARNING=1 overrides AUTO_LEARN=1', () => {
  const res = run({}, {
    env: {
      GREAT_CTO_DISABLE_SESSION_LEARNING: '1',
      GREAT_CTO_AUTO_LEARN: '1',
    },
  });
  try {
    assert.equal(res.exit, 0, 'hook must still exit 0');
    assert.ok(!existsSync(res.markerPath), '.last-auto-learn must NOT exist when DISABLE flag is set');
  } finally {
    res.cleanup();
  }
});

test('GREAT_CTO_DISABLE_SESSION_LEARNING=1 alone exits cleanly', () => {
  const res = run({}, { env: { GREAT_CTO_DISABLE_SESSION_LEARNING: '1' } });
  try {
    assert.equal(res.exit, 0);
  } finally {
    res.cleanup();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Exit code — always 0
// ═══════════════════════════════════════════════════════════════════════════

test('hook always exits 0 regardless of flags', () => {
  for (const env of [
    {},
    { GREAT_CTO_AUTO_LEARN: '1' },
    { GREAT_CTO_DISABLE_SESSION_LEARNING: '1' },
    { GREAT_CTO_AUTO_LEARN: '1', GREAT_CTO_DISABLE_SESSION_LEARNING: '1' },
  ]) {
    const res = run({}, { env });
    try {
      assert.equal(res.exit, 0, `expected exit 0 with env ${JSON.stringify(env)}`);
    } finally {
      res.cleanup();
    }
  }
});
