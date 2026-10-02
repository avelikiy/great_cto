/** Opt-in human-pause policy. Never changes verification, joins or approvals. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { classify } from './change-tier.mjs';
import { gatesForApprovalLevel, APPROVAL_LEVELS } from './approval-level.mjs';
import { readStandDowns } from './stand-down.mjs';

const sensitive = /(^|\/)(auth(?:entication)?|migrations?|payments?|billing|pricing|wallets?|signing|secrets?|permissions?|rbac|tenant[_-]?isolation|terraform|infra|agents(?:-full)?|skills|shared|scripts|\.github|\.codex|\.claude|\.great_cto)(\/|\.|$)|(^|\/)(AGENTS|CLAUDE|SKILL)\.md$|(^|\/)(package(?:-lock)?\.json|.*lock.*)$/i;
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const activity = new Set(['.great_cto/stand-downs.jsonl', '.great_cto/events.jsonl', '.great_cto/events.1.jsonl', '.great_cto/cache/adaptive-reviewer-notice.json', '.beads/interactions.jsonl']);

export function pinChangeBase(root, ref) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw Error('explicit change base required');
  if (git(root, ['rev-parse', '--show-prefix']).trim()) throw Error('change assessment requires repository root');
  return git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
}

export function assessChange(root, base) {
  try {
    if (!/^[a-f0-9]{40,64}$/.test(base || '')) throw Error('base must be a pinned commit');
    pinChangeBase(root, base);
    const tracked = git(root, ['diff', '--no-ext-diff', '--name-only', '-z', '--no-renames', base, '--']);
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
    const files = [...new Set([...tracked.split('\0'), ...untracked.split('\0')].filter(f => f && !activity.has(f)))].sort();
    if (!files.length) throw Error('empty change has no risk evidence');
    const result = classify({ changedFiles: files, bulkThreshold: 10 });
    const high = files.filter(f => sensitive.test(f));
    if (high.length) { result.tier = 'T2'; result.reasons.push(...high.map(f => `runtime-sensitive:${f}`)); }
    const digest = createHash('sha256').update(JSON.stringify({ base, files, tier: result.tier }));
    for (const file of files) {
      try {
        const path = join(root, file); const stat = lstatSync(path);
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('unsupported change artifact');
        digest.update(file).update(String(stat.mode)).update(readFileSync(path));
      } catch (e) { if (e.code === 'ENOENT') digest.update(`deleted:${file}`); else throw e; }
    }
    return { ...result, files, base, fingerprint: digest.digest('hex'), known: true };
  } catch (error) {
    return { known: false, tier: 'T2', reasons: [`assessment-unavailable:${error.message}`], base: base || null };
  }
}

export function runtimeGatePolicy({ root, base, level, archetype, briefReadable = true }) {
  const assessment = assessChange(root, base);
  const baseline = gatesForApprovalLevel(level, { archetype, briefReadable });
  if (!assessment.known) return { assessment, activeGates: null, removed: [] };
  // Never silently relax an explicit strict/expert/step-by-step policy.
  const reducible = level === 'gates-only';
  const activeGates = baseline.filter(g => !(reducible && assessment.tier !== 'T2' && g === 'arch'));
  if (!activeGates.includes('ship')) activeGates.push('ship');
  // Even auto/ship-only cannot waive the hard floor on a known sensitive diff.
  if (assessment.tier === 'T2') for (const g of ['security', 'compliance', 'ship']) if (!activeGates.includes(g)) activeGates.push(g);
  return { assessment, activeGates, removed: baseline.filter(g => !activeGates.includes(g)) };
}

export function validateRuntimePolicy(root, policy) {
  if (!policy || policy.mode !== 'adaptive' || !APPROVAL_LEVELS.includes(policy.level)) throw Error('invalid adaptive gate policy');
  if (policy.level === 'ship-only') throw Error('controlled adaptive runs do not implement the mandatory ship-only product briefing');
  if (typeof policy.archetype !== 'string' || !policy.archetype.trim()) throw Error('explicit archetype required');
  return { mode: 'adaptive', level: policy.level, archetype: policy.archetype, base: pinChangeBase(root, policy.base), skipped: [] };
}

/** Operator environment opt-in for native hooks; project/worker labels cannot enable it. */
export function nativeRuntimePolicy({ root, level, archetype, briefReadable = true, env = process.env, record = null }) {
  if (env.GREAT_CTO_ADAPTIVE_GATES !== '1') return null;
  const policy = runtimeGatePolicy({ root, base: env.GREAT_CTO_CHANGE_BASE, level, archetype, briefReadable });
  if (policy.removed.length) {
    const evidence = JSON.stringify({ base: policy.assessment.base, fingerprint: policy.assessment.fingerprint, reasons: policy.assessment.reasons });
    const recorded = record
      ? policy.removed.every(gate => record({ gate, agent: 'architect', tier: `change:${policy.assessment.tier}`, evidence, at: Date.now() })?.recorded === true)
      : policy.removed.every(gate => readStandDowns(root)?.some(r => r.gate === gate && r.agent === 'architect' && r.evidence === evidence));
    if (!recorded) {
      policy.activeGates = gatesForApprovalLevel(level, { archetype, briefReadable });
      policy.removed = []; policy.audit = 'not-recorded';
    } else policy.audit = 'recorded';
  }
  return policy;
}
