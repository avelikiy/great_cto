// Command consolidation, stream D: one job = one command.
//
//   /start  — the one onboarding entry: a new project, or an existing codebase
//             that great_cto has not configured yet (the audit path).
//   /audit  — kept as a one-screen alias for `/start audit`, because it is one of
//             the commands people actually type. An alias must not grow its own
//             copy of the audit: two copies drift.
//   /doctor --fix — absorbs /migrate (PROJECT.md schema upgrade, append-only).
//   /spec discover | prd | build — absorbs /discover and /prd.
//
// These pin the routing text an agent follows. If one fails, the command a user
// types no longer reaches the job it used to do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter present');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return fm;
};
/** Body of a `## <title>` section up to the next `## ` heading (fence-unaware is fine: the sections pinned here have none at level 2). */
const section = (text, title) => {
  const start = text.indexOf(`\n## ${title}`);
  assert.ok(start >= 0, `section "## ${title}" present`);
  const next = text.indexOf('\n## ', start + 4);
  return text.slice(start, next < 0 ? undefined : next);
};

test('start.md carries the audit path as its own section', () => {
  const start = read('commands/start.md');
  const audit = start.slice(start.indexOf('\n## Path: audit'));
  assert.ok(start.includes('\n## Path: audit'), 'start.md has "## Path: audit"');
  // The moved content, not a pointer to it: eval harness, lint, project-auditor spawn.
  assert.match(audit, /### Action: `eval` — run eval harness/);
  assert.match(audit, /### Action: `lint` — scan artefacts against anti-pattern blocklist/);
  assert.match(audit, /Spawn `great_cto-project-auditor`/);
  assert.match(audit, /Write \.great_cto\/PROJECT\.md/);
});

test('start.md routes an existing codebase without PROJECT.md to the audit path', () => {
  const start = read('commands/start.md');
  const route = section(start, 'Route: new project, or existing codebase → audit path');
  // The route runs before the existing-project guard, or `/start audit` on a
  // configured project would be stopped by it.
  assert.ok(start.indexOf('## Route: new project') < start.indexOf('## Guard: existing project'),
    'route precedes the existing-project guard');
  assert.match(route, /EXISTING_CODE=/, 'detects existing code');
  assert.match(route, /\.great_cto\/PROJECT\.md/, 'checks for great_cto config');
  assert.match(route, /`CONFIGURED=false` and `EXISTING_CODE=true`[^\n]*\*\*Audit path\*\*/,
    'no config + existing code → audit path');
  assert.match(route, /First word of the argument is `audit`[^\n]*\*\*Audit path\*\*/,
    '`/start audit` → audit path');
  assert.match(route, /Anything else \| \*\*New-project setup\*\*/, 'otherwise new-project setup');
  assert.match(route, /Do NOT run the guards or Steps 0–6/, 'audit path skips new-project setup');
});

test('start.md description leads with when + what you get, and hints at audit', () => {
  const fm = frontmatter(read('commands/start.md'));
  assert.match(fm.description, /^Have an idea or an existing codebase\?/);
  assert.match(fm['argument-hint'], /audit \[eval \| lint \| focus area\]/);
});

test('audit.md is a short alias that runs /start audit', () => {
  const text = read('commands/audit.md');
  const fm = frontmatter(text);
  assert.match(fm.description, /Same as `\/start audit`/);
  assert.match(text, /same as `\/start audit`/i);
  assert.match(text, /## Path: audit/, 'names the section it runs');
  assert.match(text, /commands\/start\.md/, 'finds start.md');
  // An alias, not a second copy of the audit.
  assert.ok(!/Spawn `great_cto-project-auditor`/.test(text), 'does not duplicate the audit body');
  assert.ok(text.split('\n').length <= 45, `one screen (got ${text.split('\n').length} lines)`);
});

test('doctor.md has --fix and it upgrades the PROJECT.md schema; migrate.md is gone', () => {
  const doctor = read('commands/doctor.md');
  const fm = frontmatter(doctor);
  assert.match(fm['argument-hint'], /--fix/);
  assert.match(doctor, /--fix\) FIX_MODE=true/);
  assert.match(doctor, /## Check 2b — PROJECT\.md schema/, 'diagnosis detects an outdated schema');
  assert.match(doctor, /# Fix 4b — Upgrade PROJECT\.md to the current schema \(formerly \/migrate\)/);
  for (const field of ['archetype_confidence', 'archetype_alternatives', 'archetype_rationale',
    'security_tier', 'project_size', 'packs']) {
    assert.match(doctor, new RegExp(`grep -q "\\^${field}:"`), `schema fix appends ${field}`);
  }
  assert.ok(!existsSync(join(ROOT, 'commands/migrate.md')), 'commands/migrate.md removed');
});

test('spec.md names the discover, prd and build stages; discover.md and prd.md are gone', () => {
  const spec = read('commands/spec.md');
  const fm = frontmatter(spec);
  for (const stage of ['discover', 'prd', 'build']) {
    assert.ok(spec.includes(`\n## Stage: ${stage}`), `spec.md has "## Stage: ${stage}"`);
    assert.match(fm['argument-hint'], new RegExp(`\\b${stage}\\b`), `argument-hint names ${stage}`);
  }
  // Order is stated up front: discover → prd → build.
  const head = spec.slice(0, spec.indexOf('\n## '));
  assert.match(head, /\*\*discover\*\*[\s\S]*→[\s\S]*\*\*prd\*\*[\s\S]*→[\s\S]*\*\*build\*\*/);
  // The moved content is there, not a pointer to it.
  assert.match(section(spec, 'Stage: discover'), /Opportunity Score = Importance × \(1 − Satisfaction\)/);
  assert.match(section(spec, 'Stage: prd'), /docs\/requirements\/PRD-/);
  assert.match(section(spec, 'Stage: build'), /requirements\.md/);
  // Bare `/spec <description>` keeps doing what it did: the build stage.
  assert.match(spec, /empty, or anything else \| `## Stage: build`/);
  for (const gone of ['discover', 'prd']) {
    assert.ok(!existsSync(join(ROOT, `commands/${gone}.md`)), `commands/${gone}.md removed`);
  }
});

test('no shipped surface still sends a user to /migrate, /discover or /prd', () => {
  const files = ['commands/start.md', 'commands/audit.md', 'commands/doctor.md', 'commands/spec.md',
    'skills/opportunity-solution-tree/SKILL.md', 'skills/outcome-roadmap/SKILL.md',
    'skills/great_cto/templates/README.md', 'docs/help-card.md', 'agents/product-owner.md'];
  const dead = /(^|[\s`(])\/(migrate|discover|prd)\b/m;
  for (const f of files) {
    const hit = read(f).split('\n').find((l) => dead.test(l) && !/formerly \/migrate|what `\/migrate` used to do/.test(l));
    assert.equal(hit, undefined, `${f} still names a removed command: ${hit}`);
  }
});
