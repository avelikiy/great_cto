// Agents that report must offer options and take a pick.
//
// The measurement that prompted this: `architect` mentions alternatives,
// trade-offs or a recommendation 27 times. `code-reviewer` and
// `security-officer` mention them once each; `senior-dev` three times. The
// agents whose output the operator reads every day told him what happened and
// never what he could do about it, or which they would choose.
//
// The rule existed in one place — design-advisor's "each with your recommended
// default so the pipeline never blocks on you" — and in the shared handoff
// contract, which reached ten agents, none of them in the core pipeline.
//
// `decision-scorer` is the same defect one layer down: an agent whose whole job
// is scoring alternatives, referenced by SKILL.md and the lifecycle map and by
// no agent that could dispatch it. Zero verdicts in its life.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Prose wraps where the line ends. Anchoring a rule check on the spacing fails
 *  on a reflow rather than on a change of meaning — twice now. */
const flat = (p) => read(p).replace(/\s+/g, ' ');

/** The agents whose output a human reads and acts on. */
const REPORTERS = [
  'architect', 'pm', 'product-owner', 'senior-dev', 'qa-engineer',
  'code-reviewer', 'security-officer', 'devops', 'project-auditor', 'design-advisor',
];

test('the shared contract states the rule, not just the slot', () => {
  const c = flat('agents/_shared/handoff-format.md');
  assert.match(c, /Every open question carries options and a pick/,
    'the contract must carry the rule itself — a template slot named "Open questions" '
    + 'is answered by writing a question, which is the behaviour being replaced');
  assert.match(c, /Attack your own pick first/,
    'a recommendation nobody would defend is a survey');
  assert.match(c, /options go to the human and the pick is a recommendation, not an action/,
    'the rule must not read as permission to decide what an agent may not decide');
});

test('every reporting agent carries the rule', () => {
  const missing = REPORTERS.filter((a) => {
    const t = read(`agents/${a}.md`);
    return !/handoff-format\.md/.test(t) && !/recommended default/.test(t);
  });
  assert.deepEqual(missing, [],
    `these agents report to a human and never say which option they would take:\n  ${missing.join('\n  ')}`);
});

test('decision-scorer is reachable from an agent that could call it', () => {
  // Being named in a skill and in the lifecycle map is not reachability: neither
  // dispatches. It has to be named by an agent, in the place that agent decides.
  const callers = fs.readdirSync(path.join(ROOT, 'agents'))
    .filter((f) => f.endsWith('.md') && f !== 'decision-scorer.md')
    .filter((f) => read(`agents/${f}`).includes('decision-scorer'));
  assert.ok(callers.length > 0,
    'decision-scorer scores alternatives and no agent names it — it has produced zero '
    + 'verdicts in its life, which is what a capability declared and never invoked looks like');
  assert.ok(callers.some((f) => read(`agents/${f}`).includes('subagent_type: decision-scorer')),
    'a mention is not a call — one caller must name it as a dispatchable subagent');
});
