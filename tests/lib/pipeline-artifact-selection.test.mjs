import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/test-pipeline.sh', import.meta.url));
const invoke = args => spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 5000 });

test('candidate selection rejects empty, relative and duplicate paths before probes', () => {
  for (const args of [['--plugin-dir='], ['--plugin-dir=relative'], ['--plugin-dir=/one', '--plugin-dir=/two']]) {
    const result = invoke(args);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /L1|pipeline test/);
  }
});

test('candidate selection refuses incomplete artifact before probes', t => {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-artifact-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = invoke([`--plugin-dir=${root}`]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /candidate artifact missing/);
  assert.doesNotMatch(result.stdout, /pipeline test/);
});

test('explicit candidate mode is labelled separately and never registers with hosts', t => {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-artifact-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['.claude-plugin/plugin.json', 'packages/cli/index.mjs', 'packages/cli/dist/main.js', 'packages/board/server.mjs']) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), 'fixture');
  }
  const result = invoke([`--plugin-dir=${root}`, '--skip-l1', '--skip-l2', '--skip-l3', '--skip-l4', '--skip-l5']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /explicit candidate artifact \(not operator installed-plugin evidence\)/);
  assert.match(result.stdout, /NOT CHECKED/);
});

test('canonical library gate bounds scheduling without excluding test inventory', () => {
  const ci = readFileSync(new URL('../../scripts/ci-local.sh', import.meta.url), 'utf8');
  assert.match(ci, /step "lib tests" node --test --test-concurrency=2 tests\/lib\/\*\.test\.mjs scripts\/lib\/\*\.test\.mjs/);
  assert.match(ci, /GREAT_CTO_TEST_PLUGIN_DIR/);
  assert.doesNotMatch(ci, /--test-name-pattern|--test-skip-pattern/);
});
