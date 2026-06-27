// tests/lib/acceptance-verify.test.mjs — DEEPEN W2 acceptance executor.
// Run: node --test tests/lib/acceptance-verify.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAcceptance, summarize } from '../../scripts/lib/acceptance-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL = join(__dirname, '..', '..', 'scripts', 'lib', 'acceptance-verify.mjs');

const BRIEF = `# IMPL-BRIEF-x

## ACCEPTANCE
- [ ] Tests pass — verify: true
- [x] Lint clean — verify: true
- [ ] Human design review

## Out of scope
- nothing
`;

test('parseAcceptance: extracts items, checked flag, and verify directive', () => {
  const items = parseAcceptance(BRIEF);
  assert.equal(items.length, 3);
  assert.equal(items[0].verify, 'true');
  assert.equal(items[0].checked, false);
  assert.equal(items[1].checked, true);
  assert.equal(items[2].verify, null, 'item without directive → null');
  assert.ok(!items[0].text.includes('verify:'), 'verify marker stripped from text');
});

test('parseAcceptance: only reads the ## ACCEPTANCE section', () => {
  const md = `## Other\n- [ ] not this — verify: false\n## ACCEPTANCE\n- [ ] this — verify: true\n`;
  const items = parseAcceptance(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].verify, 'true');
});

test('summarize: counts pass / fail / no-verify', () => {
  const s = summarize([
    { status: 'pass' }, { status: 'pass' }, { status: 'fail' }, { status: 'no-verify' },
  ]);
  assert.deepEqual(s, { total: 4, verified: 2, failed: 1, unverifiable: 1 });
});

// ── CLI ───────────────────────────────────────────────────────────────────────

function writeBrief(body) {
  const dir = mkdtempSync(join(tmpdir(), 'accept-'));
  const p = join(dir, 'IMPL-BRIEF-x.md');
  writeFileSync(p, body);
  return p;
}

test('CLI: all verify commands pass → exit 0', () => {
  const p = writeBrief(`## ACCEPTANCE\n- [ ] a — verify: true\n- [ ] b — verify: true\n`);
  const res = spawnSync(process.execPath, [TOOL, p], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('CLI: a failing verify command → exit 1', () => {
  const p = writeBrief(`## ACCEPTANCE\n- [ ] a — verify: true\n- [ ] b — verify: false\n`);
  const res = spawnSync(process.execPath, [TOOL, p], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.ok((res.stdout + res.stderr).includes('failed verification'));
});

test('CLI: --require-verify fails when a directive is missing', () => {
  const p = writeBrief(`## ACCEPTANCE\n- [ ] a — verify: true\n- [ ] manual item\n`);
  const ok = spawnSync(process.execPath, [TOOL, p], { encoding: 'utf8' });
  assert.equal(ok.status, 0, 'without flag, missing directive is only a warning');
  const strict = spawnSync(process.execPath, [TOOL, p, '--require-verify'], { encoding: 'utf8' });
  assert.equal(strict.status, 1);
});
