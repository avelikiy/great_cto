// A lesson reaches every project only with measured evidence (ADR-037).
//
// `~/.great_cto/decisions.md` is read by every session of every project. The
// rule for writing into it was "the same lesson slug in 3 distinct projects" —
// recurrence of the learner's own framing, which is what the same learner with
// the same prompt reproduces. That count now only makes a lesson a CANDIDATE.
// Promotion needs an A/B eval stamp on the lesson, judged by the same decision
// `/crystallize approve` uses for global patterns (`gp-approve-gate.mjs`):
//
//   measured regression  → never promoted, no override
//   no stamp             → stays a candidate, unless an explicit, logged bypass
//   improvement / noisy  → promoted, the stamp travels with it
//
// A lesson that names no eval cannot be measured, so it stays in its own
// project — where it still works (lesson-tripwire), and is cheap to undo.
import { readEvidence, decideApproval } from './gp-approve-gate.mjs';
import { stampTrace } from './gp-eval-trace.mjs';

export const CANDIDATE_THRESHOLD = 3;   // distinct projects

/**
 * A lessons.md file → entries. Each entry is a `---` frontmatter block followed
 * by a `## pattern: <slug>` line; `raw` is the exact block text.
 */
export function parseLessons(text) {
  const entries = [];
  for (const block of String(text).split(/\n(?=---\s*\n[a-z_-]+:)/)) {
    if (!block.trim()) continue;
    const slugMatch = block.match(/^##\s+pattern:\s*(.+?)\s*$/m);
    if (!slugMatch) continue;
    const fm = {};
    const fmMatch = block.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n/);
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const m = line.match(/^([a-z_-]+):\s*(.+)$/);
        if (m) fm[m[1]] = m[2].trim();
      }
    }
    entries.push({ slug: slugMatch[1].trim(), fm, raw: block.trim() });
  }
  return entries;
}

/** [{project, path, text}] → Map slug → {projects:Set, archetypes:Set, samples:[entry+{project,path}]} */
export function aggregate(files) {
  const map = new Map();
  for (const { project, path, text } of files) {
    for (const e of parseLessons(text)) {
      if (!map.has(e.slug)) map.set(e.slug, { slug: e.slug, projects: new Set(), archetypes: new Set(), samples: [] });
      const agg = map.get(e.slug);
      agg.projects.add(e.fm.project || project);
      if (e.fm.archetype) agg.archetypes.add(e.fm.archetype);
      agg.samples.push({ ...e, project, path });
    }
  }
  return map;
}

/** The eval a lesson declares, and the stamp on whichever sample carries one. */
export function lessonEvidence(agg) {
  const evalName = agg.samples.map((s) => s.fm.eval).find(Boolean) || null;
  const stamped = agg.samples.find((s) => s.fm.eval_delta || s.fm.eval_confidence || s.fm.eval_direction);
  const fmText = stamped ? Object.entries(stamped.fm).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
  return { evalName, stamped: stamped || null, evidence: readEvidence(fmText) };
}

/**
 * @returns {{slug, state:'below-threshold'|'local-only'|'candidate'|'regression'|'promote',
 *            reason:string, evidence?:string, bypassed:boolean, evalName:string|null}}
 */
export function promotionDecision(agg, { bypassReason = null, threshold = CANDIDATE_THRESHOLD } = {}) {
  const base = { slug: agg.slug, bypassed: false, projects: agg.projects.size };
  if (agg.projects.size < threshold) {
    return { ...base, state: 'below-threshold', evalName: null, reason: `seen in ${agg.projects.size} project(s), a candidate needs ${threshold}` };
  }
  const { evalName, evidence } = lessonEvidence(agg);
  const stamped = evidence.direction || evidence.delta !== null;
  if (!evalName && !stamped && !bypassReason) {
    return { ...base, state: 'local-only', evalName,
      reason: 'declares no `eval:` to measure it against — it stays in its projects and does not cross into every session' };
  }
  const v = decideApproval(evidence, { bypassReason });
  if (v.evidence === 'regression') return { ...base, state: 'regression', evalName, evidence: v.evidence, reason: v.reason };
  if (v.ok) return { ...base, state: 'promote', evalName, evidence: v.evidence, bypassed: v.bypassed, reason: v.reason };
  return { ...base, state: 'candidate', evalName, evidence: v.evidence,
    reason: `not measured — run: lessons-merge.mjs --measure ${agg.slug} (or --no-eval "<why>" --slug ${agg.slug})` };
}

/** The lesson body without its frontmatter and heading. */
export function lessonBody(entry) {
  return entry.raw.replace(/^---[\s\S]*?\n---\s*\n/, '').replace(/^##\s+pattern:[^\n]*\n/m, '').trim();
}

/** Candidate arm of the A/B: the agent's prompt as is, plus the lesson. */
export function candidatePrompt(agentPrompt, entry) {
  return `${String(agentPrompt).replace(/\s*$/, '')}\n\n## Lesson under evaluation: ${entry.slug}\n\n${lessonBody(entry)}\n`;
}

/** Stamp one entry of a lessons.md file and leave every other entry untouched. */
export function stampLesson(fileText, entryRaw, delta, { ts, commit = null, ke = null } = {}) {
  const text = String(fileText);
  const at = text.indexOf(entryRaw);
  if (at < 0) throw new Error('the lesson entry is no longer in its file — re-read and retry');
  // stampTrace inserts frontmatter keys after the FIRST `---\n` of its input,
  // which inside one entry is the entry's own opening fence.
  const stamped = stampTrace(entryRaw.endsWith('\n') ? entryRaw : `${entryRaw}\n`, { ke, commit, delta, ts }).replace(/\s*$/, '');
  return text.slice(0, at) + stamped + text.slice(at + entryRaw.length);
}
