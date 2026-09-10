// Live acceptance for the GitHub Release adapter — a REAL release in a REAL repository.
//
// Everything the unit tests assert about GitHub is asserted against a fake gh.
// That fake was wrong once already: it signalled "release not found" with an
// error.code real gh never sets, so the branch production depends on went
// untested. This runs the same path against GitHub itself — prepare → approve →
// executeRelease with the host's gh, and the smoke in the pinned Docker image on
// the bytes downloaded back from the release — so the adapter's assumptions about
// gh output, draft lookup by pending tag, and `target_commitish` meet the real
// thing.
//
// It publishes. So it runs only when asked twice: the explicit flag AND the
// repository named in the environment. Point it at a private throwaway repository.
//
//   GREAT_CTO_LIVE_DOCKER_IMAGE=node:22-alpine@sha256:<digest> \
//   GREAT_CTO_LIVE_GH_REPO=<owner>/<throwaway> \
//   GREAT_CTO_LIVE_TARGET=<40-hex commit that exists in that repository> \
//   GREAT_CTO_LIVE_CONFLICT_TAG=<existing tag that points at a DIFFERENT commit> \
//   GREAT_CTO_LIVE_EVIDENCE=<path to write evidence JSON> \
//   node tests/eval/codex-github-release-live.mjs --approve-live-github-release
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { validateArtifacts, bundleDigest, digest } from '../../scripts/lib/codex-artifacts.mjs';
import { prepareRelease, approveRelease, executeRelease, validateReleasePolicy } from '../../scripts/lib/codex-release.mjs';
import { invokeGh } from '../../scripts/lib/codex-github-release.mjs';
import { safePath } from '../../scripts/lib/codex-pipeline.mjs';
import { runChecks } from '../../scripts/lib/codex-checks.mjs';

const REPO = process.env.GREAT_CTO_LIVE_GH_REPO;
const TARGET = process.env.GREAT_CTO_LIVE_TARGET;
const CONFLICT_TAG = process.env.GREAT_CTO_LIVE_CONFLICT_TAG;
const EVIDENCE = process.env.GREAT_CTO_LIVE_EVIDENCE;
const image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE;

if (!process.argv.includes('--approve-live-github-release') || !REPO || !TARGET || !image) {
  throw Error('Publishes a real GitHub release. Requires --approve-live-github-release, '
    + 'GREAT_CTO_LIVE_GH_REPO, GREAT_CTO_LIVE_TARGET and GREAT_CTO_LIVE_DOCKER_IMAGE.');
}

const content = 'export const x = 2;\n';
const artifacts = () => validateArtifacts([{ path: 'dist/index.mjs', base64: Buffer.from(content).toString('base64') }]);
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
const recording = (log) => async (args) => { log.push(`${args[0]} ${args[1]}`); return invokeGh(args); };
const evidence = { repository: REPO, target: TARGET, image, startedAt: new Date().toISOString(), scenarios: {} };

after(() => {
  evidence.finishedAt = new Date().toISOString();
  if (EVIDENCE) writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
});

