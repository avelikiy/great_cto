// Every pre-implementation domain reviewer names its verdict line, in the one
// vocabulary the readers agree on.
//
// 38 reviewers shipped without a `scripts/log-verdict.sh <name>` line. They still
// wrote verdicts — subagent-stop-completion refuses a stop without one, and
// required-reviewers proves a reviewer ran by a non-empty verdicts/<name>.log —
// but each improvised the word. The dispatcher advances a reviewer on APPROVED and
// halts on BLOCKED; any third word is either silence (a stalled pipeline) or, for
// APPROVED_WITH_*, an open negative at gate:ship. agents/_shared/reviewer-verdict.md
// holds the rules; this keeps a new reviewer from arriving without them.
//
// Run: node --test tests/lib/reviewer-verdict-line.test.mjs (no LLM cost)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGENTS = join(ROOT, 'agents');

const reviewers = readdirSync(AGENTS)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => ({ name: f.slice(0, -3), text: readFileSync(join(AGENTS, f), 'utf8') }))
  .filter(({ text }) => /^description:.*pre-implementation/im.test(text));

test('the pre-implementation reviewers are found at all', () => {
  assert.ok(reviewers.length >= 38, `found ${reviewers.length}`);
});

for (const { name, text } of reviewers) {
  test(`${name}: names its verdict line with APPROVED|BLOCKED, need and the shared rules`, () => {
    const line = text.match(new RegExp(`bash scripts/log-verdict\\.sh ${name} (\\S+) auto(?:[^\\n\\\\]|\\\\\\n)*`));
    assert.ok(line, `${name}: no \`bash scripts/log-verdict.sh ${name} ...\` line`);
    assert.equal(line[1], '<APPROVED|BLOCKED>', `${name}: verdict vocabulary is ${line[1]}`);
    for (const key of ['feature=', 'tm=docs/sec-threats/TM-', 'need=<implementer|decision>', 'finding=']) {
      assert.ok(line[0].includes(key), `${name}: verdict line lacks ${key}`);
    }
    assert.match(text, /agents\/_shared\/reviewer-verdict\.md/, `${name}: does not point at the shared rules`);
  });
}

test('the TM path in each verdict line is one the reviewer writes elsewhere in its prompt', () => {
  for (const { name, text } of reviewers) {
    const tm = text.match(new RegExp(`log-verdict\\.sh ${name}[\\s\\S]*?tm=docs/sec-threats/(TM-[a-z-]*)<slug>\\.md`));
    assert.ok(tm, `${name}: no tm= in its verdict line`);
    const written = text.replace(/tm=docs\/sec-threats\/TM-[a-z-]*<slug>\.md/g, '');
    assert.ok(written.includes(`${tm[1]}{slug}.md`) || written.includes(`${tm[1]}\${SLUG}.md`),
      `${name}: verdict names ${tm[1]}<slug>.md, which its prompt never writes`);
  }
});
