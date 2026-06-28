// tests/lib/gate-retro.test.mjs — DEEPEN W3.4 gate-effectiveness auditor.
// Run: node --test tests/lib/gate-retro.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdictAudit, scoreEffectiveness, normalizeAgent, isPositiveVerdict } from '../../scripts/lib/gate-retro.mjs';

const PM = `# PM-2026-06-27

## Timeline
something happened

## Agent Verdict Audit
> Was each agent's pre-deploy verdict correct given what we now know?

| Agent | Verdict | Correct? | Gap |
|-------|---------|----------|-----|
| QA (qa-engineer) | PASS | no | missed the empty-cart path |
| Security (security-officer) | APPROVED | yes |  |
| DevOps (devops) | smoke: pass | no | staging had no prod data |

Root attribution: qa-engineer

## Action items
- fix it
`;

const TEMPLATE_PM = `# PM-x
## Agent Verdict Audit
| Agent | Verdict | Correct? | Gap |
|-------|---------|----------|-----|
| QA (qa-engineer) | PASS / FAIL | yes / no | <what was missed> |
`;

test('normalizeAgent: prefers the parenthesised slug', () => {
  assert.equal(normalizeAgent('QA (qa-engineer)'), 'qa-engineer');
  assert.equal(normalizeAgent('Red Team'), 'red-team');
});

test('isPositiveVerdict: PASS/APPROVED positive; FAIL/BLOCKED negative', () => {
  assert.equal(isPositiveVerdict('PASS'), true);
  assert.equal(isPositiveVerdict('APPROVED'), true);
  assert.equal(isPositiveVerdict('smoke: pass'), true);
  assert.equal(isPositiveVerdict('FAIL'), false);
  assert.equal(isPositiveVerdict('BLOCKED'), false);
});

test('parseVerdictAudit: extracts filled rows, skips header/separator', () => {
  const rows = parseVerdictAudit(PM);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].agent, 'qa-engineer');
  assert.equal(rows[0].correct, false);
  assert.equal(rows[1].agent, 'security-officer');
  assert.equal(rows[1].correct, true);
});

test('parseVerdictAudit: skips unfilled template rows (verdict "PASS / FAIL", correct "yes / no")', () => {
  assert.equal(parseVerdictAudit(TEMPLATE_PM).length, 0);
});

test('parseVerdictAudit: no audit section → []', () => {
  assert.deepEqual(parseVerdictAudit('# PM\n## Timeline\nx\n'), []);
});

test('scoreEffectiveness: per-agent correct ratio + false-pass count', () => {
  const s = scoreEffectiveness(parseVerdictAudit(PM));
  const qa = s.find(x => x.agent === 'qa-engineer');
  const sec = s.find(x => x.agent === 'security-officer');
  const dev = s.find(x => x.agent === 'devops');
  assert.equal(qa.effectiveness, 0);
  assert.equal(qa.falsePass, 1, 'PASS + correct=no → false pass');
  assert.equal(sec.effectiveness, 1);
  assert.equal(sec.falsePass, 0);
  assert.equal(dev.falsePass, 1, 'smoke: pass + correct=no → false pass');
});
