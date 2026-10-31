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

import { test, after } from 'node:test';

// Temp dirs this file creates, removed when the file finishes. Before this, every
// run left them in TMPDIR: thousands had built up per prefix (great_cto-7179).
const TMP_DIRS = [];
const tmpDir = (d) => (TMP_DIRS.push(d), d);
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

// Every fixture writes its OWN pipeline map.
//
// `contractFor` falls back to the module's own repository when a root has no
// map — so a test with a temp root still picked up the real shared/pipeline.toml
// and answered about THIS repository's contracts rather than the fixture's. It
// was invisible until senior-dev gained a contract there and six tests changed
// answer without their fixtures changing at all. A test that reads state outside
// its own fixture is not testing what its name says.
function writeMap(root, body) {
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared', 'pipeline.toml'), body);
}

function project({ brief = null, artefactPresent = true, map = null } = {}) {
  const root = tmpDir(mkdtempSync(join(tmpdir(), 'gcto-iv-')));
  mkdirSync(join(root, 'docs', 'impl-briefs'), { recursive: true });
  // Default: the stage exists in the map and declares nothing. That is the
  // "no contract to hold it to" case most of these tests mean.
  writeMap(root, map || '[transitions.senior-dev]\non = ["APPROVED"]\nnext = ["qa-engineer"]\n');
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
  // The requirement is declared BY THE FIXTURE. Borrowing it from this
  // repository's own map made the test assert on whatever pm happens to owe
  // today — it broke the day pm's contract went from `brief` to `briefs`, which
  // is a change in the map, not a regression in the code under test.
  const root = project({
    brief: '# plan\n\nreal content\n',
    map: '[transitions.pm]\non = ["PLAN_READY"]\nproduces = ["plan", "handbook"]\nnext = ["senior-dev"]\n',
  });
  const r = await verifyAgentOutput({
    verdict: { agent: 'pm', verdict: 'PLAN_READY', meta: { plan: 'docs/impl-briefs/B.md' } },
    root,
  });
  assert.equal(r.state, STATE.REWORK);
  assert.match(r.findings.join(' '), /handbook=<path>/,
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
  // not the same as a stage the map has never heard of. `senior-dev` used to be
  // the example here and stopped being one when it gained `produces = ["receipt"]`;
  // a stage picked because it happens to declare nothing today will keep breaking
  // this test, so the case is made against a map written for it.
  const bare = tmpDir(mkdtempSync(join(tmpdir(), 'gcto-iv-bare-')));
  mkdirSync(join(bare, 'shared'), { recursive: true });
  writeFileSync(join(bare, 'shared/pipeline.toml'),
    '[transitions.some-stage]\non = ["DONE"]\nnext = ["other"]\n');
  assert.equal(checkRequiredClaim({ agent: 'some-stage', meta: {} }, { root: bare }).status, 'none');

  // And senior-dev, which the real map now holds to a receipt, fails without one.
  assert.equal(checkRequiredClaim({ agent: 'senior-dev', meta: {} }, { pipelinePath: MAP }).status, 'fail');
});

// ── every stage leaves evidence, and not all evidence is a path ──────────────
//
// Four of seven stages came back `unverifiable` — not "the check failed" but
// "there was nothing to check". Two of them, senior-dev and code-reviewer, have
// NEVER written a path into their meta across every project's logs, so declaring
// a document key for them would invent an obligation and start rejecting correct
// work. They leave a receipt instead: head, base, and every file touched with its
// hash.

test('a receipt satisfies a contract that asks for one', () => {
  const root = tmpDir(mkdtempSync(join(tmpdir(), 'gcto-iv-receipt-')));
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared/pipeline.toml'),
    '[transitions.senior-dev]\non = ["DONE"]\nproduces = ["receipt"]\nnext = ["code-reviewer"]\n');
  const withReceipt = {
    agent: 'senior-dev', verdict: 'DONE', meta: {},
    receipt: { head: 'abc', base: 'def', files: { 'a.mjs': '1', 'b.mjs': '2' } },
  };
  const r = checkRequiredClaim(withReceipt, { root });
  assert.equal(r.status, 'pass');
  assert.match(r.detail, /receipt over 2 file/);
});

