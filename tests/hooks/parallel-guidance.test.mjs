/**
 * Two pieces of guidance that reach every subagent, from Anthropic's own
 * "Prompting Claude Fable 5.1".
 *
 * 1. BATCH INDEPENDENT TOOL CALLS. The doc is specific about where this goes
 *    wrong: in coding and bash-and-editor loops, where the next independent
 *    calls are implied by the task rather than named in the request, the model
 *    "may issue them one per turn instead". Every extra turn costs a round trip
 *    and wall-clock time. We had the advice in architect.md and two skills —
 *    five agents out of seventy-one.
 *
 * 2. THE LEAD DOES NOT HAVE TO WAIT. Also from the doc: "don't force the lead
 *    agent to stop and wait for each one... letting the lead continue while
 *    subagents run lowers average time to completion at similar quality, token
 *    usage, and cost."
 *
 *    This one has a measurement behind it. `orchestrator.toml` has capped
 *    max_parallel_streams at 5 since it was written; when the measurement went
 *    in (d48ddf44) the observed peak was 2. coordinator.md prescribed
 *    `background: true` for Fork — read-only research — and said nothing of the
 *    sort for Spawn, the mode that does the actual work. It also said "don't
 *    peek mid-flight", which reads as "wait quietly" unless you are told the
 *    alternative.
 *
 * The delivery matters. `agents/_shared/*` is referenced BY NAME from individual
 * agents — verdict-format reaches 30 of 71, skill-catalog-browse reaches 5 — so
 * a fragment there would reach whoever happened to cite it. The SubagentStart
 * contract print reaches every subagent without anyone remembering to link it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contractPrint = () =>
  execFileSync('node', [join(REPO, 'scripts', 'hooks', 'orchestrator-check.mjs')],
    { cwd: REPO, input: '', encoding: 'utf8', timeout: 20000 });

test('the contract declares that independent tool calls are batched', () => {
  const toml = readFileSync(join(REPO, 'shared', 'orchestrator.toml'), 'utf8');
  assert.match(toml, /batch_independent_tool_calls\s*=\s*true/,
    'a machine-readable rule, not prose someone can argue around');
});

test('every subagent is told to batch, with the wording that works', () => {
  const out = contractPrint();
  // The doc gives a specific sentence and reports it addresses the behaviour.
  // Paraphrasing it is untested rewriting of tested advice.
  assert.match(out, /list what you need next/i, 'the nudge must reach the subagent');
  assert.match(out, /doesn't depend on another's result|does not depend on another/i,
    'including the condition that makes batching safe');
});

test('the contract says a lead may keep working while subagents run', () => {
  const out = contractPrint();
  assert.match(out, /keep working|continue while|need not wait|do not wait/i,
    'the lead must be told it may carry on — silence reads as "wait"');
});

test('coordinator.md tells Spawn, not just Fork, that waiting is optional', () => {
  // The concrete gap: `background: true` was prescribed for Fork (read-only
  // research) and nothing was said for Spawn, which is the mode that does the
  // work and therefore the mode whose blocking costs wall-clock time.
  const src = readFileSync(join(REPO, 'agents', 'coordinator.md'), 'utf8');
  const spawnRule = src.match(/- \*\*Spawn\*\*[^\n]*\n|- Spawn → [^\n]*\n/);
  assert.ok(spawnRule, 'expected a Spawn rule in coordinator.md');
  assert.match(src, /Spawn[\s\S]{0,600}?(keep working|carry on|do not block|need not wait)/i,
    'the Spawn rules must say the lead can carry on while it runs');
});

test('and it still forbids peeking mid-flight — carrying on is not polling', () => {
  // The two are easy to confuse and mean opposite things. Continuing with OTHER
  // work is the win; querying a running agent for partial results is the thing
  // that was already ruled out, and this fix must not quietly reverse it.
  const src = readFileSync(join(REPO, 'agents', 'coordinator.md'), 'utf8');
  assert.match(src, /Don't peek mid-flight/i, 'the existing rule must survive');
});
