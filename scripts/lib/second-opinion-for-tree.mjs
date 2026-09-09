// One reader for "has another model seen THIS tree", used by the board and by
// the Stop gate.
//
// It lived inside the board's route module, which was fine while the board was
// the only thing asking. The cross-review Stop gate asks the same question, and
// a hook importing the board's server routes to get it would drag a server into
// a hook — so the reader moved here and routes.mjs re-exports it. One reader,
// because two would drift and then disagree about whether a diff was reviewed.
//
// The states are the point, and none of them is a pass:
//   ok         — a review line joins this HEAD; carries its verdict
//   not-run    — no second opinion is declared (including a deliberate `none`)
//   unmeasured — declared, but nothing has reviewed THIS tree
//   unreadable — lines exist and none can be paired (they predate the join key)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { capabilitiesFromProjectMd } from './stack-capabilities.mjs';

export function secondOpinionForTree(c) {
  let projectMd = null;
  try { projectMd = fs.readFileSync(path.join(c, '.great_cto', 'PROJECT.md'), 'utf8'); } catch { projectMd = null; }
  let declared = null;
  try { declared = projectMd == null ? null : capabilitiesFromProjectMd(projectMd).map.second_opinion; } catch { declared = null; }
  const tool = declared?.tool ?? null;
  const declaredState = declared?.state ?? (projectMd == null ? 'no-project-md' : 'undeclared');
  let head = null;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: c, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { head = null; }
  const base = { declared: declaredState, tool, head, verdict: null, findings: null, p0: null, sha: null, ts: null };
  if (declaredState !== 'declared' || !tool) {
    return { ...base, state: 'not-run', why: declaredState === 'none' ? 'second_opinion: none — deliberately off' : 'no second opinion declared in PROJECT.md' };
  }
  let lines = [];
  try { lines = fs.readFileSync(path.join(c, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').filter(Boolean); }
  catch { return { ...base, state: 'unmeasured', why: `declared (${tool}), no review has been written yet` }; }
  const rows = [];
  for (const line of lines) { try { rows.push(JSON.parse(line)); } catch { /* counted by /api/harnesses; not a verdict either way */ } }
  const paired = rows.filter((r) => typeof r.sha === 'string' && r.sha !== '' && head && (r.sha === head || head.startsWith(r.sha) || r.sha.startsWith(head)) && r.state === 'ok');
  if (paired.length) {
    const r = paired[paired.length - 1];
    return { ...base, state: 'ok', verdict: r.verdict ?? null, findings: r.findings ?? null, p0: r.p0 ?? null, sha: r.sha, ts: r.ts ?? null, why: '' };
  }
  // A line that joins this tree but reached no verdict is not "no review line".
  // It is a review that produced nothing readable, and saying so is the whole
  // point — falling through to `unmeasured` would tell the operator to run a
  // review that already ran.
  const joins = (r) => typeof r.sha === 'string' && r.sha !== '' && head && (r.sha === head || head.startsWith(r.sha) || r.sha.startsWith(head));
  const noVerdict = rows.filter((r) => joins(r) && r.state === 'unreadable');
  if (noVerdict.length) {
    const r = noVerdict[noVerdict.length - 1];
    return { ...base, state: 'unreadable', sha: r.sha, ts: r.ts ?? null,
      why: `${tool} answered for this tree and the answer carries no verdict — it is not a pass` };
  }
  const anyKeyed = rows.some((r) => typeof r.sha === 'string' && r.sha !== '');
  if (!anyKeyed && rows.length) {
    return { ...base, state: 'unreadable', why: `${rows.length} review line(s) predate the join key — none can be paired with this tree` };
  }
  return { ...base, state: 'unmeasured', why: `declared (${tool}), no review line for ${head ? head.slice(0, 8) : 'this tree'}` };
}
