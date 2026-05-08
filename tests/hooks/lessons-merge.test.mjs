// Tests for scripts/lessons-merge.mjs
//
// Run with:  node --test tests/hooks/lessons-merge.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../../scripts/lessons-merge.mjs');

function makeTmpHome() {
  const home = join(tmpdir(), `gc-merge-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(home, { recursive: true });
  mkdirSync(join(home, '.great_cto', 'projects'), { recursive: true });
  return home;
}

function makeLesson({ slug, archetype, project }) {
  return `---
date: 2026-05-08
project: ${project}
archetype: ${archetype}
confidence: high
shape: A
---

## pattern: ${slug}

**Context:** Test fixture for ${project}.

**Decision/Pattern:** Always do X.

**Outcome:** Caught Y bug.

**Applies-to-archetypes:** ${archetype}

**Evidence:**
- session: 2026-05-08

**Skill-candidate:** n/a
`;
}

function writeProject(home, name, lessonsContent) {
  const dir = join(home, '.great_cto', 'projects', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'lessons.md'), lessonsContent);
}

function run(home, args = []) {
  const r = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('no projects → exits clean with informative message', () => {
  const home = makeTmpHome();
  try {
    const r = run(home);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /no patterns met threshold/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('single occurrence → not promoted', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'always-validate-webhook', archetype: 'fintech', project: 'proj-a' }));
    const r = run(home);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /no patterns met threshold/);
    assert.equal(existsSync(join(home, '.great_cto', 'decisions.md')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('two occurrences → not promoted (threshold=3)', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'always-validate-webhook', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'always-validate-webhook', archetype: 'fintech', project: 'proj-b' }));
    const r = run(home);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /no patterns met threshold/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('three occurrences → promoted to decisions.md', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'always-validate-webhook', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'always-validate-webhook', archetype: 'commerce', project: 'proj-b' }));
    writeProject(home, 'proj-c', makeLesson({ slug: 'always-validate-webhook', archetype: 'marketplace', project: 'proj-c' }));

    const r = run(home);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /promoting 1 pattern/);

    const decisions = readFileSync(join(home, '.great_cto', 'decisions.md'), 'utf8');
    assert.match(decisions, /## pattern: always-validate-webhook/);
    assert.match(decisions, /occurrences: 3/);
    assert.match(decisions, /skill-candidate-priority: high/); // 3 archetypes → high priority
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('repeat run skips already-promoted slugs', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-b' }));
    writeProject(home, 'proj-c', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-c' }));

    run(home);   // first promotion
    const r2 = run(home);  // second run — should be no-op
    assert.equal(r2.exit, 0);
    assert.match(r2.stdout, /no patterns met threshold/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('--force re-promotes already-promoted patterns', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-b' }));
    writeProject(home, 'proj-c', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-c' }));

    run(home);
    const r2 = run(home, ['--force']);
    assert.equal(r2.exit, 0);
    assert.match(r2.stdout, /promoting 1 pattern/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('--dry-run reports but does not write', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-b' }));
    writeProject(home, 'proj-c', makeLesson({ slug: 'foo', archetype: 'fintech', project: 'proj-c' }));

    const r = run(home, ['--dry-run']);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /promoting 1 pattern/);
    assert.match(r.stdout, /not writing/);
    assert.equal(existsSync(join(home, '.great_cto', 'decisions.md')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('multiple distinct patterns aggregate independently', () => {
  const home = makeTmpHome();
  try {
    writeProject(home, 'proj-a', makeLesson({ slug: 'pattern-x', archetype: 'fintech', project: 'proj-a' }) +
                                  '\n' + makeLesson({ slug: 'pattern-y', archetype: 'fintech', project: 'proj-a' }));
    writeProject(home, 'proj-b', makeLesson({ slug: 'pattern-x', archetype: 'fintech', project: 'proj-b' }));
    writeProject(home, 'proj-c', makeLesson({ slug: 'pattern-x', archetype: 'fintech', project: 'proj-c' }));

    const r = run(home);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /promoting 1 pattern/);  // only x has 3 projects
    assert.match(r.stdout, /pattern-x/);
    assert.doesNotMatch(r.stdout, /pattern-y \(/);  // y in only 1 project
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