test('an empty receipt does not satisfy it — a fingerprint of nothing is not evidence', () => {
  const root = tmpDir(mkdtempSync(join(tmpdir(), 'gcto-iv-receipt2-')));
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared/pipeline.toml'),
    '[transitions.senior-dev]\non = ["DONE"]\nproduces = ["receipt"]\nnext = ["x"]\n');
  for (const receipt of [undefined, {}, { files: {} }, { head: 'abc', files: {} }]) {
    const r = checkRequiredClaim({ agent: 'senior-dev', verdict: 'DONE', meta: {}, receipt }, { root });
    assert.equal(r.status, 'fail', JSON.stringify(receipt));
    assert.match(r.detail, /the files it touched/,
      'and the message names what a receipt is, not just the key');
  }
});

test('a path key is still a path key — receipt is an addition, not a replacement', () => {
  const root = tmpDir(mkdtempSync(join(tmpdir(), 'gcto-iv-mixed-')));
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared/pipeline.toml'),
    '[transitions.pm]\non = ["DONE"]\nproduces = ["plan", "brief"]\nnext = ["x"]\n');
  const half = { agent: 'pm', verdict: 'DONE', meta: { plan: 'docs/plans/P.md' },
                 receipt: { files: { 'a.mjs': '1' } } };
  const r = checkRequiredClaim(half, { root });
  assert.equal(r.status, 'fail', 'a receipt must not stand in for a declared document');
  assert.match(r.detail, /brief=<path>/);
});

// ── a tie is not a majority ───────────────────────────────────────────────────
//
// Three samples resolved a 1-yes/1-no tie straight to `no`. That contradicted
// this module's own economics — a second model is consulted ONLY on `no`,
// because a wrong `no` is the expensive answer — and it made a coin flip read,
// in the finding text, exactly like three judges out of three saying no.
//
// Measured before changing it: one tie in six runs of the same real question,
// and the one that occurred did send a stage back on 1 yes / 1 no.

/** A judge whose successive votes are scripted, so a tie can be constructed. */
const scriptedJudge = (votes) => {
  let i = 0;
  return async () => votes[i++ % votes.length];
};

const oneRequirement = () => project({
  brief: ['# B', '## ACCEPTANCE', '- [ ] One requirement'].join('\n'),
});

test('a tie the second model resolves to yes is a pass, not rework', async () => {
  let secondAsked = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root: oneRequirement(),
    ask: scriptedJudge(['yes', 'no', 'unclear']),
    second: async () => { secondAsked += 1; return 'yes'; },
  });
  assert.equal(secondAsked, 1, 'a tie must reach the second model');
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(r.findings.length, 0, 'a settled tie leaves nothing to send back');
});

test('a tie the second model resolves to no is a real finding, worded as one', async () => {
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root: oneRequirement(),
    ask: scriptedJudge(['yes', 'no', 'unclear']),
    second: async () => 'no',
  });
  assert.equal(r.state, STATE.REWORK);
  // Settled, so it speaks with the ordinary voice — not as an unresolved split.
  assert.match(r.findings.join(' '), /answered no/);
  assert.doesNotMatch(r.findings.join(' '), /did not settle it/);
});

test('a tie nothing settles still comes back — but as undecided, not as a finding', async () => {
  // The whole point. The work returns either way; what changes is that the
  // report stops asserting a conclusion nobody reached.
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root: oneRequirement(),
    ask: scriptedJudge(['yes', 'no', 'unclear']),
    second: async () => 'unclear',
  });
  assert.equal(r.state, STATE.REWORK, 'falling toward rework is right when verifying');
  const f = r.findings.join(' ');
  assert.match(f, /split 1 yes \/ 1 no/);
  assert.match(f, /did not settle it/);
  assert.doesNotMatch(f, /answered no/, 'a coin flip must not borrow the sentence for a rejection');
});

