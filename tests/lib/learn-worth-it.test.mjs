// Should this session end spend money on a learner?
//
// `continuous-learner` is opt-in behind GREAT_CTO_AUTO_LEARN=1, off by default
// "to avoid surprising existing users" — a deliberate choice, honestly
// documented, and the reason lessons.md has never been written on this machine.
// Not the declared-and-unreachable defect it first looked like.
//
// But turning it on as written spawns `claude --agent continuous-learner` at
// EVERY session end, including the thirty-second one that answered a question.
// The project's own /save skill already says to skip when the session was
// trivial; the hook has no such rule, and the nightly loop needed the same guard
// today for the same reason.
//
// The signal is already gathered: captureGitState() computes commitsToday and
// uncommitted before this decision is made, so the guard costs nothing to
// evaluate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnWorthIt } from '../../scripts/lib/learn-worth-it.mjs';

test('a session that changed nothing is not worth a paid agent', () => {
  const r = learnWorthIt({ commitsToday: 0, uncommitted: 0 });
  assert.equal(r.run, false);
  assert.equal(r.reason, 'nothing-changed');
});

test('commits are substance', () => {
  assert.equal(learnWorthIt({ commitsToday: 3, uncommitted: 0 }).run, true);
});

test('uncommitted work is substance too — a session can end mid-flight', () => {
  assert.equal(learnWorthIt({ commitsToday: 0, uncommitted: 5 }).run, true);
});

test('a git state that could not be read runs the learner, and says why', () => {
  // Fail toward learning, not away from it. Skipping here would silently drop a
  // lesson whenever git is unavailable, and "I could not tell" would arrive as
  // "there was nothing to learn" — the substitution this project refuses. The
  // cost of one unnecessary run is smaller than a loop that quietly stops.
  const r = learnWorthIt(null);
  assert.equal(r.run, true);
  assert.equal(r.reason, 'substance-unknown');
});

test('the reason is always reported, so the marker file can record it', () => {
  for (const input of [null, { commitsToday: 0, uncommitted: 0 }, { commitsToday: 1, uncommitted: 0 }]) {
    assert.ok(learnWorthIt(input).reason, 'every decision names itself');
  }
});
