import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSessionEndSmoke } from '../../scripts/lib/session-end-smoke.mjs';
import { spawnSync } from 'node:child_process';

test('actual source SessionEnd writes snapshot and isolated lessons link, without real background tasks', () => {
  const result = runSessionEndSmoke({ hookPath: fileURLToPath(new URL('../../scripts/hooks/session-end.mjs', import.meta.url)) });
  assert.deepEqual(result, {
    snapshotVerified: true, isolatedRegistrationVerified: true,
    actualGitBeadsCaptureVerified: false, actualMergeVerified: false,
    actualLearnerVerified: false, providerCalls: 0,
  });
});

test('a hook that merely exits zero cannot pass as snapshot evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-no-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hook = join(root, 'hook.mjs');
  writeFileSync(hook, 'process.exit(0);');
  assert.throws(() => runSessionEndSmoke({ hookPath: hook }), /ENOENT|actual snapshot/);
});

test('unexpected child launch is intercepted and cannot become successful snapshot proof', t => {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-unexpected-session-child-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hook = join(root, 'hook.mjs');
  writeFileSync(hook, "import{spawn}from'node:child_process';spawn('claude',['-p','do not execute']);");
  assert.throws(() => runSessionEndSmoke({ hookPath: hook }), /unexpected child refused/);
});

test('quoted shell-shaped hook filename remains argv data and captures the actual snapshot', t => {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-session-argv-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hook = join(root, "hook 'quoted $literal; [fixture].mjs");
  const source = fileURLToPath(new URL('../../scripts/hooks/session-end.mjs', import.meta.url));
  writeFileSync(hook, 'await import(' + JSON.stringify(pathToFileURL(source).href) + ');');
  assert.equal(runSessionEndSmoke({ hookPath: hook }).snapshotVerified, true);
});

test('unexpected alternate process API is refused before execution', t => {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-session-exec-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hook = join(root, 'hook.mjs');
  writeFileSync(hook, "import{execFileSync}from'node:child_process';execFileSync('claude',['-p','must not execute']);");
  assert.throws(() => runSessionEndSmoke({ hookPath: hook }), /unexpected child refused/);
});

test('stock summary cannot claim merge readiness for skipped checks', () => {
  const script = fileURLToPath(new URL('../../scripts/test-pipeline.sh', import.meta.url));
  const r = spawnSync('bash', [script, '--skip-l1', '--skip-l2', '--skip-l3', '--skip-l4', '--skip-l5'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /checks NOT CHECKED\. Full pipeline readiness is unproven/);
  assert.doesNotMatch(r.stdout, /Pipeline ready to merge/);
});