test('with no second model at all a tie is unresolved, never silently decided', async () => {
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root: oneRequirement(),
    ask: scriptedJudge(['yes', 'no', 'unclear']),
    second: null,
  });
  assert.equal(r.state, STATE.REWORK);
  assert.match(r.findings.join(' '), /did not settle it/);
});

test('a decided no is untouched by the tie-break — a second model never overrules', async () => {
  // The pre-existing contract, which the tie-break must not quietly widen: where
  // the first judge REACHED an answer, divergence is reported and the answer
  // stands. Only a tie — where there is nothing to overrule — is settled.
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }),
    root: oneRequirement(),
    ask: scriptedJudge(['no', 'no', 'no']),
    second: async () => 'yes',
  });
  assert.equal(r.state, STATE.REWORK, 'three no votes stand against one dissenting model');
  assert.match(r.findings.join(' '), /answered no/);
});

// The second-judge choice, as a function — because inline it opted the project
// back in after it had opted out. Found by Codex on 2026-09-05, reviewing the
// commit that wired Codex in.
import { chooseSecondJudge } from '../../scripts/lib/independent-verify.mjs';

test('second_opinion: none means NO second judge — not the router, not codex', () => {
  const c = chooseSecondJudge({ so: { state: 'none', provider: 'none', why: '' }, routerAvailable: true });
  assert.equal(c.kind, 'none');
  assert.match(c.note, /declared second_opinion: none/);
});

test('codex declared and available is codex; declared and absent falls back to the router and SAYS so', () => {
  const ok = chooseSecondJudge({ so: { state: 'declared', provider: 'codex', codex: { model: 'gpt-x' } }, routerAvailable: true });
  assert.equal(ok.kind, 'codex'); assert.match(ok.note, /gpt-x/);
  const gone = chooseSecondJudge({ so: { state: 'unavailable', provider: 'codex', why: 'not on PATH', codex: { state: 'absent' } }, routerAvailable: true });
  assert.equal(gone.kind, 'router'); assert.match(gone.note, /declared but is absent/);
  const nothing = chooseSecondJudge({ so: { state: 'unavailable', provider: 'codex', why: 'not on PATH', codex: { state: 'absent' } }, routerAvailable: false });
  assert.equal(nothing.kind, 'none'); assert.match(nothing.note, /no router either/);
});

test('undeclared keeps the router, and no router is none with a reason', () => {
  assert.equal(chooseSecondJudge({ so: { state: 'undeclared', provider: null }, routerAvailable: true }).kind, 'router');
  const c = chooseSecondJudge({ so: { state: 'undeclared', provider: null }, routerAvailable: false });
  assert.equal(c.kind, 'none'); assert.match(c.note, /not found/);
});

// ── a count from a test run is not a claim about the diff ────────────────────
//
// A live pipeline run on 2026-09-14: senior-dev fixed a bug whose failing test
// already existed, and recorded `tests=2` — how many tests ran. The verifier
// turned that into "the change adds or updates automated tests", the judge read
// a change containing no test file and answered no, and a correct fix came back
// as rework. The module's own rule is that only claims a reader can settle from
// the files become questions; a test count is a fact about a run. It is asked
// only when the change actually contains a test file, where "are these real
// tests" is something the files can answer.
import { claimsAsRequirements } from '../../scripts/lib/independent-verify.mjs';

const withFiles = (files, meta = {}) => ({
  agent: 'senior-dev', verdict: 'TASK_DONE',
  meta: { feature: 'checkout-discount', tests: '2', ...meta },
  receipt: { head: 'a'.repeat(40), files: Object.fromEntries(files.map((f) => [f, 'b'.repeat(40)])) },
});
const asksAboutTests = (reqs) => reqs.some((r) => /tests/.test(r) && /automated/.test(r));

test('a test count is not asked about when the change contains no test file', () => {
  const reqs = claimsAsRequirements(withFiles(['src/cart.mjs', 'docs/architecture/ARCH-checkout-discount.md']));
  assert.ok(!asksAboutTests(reqs), `asked anyway: ${reqs.join(' / ')}`);
  assert.ok(reqs.some((r) => /checkout-discount/.test(r)), 'the feature claim is still a question');
});

