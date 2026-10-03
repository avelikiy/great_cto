import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { treeReceipt, fileDigest } from '../../scripts/lib/receipt.mjs';

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'receipt-executable-boundary-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'candidate'); mkdirSync(root);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git(['init', '-q']); writeFileSync(join(root, 'sample.txt'), 'before\n'); git(['add', '.']);
  git(['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const marker = join(temp, 'executed'), helper = join(temp, 'helper.mjs');
  writeFileSync(helper, `import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, 'invoked\\n'); process.stdout.write('converted\\n');`);
  const command = `'${process.execPath.replace(/'/g, "'\\''")}' '${helper.replace(/'/g, "'\\''")}'`;
  writeFileSync(join(root, 'sample.txt'), 'after\n');
  return { root, git, marker, helper, command };
}

test('receipt diff does not invoke a configured external driver', t => {
  const f = fixture(t); f.git(['config', 'diff.external', f.command]);
  f.git(['diff', 'HEAD']); assert.equal(existsSync(f.marker), true, 'witness proves helper is executable');
  rmSync(f.marker);
  const receipt = treeReceipt(f.root);
  assert.ok(receipt?.dirty); assert.ok(receipt.files['sample.txt']);
  assert.equal(existsSync(f.marker), false);
});

test('receipt does not invoke configured textconv on candidate attributes', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), '*.txt diff=oracle\n');
  f.git(['config', 'diff.oracle.textconv', f.command]);
  f.git(['diff', 'HEAD']); assert.equal(existsSync(f.marker), true);
  rmSync(f.marker);
  assert.ok(treeReceipt(f.root)?.dirty); assert.equal(existsSync(f.marker), false);
});

test('receipt fileDigest hashes raw on-disk bytes without a configured clean filter', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=oracle\n');
  f.git(['config', 'filter.oracle.clean', f.command]);
  const converted = f.git(['hash-object', '--', 'sample.txt']).trim();
  assert.equal(existsSync(f.marker), true); rmSync(f.marker);
  const raw = f.git(['hash-object', '--no-filters', '--', 'sample.txt']).trim();
  assert.notEqual(raw, converted);
  assert.equal(fileDigest(f.root, 'sample.txt'), raw); assert.equal(existsSync(f.marker), false);
  assert.ok(treeReceipt(f.root)?.dirty); assert.equal(existsSync(f.marker), false, 'diff inspection must also disable clean filters');
});

test('receipt Git reads disable configured filesystem monitor executable', t => {
  const f = fixture(t), monitor = join(f.root, '..', 'monitor.sh');
  writeFileSync(monitor, `#!/bin/sh\n${f.command}\n`); chmodSync(monitor, 0o700);
  f.git(['config', 'core.fsmonitor', monitor]);
  f.git(['ls-files']); assert.equal(existsSync(f.marker), true);
  rmSync(f.marker);
  assert.ok(treeReceipt(f.root)?.head); assert.equal(existsSync(f.marker), false);
});

test('receipt disables required long-running process filters without launching them', t => {
  const f = fixture(t); writeFileSync(join(f.root, '.gitattributes'), '*.txt filter=oracle\n');
  f.git(['config', 'filter.oracle.process', f.command]);
  f.git(['config', 'filter.oracle.required', 'true']);
  assert.ok(treeReceipt(f.root)?.dirty);
  assert.equal(existsSync(f.marker), false);
});

test('failed Git inspection returns unknown, not a fabricated clean receipt', t => {
  const f = fixture(t); f.git(['config', 'core.repositoryFormatVersion', '999']);
  assert.equal(treeReceipt(f.root), null);
});
