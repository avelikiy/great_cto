// The gate:ship rollback validation is a bash block the orchestrator copies out of
// reference/full-pipeline.md. Two ways it reported "no rollback risk" without
// checking anything (great_cto-0f9e, 26.10.2026):
//   - every ROLLBACK_RISK check was `grep … | head -1 || echo …`, which takes
//     head's exit status — always 0 — so no warning could ever print;
//   - a PROJECT.md without `primary:` matched no case and printed nothing.
// So the block is run here as written, against fixture projects, both ways round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DOC = new URL('../../skills/great_cto/reference/full-pipeline.md', import.meta.url);

function rollbackBlock() {
  const lines = fs.readFileSync(DOC, 'utf8').split('\n');
  const start = lines.findIndex(l => l.startsWith('**Rollback validation**'));
  assert.ok(start >= 0, 'full-pipeline.md keeps its **Rollback validation** step');
  const open = lines.findIndex((l, i) => i > start && l.startsWith('```bash'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  return lines.slice(open + 1, close).join('\n');
}

function run(projectMd, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-rollback-'));
  try {
    fs.mkdirSync(path.join(dir, '.great_cto'));
    fs.writeFileSync(path.join(dir, '.great_cto/PROJECT.md'), projectMd);
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    return execFileSync('bash', ['-c', rollbackBlock()], { cwd: dir, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a missing rollback precondition is reported, for every type that checks one', () => {
  assert.match(run('primary: smart-contract\n'), /ROLLBACK_RISK: no upgrade proxy/);
  assert.match(run('primary: rag-system\n'), /ROLLBACK_RISK: no index snapshot/);
  assert.match(run('primary: trading-bot\n'), /ROLLBACK_RISK: no kill switch/);
});

test('a present precondition raises no risk', () => {
  assert.doesNotMatch(run('primary: smart-contract\n', { 'contracts/Token.sol': 'contract T is UUPSUpgradeable {}' }), /ROLLBACK_RISK/);
  assert.doesNotMatch(run('primary: rag-system\n', { '.great_cto/index-snapshots/s1': '' }), /ROLLBACK_RISK/);
  assert.doesNotMatch(run('primary: trading-bot\n', { 'src/bot.js': 'killSwitch()' }), /ROLLBACK_RISK/);
});

test('no primary: type says the rollback was not checked instead of saying nothing', () => {
  assert.match(run('archetype: web-service\n'), /ROLLBACK_UNCHECKED/);
  assert.equal(run('primary: web-fullstack\n').trim(), '', 'a type with no rollback precondition is quiet');
});