test('a changed test file brings the tests question back', () => {
  for (const f of ['test/cart.test.mjs', 'tests/lib/cart.test.mjs', 'src/__tests__/cart.js', 'spec/cart_spec.rb', 'pkg/cart_test.go', 'tests/test_cart.py']) {
    assert.ok(asksAboutTests(claimsAsRequirements(withFiles(['src/cart.mjs', f]))), `not asked for ${f}`);
  }
});

test('with no receipt there are no changed files to settle a test count against', () => {
  const v = withFiles([]); delete v.receipt;
  assert.ok(!asksAboutTests(claimsAsRequirements(v)));
});

// ── quality 0–100 and the recommendations that close the gap (great_cto-1zu7) ──
//
// The owner's ask: the judge of task implementation gives a 0–100 score and,
// below 100, says what to improve. The score is counted from checks, never asked
// of a model — so each case below has its number known before the run.

import { assessQuality } from '../../scripts/lib/independent-verify.mjs';

const TWO = ['# B', '## ACCEPTANCE',
  '- [ ] The endpoint rate-limits by IP',
  '- [ ] Rejections are written to the audit log'].join('\n');

test('quality: work that meets every requirement scores 100 and carries no recommendation', async () => {
  const root = project({ brief: TWO });
  const r = await verifyAgentOutput({ verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }), root, ask: async () => 'yes' });
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(r.quality, 100);
  assert.deepEqual(r.recommendations, []);
  assert.match(r.conclusion, /quality: 100\/100 — 3 of 3 check\(s\) passed/);
  assert.doesNotMatch(r.conclusion, /To reach 100/);
});

test('quality: one unmet requirement of two costs its share, and the recommendation names it', async () => {
  const root = project({ brief: TWO });
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }), root,
    ask: stubJudge({ 'audit log': 'no', 'rate-limits': 'yes' }),
  });
  assert.equal(r.state, STATE.REWORK);
  assert.equal(r.quality, 66, 'artefact + one requirement of three checks: floor(200/3)');
  assert.equal(r.recommendations.length, 1);
  assert.match(r.recommendations[0], /^Address “Rejections are written to the audit log”/);
  assert.match(r.conclusion, /To reach 100\/100:\n  - Address/);
});

test('quality: a short-circuit does not raise the score — what it left unrun counts against it', async () => {
  const root = project({ brief: TWO });
  let asked = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md', design: 'docs/impl-briefs/MISSING.md' }), root,
    ask: async () => { asked += 1; return 'yes'; },
  });
  assert.equal(r.state, STATE.REWORK);
  assert.equal(asked, 0, 'still no model call after a missing file');
  // 1 of 2 artefacts present, 2 requirements never asked: 1 of 4, not 1 of 2.
  assert.equal(r.quality, 25);
  assert.equal(r.counted, 4);
  assert.match(r.recommendations.join(' '), /MISSING\.md/);
  assert.match(r.recommendations.at(-1), /verify again — 2 check\(s\) did not run/);
});

test('quality: unverifiable is not scored at all — null, never 0 — and says how to become checkable', async () => {
  const root = project();
  const r = await verifyAgentOutput({ verdict: verdictFor({ task: 'great_cto-1' }), root });
  assert.equal(r.state, STATE.UNVERIFIABLE);
  assert.equal(r.quality, null);
  assert.match(r.recommendations.join(' '), /Name what the stage produced/);
  assert.match(r.conclusion, /quality: not assessed/);
  assert.match(r.conclusion, /To make this stage checkable:/);
});

test('quality: a pass the judge split on is 99, not 100 — there is still something to show', async () => {
  const root = project({ brief: ['# B', '## ACCEPTANCE', '- [ ] The endpoint rate-limits by IP'].join('\n') });
  let n = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }), root,
    ask: async () => (n++ % 3 === 2 ? 'no' : 'yes'),
  });
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(r.quality, 99);
  assert.match(r.recommendations[0], /passed it only 2 yes \/ 1 no/);
});

