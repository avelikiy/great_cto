// /inbox's LLM budget signal grepped JSON "cost_usd" out of cost-history.log,
// which has never held JSON — so it never fired. Once it could, it printed
// "850f monthly cap": the signals went through printf as a format string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const INBOX = new URL('../scripts/cmd-data/inbox-data.sh', import.meta.url).pathname;
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function inbox(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-llm-'));
  try {
    mkdirSync(join(dir, '.great_cto'));
    writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'archetype: ai-system\nmonthly-budget-llm-usd: 10\n');
    writeFileSync(join(dir, '.great_cto', 'cost-history.log'), rows.join('\n') + '\n');
    return execFileSync('bash', [INBOX], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('measured spend near the cap is reported as a percentage', () => {
  assert.match(inbox([`${now()} qa 8.5 turns=9 model=match`]), /LLM spend at 85% of monthly cap \(\$8\.50 \/ \$10\)/);
});

test('spend over the cap is a P0', () => {
  assert.match(inbox([`${now()} qa 8.5 turns=9 model=match`, `${now()} architect 3`]), /P0: LLM spend \$11\.50 this month exceeds budget \$10 \(115%\)/);
});

test('devops infrastructure rows in the same file are not LLM spend', () => {
  assert.doesNotMatch(inbox([`${now()} | api | 900 | - | arch-estimate | checkout`]), /LLM spend/);
});
