// tests/design-skills-smoke.test.mjs — integration smoke for the design-intelligence
// loop (epic great_cto-4lm). Proves the vendored skills are intact, the data the
// agents rely on parses, the two agents are wired to the skills, and the ui-ux-pro-max
// design-system generator actually runs and produces a recommendation.
//
// Run: node --test tests/design-skills-smoke.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// ── Vendored skills are intact ────────────────────────────────────────────────

test('ui-ux-pro-max skill is vendored with SKILL.md + LICENSE + data', () => {
  for (const f of ['skills/ui-ux-pro-max/SKILL.md', 'skills/ui-ux-pro-max/LICENSE',
                   'skills/ui-ux-pro-max/data/landing.csv', 'skills/ui-ux-pro-max/data/app-interface.csv',
                   'skills/ui-ux-pro-max/data/styles.csv', 'skills/ui-ux-pro-max/scripts/design_system.py']) {
    assert.ok(existsSync(resolve(ROOT, f)), `${f} must exist`);
  }
  assert.match(read('skills/ui-ux-pro-max/SKILL.md'), /^name:\s*ui-ux-pro-max/m);
});

test('anydesign skill is vendored with SKILL.md + LICENSE', () => {
  assert.ok(existsSync(resolve(ROOT, 'skills/anydesign/SKILL.md')));
  assert.ok(existsSync(resolve(ROOT, 'skills/anydesign/LICENSE')));
  assert.match(read('skills/anydesign/SKILL.md'), /^name:\s*anydesign/m);
});

test('app-interface.csv carries React Native rules (mobile target)', () => {
  const csv = read('skills/ui-ux-pro-max/data/app-interface.csv');
  assert.ok(/React Native/.test(csv), 'RN rules must be present for mobile design');
  assert.ok(csv.split('\n').length > 10, 'should be a non-trivial rule set');
});

// ── Agents are wired to the skills ────────────────────────────────────────────

test('design-advisor mounts ui-ux-pro-max + anydesign and is plan-altitude', () => {
  const md = read('agents/design-advisor.md');
  assert.match(md, /^\s*-\s*ui-ux-pro-max\s*$/m);
  assert.match(md, /^\s*-\s*anydesign\s*$/m);
  assert.match(md, /DESIGN-\{slug\}\.md/, 'must declare its output contract');
  assert.match(md, /never.*implement|plan.*only|do not implement/i, 'must state the no-impl boundary');
});

test('senior-dev mounts the build skills and reads the DESIGN contract', () => {
  const md = read('agents/senior-dev.md');
  assert.match(md, /^\s*-\s*ui-ux-pro-max\s*$/m);
  assert.match(md, /web-artifacts-builder/);
  assert.match(md, /theme-factory/);
  assert.match(md, /DESIGN-\{slug\}\.md/, 'must point the implementer at the design contract');
});

test('NOTICE.md attributes both MIT skills', () => {
  const n = read('NOTICE.md');
  assert.match(n, /ui-ux-pro-max-skill/);
  assert.match(n, /uxKero\/anydesign/);
});

// ── design-advisor is wired into the flow for UI archetypes ───────────────────

test('compileFlow includes design-advisor for a UI archetype, not for a backend one', async () => {
  const { compileFlow } = await import('../packages/cli/dist/flow.js');
  const det = { stack: [], languages: [], signals: {}, readmeKeywords: [], infraKeywords: [] };
  assert.ok(compileFlow('web-service', 'medium', det, [], 'high').agents.includes('design-advisor'));
  assert.ok(!compileFlow('cli-tool', 'medium', det, [], 'high').agents.includes('design-advisor'));
});

// ── The generator actually runs (live proof of the loop) ──────────────────────

test('ui-ux-pro-max generator produces a design system for a landing query', () => {
  const py = spawnSync('python3',
    ['scripts/design_system.py', '--project-name', 'SmokeSpa', '--format', 'markdown', 'spa wellness landing page'],
    { cwd: resolve(ROOT, 'skills/ui-ux-pro-max'), encoding: 'utf8', timeout: 20000 });
  if (py.error && py.error.code === 'ENOENT') { console.log('# skip: python3 unavailable'); return; }
  assert.equal(py.status, 0, `generator exited ${py.status}: ${py.stderr?.slice(0, 200)}`);
  assert.match(py.stdout, /Design System/i);
  assert.match(py.stdout, /Pattern/i, 'must recommend a landing pattern');
  assert.match(py.stdout, /--color-|#[0-9A-Fa-f]{6}/, 'must emit a color system');
});

test('ui-ux-pro-max generator handles a React Native mobile query', () => {
  const py = spawnSync('python3',
    ['scripts/design_system.py', '--project-name', 'SmokeApp', 'react native mobile app dashboard'],
    { cwd: resolve(ROOT, 'skills/ui-ux-pro-max'), encoding: 'utf8', timeout: 20000 });
  if (py.error && py.error.code === 'ENOENT') { console.log('# skip: python3 unavailable'); return; }
  assert.equal(py.status, 0, `generator exited ${py.status}: ${py.stderr?.slice(0, 200)}`);
  assert.match(py.stdout, /PATTERN|Pattern/, 'must recommend a pattern for the mobile app');
});