test('quality: without a judge, the requirements nobody asked keep the score from 100', async () => {
  const root = project({ brief: ['# B', '## ACCEPTANCE', '- [ ] The endpoint rate-limits by IP'].join('\n') });
  const r = await verifyAgentOutput({ verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }), root });
  assert.equal(r.state, STATE.VERIFIED, 'the file exists — layers 1–2 pass');
  assert.equal(r.quality, 50, 'but only the file was checked, not the requirement');
  assert.match(r.recommendations[0], /Run verification with a judge — 1 requirement/);
});

test('quality: floor, not round — 199 of 200 is 99', () => {
  const q = assessQuality({
    state: STATE.REWORK,
    checks: [{ layer: 'artefacts', status: 'fail', checked: 200, missing: ['x=a.md (absent)'] }],
  });
  assert.equal(q.quality, 99);
  assert.equal(q.counted, 200);
});

test('quality: 100 exactly when there is nothing to recommend', () => {
  const cases = [
    { state: STATE.VERIFIED, checks: [{ layer: 'artefacts', status: 'pass', checked: 2, missing: [] }] },
    { state: STATE.VERIFIED, checks: [{ layer: 'artefacts', status: 'pass', checked: 1, missing: [] },
      { layer: 'judgement', status: 'pass', answers: [{ requirement: 'R', answer: 'yes', split: '2 yes / 1 no' }],
        abstained: 0, skipped: 0, excerpt: { truncated: false } }] },
    { state: STATE.VERIFIED, checks: [{ layer: 'artefacts', status: 'pass', checked: 1, missing: [] },
      { layer: 'judgement', status: 'pass', answers: [{ requirement: 'R', answer: 'yes' }], abstained: 0, skipped: 0,
        excerpt: { truncated: true, shownBytes: 10, totalBytes: 20, path: 'a.md', files: null, totalFiles: null } }] },
    { state: STATE.VERIFIED, checks: [{ layer: 'acceptance', status: 'pass', passed: 3, failed: [] }], pending: { judgement: 1 } },
  ];
  for (const c of cases) {
    const q = assessQuality(c);
    assert.equal(q.quality === 100, q.recommendations.length === 0, JSON.stringify({ c, q }));
  }
});

// Review findings on great_cto-1zu7, each pinned with the input that showed it.

test('quality F1: a yes that two of three samples could not answer is not 100', async () => {
  const root = project({ brief: ['# B', '## ACCEPTANCE', '- [ ] The endpoint rate-limits by IP'].join('\n') });
  const said = ['yes', 'maybe', 'hmm'];
  let n = 0;
  const r = await verifyAgentOutput({
    verdict: verdictFor({ brief: 'docs/impl-briefs/B.md' }), root, ask: async () => said[n++ % 3],
  });
  assert.equal(r.state, STATE.VERIFIED, 'the gate outcome is unchanged — only the grade');
  assert.ok(r.quality < 100, `got ${r.quality}`);
  assert.match(r.recommendations.join(' '), /said yes on 1 of 3 samples/);
});

test('quality F2: files present but no criterion at all is 99, with the criterion to add', async () => {
  const root = project({ brief: '# A\n\nprose, no acceptance section\n' });
  const r = await verifyAgentOutput({ verdict: verdictFor({ arch: 'docs/impl-briefs/B.md' }), root, ask: async () => 'yes' });
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(r.quality, 99);
  assert.match(r.recommendations[0], /Freeze `## ACCEPTANCE`/);
});

test('quality F3/F4: a deleted file is not a cut, a receipt the writer cut is', async () => {
  const root = project();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.mjs'), 'export const a = 1;\n');
  const files = { 'src/a.mjs': 'h1', 'src/gone.mjs': 'h2' };
  const deleted = await verifyAgentOutput({
    verdict: { agent: 'senior-dev', verdict: 'TASK_DONE', meta: { feature: 'x' }, receipt: { files } }, root, ask: async () => 'yes',
  });
  assert.equal(deleted.quality, 100, 'the judge read every file there was to read');
  const cut = await verifyAgentOutput({
    verdict: { agent: 'senior-dev', verdict: 'TASK_DONE', meta: { feature: 'x' }, receipt: { files, truncated: true } }, root, ask: async () => 'yes',
  });
  assert.equal(cut.quality, 99);
  assert.match(cut.recommendations.join(' '), /receipt itself was cut/);
});

