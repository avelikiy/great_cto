// Gate approval is read now, but only while a turn is running. Approve a gate two
// hours later and nothing notices — the turn ended, and the Stop hook does not
// hold one open on a gate because answering one requires the turn to end. So
// approving was never enough: someone had to come back and say "continue", and
// that second action carried no decision.
//
// SessionStart rather than cron, on purpose. It closes the same gap at the one
// moment the human is already present — and four of eight agents over two days
// were cut off mid-loop, where a failed recovery under a scheduler is an
// invisible stall at 3am.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resumeBrief } from '../../scripts/hooks/session-pipeline-resume.mjs';

const decision = { act: true, agents: ['qa-engineer', 'security-officer'], why: 'code-reviewer succeeded and nothing gates them' };

test('the brief names what is waiting and what runs next', () => {
  const out = resumeBrief(decision, { summary: 'ready-to-dispatch — spawn qa-engineer' });
  assert.match(out, /work waiting/);
  assert.match(out, /subagent_type: qa-engineer/);
  assert.match(out, /subagent_type: security-officer/);
});

test('it is phrased for someone who is present', () => {
  // tickBrief ends with "this ran unattended — stop and report rather than
  // dispatching", which is right for a scheduler-woken session and wrong here:
  // the CTO is at the keyboard and can simply look.
  const out = resumeBrief(decision, null);
  assert.match(out, /did not ask for this yet/);
  assert.ok(!/ran unattended/.test(out));
});

test('nothing to resume produces nothing', () => {
  assert.equal(resumeBrief({ act: false }, null), null);
  assert.equal(resumeBrief(null, null), null);
});

test('the hook is registered at SessionStart', () => {
  // A hook nobody calls is a file, not a mechanism.
  const manifest = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  const hooks = manifest.hooks.SessionStart.flatMap((h) => h.hooks || []);
  const entry = hooks.find((h) => String(h.command).includes('session-pipeline-resume'));
  assert.ok(entry, 'registered');
  assert.ok(entry.timeout <= 10, 'a slow SessionStart hook delays every session in every project');
  assert.match(String(entry.command), /\|\| true/, 'a session must start even when this fails');
});
