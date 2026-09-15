// ADR-025: independent architecture drafts from other models, before the architect
// writes. Every case uses injected transports — no request leaves the machine — and
// a temp project, so nothing is written into this repository.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { councilFromProjectMd, runCouncil, estimateUsd, DEFAULT_MAX_USD } from '../../scripts/lib/council.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
const root = () => { const d = mkdtempSync(path.join(tmpdir(), 'gc-council-')); TMP.push(d); return d; };

// What resolveSecondOpinion needs to call each member declared: a Codex that is
// installed and logged in, and an OpenRouter key. The OpenRouter model is one the
// price table knows, so its cost can be estimated and capped.
const CODEX = { state: 'available', model: 'gpt-5', why: '' };
// Assembled rather than written: a key-shaped literal reads as a leaked key to every
// secret scanner, and this value's only job is to be present.
const FAKE_OPENROUTER_KEY = ['test', 'key'].join('-');
const ENV = { OPENROUTER_API_KEY: FAKE_OPENROUTER_KEY, GREAT_CTO_COUNCIL_MODEL: 'anthropic/claude-sonnet-4' };
const BOTH = (extra = '') => `# PROJECT.md\narchetype: web-service\ncouncil: arch\ncouncil-members: codex, openrouter\n${extra}`;
const OPENROUTER_ONLY = (extra = '') => `council: arch\ncouncil-members: openrouter\n${extra}`;

function recorder(text, usage = { input_tokens: 1000, output_tokens: 500 }) {
  const calls = [];
  const ask = async (req) => { calls.push(req); return { state: 'ok', text, usage, model: req.model }; };
  return { ask, calls };
}

test('the declaration has three states, and an unknown value is not read as off', () => {
  assert.equal(councilFromProjectMd('archetype: cli\n').state, 'off');
  assert.equal(councilFromProjectMd('council: none\n').state, 'off');
  const on = councilFromProjectMd('council: arch\n');
  assert.equal(on.state, 'on');
  assert.deepEqual(on.stages, ['arch']);
  assert.equal(on.maxUsd, DEFAULT_MAX_USD);
  assert.equal(councilFromProjectMd('council: code\n').state, 'invalid');
  assert.equal(councilFromProjectMd('council: arch\ncouncil-max-usd: lots\n').state, 'invalid');
  assert.equal(councilFromProjectMd('council: arch\ncouncil-members: gemini\n').state, 'invalid');
});

test('with no council declared, nothing is called and nothing is written', async () => {
  const dir = root();
  const codex = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: '# PROJECT.md\narchetype: cli\n', env: ENV, codex: CODEX, askers: { codex: codex.ask } });
  assert.equal(r.state, 'off');
  assert.equal(codex.calls.length, 0);
  assert.equal(existsSync(path.join(dir, 'docs')), false);
});

test('two members draft independently; drafts and a manifest are written', async () => {
  const dir = root();
  const a = recorder('## Decision\nPostgres, one service.');
  const b = recorder('## Decision\nEvent log, two services.');
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'Build checkout.', projectMd: BOTH(), env: ENV, codex: CODEX,
    askers: { codex: a.ask, openrouter: b.ask } });
  assert.equal(r.state, 'ran');
  const m = r.manifest;
  assert.equal(m.summary, 'council: 2 of 2 members drafted');
  assert.equal(m.degraded, false);
  for (const x of m.members) {
    assert.equal(x.state, 'drafted');
    assert.match(readFileSync(path.join(dir, x.path), 'utf8'), /## Decision/);
  }
  const onDisk = JSON.parse(readFileSync(path.join(dir, 'docs/architecture/council/checkout/council.json'), 'utf8'));
  assert.equal(onDisk.summary, m.summary);
});

test('a member is never shown another member\'s draft, and both get the identical request', async () => {
  const dir = root();
  const a = recorder('UNIQUE-DRAFT-A');
  const b = recorder('UNIQUE-DRAFT-B');
  await runCouncil({ root: dir, feature: 'checkout', brief: 'Build checkout.', projectMd: BOTH(), env: ENV, codex: CODEX,
    askers: { codex: a.ask, openrouter: b.ask } });
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(b.calls), /UNIQUE-DRAFT-A/);
  assert.doesNotMatch(JSON.stringify(a.calls), /UNIQUE-DRAFT-B/);
  assert.equal(a.calls[0].user, b.calls[0].user);
  assert.match(a.calls[0].user, /Build checkout\./, 'the brief is the input');
});

