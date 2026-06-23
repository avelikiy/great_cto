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
  const server = read('packages/board/server.mjs');
  const m = server.match(/const stages = \[([^\]]+)\]/);
  assert.ok(m, 'could not find stages array in board/server.mjs');
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
