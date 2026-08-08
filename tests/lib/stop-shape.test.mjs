// Four of seven agents in one live pipeline run ended mid-sentence. senior-dev's
// last words were "Let me run the exact command as specified in the task"; a
// security re-verification's were "Now let's check gate-check and run the
// finding-evidence linter mentally as I write". Each had done real work — 33
// tests, a 23 KB report with two reproduced CRITICALs — and none recorded a
// verdict, so the dispatcher named no next stage and the pipeline stopped.
//
// The two failures look identical from the pipeline's record (a stage with no
// verdict) and need opposite remedies. The separation turned out to be exact
// across twelve transcripts: an agent that returned normally has one assistant
// message with stop_reason `end_turn`; one that was cut off has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopShape, stopRemedy } from '../../scripts/lib/stop-shape.mjs';

const msg = (stop_reason, text) => JSON.stringify({
  type: 'assistant',
  message: { stop_reason, content: text ? [{ type: 'text', text }] : [{ type: 'tool_use', name: 'Bash' }] },
});
const jsonl = (...lines) => lines.join('\n');

// ── the signal ─────────────────────────────────────────────────────────────

test('one closed turn means the agent reached a conclusion', () => {
  const s = stopShape(jsonl(msg('tool_use'), msg('tool_use'), msg('end_turn', 'Done. Verdict recorded.')));
  assert.equal(s.shape, 'reported');
  assert.equal(s.endTurns, 1);
  assert.equal(s.turns, 3);
  assert.match(s.lastText, /Verdict recorded/);
});

test('no closed turn means it was cut off mid-loop', () => {
  // The observed case: last message still tool_use, text a half-thought.
  const s = stopShape(jsonl(msg('tool_use'), msg('tool_use', 'Let me run the exact command as specified')));
  assert.equal(s.shape, 'cut-off');
  assert.equal(s.endTurns, 0);
});

test('the shape does not depend on how the text reads', () => {
  // Heuristics on sentence endings were tried first and are worse: a report can
  // end without a period, and a cut-off agent can stop on a clean sentence.
  assert.equal(stopShape(jsonl(msg('end_turn', 'no trailing period'))).shape, 'reported');
  assert.equal(stopShape(jsonl(msg('tool_use', 'A complete sentence.'))).shape, 'cut-off');
});

test('a transcript with no assistant turns is empty, not cut off', () => {
  assert.equal(stopShape('').shape, 'empty');
  assert.equal(stopShape(jsonl(JSON.stringify({ type: 'user', message: {} }))).shape, 'empty');
  assert.equal(stopShape(null).shape, 'empty');
  assert.equal(stopShape('/nonexistent/path.jsonl').shape, 'empty');
});

test('malformed lines are skipped rather than failing the read', () => {
  // A transcript being appended to right now ends mid-line.
  const s = stopShape(jsonl(msg('end_turn', 'ok'), '{"type":"assist', 'not json at all'));
  assert.equal(s.shape, 'reported');
  assert.equal(s.turns, 1);
});

// ── the remedy, which is the point ─────────────────────────────────────────

test('a cut-off agent is resumed, not re-run', () => {
  // Re-running repeats work already done — 33 tests, a 23 KB report.
  const r = stopRemedy({ shape: 'cut-off', turns: 125, hasVerdict: false, agent: 'senior-dev' });
  assert.equal(r.kind, 'resume');
  assert.match(r.text, /RESUME/);
  assert.match(r.text, /rather than re-running/);
  assert.match(r.text, /worktree/, 'its work may be somewhere the main tree cannot see');
});

test('an agent that finished and forgot is simply asked for the last step', () => {
  const r = stopRemedy({ shape: 'reported', turns: 40, hasVerdict: false, agent: 'code-reviewer' });
  assert.equal(r.kind, 'record');
  assert.match(r.text, /log-verdict\.sh code-reviewer/);
  assert.ok(!/RESUME/.test(r.text), 'it has context and budget — resuming would be theatre');
});

test('a recorded verdict needs no remedy at all', () => {
  for (const shape of ['reported', 'cut-off', 'empty']) {
    assert.equal(stopRemedy({ shape, turns: 10, hasVerdict: true }), null, shape);
  }
});

test('an unreadable transcript says the stage is incomplete rather than guessing', () => {
  const r = stopRemedy({ shape: 'empty', turns: 0, hasVerdict: false, agent: 'x' });
  assert.equal(r.kind, 'unknown');
  assert.match(r.text, /cannot be established/);
});

test('an unknown agent stays a visible placeholder, not a plausible name', () => {
  // At SubagentStop the name is only knowable from a verdict, and the whole
  // point is that there isn't one. `log-verdict.sh the agent APPROVED` is a
  // command that silently does the wrong thing.
  const r = stopRemedy({ shape: 'reported', turns: 40, hasVerdict: false });
  assert.match(r.text, /log-verdict\.sh <agent>/);
  assert.ok(!/the agent finished/.test(r.text));
});
