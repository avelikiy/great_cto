// Cut-off detection was built on SubagentStop, which records how a subagent
// stopped. On 2026-08-08 an agent was cut off after 97 turns with 105 passing
// tests in a worktree — and nothing fired. Run by hand against the same
// transcript the hook worked perfectly: it named the cut-off, both worktrees, and
// correctly declined to block. It simply had not run.
//
// cost-history.log is appended by that same hook on every invocation, and its
// last entry predated the agent by two hours. Either SubagentStop does not fire
// when the harness force-stops a subagent, or it fires without a transcript_path.
// Which of the two is unknown and does not matter: the hook is unreliable in
// exactly the case it was written for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugForCwd, transcriptCandidates, findAgentTranscript } from '../../scripts/lib/agent-transcript.mjs';

const ARGS = { agentId: 'a4c18b05107354e48', cwd: '/Users/x/dev/my_project', sessionId: 'ef794f5a-9f44', uid: 501, tmp: '/tmp' };

test('the slug follows the rule Claude Code uses for ~/.claude/projects', () => {
  // Every character outside [A-Za-z0-9-] becomes a hyphen, underscores included.
  assert.equal(slugForCwd('/Users/x/development/Personal/great_cto'), '-Users-x-development-Personal-great-cto');
});

test('the path is derived from the session id, not searched for', () => {
  // A hook that walks a filesystem is a hook that stalls a session.
  const [first] = transcriptCandidates(ARGS);
  assert.equal(first, '/private/tmp/claude-501/-Users-x-dev-my-project/ef794f5a-9f44/tasks/a4c18b05107354e48.output');
});

test('more than one root is tried, because the base is host-dependent', () => {
  const c = transcriptCandidates(ARGS);
  assert.ok(c.length >= 2);
  assert.ok(c.some((p) => p.startsWith('/tmp/')));
});

test('without a session id or a plausible agent id there is nothing to derive', () => {
  // `null`, not `undefined`: a default parameter treats undefined as "not
  // passed" and falls back to the environment, which is the behaviour wanted in
  // production and the wrong thing to assert here.
  assert.deepEqual(transcriptCandidates({ ...ARGS, sessionId: null }), []);
  assert.deepEqual(transcriptCandidates({ ...ARGS, sessionId: '' }), []);
  assert.deepEqual(transcriptCandidates({ ...ARGS, agentId: null }), []);
  assert.deepEqual(transcriptCandidates({ ...ARGS, agentId: 'not-a-hex-id' }), [],
    'a value that is not an id must not become a path');
  assert.deepEqual(transcriptCandidates({}), []);
});

test('a candidate that does not exist yields null rather than a bad path', () => {
  assert.equal(findAgentTranscript({ ...ARGS, sessionId: 'nope-nope' }), null);
  assert.equal(findAgentTranscript({ agentId: null }), null);
});
