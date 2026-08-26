// Does the verifier verify — and does it also PASS work that is complete?
//
// Both directions matter equally. A verifier that only ever returns rework sends
// correct work back forever and gets switched off within a day; one that only
// ever returns verified is the self-report it was built to replace. The fixtures
// below are one of each, with the answer known before the run.
//
// Layer 3 needs a live second model, so these tests inject a stub judge. The
// live path is exercised separately (tests/openrouter-*.mjs); what is asserted
// here is the machinery around the judge: ordering, short-circuiting, the
// majority vote, and the three states.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STATE, SAMPLES, verifyAgentOutput, checkClaimedArtifacts,
  findAcceptanceDoc, judgeableRequirements, checkRequiredClaim, contractFor,
} from '../../scripts/lib/independent-verify.mjs';

// Briefs are padded past THIN_BYTES on purpose. A real brief is never 50 bytes,
// and the first version of these fixtures was — so every one of them tripped the
// thin-artefact check and returned rework before the judge was ever reached. The
// checker was right and the fixture was a toy; padding keeps the test about the
// layer it claims to be about.
const PAD = '\n<!-- ' + 'padding to clear the thin-artefact floor. '.repeat(6) + '-->\n';

function project({ brief = null, artefactPresent = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-iv-'));
  mkdirSync(join(root, 'docs', 'impl-briefs'), { recursive: true });
  // Padded BEFORE the ACCEPTANCE section, not after: parseAcceptance folds any
  // trailing prose into the last checklist item, so padding at the end became
  // part of the requirement text. Real briefs have a heading after ACCEPTANCE,
  // which flushes it; a fixture has to be arranged not to lie about that.
  if (brief && artefactPresent) writeFileSync(join(root, 'docs/impl-briefs/B.md'), PAD + brief);
  return root;
}

const verdictFor = (meta) => ({ agent: 'senior-dev', verdict: 'APPROVED', meta });

// A judge that answers from a lookup table, so a test asserts on the machinery
// rather than on a model's mood.
// Matches on the REQUIREMENT block only. Matching the whole prompt matched the
// artefact too — which contains every requirement — so one needle answered for
// all of them and the test asserted on a coincidence.
const stubJudge = (table) => async (q) => {
  const req = (q.match(/REQUIREMENT:\n([\s\S]*?)\n\n/) || [])[1] || '';
  for (const [needle, answer] of Object.entries(table)) if (req.includes(needle)) return answer;
  return 'yes';
};

test('a claimed artefact that does not exist is rework, and no judge is asked', async () => {
  const root = project();
  let asked = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => { asked += 1; return 'yes'; },
  });
  assert.equal(r.state, STATE.REWORK);
  assert.equal(asked, 0, 'a missing file is a fact — it must not cost a model call');
  assert.match(r.findings.join(' '), /B\.md/);
});

test('claiming nothing is unverifiable, never a pass', async () => {
  const root = project();
  const r = await verifyAgentOutput({ verdict: verdictFor({ task: 'great_cto-1' }), root });
  assert.equal(r.state, STATE.UNVERIFIABLE);
  assert.notEqual(r.state, STATE.VERIFIED,
    'the cheapest way to pass must not be to claim nothing');
});

test('an unmet requirement is named, and a met one is not', async () => {
  const root = project({
    brief: [
      '# B', '## ACCEPTANCE',
      '- [ ] The endpoint rate-limits by IP',
      '- [ ] Rejections are written to the audit log',
    ].join('\n'),
  });
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: stubJudge({ 'audit log': 'no', 'rate-limits': 'yes' }),
  });
  assert.equal(r.state, STATE.REWORK);
  assert.equal(r.findings.length, 1, 'only the unmet requirement goes back');
  assert.match(r.findings[0], /audit log/);
});

test('work that meets every requirement is verified', async () => {
  const root = project({
    brief: ['# B', '## ACCEPTANCE', '- [ ] The endpoint rate-limits by IP'].join('\n'),
  });
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => 'yes',
  });
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(r.findings.length, 0);
});

