#!/usr/bin/env node
/**
 * reviewer-nudge — PostToolUse hook (matcher: Write|Edit|MultiEdit) that flags
 * the matching specialist reviewer the moment a sensitive file is touched.
 *
 * auto-attach-reviewers.mjs runs at SessionStart only — a payment file created
 * MID-session got no flag until the next session. This hook closes that gap:
 * it matches the just-edited file against the same RULES and injects a
 * one-line nudge into the main-loop context.
 *
 * Debounce: one nudge per reviewer per 30 min (state in
 * .great_cto/cache/reviewer-nudge.json), and none if that reviewer already
 * recorded a verdict in the last 24h (.great_cto/verdicts/<reviewer>.log).
 *
 * I/O (PostToolUse): stdin {tool_input:{file_path}}; stdout additionalContext
 * JSON (silent when no match); exit always 0.
 * Opt out: GREAT_CTO_DISABLE_REVIEWER_NUDGE=1
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, shouldExclude } from "./auto-attach-reviewers.mjs";

const PROJ_DIR = process.env.GREAT_CTO_DIR || ".great_cto";
const STATE_PATH = join(PROJ_DIR, "cache", "reviewer-nudge.json");
const DEBOUNCE_MS = 30 * 60 * 1000;
const VERDICT_FRESH_MS = 24 * 60 * 60 * 1000;

/** Pure: match one repo-relative path against the reviewer rules. */
export function matchReviewers(relPath) {
  if (!relPath || shouldExclude(relPath)) return [];
  return RULES.filter(r => r.pattern.test(relPath)).map(r => r.reviewer);
}

/** Pure: apply debounce + fresh-verdict suppression. */
export function filterNudges(reviewers, { state = {}, now, verdictMtimes = {} }) {
  return reviewers.filter(r => {
    if (state[r] && now - state[r] < DEBOUNCE_MS) return false;
    if (verdictMtimes[r] && now - verdictMtimes[r] < VERDICT_FRESH_MS) return false;
    return true;
  });
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_REVIEWER_NUDGE === "1") return process.exit(0);
  if (!existsSync(PROJ_DIR)) return process.exit(0);

  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { return process.exit(0); }
  const fp = payload.tool_input?.file_path || "";
  if (!fp) return process.exit(0);
  const rel = isAbsolute(fp) ? relative(process.cwd(), fp) : fp;
  if (rel.startsWith("..")) return process.exit(0); // outside the project

  const candidates = matchReviewers(rel);
  if (candidates.length === 0) return process.exit(0);

  const now = Date.now();
  let state = {};
  try { state = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { /* fresh */ }
  const verdictMtimes = {};
  for (const r of candidates) {
    try { verdictMtimes[r] = statSync(join(PROJ_DIR, "verdicts", `${r}.log`)).mtimeMs; } catch { /* none */ }
  }

  const due = filterNudges(candidates, { state, now, verdictMtimes });
  if (due.length === 0) return process.exit(0);

  for (const r of due) state[r] = now;
  try {
    mkdirSync(join(PROJ_DIR, "cache"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch { /* nudge still worth emitting */ }

  const text = `REVIEWER-NUDGE: \`${rel}\` matches [${due.join(", ")}]. ` +
    `Before this change ships, spawn ${due.map(r => `Agent(subagent_type: ${r})`).join(" and ")} ` +
    `to review it (auto-attach rule; one nudge per reviewer per 30 min).`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text },
  }) + "\n");
  return process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