test('quality F5: the invariant holds the other way — a recommendation means below 100', () => {
  const q = assessQuality({ state: STATE.REWORK,
    checks: [{ layer: 'artefacts', status: 'fail', checked: 2, missing: ['x=a.md (absent)'] }] });
  assert.equal(q.quality, 50);
  assert.equal(q.recommendations.length, 1);
  assert.notEqual(q.quality === 100, q.recommendations.length > 0);
});

// ── the judge reads the change, and every file of it ─────────────────────────
//
// A live run on 2026-10-31 graded a senior-dev stage 33/100: the excerpt took
// files whole, in receipt order, and three 40–70 KB prompts that sort first used
// the 128 KB budget — the eight files where the change lived, its test among
// them, were never shown. It read today's disk, too, not what the run recorded.
import { changedFilesExcerpt, artefactExcerpt } from '../../scripts/lib/independent-verify.mjs';
import { checkArtifacts, resolveClaimPath } from '../../scripts/lib/artifact-claims.mjs';
import { spawnSync } from 'node:child_process';

const sh = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

test('evidence: large files first do not starve the small ones after them', () => {
  const root = mkdtempSync(join(tmpdir(), 'iv-share-'));
  const files = {};
  for (const f of ['a-big1.md', 'a-big2.md', 'a-big3.md']) { writeFileSync(join(root, f), 'x'.repeat(5000)); files[f] = 'h'; }
  writeFileSync(join(root, 'z-impl.mjs'), 'export const feature = true;\n'); files['z-impl.mjs'] = 'h';
  writeFileSync(join(root, 'z-impl.test.mjs'), 'test("feature", () => {});\n'); files['z-impl.test.mjs'] = 'h';
  const e = changedFilesExcerpt({ receipt: { files } }, { root, bytes: 4000 });
  assert.deepEqual(e.files, Object.keys(files), 'every file is shown, in receipt order');
  assert.match(e.text, /export const feature = true/);
  assert.match(e.text, /test\("feature"/);
  assert.equal(e.truncated, true);
  assert.ok(e.shownBytes <= 4000, `budget kept: ${e.shownBytes}`);
  assert.equal(e.totalBytes, 15000 + 29 + 27, 'the total is the whole of it, not what was shown');
  rmSync(root, { recursive: true, force: true });
});

test('evidence: the judge reads the diff the run recorded, not today\'s disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'iv-diff-'));
  sh(root, 'init', '-q');
  sh(root, 'config', 'user.email', 't@t'); sh(root, 'config', 'user.name', 't');
  writeFileSync(join(root, 'cart.mjs'), 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);\n');
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'base');
  const base = sh(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'cart.mjs'), 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);\nexport const discount = (t) => t * 0.9;\n');
  const changed = sh(root, 'hash-object', '-w', 'cart.mjs');
  writeFileSync(join(root, 'coupon.mjs'), 'export const code = "SAVE10";\n');
  const created = sh(root, 'hash-object', '-w', 'coupon.mjs');
  // The tree moves on after the run; the judge must not read the later version.
  writeFileSync(join(root, 'cart.mjs'), 'export const unrelated = 1;\n');

  const e = changedFilesExcerpt({ receipt: { base, files: { 'cart.mjs': changed, 'coupon.mjs': created } } }, { root });
  assert.equal(e.change, true);
  assert.match(e.text, /cart\.mjs \(diff against base\)/);
  assert.match(e.text, /^\+export const discount/m, 'the added line is shown as added');
  assert.doesNotMatch(e.text, /unrelated/, 'today\'s disk is not what the run did');
  assert.match(e.text, /coupon\.mjs \(new file\)[\s\S]*SAVE10/);
  rmSync(root, { recursive: true, force: true });
});

