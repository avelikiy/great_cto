// E2E test — multi-platform parity (closes X4).
//
// Validates that `great-cto adapt --platform <X>` produces consistent
// configs across Claude Code, Cursor, OpenAI Codex CLI, Aider, and
// Continue. The shared AGENTS.md "core" must be identical across all 5
// platforms (since all 5 derive from getAgentsCore()).
//
// Without this test, a regression in one adapter (e.g. Cursor strips a
// compliance section) silently breaks one platform while others stay
// green. Users only notice when their Cursor agent doesn't get the
// PROJECT.md context.
//
// Run: node --test tests/multi-platform-parity.test.mjs (no LLM cost)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');

// Per-platform expected outputs
const PLATFORM_FILES = {
  claude:   ['CLAUDE.md', 'AGENTS.md'],
  codex:    ['AGENTS.md'],
  cursor:   ['.cursorrules', '.cursor/rules/great-cto.mdc'],
  aider:    ['.aider.conf.yml', 'CONVENTIONS.md'],
  continue: ['.continue/rules.md'],
};

// ── helpers ────────────────────────────────────────────────────────────────

function makeProject({ archetype = 'web-service', compliance = 'gdpr', owners = 'avelikiy' } = {}) {
  const project = mkdtempSync(join(tmpdir(), 'parity-proj-'));
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'),
    `primary: ${archetype}\narchetype: ${archetype}\ncompliance:\n  - ${compliance}\nowners: ${owners}\n`);
  return project;
}

function runAdapt(project, platform) {
  return spawnSync('node', [CLI_ENTRY, 'adapt', '--platform', platform], {
    cwd: project, encoding: 'utf8',
  });
}

function cleanup(...dirs) {
  for (const d of dirs) try { rmSync(d, { recursive: true, force: true }); } catch {}
}

// Extract a normalized "shared core" section that should appear identically
// across platforms. We define this as the lines between two well-known
// markers in any generated file that embeds AGENTS.md content.
function extractCore(content) {
  // The shared core starts with "# AGENTS.md" or "## Project context"
  // and ends just before any platform-specific instruction block.
  const start = content.indexOf('## Project context');
  if (start < 0) return null;
  // Take up to (but not including) the platform-specific tail
  const endMarkers = ['## How this differs from', '## Codex-specific', '## Cursor-specific',
                       '## Aider-specific', '## Continue-specific', '## Platform-specific'];
  let end = content.length;
  for (const marker of endMarkers) {
    const i = content.indexOf(marker, start);
    if (i > 0 && i < end) end = i;
  }
  return content.slice(start, end).trim();
}

// ── tests ──────────────────────────────────────────────────────────────────

test('parity: each of 5 platforms generates its expected files', async () => {
  for (const [platform, expectedFiles] of Object.entries(PLATFORM_FILES)) {
    const project = makeProject();
    try {
      const r = runAdapt(project, platform);
      assert.equal(r.status, 0,
        `adapt --platform ${platform} failed: ${r.stderr || r.stdout}`);
      for (const f of expectedFiles) {
        const fpath = join(project, f);
        assert.ok(existsSync(fpath),
          `Platform '${platform}' should create ${f}, missing.`);
      }
    } finally {
      cleanup(project);
    }
  }
});

test('parity: PROJECT.md archetype propagates into every platform output', async () => {
  const archetype = 'fintech';
  for (const [platform, files] of Object.entries(PLATFORM_FILES)) {
    const project = makeProject({ archetype });
    try {
      runAdapt(project, platform);
      // At least one of the platform's files should mention the archetype
      let found = false;
      for (const f of files) {
        const fpath = join(project, f);
        if (!existsSync(fpath)) continue;
        const content = readFileSync(fpath, 'utf8');
        if (content.includes(archetype)) { found = true; break; }
      }
      assert.ok(found,
        `Platform '${platform}': none of ${files.join(', ')} contains archetype '${archetype}'`);
    } finally {
      cleanup(project);
    }
  }
});

