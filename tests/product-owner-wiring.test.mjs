// Guard: product-owner must be WIRED as the first pipeline stage, not just exist.
// (Lesson: creating agents/*.md ≠ wiring it. An agent only participates if it's
// in the stage list, the phase-task map, the routing table, and the install loop.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');

test('product-owner: agent file exists with required frontmatter', () => {
  const md = read('agents/product-owner.md');
  for (const field of ['name:', 'description:', 'model:', 'tools:', 'maxTurns:', 'timeout:']) {
    assert.ok(md.includes(field), `product-owner.md missing frontmatter ${field}`);
  }
  assert.match(md, /name:\s*product-owner/, 'name must be product-owner');
});

test('product-owner: runs FIRST in the board pipeline stages (before architect)', () => {
  const server = read('packages/board/lib/data-readers.mjs');
  const m = server.match(/const stages = \[([^\]]+)\]/);
  assert.ok(m, 'could not find stages array in board/lib/data-readers.mjs');
  const stages = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
  assert.equal(stages[0], 'product-owner', 'product-owner must be the first stage');
  assert.ok(stages.indexOf('product-owner') < stages.indexOf('architect'),
    'product-owner must precede architect');
});

test('product-owner: mapped in phase-task.sh (phase label + priority)', () => {
  const sh = read('scripts/phase-task.sh');
  assert.match(sh, /product-owner\)\s*echo "phase-product"/, 'missing phase-product label');
  assert.match(sh, /product-owner\|architect\|security-officer\|qa-engineer\) echo 1/,
    'product-owner must be a priority-1 phase');
});

test('product-owner: present in routing table + installed by plugin.json', () => {
  assert.match(read('skills/great_cto/SKILL.md'), /`product-owner`/,
    'product-owner missing from SKILL.md routing table');
  assert.match(read('.claude-plugin/plugin.json'), /for AGENT in product-owner /,
    'product-owner missing from plugin.json install loop');
});

test('product-owner: brainstorming skill exists and defines the 4-model debate panel', () => {
  const skill = read('skills/brainstorming/SKILL.md');
  for (const model of ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'ask_kimi']) {
    assert.ok(skill.includes(model), `brainstorming skill missing debate model ${model}`);
  }
  assert.match(read('agents/product-owner.md'), /skills:[\s\S]*brainstorming/,
    'product-owner must load the brainstorming skill');
});

// ── Economics ───────────────────────────────────────────────────────────────
//
// The pipeline can pass a product all the way to a live URL — architecture
// reviewed, tests green, security signed off — and never once ask whether a unit
// pays for itself. Every later gate answers "can this be built safely"; none of
// them answers "should this be built at all, at a price someone will pay", and
// the silence is indistinguishable from an answer of yes.
//
// Same wiring lesson as the rest of this file: writing skills/product-economics
// is not wiring it. The skill participates only if the brief has the section and
// the section comes before the decision it informs.

test('product-economics: the skill exists and parses', () => {
  const md = read('skills/product-economics/SKILL.md');
  assert.match(md, /^---\n[\s\S]*?\n---/, 'SKILL.md needs frontmatter');
  for (const field of ['name:', 'description:', 'when_to_use:']) {
    assert.ok(md.includes(field), `product-economics SKILL.md missing ${field}`);
  }
  assert.match(md, /name:\s*product-economics/);
});

test('product-owner: the brief has an Economics section, and product-owner names the skill', () => {
  const md = read('agents/product-owner.md');
  assert.match(md, /^## Economics/m, 'the brief template must carry an Economics section');
  assert.match(md, /product-economics/, 'product-owner must name the skill that fills it');
});

test('product-owner: Economics comes BEFORE the recommendation it informs', () => {
  // Order is the whole point. A margin computed after BUILD / DON'T BUILD has
  // been written is a justification, not an input — and this pipeline already
  // learned that a gate placed after the decision it guards changes nothing
  // (ADR-009).
  const md = read('agents/product-owner.md');
  const econ = md.indexOf('\n## Economics');
  const rec = md.indexOf('\n## Recommendation');
  assert.ok(econ > 0, 'Economics section not found');
  assert.ok(rec > 0, 'Recommendation section not found');
  assert.ok(econ < rec,
    'Economics must precede Recommendation — otherwise the numbers justify a decision already made');
});

test('product-economics: reuses the brief\'s provenance notation, does not invent a second one', () => {
  // The brief already requires `[source: …]` or `[assumption]` on every figure,
  // and artifact-lint rejects a figure carrying neither. A skill that shipped its
  // own vocabulary for the same idea would leave two rules for one rule's job,
  // and the lint would enforce only one of them.
  const skill = read('skills/product-economics/SKILL.md');
  assert.match(skill, /\[source:/, 'must use the brief\'s [source: …] marker');
  assert.match(skill, /\[assumption\]/, 'must use the brief\'s [assumption] marker');
  assert.match(skill, /artifact-lint/, 'must point at the lint that already enforces this');
});