test('evidence: a recorded blob missing from git falls back to the disk, and says so', () => {
  const root = mkdtempSync(join(tmpdir(), 'iv-disk-'));
  writeFileSync(join(root, 'a.mjs'), 'export const a = 1;\n');
  const e = changedFilesExcerpt({ receipt: { files: { 'a.mjs': 'f'.repeat(40) } } }, { root });
  assert.match(e.text, /a\.mjs \(current tree — the run's version is not in git\)/);
  rmSync(root, { recursive: true, force: true });
});

test('a claimed path under ~/ is the home directory, not a folder called ~', () => {
  const home = mkdtempSync(join(tmpdir(), 'iv-home-'));
  const root = mkdtempSync(join(tmpdir(), 'iv-root-'));
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    mkdirSync(join(home, 'evidence'), { recursive: true });
    writeFileSync(join(home, 'evidence', 'CSO.md'), '# Security report\n\n' + 'finding '.repeat(40));
    assert.equal(resolveClaimPath(root, '~/evidence/CSO.md'), join(home, 'evidence', 'CSO.md'));
    assert.equal(resolveClaimPath(root, 'docs/A.md'), join(root, 'docs/A.md'));
    assert.equal(resolveClaimPath(root, '/abs/A.md'), '/abs/A.md');
    const r = checkArtifacts({ report: '~/evidence/CSO.md' }, { root });
    assert.equal(r.ok, true, `reported absent: ${JSON.stringify(r.missing)}`);
  } finally {
    if (saved === undefined) delete process.env.HOME; else process.env.HOME = saved;
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('evidence: a change cut by file count says files, not "N of N bytes"', async () => {
  const root = project();
  const files = {};
  for (let i = 0; i < 45; i++) { const f = `src/f${i}.mjs`; mkdirSync(join(root, 'src'), { recursive: true }); writeFileSync(join(root, f), `export const v${i} = ${i};\n`); files[f] = 'h'; }
  const r = await verifyAgentOutput({ verdict: { agent: 'senior-dev', verdict: 'TASK_DONE', meta: { feature: 'x' }, receipt: { files } }, root, ask: async () => 'no' });
  const j = r.checks.find((c) => c.layer === 'judgement');
  assert.match(j.detail, /judge saw 40 of 45 changed file\(s\)/);
  assert.doesNotMatch(j.detail, /(\d+) of \1 bytes/);
});

// Review of the first version (BLOCKED): receipts recorded digests only, so an
// uncommitted change — the normal senior-dev case — had no object in git, and
// the judge fell back to today's disk. The emitted receipt now persists them.
import { treeReceipt } from '../../scripts/lib/receipt.mjs';

const repo = (prefix) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  sh(root, 'init', '-q'); sh(root, 'config', 'user.email', 't@t'); sh(root, 'config', 'user.name', 't');
  return root;
};

test('evidence: an uncommitted change is judged as the receipt recorded it, not as the disk is later', () => {
  const root = repo('iv-persist-');
  writeFileSync(join(root, 'cart.mjs'), 'export const total = 0;\n');
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'base');
  writeFileSync(join(root, 'cart.mjs'), 'export const total = 0;\nexport const discount = 0.9;\n');
  writeFileSync(join(root, 'coupon.mjs'), 'export const code = "SAVE10";\n');
  const receipt = treeReceipt(root, { base: 'HEAD', persist: true });
  writeFileSync(join(root, 'cart.mjs'), 'export const later = 1;\n');
  writeFileSync(join(root, 'coupon.mjs'), 'export const later = 2;\n');

  const e = changedFilesExcerpt({ receipt }, { root });
  assert.match(e.text, /cart\.mjs \(diff against base\)[\s\S]*^\+export const discount/m);
  assert.match(e.text, /coupon\.mjs \(new file\)[\s\S]*SAVE10/);
  assert.doesNotMatch(e.text, /later/);
  rmSync(root, { recursive: true, force: true });
});

test('a receipt built for a check, not for a verdict, writes nothing into git', () => {
  const root = repo('iv-nopersist-');
  writeFileSync(join(root, 'a.mjs'), 'export const a = 1;\n');
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'base');
  writeFileSync(join(root, 'b.mjs'), 'export const b = "only-on-disk";\n');
  const receipt = treeReceipt(root, { base: 'HEAD' });
  const r = spawnSync('git', ['cat-file', '-e', receipt.files['b.mjs']], { cwd: root });
  assert.notEqual(r.status, 0, 'the board polls receipts; it must not leave objects behind');
  rmSync(root, { recursive: true, force: true });
});

test('evidence: a project in a subdirectory gets no diff against a same-named file at the top', () => {
  const root = repo('iv-subdir-');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/index.mjs'), 'export const repoLevel = 1;\n');
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'base');
  const app = join(root, 'app');
  mkdirSync(join(app, 'src'), { recursive: true });
  writeFileSync(join(app, 'src/index.mjs'), 'export const appLevel = 1;\n');
  const blob = sh(app, 'hash-object', '-w', 'src/index.mjs');
  const e = changedFilesExcerpt({ receipt: { base: sh(root, 'rev-parse', 'HEAD'), files: { 'src/index.mjs': blob } } }, { root: app });
  assert.doesNotMatch(e.text, /repoLevel/);
  assert.match(e.text, /appLevel/);
  rmSync(root, { recursive: true, force: true });
});

