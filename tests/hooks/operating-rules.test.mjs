// Every great_cto session gets the operating rules, not only the first one after
// an install. welcome.sh prints once per minor version; these print every time.
//
// Why they exist: across the projects measured on 2026-09-21, 1,181 of 5,126
// operator messages were "делай"/"да" — the main session offering a reversible
// step instead of taking it — and "done" was declared 178 times on something the
// operator then found "still broken".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULES = join(ROOT, 'scripts', 'hooks', 'operating-rules.md');

test('SessionStart prints the operating rules, before preferences', () => {
  const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const cmds = (plugin.hooks.SessionStart || []).flatMap((h) => h.hooks.map((x) => x.command));
  const cmd = cmds.find((c) => c.includes('=== PREFERENCES ==='));
  assert.ok(cmd, 'the SessionStart command that prints context exists');
  const at = cmd.indexOf('scripts/hooks/operating-rules.md');
  assert.ok(at > 0, 'it prints scripts/hooks/operating-rules.md');
  assert.ok(at < cmd.indexOf('=== PREFERENCES ==='), 'every session, not behind the once-per-version welcome');
  assert.ok(existsSync(RULES));
});

test('the rules say: take reversible steps, ask for irreversible ones, prove done on what ships', () => {
  const t = readFileSync(RULES, 'utf8');
  assert.match(t, /Reversible steps inside the task are yours/);
  assert.match(t, /expensive to undo/);
  assert.match(t, /E2E_SKIP/);
  assert.match(t, /finding is a claim/);
  // The main session does most deploys and commits, and on a machine with hundreds
  // of skills their descriptions do not reach it — so the rules name them.
  for (const s of ['deploy-landed', 'secrets-rotation', 'signing-preflight']) assert.match(t, new RegExp(`great-cto:${s}`));
  // The proposal the operator approves with one word is the task statement: 0 of
  // 965 approvals over 60 days (25.09) were of a proposal that said how the work
  // counts as done. Rule 6 puts that line in, and reproduces a bug before fixing it.
  assert.match(t, /Done when:/);
  assert.match(t, /reproduce it first/);
  assert.match(t, /agents\/_shared\/task-brief\.md/);
  // Paid in every session: keep it short. Raised from 1500 for rule 6.
  assert.ok(t.length < 1700, `operating rules are ${t.length} chars`);
});