test('a member that fails is recorded failed; all failing is degraded, never agreement', async () => {
  const dir = root();
  const boom = async () => { throw new Error('connection reset'); };
  const empty = async () => ({ state: 'empty', text: '', usage: null });
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: BOTH(), env: ENV, codex: CODEX, askers: { codex: boom, openrouter: empty } });
  const m = r.manifest;
  assert.deepEqual(m.members.map((x) => [x.member, x.state]), [['codex', 'failed'], ['openrouter', 'failed']]);
  assert.match(m.members[0].why, /connection reset/);
  assert.equal(m.degraded, true);
  assert.equal(m.summary, 'council: degraded — 0 of 2 members drafted');
});

test('a member that never answers times out and is recorded failed', async () => {
  const dir = root();
  const hang = () => new Promise(() => {});
  const ok = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: BOTH(), env: ENV, codex: CODEX, timeoutMs: 50,
    askers: { codex: hang, openrouter: ok.ask } });
  assert.equal(r.manifest.members[0].state, 'failed');
  assert.match(r.manifest.members[0].why, /timed out/);
  assert.equal(r.manifest.summary, 'council: 1 of 2 members drafted');
});

test('an OpenRouter member whose estimate exceeds the cap is skipped, not run', async () => {
  const dir = root();
  const b = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'x'.repeat(20000), projectMd: OPENROUTER_ONLY('council-max-usd: 0.0001\n'),
    env: ENV, codex: CODEX, askers: { openrouter: b.ask } });
  assert.equal(b.calls.length, 0, 'nothing over the cap is called');
  assert.equal(r.manifest.members[0].state, 'skipped');
  assert.match(r.manifest.members[0].why, /exceeds council-max-usd/);
});

test('an OpenRouter model with no known price cannot be kept under the cap, so it is skipped', async () => {
  const dir = root();
  const b = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(),
    env: { ...ENV, GREAT_CTO_COUNCIL_MODEL: 'nobody/unpriced-model-xyz' }, codex: CODEX, askers: { openrouter: b.ask } });
  assert.equal(b.calls.length, 0);
  assert.equal(r.manifest.members[0].state, 'skipped');
  assert.match(r.manifest.members[0].why, /no price/);
});

test('a Codex member runs on the subscription: no dollar estimate, and its cost is unverifiable, not $0', async () => {
  const dir = root();
  const a = recorder('draft', { input_tokens: 3000, output_tokens: 900 });
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'x'.repeat(20000), projectMd: 'council: arch\ncouncil-members: codex\ncouncil-max-usd: 0.0001\n',
    env: ENV, codex: CODEX, askers: { codex: a.ask } });
  const [x] = r.manifest.members;
  assert.equal(a.calls.length, 1, 'the per-token cap does not apply to a subscription');
  assert.equal(x.state, 'drafted');
  assert.deepEqual(x.estimate, { usd: null, priceSource: 'subscription' });
  assert.equal(x.cost.state, 'unverifiable');
  assert.equal(x.cost.usd, null);
  assert.match(x.cost.why, /subscription/);
});

test('an OpenRouter draft whose provider returned no usage is unverifiable, never $0', async () => {
  const dir = root();
  const noUsage = recorder('draft', null);
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: ENV, codex: CODEX, askers: { openrouter: noUsage.ask } });
  const [x] = r.manifest.members;
  assert.equal(x.state, 'drafted');
  assert.equal(x.cost.state, 'unverifiable');
  assert.equal(x.cost.usd, null);
  assert.deepEqual(r.manifest.cost.unverifiable, ['openrouter']);
});

test('a measured OpenRouter draft is priced from its usage', async () => {
  const dir = root();
  const b = recorder('draft', { input_tokens: 2000, output_tokens: 1000 });
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: ENV, codex: CODEX, askers: { openrouter: b.ask } });
  const [x] = r.manifest.members;
  assert.equal(x.cost.state, 'measured');
  assert.ok(x.cost.usd > 0);
  assert.equal(r.manifest.cost.measuredUsd, x.cost.usd);
});

test('an undeclared provider is unavailable, with the reason', async () => {
  const dir = root();
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: {}, codex: CODEX, askers: {} });
  assert.equal(r.manifest.members[0].state, 'unavailable');
  assert.match(r.manifest.members[0].why, /OPENROUTER_API_KEY/);
  assert.equal(r.manifest.degraded, true);
});

test('a feature slug that could escape the council directory is refused', async () => {
  const dir = root();
  const r = await runCouncil({ root: dir, feature: '../../etc', projectMd: BOTH(), env: ENV, codex: CODEX, askers: {} });
  assert.equal(r.state, 'invalid');
  assert.equal(existsSync(path.join(dir, 'docs')), false);
});

test('an estimate for an unpriced model is null, not zero', () => {
  assert.equal(estimateUsd({ model: 'nobody/unpriced-model-xyz', inputChars: 4000 }).usd, null);
  assert.ok(estimateUsd({ model: 'claude-sonnet-4', inputChars: 4000 }).usd > 0);
});