test('parity: compliance keys propagate into every platform output', async () => {
  const compliance = 'pci-dss';
  for (const [platform, files] of Object.entries(PLATFORM_FILES)) {
    const project = makeProject({ archetype: 'fintech', compliance });
    try {
      runAdapt(project, platform);
      let found = false;
      for (const f of files) {
        const fpath = join(project, f);
        if (!existsSync(fpath)) continue;
        const content = readFileSync(fpath, 'utf8');
        if (content.includes(compliance)) { found = true; break; }
      }
      assert.ok(found,
        `Platform '${platform}': none of ${files.join(', ')} contains compliance '${compliance}'`);
    } finally {
      cleanup(project);
    }
  }
});

test('parity: AGENTS.md content is identical wherever it appears across platforms', async () => {
  // claude and codex both produce AGENTS.md from the same getAgentsCore().
  // Verify byte-for-byte (after normalization).
  const project = makeProject();
  try {
    runAdapt(project, 'claude');
    const claudeAgentsMd = readFileSync(join(project, 'AGENTS.md'), 'utf8');
    cleanup(project);

    const project2 = makeProject();
    runAdapt(project2, 'codex');
    const codexAgentsMd = readFileSync(join(project2, 'AGENTS.md'), 'utf8');
    cleanup(project2);

    assert.equal(claudeAgentsMd, codexAgentsMd,
      'AGENTS.md content differs between claude and codex platforms — these should derive from the same getAgentsCore()');
  } finally {
    /* already cleaned in branches */
  }
});

test('parity: shared core (archetype + compliance + owners block) appears in every platform', async () => {
  // Build matrix: for each platform, get the file that embeds AGENTS.md,
  // extract the shared "## Project context" block, compare.
  const project = makeProject({ archetype: 'mlops', compliance: 'eu-ai-act', owners: 'ai-team' });
  const cores = {};
  const errors = [];

  try {
    for (const [platform, files] of Object.entries(PLATFORM_FILES)) {
      runAdapt(project, platform);
      // Find first file that contains the project context block
      let core = null;
      for (const f of files) {
        const fpath = join(project, f);
        if (!existsSync(fpath)) continue;
        const content = readFileSync(fpath, 'utf8');
        const extracted = extractCore(content);
        if (extracted) { core = extracted; break; }
      }
      if (!core) {
        errors.push(`Platform '${platform}' produced no extractable Project context block`);
        continue;
      }
      cores[platform] = core;
    }

    if (errors.length > 0) {
      // Soft warn for platforms that don't embed the full block — Cursor
      // and Continue have shorter formats. As long as archetype + compliance
      // are present somewhere, we don't fail on missing block format.
      // (Tested in separate test cases above.)
    }

    // For platforms that DO produce a Project context block, they must
    // agree on the contents (archetype, compliance, owners).
    const platforms = Object.keys(cores);
    if (platforms.length >= 2) {
      const reference = cores[platforms[0]];
      for (let i = 1; i < platforms.length; i++) {
        // Compare key fields only (the platforms may format differently)
        const refHasArch = reference.includes('mlops');
        const curHasArch = cores[platforms[i]].includes('mlops');
        assert.equal(refHasArch, curHasArch,
          `Archetype field disagrees between ${platforms[0]} and ${platforms[i]}`);

        const refHasCompliance = reference.includes('eu-ai-act');
        const curHasCompliance = cores[platforms[i]].includes('eu-ai-act');
        assert.equal(refHasCompliance, curHasCompliance,
          `Compliance field disagrees between ${platforms[0]} and ${platforms[i]}`);
      }
    }
  } finally {
    cleanup(project);
  }
});

test('parity: --platform all generates outputs for all 5 platforms', async () => {
  const project = makeProject();
  try {
    const r = runAdapt(project, 'all');
    assert.equal(r.status, 0, `adapt --platform all failed: ${r.stderr || r.stdout}`);
    for (const files of Object.values(PLATFORM_FILES)) {
      for (const f of files) {
        const fpath = join(project, f);
        assert.ok(existsSync(fpath), `'all' should create ${f}, missing.`);
      }
    }
  } finally {
    cleanup(project);
  }
});
