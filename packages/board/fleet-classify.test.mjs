// fleet.mjs was 33% covered and decides what the agents panel shows: which
// domain an agent belongs to, whether a run counted as a success, and what its
// recurring failure modes are. Those three answers are what a reader uses to
// decide an agent is working, so a wrong one is worse than a missing one.
//
// The classification is pure and was untested; getAgentsFleet and
// getAgentProfile read the real ~/.claude/agents directory and are left to the
// integration path.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { deriveDomain, clusterFailureModes, isSuccess, isFailure } =
  await import('./lib/fleet.mjs');

// ── domain ─────────────────────────────────────────────────────────────────

test('each agent lands in the domain a reader would expect', () => {
  const expected = {
    architect: 'arch', 'ai-prompt-architect': 'arch',
    'security-officer': 'security', 'pci-reviewer': 'security', 'gdpr-reviewer': 'security',
    'qa-engineer': 'qa', 'e2e-test-engineer': 'qa', 'ai-eval-engineer': 'qa',
    devops: 'ops', 'l3-support': 'ops', 'infra-provisioner': 'ops',
    pm: 'pm', 'product-owner': 'pm',
    'continuous-learner': 'memory',
    'cms-reviewer': 'domain', 'library-reviewer': 'domain', 'legal-reviewer': 'domain',
  };
  for (const [slug, domain] of Object.entries(expected)) {
    assert.equal(deriveDomain(slug), domain, slug);
  }
});

test('an unrecognised agent is `other`, not a silent miscategory', () => {
  assert.equal(deriveDomain('app-scaffolder'), 'other');
  assert.equal(deriveDomain(''), 'other');
});

test('domain matching is case-insensitive', () => {
  assert.equal(deriveDomain('Security-Officer'), 'security');
});

// The qa rule used to match on `review`, which every `*-reviewer` slug contains.
// 37 of the 40 agents in `qa` were domain reviewers, the `domain` bucket was
// permanently empty, and the panel grouped 58% of the fleet under one heading.
// The rule meant to separate them sat two lines later and could never be reached.
test('a domain reviewer is a domain reviewer, not a QA agent', () => {
  const domain = ['library-reviewer', 'cms-reviewer', 'insurance-reviewer', 'msp-reviewer', 'tax-reviewer'];
  for (const slug of domain) assert.equal(deriveDomain(slug), 'domain', slug);
});

test('the four genuine QA agents stay in qa', () => {
  for (const slug of ['qa-engineer', 'e2e-test-engineer', 'ai-eval-engineer', 'code-reviewer']) {
    assert.equal(deriveDomain(slug), 'qa', slug);
  }
});

test('an earlier rule still wins where it should', () => {
  // pci-reviewer is a reviewer, but security is tested first and that is right —
  // a reader looking for the payments reviewer looks under security.
  assert.equal(deriveDomain('pci-reviewer'), 'security');
  assert.equal(deriveDomain('gdpr-reviewer'), 'security');
});

// ── success and failure vocabularies ───────────────────────────────────────

test('every success word an agent actually emits counts as success', () => {
  for (const v of ['APPROVED', 'OK', 'DONE', 'PASS', 'PASSED', 'approved', 'done']) {
    assert.equal(isSuccess(v), true, v);
    assert.equal(isFailure(v), false, v);
  }
});

test('every failure word counts as failure', () => {
  for (const v of ['BLOCKED', 'FAIL', 'FAILED', 'REJECTED', 'blocked']) {
    assert.equal(isFailure(v), true, v);
    assert.equal(isSuccess(v), false, v);
  }
});

test('an unknown verdict is neither — it must not be counted as a pass', () => {
  for (const v of ['ESCALATED', 'SKIPPED', 'CODE-REVIEW', '', null, undefined, 'APPROVED_WITH_NOTES']) {
    assert.equal(isSuccess(v), false, String(v));
    assert.equal(isFailure(v), false, String(v));
  }
});

test('a verdict is matched whole, not as a substring', () => {
  assert.equal(isSuccess('NOT APPROVED'), false, 'substring matching would score a rejection as a pass');
  assert.equal(isFailure('UNBLOCKED'), false);
});

// ── failure clustering ─────────────────────────────────────────────────────

const v = (raw, ts = '2026-08-01T10:00:00Z') => ({ raw, ts });

test('recurring failures cluster by cause and are ranked by frequency', () => {
  const modes = clusterFailureModes([
    v('HTTP 429 too many requests'),
    v('rate-limit exceeded'),
    v('request timed out after 60s'),
    v('rate limit hit again'),
  ]);
  assert.equal(modes[0].key, 'rate-limit');
  assert.equal(modes[0].count, 3);
  assert.equal(modes[1].key, 'timeout');
});

test('each verdict counts once, toward its first matching cause', () => {
  // Without the break, a line mentioning two patterns would inflate both counts
  // and the panel would report more failures than there were runs.
  const modes = clusterFailureModes([v('rate-limit hit, then timed out')]);
  assert.equal(modes.reduce((s, m) => s + m.count, 0), 1);
});

test('the newest occurrence is what last_seen reports', () => {
  const modes = clusterFailureModes([
    v('rate-limit', '2026-07-01T00:00:00Z'),
    v('HTTP 429', '2026-08-01T00:00:00Z'),
    v('too many requests', '2026-06-01T00:00:00Z'),
  ]);
  assert.equal(modes[0].last_seen, '2026-08-01T00:00:00Z',
    'reporting the first sighting would make a live problem look resolved');
});

test('a verdict matching no known pattern is not clustered', () => {
  assert.deepEqual(clusterFailureModes([v('something else went wrong')]), [],
    'inventing a bucket for an unrecognised failure is a category nobody can act on');
});

test('no verdicts and malformed verdicts both yield no clusters', () => {
  assert.deepEqual(clusterFailureModes([]), []);
  assert.deepEqual(clusterFailureModes([{}, { raw: null }]), []);
});

test('a precondition failure is its own mode, not a generic one', () => {
  const modes = clusterFailureModes([v('BLOCKED: no ARCH doc found for this feature')]);
  assert.equal(modes[0].key, 'precondition');
});
