/** Advisory specialist selection, never gate authority or reusable PASS evidence. */
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assessChange } from './runtime-gate-policy.mjs';
import { readOnlyGit } from './receipt.mjs';
import { requiredReviewers, REVIEWERS_BY_ARCHETYPE, PACK_REVIEWERS, COMPLIANCE_REVIEWERS } from './required-reviewers.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const activity = /^(?:\.great_cto\/(?:events(?:\.1)?\.jsonl|stand-downs\.jsonl|cache\/adaptive-reviewer-notice\.json)|\.beads\/interactions\.jsonl)$|^\.great_cto\/verdicts\//;

/** Conservative whole visible-tree dependency scope; bounded and fail closed. */
function dependencyFingerprint(root, project, exclude) {
  const inventory = readOnlyGit(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], root,
    { maxBuffer: 4 * 1024 * 1024 });
  if (inventory === null) throw Error('bounded read-only Git inventory unavailable');
  const names = inventory.split('\0').filter(Boolean);
  const paths = [...new Set(names)].filter(p => !activity.test(p) && !exclude.includes(p)).sort();
  if (paths.length > 2000) throw Error('dependency scope exceeds 2000 files');
  const digest = createHash('sha256').update(JSON.stringify({ version: 1, project }));
  let bytes = 0;
  for (const path of paths) {
    digest.update(JSON.stringify(path));
    try {
      // Git paths can contain a symlink parent; do not read outside the project.
      let current = root;
      for (const part of path.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) throw Error('symlink dependency scope unsupported');
      }
      const stat = lstatSync(current);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('unsupported dependency artifact');
      bytes += stat.size;
      if (bytes > 32 * 1024 * 1024) throw Error('dependency scope exceeds 32 MiB');
      digest.update(String(stat.mode)).update(sha(readFileSync(current)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      digest.update('deleted');
    }
  }
  return digest.digest('hex');
}

export function specialistPlan({ root, base, rules, exclude = [], planning = false }) {
  const assessment = assessChange(root, base);
  try {
    // A clean pre-build tree has no implemented diff yet. It can select declared
    // contracts, but must retain unknown/T2 risk and cannot waive runtime gates.
    const planningOnly = planning === true && !assessment.known && assessment.reasons?.length === 1
      && assessment.reasons[0] === 'assessment-unavailable:empty change has no risk evidence';
    if (!assessment.known && !planningOnly) throw Error(assessment.reasons.join('; '));
    if (planningOnly) assessment.files = [];
    if (lstatSync(join(root, '.great_cto')).isSymbolicLink()) throw Error('symlink project directory unsupported');
    const projectPath = join(root, '.great_cto', 'PROJECT.md');
    if (!lstatSync(projectPath).isFile() || lstatSync(projectPath).isSymbolicLink()) throw Error('project declaration must be a regular file');
    if (lstatSync(projectPath).size > 8 * 1024 * 1024) throw Error('project declaration exceeds 8 MiB');
    const project = readFileSync(projectPath, 'utf8');
    const archetypes = ['primary', 'archetype'].map(key => project.match(new RegExp(`^${key}:\\s*([^\\s#]+)`, 'm'))?.[1]);
    if (!archetypes.some(key => Object.hasOwn(REVIEWERS_BY_ARCHETYPE, key || ''))) throw Error('known project archetype required');
    const selected = new Map(mandatory.map(agent => [agent, { agent, reasons: ['mandatory independent delivery review'], files: [] }]));
    const add = (agent, reason, files = []) => {
      const entry = selected.get(agent) || { agent, reasons: [], files: [] };
      entry.reasons.push(reason); entry.files = [...new Set([...entry.files, ...files])].sort(); selected.set(agent, entry);
    };
    for (const { agent, why } of requiredReviewers(project)) add(agent, why);
    // Unlike legacy routing, documents/prompts/config are not blanket excluded.
    for (const rule of rules) {
      const files = assessment.files.filter(path => !activity.test(path) && !exclude.includes(path) && rule.pattern.test(path));
      if (files.length) add(rule.reviewer, 'changed artifact pattern', files);
    }
    const uiFiles = assessment.files.filter(path => !activity.test(path) && !exclude.includes(path)
      && /\.(?:html?|css|scss|sass|jsx|tsx|vue|svelte)$/i.test(path));
    if (uiFiles.length) add('design-advisor', 'UI interaction, accessibility and responsive contract required before implementation', uiFiles);
    if (assessment.files.some(path => /(^|\/)(agents(?:-full)?|skills|prompts?)\/|(^|\/)(AGENTS|CLAUDE|SKILL)\.md$/i.test(path))) {
      add('ai-security-reviewer', 'executable prompt or policy change');
      add('ai-eval-engineer', 'executable prompt or policy change');
    }
    const reviewers = [...selected.values()].sort((a, b) => a.agent.localeCompare(b.agent));
    const dependencies = dependencyFingerprint(root, project, exclude);
    return { version: 1, state: 'planned', advisory: true, planningOnly, assessment, reviewers,
      fingerprint: sha(JSON.stringify({ base, dependencies, reviewers })),
      scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested', reusablePass: false };
  } catch (error) {
    // Unknown evidence may widen selection, never silently drop specialists.
    const agents = [...new Set([...mandatory, 'design-advisor', ...rules.map(r => r.reviewer), ...Object.values(REVIEWERS_BY_ARCHETYPE).flat(),
      ...Object.values(PACK_REVIEWERS).flat(), ...COMPLIANCE_REVIEWERS.map(r => r.reviewer)])].sort();
    return { version: 1, state: 'unknown', advisory: true, assessment, reason: error.message, fingerprint: null,
      reviewers: agents.map(agent => ({ agent, reasons: ['risk evidence unavailable; no selective omission'], files: [] })), reusablePass: false };
  }
}

export function adaptiveSpecialistPlan(root, rules, env = process.env) {
  return env.GREAT_CTO_ADAPTIVE_REVIEWERS === '1'
    ? specialistPlan({ root, base: env.GREAT_CTO_CHANGE_BASE, rules }) : null;
}

export function planNotice(plan) {
  return `SPECIALIST-PLAN (${plan.state}, advisory only): ${JSON.stringify(plan)}\n` +
    'No historical verdict, recent log or this notification approves a gate. Preserve mandatory independent reviews. ' +
    'Specialist omission is unsupported when state is unknown; restore evidence before optimizing.\n';
}
