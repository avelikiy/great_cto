// Agent frontmatter is read once per session, for every agent, before anything
// is chosen. Claude Code warns above ~15.0k tokens; this repository was at 16.1k
// with 70 agents and got the warning on every start.
//
// Where it went, measured: description 7.2k, tools 2.3k, skills 1.6k, everything
// else ~4.5k. `tools` and `skills` are functional — cutting them breaks agents.
// The fat was in `description`: thirty reviewers carried a "Specialises in …"
// enumeration of statutes and standards that was ALSO present, verbatim, in the
// agent's own body. The frontmatter is read for every agent on every session; the
// body is read only after that agent is chosen. Paying session-wide for text that
// is duplicated one scroll down is the whole defect.
//
// Trimmed under a guard: an enumeration was cut only when every distinctive term
// in it already appeared in the body. Four agents were skipped because a term
// existed ONLY in the description — cutting there would have destroyed the only
// copy, which is a different kind of mistake from being over budget.
//
// This is the ratchet. The number may not grow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const AGENTS = path.resolve(import.meta.dirname, '../../agents');

/** Rough but stable: ~4 chars per token. The absolute value matters less than
 *  the fact that it cannot drift upward without this test saying so. */
const approxTokens = (s) => s.length / 4;

function frontmatters() {
  return readdirSync(AGENTS)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const src = readFileSync(path.join(AGENTS, f), 'utf8');
      const m = /^---\n([\s\S]*?)\n---/.exec(src);
      return { file: f, fm: m ? m[1] : '', body: m ? src.slice(m[0].length) : src };
    });
}

test('the agent frontmatter budget stays under the harness limit', () => {
  // 13.5k measured after the trim, against a 15.0k warning. The floor is set with
  // headroom for a few new agents; crossing it means trimming, not raising it.
  const CEILING_K = 14.0;
  const total = frontmatters().reduce((n, a) => n + approxTokens(a.fm), 0) / 1000;
  assert.ok(total <= CEILING_K,
    `agent frontmatter is ~${total.toFixed(1)}k tokens, over the ${CEILING_K}k floor. ` +
    `Trim descriptions — move enumerations into the body, where they are read only ` +
    `by the agent that was actually chosen. Do NOT trim tools or skills.`);
});

// Thirteen descriptions are still over the cap, and they are NAMED rather than
// hidden behind a threshold set to whatever the worst one happens to be. A
// ceiling raised to fit its violations asserts nothing.
//
// Four of them (edtech, healthcare, insurance, voice-ai) carry a statute the body
// does not: `NY 2-D`, `OCR`, `NAIC AI Model Bulletin 2023`, `AB-2655`. Trimming
// there would destroy the only copy, which is a worse mistake than being long.
// The rest have no mechanical cut point and need a person's judgement.
//
// The list may SHRINK and may not GROW. A new agent gets 420 characters.
const OVER_CAP_LEGACY = new Set([
  'insurance-reviewer.md', 'infra-provisioner.md', 'app-scaffolder.md',
  'mobile-app-builder.md', 'quant-researcher.md', 'connector-builder.md',
  'geo-routing-engineer.md', 'integrations-engineer.md', 'edtech-reviewer.md',
  'voice-ai-reviewer.md', 'migration-import-engineer.md', 'healthcare-reviewer.md',
  'growth-engineer.md',
]);

test('no NEW description is written past the point of being a routing signal', () => {
  const MAX = 420;
  const over = [];
  for (const { file, fm } of frontmatters()) {
    const m = /^description:\s*([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/m.exec(fm);
    if (!m) continue;
    const d = m[1].trim().replace(/^"|"$/g, '');
    if (d.length > MAX && !OVER_CAP_LEGACY.has(file)) over.push(`${file} (${d.length})`);
  }
  assert.deepEqual(over, [],
    `description(s) over ${MAX} chars: ${over.join(', ')} — the detail belongs in the body, ` +
    `which is read only by the agent that was chosen`);
});

test('the legacy over-cap list only shrinks', () => {
  // Without this the exception list is a place to add things to, which is how an
  // allowlist becomes the new ceiling.
  const MAX = 420;
  const stillOver = new Set();
  for (const { file, fm } of frontmatters()) {
    const m = /^description:\s*([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/m.exec(fm);
    if (!m) continue;
    if (m[1].trim().replace(/^"|"$/g, '').length > MAX) stillOver.add(file);
  }
  const fixed = [...OVER_CAP_LEGACY].filter((f) => !stillOver.has(f));
  assert.deepEqual(fixed, [],
    `${fixed.join(', ')} now fits — remove it from OVER_CAP_LEGACY so the list keeps holding`);
});

test('every agent still says what it is, so the model can pick it', () => {
  // The failure mode of trimming: a description short enough to pass a budget and
  // too vague to route on. Asserted as a floor, not just a ceiling.
  const thin = frontmatters()
    .map(({ file, fm }) => {
      const m = /^description:\s*([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/m.exec(fm);
      return { file, d: m ? m[1].trim().replace(/^"|"$/g, '') : '' };
    })
    .filter(({ d }) => d.length < 60);
  assert.deepEqual(thin.map((t) => t.file), [],
    'description(s) too thin to route on — a budget is not a reason to say nothing');
});
