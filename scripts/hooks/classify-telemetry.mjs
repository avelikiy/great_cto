#!/usr/bin/env node
/**
 * UserPromptSubmit hook — OPT-IN request-class telemetry.
 *
 * WHY: the request classifier (CLAUDE.md "Request classifier" table:
 * QUESTION / SURVEY / SIMPLE CODE / COMPLEX CODE / DESIGN / SLASH CMD /
 * INCIDENT / COORDINATE) is a prompt-level heuristic and leaves NO trace, so we
 * can't measure how often it fires each class or how ambiguous requests are.
 * Without that we can't answer "is an explicit `mode:` override worth building?"
 * with data. This hook records a passive, LOCAL corpus so that question becomes
 * measurable — measure, don't guess.
 *
 * IMPORTANT — this is a regex PROXY of the model's classifier (the same signal
 * words), not the model's own decision. It measures request-shape distribution
 * and ambiguity, not the model's exact routing. Good enough to spot whether
 * ambiguity is common (→ `mode:` might help) or rare (→ don't build it).
 *
 * PRIVACY (see CLAUDE.md "Privacy — telemetry"):
 *   - OFF by default. Only runs when GREAT_CTO_CLASS_TELEMETRY=1 (the plugin.json
 *     registration shell-guards on that var, so node is not even spawned when off).
 *   - LOCAL only. Appends to <cwd>/.great_cto/class-telemetry.log (or
 *     ~/.great_cto/ if no project). NOTHING is ever sent anywhere — this is not
 *     the opt-in network telemetry pipeline, it's a local log like verdicts/.
 *   - Records METADATA only: class, ambiguity, signal counts, prompt length.
 *     NEVER the prompt text or the matched keywords (those could echo content).
 *
 * Hook protocol:
 *   stdin:  { prompt, session_id, cwd?, ... }  (Claude Code UserPromptSubmit payload)
 *   stdout: nothing · exit: always 0 (fail-open — telemetry must never block a prompt)
 *
 * @see docs/HOOKS.md
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Ordered by precedence — first match wins for the recorded class, but we also
// count how many classes matched (ambiguity signal). Mirrors the CLAUDE.md table.
const CLASSES = [
  ['SLASH',     /^\s*\//],
  ['INCIDENT',  /\b(broken|is down|prod(uction)? (issue|down)|incident|P0|outage|alert(ing)?)\b/i],
  ['COORDINATE',/\b(parallel(ize|ise)?|orchestrat|3\+? streams|multiple streams|dependency graph)\b/i],
  ['DESIGN',    /\b(design|architect|RFC|ADR|how should we|trade-?offs?)\b/i],
  ['COMPLEX',   /\b(implement|build|add (a )?feature|refactor|migrat(e|ion)|integrat(e|ion)|redesign)\b/i],
  ['SIMPLE',    /\b(fix|typo|rename|minor|patch|tweak|bump|small change)\b/i],
  ['SURVEY',    /\b(show me|list|what files|status|what'?s pending|show report|which )\b/i],
  ['QUESTION',  /\b(what is|what'?s|how does|explain|why|difference between|can (claude|it|you))\b/i],
];

function classify(prompt) {
  const matched = [];
  for (const [name, rx] of CLASSES) if (rx.test(prompt)) matched.push(name);
  // Precedence rule from CLAUDE.md: when ambiguous SIMPLE vs COMPLEX, prefer COMPLEX.
  let cls = matched[0] || 'UNCLASSIFIED';
  if (matched.includes('SIMPLE') && matched.includes('COMPLEX')) cls = 'COMPLEX';
  return { cls, ambiguous: matched.length > 1, sigCount: matched.length };
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch { /* non-JSON stdin */ }
  const prompt = String(payload.prompt || '');
  if (!prompt.trim()) return; // nothing to classify

  const { cls, ambiguous, sigCount } = classify(prompt);

  // Local destination: project-local when we have a cwd, else global.
  const cwd = payload.cwd || process.cwd();
  const dir = existsSync(join(cwd, '.great_cto')) ? join(cwd, '.great_cto') : join(homedir(), '.great_cto');
  try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }

  // Metadata only — NO prompt text, NO matched keywords.
  const ts = new Date().toISOString();
  const line = `${ts}\t${cls}\t${ambiguous ? 'ambiguous' : 'clear'}\tsig=${sigCount}\tlen=${prompt.length}\n`;
  try { appendFileSync(join(dir, 'class-telemetry.log'), line); } catch { /* fail-open */ }
}

try { main(); } catch { /* telemetry must never block a prompt */ }
process.exit(0);