test('a failing acceptance command is rework, and short-circuits the judge', async () => {
  const root = project({
    brief: ['# B', '## ACCEPTANCE', '- [ ] A file that is not here — verify: test -f absent.txt'].join('\n'),
  });
  let asked = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => { asked += 1; return 'yes'; },
  });
  assert.equal(r.state, STATE.REWORK);
  assert.equal(asked, 0, 'a command that already failed settles it — do not pay a model to agree');
});

test('a split judge resolves to the cautious answer, and the split is reported', async () => {
  const root = project({
    brief: ['# B', '## ACCEPTANCE', '- [ ] Rejections are written to the audit log'].join('\n'),
  });
  // Alternate yes/no/no across the three samples: a 1–2 split.
  let n = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => (n++ === 0 ? 'yes' : 'no'),
  });
  assert.equal(r.state, STATE.REWORK, 'majority no');
  const j = r.checks.find((c) => c.layer === 'judgement');
  assert.match(j.detail, /split/, 'a judge that could not decide must say so');
});

test('the judge is asked SAMPLES times per requirement, not once', async () => {
  const root = project({
    brief: ['# B', '## ACCEPTANCE', '- [ ] One requirement'].join('\n'),
  });
  let asked = 0;
  await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => { asked += 1; return 'yes'; },
  });
  assert.equal(asked, SAMPLES);
});

test('an unparseable judge is an abstention, not agreement', async () => {
  const root = project({
    brief: ['# B', '## ACCEPTANCE', '- [ ] One requirement'].join('\n'),
  });
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root,
    ask: async () => 'I would need more context to say.',
  });
  assert.notEqual(r.state, STATE.VERIFIED,
    'a judge that answered nothing usable must not be counted as a yes');
});

test('the governing document is the one the verdict named', () => {
  const root = project({ brief: ['# B', '## ACCEPTANCE', '- [ ] X'].join('\n') });
  const doc = findAcceptanceDoc(verdictFor({ brief: 'docs/impl-briefs/B.md' }), { root });
  assert.ok(doc && doc.endsWith('B.md'));
  const { requirements } = judgeableRequirements(verdictFor({ brief: 'docs/impl-briefs/B.md' }), { root });
  assert.deepEqual(requirements, ['X']);
});

test('a bookkeeping meta value is not mistaken for an artefact path', () => {
  const root = project();
  const r = checkClaimedArtifacts(verdictFor({ coverage: '100%', tests: '33', task: 'great_cto-9it' }), { root });
  assert.equal(r.status, 'none', 'a false accusation teaches people to disable the check');
});

test('an agent that skipped its REQUIRED artefact is rework, not a pass', async () => {
  // The plan file must genuinely exist, or layer 1 fires first and the test
  // would be asserting on the wrong check — the artefact layer runs before this
  // one on purpose, because a named file that is absent is the harder fact.
  const root = project({ brief: '# plan\n\nreal content\n' });
  const r = await verifyAgentOutput({
    verdict: { agent: 'pm', verdict: 'PLAN_READY', meta: { plan: 'docs/impl-briefs/B.md' } },
    root,
  });
  assert.equal(r.state, STATE.REWORK);
  assert.match(r.findings.join(' '), /brief=<path>/,
    'the finding names the key the map declares, so the message follows the contract');
});

test('the obligation comes from the pipeline map, not from this module', () => {
  // Was a hardcoded object here with one entry. A stage contract written in
  // JavaScript instead of in the stage map is a list somebody has to remember to
  // update, which is a list that will be wrong.
  const MAP = join(process.cwd(), 'shared', 'pipeline.toml');
  const c = contractFor('architect', { pipelinePath: MAP });
  assert.deepEqual(c?.keys, ['arch'], 'read out of shared/pipeline.toml');

  // A stage the map knows but that declares nothing is `none` — not a pass, and
  // not the same as a stage the map has never heard of.
  assert.equal(checkRequiredClaim({ agent: 'senior-dev', meta: {} }, { pipelinePath: MAP }).status, 'none');
});