/** A prepared-for-release run state, shaped like the unit fixture but aimed at a real repository. */
function runState(t, { repository = REPO, tag }) {
  const base = mkdtempSync(join(tmpdir(), 'gh-live-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/index.mjs'), content);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'src'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Live', '-c', 'user.email=live@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
  const checkPolicy = { image, inputs: ['src'], outputs: ['dist/index.mjs'], timeoutMs: 120000,
    commands: [['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/index.mjs','dist/index.mjs')"]] };
  const releasePolicy = validateReleasePolicy({ adapter: 'github-release', repository, tag, targetCommitish: TARGET,
    title: `great_cto live acceptance ${tag}`, notes: 'Throwaway release created by the GitHub adapter live acceptance run.',
    image, timeoutMs: 120000,
    smokeCommands: [['node', '--input-type=module', '-e', "import assert from 'node:assert/strict';import {x} from './dist/index.mjs';assert.equal(x,2)"]] }, root);
  const roles = ['senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer'];
  const results = Object.fromEntries(roles.map((role) => [role, { verification: { state: 'verified' } }]));
  results['qa-engineer'].checks = { state: 'passed', files: { 'src/index.mjs': digest(content) },
    policyDigest: digest(JSON.stringify(checkPolicy)), artifacts: artifacts(), artifactDigest: bundleDigest(artifacts()) };
  return { root, allowed: ['src'], checkPolicy, releasePolicy, results, released: roles, status: 'ready' };
}

test('L1+L2 live: publish through a draft with Docker smoke on downloaded bytes, then reconcile the published release', async (t) => {
  const tag = `v0.1.0-live-${Date.now()}`;
  const s = runState(t, { tag });

  // QA export through the real offline Docker check, as production does.
  s.results['qa-engineer'].checks = await runChecks(s, { safePath });
  assert.equal(s.results['qa-engineer'].checks.state, 'passed', JSON.stringify(s.results['qa-engineer'].checks));
  prepareRelease(s); approveRelease(s, s.release.token);

  const first = [];
  await executeRelease(s, { safePath, gh: recording(first) });
  assert.equal(s.release.status, 'verified', JSON.stringify({ reason: s.reason, smoke: s.release.smoke }));

  // Ask GitHub, not the adapter, what exists now.
  const remote = JSON.parse(gh('release', 'view', tag, '--repo', REPO, '--json', 'isDraft,tagName,targetCommitish,url,assets'));
  const tagSha = JSON.parse(gh('api', `repos/${REPO}/git/ref/tags/${tag}`)).object.sha;
  assert.equal(remote.isDraft, false, 'release is still a draft');
  assert.equal(tagSha, TARGET, 'the published tag does not point at the approved commit');
  assert.deepEqual(remote.assets.map((a) => a.name).sort(), s.release.remoteAssets.map((a) => a.name).sort());

  // L2: the same approved release, executed again against what is now public.
  const second = [];
  await executeRelease(s, { safePath, gh: recording(second) });
  assert.equal(s.release.status, 'verified');
  assert.equal(second.includes('release create'), false, 'reconciliation created a second release');
  assert.equal(second.includes('release upload'), false, 'reconciliation uploaded an asset again');
  assert.ok(second.includes('release download'), 'reconciliation accepted assets without re-downloading them');

  evidence.scenarios.L1 = {
    tag, url: remote.url, isDraft: remote.isDraft, tagResolvesTo: tagSha, releaseTargetCommitish: remote.targetCommitish,
    assets: remote.assets.map((a) => ({ name: a.name, size: a.size })),
    smoke: { state: s.release.smoke?.state, code: s.release.smoke?.code }, ghCalls: first,
  };
  evidence.scenarios.L2 = { ghCalls: second, status: s.release.status };
});

test('L3 live: a tag already pointing at another commit is refused before any release exists', { skip: !CONFLICT_TAG }, async (t) => {
  const s = runState(t, { tag: CONFLICT_TAG });
  prepareRelease(s); approveRelease(s, s.release.token);
  const calls = [];
  await assert.rejects(executeRelease(s, { safePath, gh: recording(calls) }), /already points at/);
  assert.equal(calls.includes('release create'), false, 'created a release for a tag at the wrong commit');
  let exists = true;
  try { gh('release', 'view', CONFLICT_TAG, '--repo', REPO); } catch { exists = false; }
  assert.equal(exists, false, 'a release exists for the conflicting tag');
  const tagSha = JSON.parse(gh('api', `repos/${REPO}/git/ref/tags/${CONFLICT_TAG}`)).object.sha;
  evidence.scenarios.L3 = { tag: CONFLICT_TAG, tagResolvesTo: tagSha, refused: true, reason: s.reason, ghCalls: calls };
});

test('L4 live: an unreachable repository is refused, not read as "no release yet"', async (t) => {
  const repository = `${REPO}-does-not-exist`;
  const s = runState(t, { repository, tag: 'v0.0.0-unreachable' });
  prepareRelease(s); approveRelease(s, s.release.token);
  const calls = [];
  await assert.rejects(executeRelease(s, { safePath, gh: recording(calls) }), /not reachable/);
  assert.equal(calls.includes('release create'), false);
  evidence.scenarios.L4 = { repository, refused: true, reason: s.reason, ghCalls: calls };
});
