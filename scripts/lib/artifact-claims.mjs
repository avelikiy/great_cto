#!/usr/bin/env node
/**
 * artifact-claims — does the artefact an agent says it wrote actually exist?
 *
 * Why this exists
 * ---------------
 * A verdict line carries claims: `arch=docs/architecture/ARCH-x.md`,
 * `report=docs/security/SEC-y.md`, `tests=33`, `coverage=100%`. Nothing checked
 * any of them. The completion hook checked that a verdict EXISTED and was
 * well-formed — that the agent reported, not that it did anything.
 *
 * One session's evidence, six agents:
 *
 *   architect         DONE          the ARCH and ADR were real
 *   senior-dev        (no verdict)  work left in a worktree, task still open
 *   code-reviewer     APPROVED      found a P1, never checked the fix
 *   qa-engineer       PASS          reported coverage=100% having run ~305 of ~1000 tests
 *   security-officer  REJECTED      two real CRITICALs, with reproductions
 *   security-officer  (no verdict)  re-verification produced nothing
 *
 * This module is the cheapest rung of the evidence ladder and the only one that
 * can run on every SubagentStop: a named path either exists and has content, or
 * the claim that produced it is not true. Stat calls, single-digit milliseconds.
 *
 * The rungs above — that a named command was actually RUN, and that a checker
 * re-ran it — cost seconds and minutes, and belong on a stage and a gate. This
 * one catches the case that needs no cleverness: an agent naming a document it
 * did not write.
 *
 * Polarity, as everywhere in this pipeline: a claim that cannot be verified has
 * not been verified. A path named and missing is a failure, not an unknown.
 * Deliberately NOT symmetric — an agent that names no path is not failed here,
 * because requiring paths is a different rule and belongs in the agent contract,
 * not in a checker that would suddenly fail every agent at once.
 */

import { statSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * Below this a file exists but says nothing — a touched placeholder, a header
 * with no body. Chosen from the artefacts this pipeline writes: the smallest
 * real one in the repo's history is a few hundred bytes of frontmatter plus a
 * verdict block. Reported separately from missing, because the two mean
 * different things to whoever has to fix it.
 */
export const THIN_BYTES = 200;

/**
 * Which meta values are paths.
 *
 * Conservative on purpose: a value must contain a separator AND end in a known
 * artefact extension. Real verdict metas from one session include
 * `task=great_cto-12qe`, `files=pipeline-position`, `coverage=100%` and
 * `findings=1-P1` — none of which are paths, and a looser rule would fail an
 * agent for a bookkeeping field. A false accusation here teaches people to
 * disable the check.
 */
const ARTEFACT_EXT = /\.(md|mjs|js|ts|tsx|json|toml|yaml|yml|sql|sh|txt|html|css|jsonl)$/i;

/**
 * A trailing slash means "the set of them, in here".
 *
 * Some stages produce ONE document and some produce a SET. `pm` emits one
 * implementation brief per senior-dev task, so no single `brief=<path>` can be
 * true of a run that wrote four of them — and requiring one anyway is a contract
 * that cannot be satisfied honestly, which is worse than no contract. It names
 * `briefs=docs/impl-briefs/` instead, and the directory is checked for contents.
 *
 * The trailing slash is required rather than inferred from what is on disk: a
 * value that resolves to a directory today and a file tomorrow would silently
 * change what was asserted. The claim says which kind it is.
 */
const DIR_CLAIM = /\/$/;

export function pathClaims(meta) {
  const out = [];
  for (const [key, raw] of Object.entries(meta || {})) {
    const value = String(raw ?? '').trim();
    if (!value || !value.includes('/')) continue;
    // A URL is a claim about somewhere else; this module only knows the disk.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) continue;
    const dir = DIR_CLAIM.test(value);
    if (!dir && !ARTEFACT_EXT.test(value)) continue;
    out.push({ key, path: value, ...(dir ? { dir: true } : {}) });
  }
  return out;
}

/**
 * @returns {{ok, checked, missing, thin, notes}}
 *   missing — named and absent, or not a regular file
 *   thin    — present but under THIN_BYTES
 */
export function checkArtifacts(meta, { root = process.cwd(), thinBytes = THIN_BYTES, stat = statSync, readdir = readdirSync } = {}) {
  const claims = pathClaims(meta);
  const missing = [];
  const thin = [];

  for (const c of claims) {
    const full = isAbsolute(c.path) ? c.path : join(root, c.path);
    let st;
    try { st = stat(full); } catch {
      missing.push(c);
      continue;
    }
    if (c.dir) {
      // A directory claim is satisfied by CONTENT, not by existence. `mkdir -p`
      // runs in half the agent prompts in this repo, so an empty directory is
      // the single most likely way for a set-producing stage to look like it
      // delivered when it did not.
      if (!st.isDirectory || !st.isDirectory()) { missing.push(c); continue; }
      let real = 0;
      try {
        for (const name of readdir(full)) {
          let f;
          try { f = stat(join(full, name)); } catch { continue; }
          if (f.isFile && f.isFile() && f.size >= thinBytes) real += 1;
        }
      } catch { missing.push(c); continue; }
      if (real === 0) thin.push({ ...c, size: 0 });
      continue;
    }
    if (!st.isFile || !st.isFile()) { missing.push(c); continue; }
    if (st.size < thinBytes) thin.push({ ...c, size: st.size });
  }

  return { ok: missing.length === 0 && thin.length === 0, checked: claims, missing, thin };
}

/** One line an operator can act on, or null when there is nothing to say. */
export function explainArtifacts(result) {
  if (!result || !result.checked.length) return null;
  if (result.ok) return null;
  const parts = [];
  if (result.missing.length) {
    parts.push(`named but absent: ${result.missing.map((m) => `${m.key}=${m.path}`).join(', ')}`);
  }
  if (result.thin.length) {
    parts.push(`present but under ${THIN_BYTES} bytes: ${result.thin.map((t) => `${t.key}=${t.path} (${t.size}B)`).join(', ')}`);
  }
  return `the verdict claims artefacts that do not back it — ${parts.join('; ')}. `
    + 'Write the artefact, or drop the claim from the verdict; a verdict naming a document nobody wrote is worse than one that names none.';
}