test('evidence: a receipt key or a claim outside the project is not handed to the judge', () => {
  const outside = mkdtempSync(join(tmpdir(), 'iv-outside-'));
  const root = mkdtempSync(join(tmpdir(), 'iv-inside-'));
  writeFileSync(join(outside, 'private.md'), '# private\n' + 'secret notes '.repeat(20));
  writeFileSync(join(root, 'ok.mjs'), 'export const ok = 1;\n');
  const rel = join('..', outside.split('/').pop(), 'private.md');
  const e = changedFilesExcerpt({ receipt: { files: { [rel]: 'h', [join(outside, 'private.md')]: 'h', 'ok.mjs': 'h' } } }, { root });
  assert.deepEqual(e.files, ['ok.mjs']);
  assert.doesNotMatch(e.text, /secret notes/);
  assert.equal(artefactExcerpt({ meta: { report: join(outside, 'private.md') } }, { root }), null);
  rmSync(outside, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true });
});

test('evidence: headers count against the budget, and an unchanged file is shown, not dropped', () => {
  const root = repo('iv-budget-');
  const files = {};
  for (let i = 0; i < 30; i++) { writeFileSync(join(root, `f${i}.mjs`), `export const v${i} = "${'y'.repeat(60)}";\n`); }
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'base');
  for (let i = 0; i < 30; i++) files[`f${i}.mjs`] = sh(root, 'rev-parse', `HEAD:f${i}.mjs`);
  const e = changedFilesExcerpt({ receipt: { base: 'HEAD', files } }, { root, bytes: 2000 });
  assert.ok(e.text.length <= 2000, `text ${e.text.length} over a 2000-byte budget`);
  assert.equal(e.files.length, 30, 'unchanged-against-base files are still shown');
  assert.match(e.text, /f0\.mjs \(as recorded\)/);
  rmSync(root, { recursive: true, force: true });
});

test('evidence: a byte cut with a file missing on disk says bytes, not "files"', async () => {
  const root = project();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/big.mjs'), 'x'.repeat(200000));
  const r = await verifyAgentOutput({ verdict: { agent: 'senior-dev', verdict: 'TASK_DONE', meta: { feature: 'x' },
    receipt: { files: { 'src/big.mjs': 'h', 'src/gone.mjs': 'h' } } }, root, ask: async () => 'no' });
  const j = r.checks.find((c) => c.layer === 'judgement');
  assert.match(j.detail, /judge saw \d+ of 200000 bytes/);
  assert.doesNotMatch(r.recommendations.join(' '), /of 2 changed file/);
});
