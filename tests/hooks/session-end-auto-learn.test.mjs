// Tests for auto-learn behaviour in scripts/hooks/session-end.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/session-end.mjs');

/**
 * Run session-end hook in an isolated temp directory.
 * Returns { exit, stdout, stderr }.
 */
function run(payload = {}, { env = {}, config = null, dirty = false } = {}) {
  const projectDir = mkdtempSync(join(tmpdir(), 'session-end-learn-'));
  // Pre-create .great_cto so the hook can write into it
  mkdirSync(join(projectDir, '.great_cto'), { recursive: true });

  // HOME is the fixture's too: auto-learn can now be switched on in
  // ~/.great_cto/config.json, and the real one on this machine must not decide
  // whether a test sees a learner.
  const home = join(projectDir, '.home');
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  if (config) writeFileSync(join(home, '.great_cto', 'config.json'), JSON.stringify(config));
  // A session that changed nothing is skipped on purpose (learn-worth-it); a test of
  // the learner needs a session with something in it.
  if (dirty) {
    spawnSync('git', ['init', '-q'], { cwd: projectDir });
    writeFileSync(join(projectDir, 'work.txt'), 'changed\n');
  }

  const finalEnv = {
    ...process.env,
    HOME: home,
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

/** A fake `claude` that fails like the real CLI when it is not given -p and a prompt. */
function fakeClaudeBin() {
  const binDir = mkdtempSync(join(tmpdir(), 'fake-claude-bin-'));
  const fakeClaude = join(binDir, 'claude');
  writeFileSync(fakeClaude, `#!/bin/sh
case " $* " in *" -p "*) exit 0 ;; esac
echo "Error: Input must be provided either through stdin or as a prompt argument when using --print" >&2
exit 1
`);
  chmodSync(fakeClaude, 0o755);
  return binDir;
}

/** A transcript the operator actually spoke in — the runner skips sessions with fewer than two messages. */
function talkedTranscript() {
  const f = join(mkdtempSync(join(tmpdir(), 'learn-talk-')), 't.jsonl');
  writeFileSync(f, ['почини тест', 'всё ещё красный'].map((t) => JSON.stringify({ type: 'user', message: { content: t } })).join('\n'));
  return f;
}

async function markerEventually(path, re, ms = 8000) {
  const end = Date.now() + ms;
  let last = '';
  while (Date.now() < end) {
    try { last = readFileSync(path, 'utf8'); if (re.test(last)) return last; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return last;
}

test('the hook writes started, and the runner replaces it with the real outcome', async () => {
  const binDir = fakeClaudeBin();
  const res = run({ reason: 'logout', transcript_path: talkedTranscript() }, { dirty: true, env: { GREAT_CTO_AUTO_LEARN: '1', PATH: `${binDir}:${process.env.PATH || ''}` } });
  try {
    assert.equal(res.exit, 0, 'hook must exit 0');
    const first = readFileSync(res.markerPath, 'utf8');
    assert.match(first, /started: /, 'on spawn the hook claims only that it started');
    assert.doesNotMatch(first, / ran: /, '"ran" on spawn is the lie this replaced');
    // The fake exits 1 unless given -p — so "done" proves the runner called it right.
    const final = await markerEventually(res.markerPath, /done: |failed: /);
    assert.match(final, /done: lessons\+0/, `the runner reached the learner in print mode (marker: ${final.trim()})`);
  } finally {
    res.cleanup();
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('"auto_learn": true in ~/.great_cto/config.json turns it on without the env var', async () => {
  const binDir = fakeClaudeBin();
  const res = run({ transcript_path: talkedTranscript() }, { dirty: true, env: { PATH: `${binDir}:${process.env.PATH || ''}` }, config: { auto_learn: true } });
  try {
    assert.match(await markerEventually(res.markerPath, /done: |failed: /), /done: /);
  } finally {
    res.cleanup();
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('GREAT_CTO_AUTO_LEARN=0 wins over the config file', () => {
  const res = run({}, { env: { GREAT_CTO_AUTO_LEARN: '0' }, config: { auto_learn: true } });
  try {
    assert.ok(!existsSync(res.markerPath));
  } finally {
    res.cleanup();
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
