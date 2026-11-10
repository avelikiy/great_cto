// scripts/lib/release-receipt.mjs — the evidence a client release must carry
// before anyone may call it "released".
//
// release-manager ships web frontends and mobile builds. Its prompt says what to
// prove; this file is where the proof is checked, because a list of evidence
// that lives only in prose is a list an agent can round up. The receipt is
// written only when every required line holds, and the CLI exits non-zero
// otherwise — the agent's rule is "no receipt, no 'released'".
//
// Two stages:
//   staged   — artifact built from the CI-green commit, on preview / internal track
//   released — promoted or submitted after gate:release, landed, rollback named,
//              old versions cleaned
//
// Usage:
//   node scripts/lib/release-receipt.mjs --stage released --kind web \
//     --version 1.4.0 --sha <40 hex> --artifact-sha <sha read back from the artifact> \
//     --artifact <deployment id | build number | path> \
//     --ci-run <id> --ci-conclusion success \
//     --e2e-run <id> --e2e-result pass --e2e-target <url | build> \
//     --gate <gate id> --live pass --rollback "<exact command>" \
//     --cleanup "<one-line df result>" [--verify-ci] [--out-dir .great_cto/releases]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isMainModule } from './is-main.mjs';

export const KINDS = Object.freeze(['web', 'ios', 'android', 'ota']);
export const STAGES = Object.freeze(['staged', 'released']);
const SHA = /^[0-9a-f]{40}$/;

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Check the evidence. Pure: everything it needs from the outside world arrives
 * in `probes` so tests can drive it.
 *
 * @param {Record<string,string>} input
 * @param {{ head?: string, dirty?: string[], ciRun?: {headSha:string, conclusion:string}|null }} [probes]
 * @returns {{ ok: boolean, problems: string[], receipt: object|null }}
 */
export function checkReceipt(input, probes = {}) {
  const p = [];
  const stage = input.stage;
  if (!STAGES.includes(stage)) p.push(`stage must be one of ${STAGES.join('|')}`);
  if (!KINDS.includes(input.kind)) p.push(`kind must be one of ${KINDS.join('|')}`);
  if (blank(input.version)) p.push('version is missing');

  const sha = String(input.sha || '').toLowerCase();
  if (!SHA.test(sha)) p.push('sha must be the full 40-character commit');

  // The tree that was built. A build packs the directory, not HEAD.
  if (probes.head !== undefined && probes.head !== sha) p.push(`working tree is at ${probes.head || 'unknown'}, not ${sha}`);
  if (probes.dirty && probes.dirty.length) p.push(`working tree has uncommitted changes: ${probes.dirty.slice(0, 5).join(', ')}`);

  // CI on THIS commit.
  if (blank(input['ci-run'])) p.push('ci-run is missing — name the CI run that checked this commit');
  if (input['ci-conclusion'] !== 'success') p.push(`CI conclusion is "${input['ci-conclusion'] || 'missing'}", not success — no build on red CI`);
  if (probes.ciRun) {
    if (probes.ciRun.headSha !== sha) p.push(`CI run ${input['ci-run']} checked ${probes.ciRun.headSha}, not ${sha}`);
    if (probes.ciRun.conclusion !== 'success') p.push(`CI run ${input['ci-run']} concluded ${probes.ciRun.conclusion}`);
  } else if (probes.ciRun === null) {
    p.push(`CI run ${input['ci-run']} could not be read — a claim that cannot be checked is not evidence`);
  }

  // The artifact is the commit.
  if (blank(input.artifact)) p.push('artifact is missing — deployment id, build number or path');
  const asha = String(input['artifact-sha'] || '').toLowerCase();
  if (!SHA.test(asha)) p.push('artifact-sha must be the 40-character commit read back FROM the artifact');
  else if (asha !== sha) p.push(`artifact carries ${asha}, not ${sha}`);

  // E2E on the shipped artifact, not on a rebuild.
  const e2e = input['e2e-result'];
  if (stage === 'released' || !blank(e2e)) {
    if (e2e !== 'pass') p.push(`e2e result is "${e2e || 'missing'}", not pass`);
    if (blank(input['e2e-run'])) p.push('e2e-run is missing');
    if (blank(input['e2e-target'])) p.push('e2e-target is missing — the URL or build the flows ran against');
  }

  if (stage === 'released') {
    if (blank(input.gate)) p.push('gate is missing — production and store steps run only after gate:release');
    if (input.live !== 'pass') p.push(`live check is "${input.live || 'missing'}", not pass`);
    if (blank(input.rollback)) p.push('rollback is missing — name the exact command');
    if (blank(input.cleanup)) p.push('cleanup is missing — old versions removed and the df result');
  }

  if (p.length) return { ok: false, problems: p, receipt: null };
  const receipt = {
    schema: 'great-cto/release-receipt@1',
    stage, kind: input.kind, version: input.version, sha,
    artifact: input.artifact,
    ci: { run: input['ci-run'], conclusion: 'success', verified: Boolean(probes.ciRun) },
    e2e: blank(e2e) ? null : { run: input['e2e-run'], result: e2e, target: input['e2e-target'] },
    gate: input.gate || null,
    live: input.live || null,
    rollback: input.rollback || null,
    cleanup: input.cleanup || null,
    at: input.at || new Date().toISOString(),
  };
  return { ok: true, problems: [], receipt };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function gitProbe(cwd) {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3));
    return { head, dirty };
  } catch {
    return { head: '', dirty: ['(not a git work tree)'] };
  }
}

function ciProbe(run, cwd) {
  try {
    const j = JSON.parse(execFileSync('gh', ['run', 'view', String(run), '--json', 'headSha,conclusion'], { cwd, encoding: 'utf8' }));
    return { headSha: j.headSha, conclusion: j.conclusion };
  } catch {
    return null;
  }
}

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cwd = args.repo || process.cwd();
  const probes = gitProbe(cwd);
  if (args['verify-ci']) probes.ciRun = ciProbe(args['ci-run'], cwd);
  const r = checkReceipt(args, probes);
  if (!r.ok) {
    process.stderr.write(`release-receipt: NOT RELEASED — ${r.problems.length} problem(s):\n`);
    for (const x of r.problems) process.stderr.write(`  - ${x}\n`);
    process.exit(1);
  }
  const dir = join(cwd, args['out-dir'] || '.great_cto/releases');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${r.receipt.version}-${r.receipt.kind}-${r.receipt.stage}.json`);
  writeFileSync(file, JSON.stringify(r.receipt, null, 2) + '\n');
  process.stdout.write(`release-receipt: ${r.receipt.stage.toUpperCase()} ${r.receipt.kind} ${r.receipt.version} @ ${r.receipt.sha.slice(0, 12)} → ${file}\n`);
}
