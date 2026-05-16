// E2E test — Claude Code adapter (adapt command).
//
// Validates that `great-cto adapt` generates correct CLAUDE.md + AGENTS.md
// with archetype, compliance, and owners from PROJECT.md.
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

const EXPECTED_FILES = ['CLAUDE.md', 'AGENTS.md'];

// ── helpers ────────────────────────────────────────────────────────────────

function makeProject({ archetype = 'web-service', compliance = 'gdpr', owners = 'avelikiy' } = {}) {
  const project = mkdtempSync(join(tmpdir(), 'adapt-proj-'));
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'),
    `primary: ${archetype}\narchetype: ${archetype}\ncompliance:\n  - ${compliance}\nowners: ${owners}\n`);
  return project;
}

function runAdapt(project, extraArgs = []) {
  return spawnSync('node', [CLI_ENTRY, 'adapt', ...extraArgs], {
    cwd: project, encoding: 'utf8',
  });
}

function cleanup(...dirs) {
  for (const d of dirs) try { rmSync(d, { recursive: true, force: true }); } catch {}
}

// ── tests ──────────────────────────────────────────────────────────────────

test('adapt: generates CLAUDE.md and AGENTS.md', async () => {
  const project = makeProject();
  try {
    const r = runAdapt(project);
    assert.equal(r.status, 0, `adapt failed: ${r.stderr || r.stdout}`);
    for (const f of EXPECTED_FILES) {
      assert.ok(existsSync(join(project, f)), `adapt should create ${f}`);
    }
  } finally {
    cleanup(project);
  }
});

test('adapt: PROJECT.md archetype propagates into AGENTS.md', async () => {
  const archetype = 'fintech';
  const project = makeProject({ archetype });
  try {
    runAdapt(project);
    const content = readFileSync(join(project, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes(archetype),
      `AGENTS.md should contain archetype '${archetype}'`);
  } finally {
    cleanup(project);
  }
});

test('adapt: compliance keys propagate into AGENTS.md', async () => {
  const compliance = 'pci-dss';
  const project = makeProject({ archetype: 'fintech', compliance });
  try {
    runAdapt(project);
    const content = readFileSync(join(project, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes(compliance),
      `AGENTS.md should contain compliance '${compliance}'`);
  } finally {
    cleanup(project);
  }
});

test('adapt: owners propagate into AGENTS.md', async () => {
  const owners = 'ai-team';
  const project = makeProject({ archetype: 'mlops', compliance: 'eu-ai-act', owners });
  try {
    runAdapt(project);
    const content = readFileSync(join(project, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes(owners),
      `AGENTS.md should contain owners '${owners}'`);
  } finally {
    cleanup(project);
  }
});

test('adapt: CLAUDE.md references AGENTS.md', async () => {
  const project = makeProject();
  try {
    runAdapt(project);
    const content = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('AGENTS.md'),
      'CLAUDE.md should reference AGENTS.md');
  } finally {
    cleanup(project);
  }
});

test('adapt: --dry-run writes no files', async () => {
  const project = makeProject();
  try {
    const r = runAdapt(project, ['--dry-run']);
    assert.equal(r.status, 0, `adapt --dry-run failed: ${r.stderr || r.stdout}`);
    for (const f of EXPECTED_FILES) {
      assert.ok(!existsSync(join(project, f)),
        `--dry-run should not create ${f}`);
    }
    assert.ok(r.stdout.includes('would write'),
      '--dry-run should print "would write" lines');
  } finally {
    cleanup(project);
  }
});
