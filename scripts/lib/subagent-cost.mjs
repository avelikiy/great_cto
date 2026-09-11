/**
 * subagent-cost — which transcript a SubagentStop measures, whose cost it is,
 * and whether the run was served by the model its agent asked for.
 *
 * Claude Code hands SubagentStop two paths: `transcript_path`, the SESSION, and
 * `agent_transcript_path`, the subagent that just stopped. The hook read the
 * first. Every stop therefore measured the whole session — ~10k turns — the
 * 400-turn guard set each figure aside as unattributed, and no agent run was
 * ever measured, while the board looked like a board that simply had not
 * measured yet.
 *
 * The model check is HarnessRouter's rule (support-matrix rule 2): a run served
 * by a model other than the one asked for is a finding, never a pass. A vendor
 * prefix or a dated suffix is the provider's name for the same model; another
 * number or a tier word is another model. Three states — `unverifiable` is what
 * a check that had nothing to compare says, and it is not `match`.
 *
 * Pure except `requestedModel`, which reads one agent file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeType } from './subagent-row.mjs';

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'];
const NOT_A_MODEL = new Set(['<synthetic>', 'unknown', '']);

/** The transcript to measure, and whether it is the agent's own or the session's. */
export function stopTranscript(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (typeof p.agent_transcript_path === 'string' && p.agent_transcript_path) {
    return { path: p.agent_transcript_path, source: 'agent' };
  }
  if (typeof p.transcript_path === 'string' && p.transcript_path) {
    return { path: p.transcript_path, source: 'session' };
  }
  return { path: null, source: null };
}

/** The agent that stopped, without the plugin prefix; null when the host did not say. */
export function stopAgent(payload) {
  return normalizeType(payload?.agent_type) || null;
}

/**
 * `model:` and `advisor-model:` from `agents/<name>.md` frontmatter.
 * A name that is not a plain agent name is never turned into a path.
 */
export function requestedModel(agentsDir, name) {
  const none = { model: null, advisor: null };
  if (!agentsDir || !/^[A-Za-z0-9_-]+$/.test(String(name || ''))) return none;
  let text;
  try { text = readFileSync(join(agentsDir, `${name}.md`), 'utf8'); } catch { return none; }
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return none;
  const field = (key) => (fm[1].match(new RegExp(`^${key}:\\s*["']?([^"'\\s#]+)`, 'm')) || [])[1] ?? null;
  return { model: field('model'), advisor: field('advisor-model') };
}

const normalizeId = (id) => String(id ?? '').trim().toLowerCase().split('/').pop().replace(/\./g, '-');
const VERSION_SUFFIX = /^(-(\d{2,}|v\d+|preview|latest))+$/;   // -20251001, -001, -v2, -preview; never -lite, never -1

/** Whether `served` is the provider's name for `asked`. */
export function sameModel(asked, served) {
  const a = normalizeId(asked);
  const s = normalizeId(served);
  if (!a || !s) return false;
  if (a === s) return true;
  const [long, short] = s.length > a.length ? [s, a] : [a, s];
  return long.startsWith(`${short}-`) && VERSION_SUFFIX.test(long.slice(short.length));
}

const familyOf = (id) => {
  const n = normalizeId(id);
  return FAMILIES.find((f) => new RegExp(`(^|-)${f}(-|$)`).test(n)) ?? null;
};

/**
 * @param {{model:string|null, advisor:string|null}} requested
 * @param {string[]} servedModels  models the transcript records, as written
 * @returns {{state:'match'|'substituted'|'unverifiable', requested:string|null, served:string[], why:string}}
 */
export function modelCheck(requested, servedModels) {
  const served = [...new Set((servedModels || []).map((m) => String(m ?? '').trim()))]
    .filter((m) => !NOT_A_MODEL.has(m)).sort();
  const asked = requested?.model ? String(requested.model).trim() : null;
  if (!asked || asked.toLowerCase() === 'inherit') {
    return { state: 'unverifiable', requested: null, served, why: 'the agent does not ask for a model' };
  }
  if (!served.length) {
    return { state: 'unverifiable', requested: asked, served, why: 'the transcript names no served model' };
  }
  const alias = FAMILIES.includes(asked.toLowerCase()) ? asked.toLowerCase() : null;
  const allowed = (m) => (alias ? familyOf(m) === alias : sameModel(asked, m))
    || (requested.advisor ? sameModel(requested.advisor, m) : false);
  const off = served.filter((m) => !allowed(m));
  if (off.length) {
    return { state: 'substituted', requested: asked, served, why: `asked ${asked}, served ${off.join(', ')}` };
  }
  return { state: 'match', requested: asked, served, why: '' };
}

/**
 * One `cost-history.log` line. The prefix is the one nine readers already
 * parse; the check rides in trailing `key=value` fields, which they ignore.
 */
export function costLine({ ts, agent, measured, check }) {
  let line = `${ts} ${agent} ${measured.usd} turns=${measured.turns || 0}`
    + ` in=${measured.input_tokens || 0} out=${measured.output_tokens || 0}`
    + ` cache_r=${measured.cache_read_input_tokens || 0} cache_w=${measured.cache_creation_input_tokens || 0}`;
  if (check) {
    line += ` model=${check.state}`;
    if (check.requested) line += ` asked=${check.requested}`;
    if (check.served?.length) line += ` served=${check.served.join(',')}`;
  }
  return `${line}\n`;
}
