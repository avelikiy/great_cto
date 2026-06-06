// tests/lib/impl-brief.test.mjs — unit tests for impl-brief parser + scope check (governance Phase 3)
//
// Run: node --test tests/lib/impl-brief.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseBrief, validateBrief, checkScope, globToRegExp } from '../../scripts/lib/impl-brief.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, '../../skills/great_cto/templates/IMPL-BRIEF-template.md');

// A concrete, well-formed brief (placeholders resolved) — what pm actually emits.
const GOOD = `# IMPL-BRIEF-gc-123.md

## Task
- **bd task:** \`gc-123\` — add /healthz endpoint
- Implements REQ / UC: REQ-2

## Files to modify
| File / glob | Why |
|---|---|
| \`src/api/healthz.ts\` | new handler |
| \`tests/api/healthz.test.ts\` | RED tests |

## Files NOT to modify
| File / glob | Why | Owner |
|---|---|---|
| \`src/shared/auth/**\` | parallel task | dev2 |
| \`db/schema.sql\` | frozen | architect |

## Step-by-step
1. write test
2. implement

## API-CONTRACT
- Surface: \`GET /healthz\`
- Output: 200 \`{status:"ok"}\`

## TEST-SPEC
| # | Case | Expected |
|---|---|---|
| 1 | hit /healthz | 200 |

## ACCEPTANCE
- [ ] test passes
- [ ] no denylist file touched
`;

// ── parseBrief ────────────────────────────────────────────────────────────────

test('parseBrief: extracts task id from **bd task** line', () => {
  assert.equal(parseBrief(GOOD).taskId, 'gc-123');
});

test('parseBrief: extracts task id from filename header when no bd-task line', () => {
  assert.equal(parseBrief('# IMPL-BRIEF-abc9.md\n## Files to modify\n`x.ts`').taskId, 'abc9');
});

test('parseBrief: collects only the modify allowlist paths', () => {
  const b = parseBrief(GOOD);
  assert.deepEqual(b.filesToModify, ['src/api/healthz.ts', 'tests/api/healthz.test.ts']);
});

test('parseBrief: collects the denylist separately', () => {
  assert.deepEqual(parseBrief(GOOD).filesNotToModify, ['src/shared/auth/**', 'db/schema.sql']);
});

test('parseBrief: detects API-CONTRACT and TEST-SPEC content', () => {
  const b = parseBrief(GOOD);
  assert.equal(b.hasApiContract, true);
  assert.equal(b.hasTestSpec, true);
});

test('parseBrief: counts acceptance checklist items', () => {
  assert.equal(parseBrief(GOOD).acceptance.length, 2);
});

test('parseBrief: ignores placeholder paths and command-like inline code', () => {
  const md = '## Files to modify\n| \`{src/foo.ts}\` | x |\n| \`npm test\` | y |\n| \`real/path.ts\` | z |';
  assert.deepEqual(parseBrief(md).filesToModify, ['real/path.ts']);
});

// ── validateBrief ─────────────────────────────────────────────────────────────

test('validateBrief: well-formed brief is valid', () => {
  assert.equal(validateBrief(parseBrief(GOOD)).valid, true);
});

test('validateBrief: missing files-to-modify fails', () => {
  const b = parseBrief('## Files NOT to modify\n## API-CONTRACT\n- x\n## TEST-SPEC\n- y\n## ACCEPTANCE\n- [ ] z');
  const r = validateBrief(b);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /Files to modify/);
});

test('validateBrief: missing NOT-to-modify section fails', () => {
  const b = parseBrief('## Files to modify\n`a.ts`\n## API-CONTRACT\n- x\n## TEST-SPEC\n- y\n## ACCEPTANCE\n- [ ] z');
  assert.equal(validateBrief(b).valid, false);
});

test('validateBrief: no acceptance items fails', () => {
  const b = parseBrief('## Files to modify\n`a.ts`\n## Files NOT to modify\n`b.ts`\n## API-CONTRACT\n- x\n## TEST-SPEC\n- y\n## ACCEPTANCE\n');
  assert.equal(validateBrief(b).valid, false);
});

// ── the shipped template itself must parse as a template (placeholders → invalid concrete) ──

test('template file: parses, all five sections present', () => {
  const b = parseBrief(readFileSync(TEMPLATE, 'utf8'));
  for (const s of ['modify', 'notModify', 'api', 'test', 'acceptance']) {
    assert.ok(b._sections.includes(s), `template missing section bucket: ${s}`);
  }
  // Template has acceptance items (real `- [ ]` lines, not placeholders).
  assert.ok(b.acceptance.length >= 5, 'template should ship a real ACCEPTANCE checklist');
});

// ── globToRegExp ──────────────────────────────────────────────────────────────

test('globToRegExp: * does not cross slash', () => {
  assert.equal(globToRegExp('src/*.ts').test('src/a.ts'), true);
  assert.equal(globToRegExp('src/*.ts').test('src/sub/a.ts'), false);
});

test('globToRegExp: ** crosses slashes', () => {
  assert.equal(globToRegExp('src/shared/**').test('src/shared/auth/jwt.ts'), true);
});

test('globToRegExp: trailing-slash dir matches everything under it', () => {
  assert.equal(globToRegExp('src/shared/').test('src/shared/x.ts'), true);
});

test('globToRegExp: dot is literal', () => {
  assert.equal(globToRegExp('a.ts').test('axts'), false);
  assert.equal(globToRegExp('a.ts').test('a.ts'), true);
});

// ── checkScope ────────────────────────────────────────────────────────────────

test('checkScope: changed files within allowlist → clean', () => {
  const r = checkScope(['src/api/healthz.ts', 'tests/api/healthz.test.ts'], parseBrief(GOOD));
  assert.equal(r.ok, true);
  assert.equal(r.violations.length, 0);
  assert.equal(r.warnings.length, 0);
});

test('checkScope: denylist hit → hard violation', () => {
  const r = checkScope(['src/shared/auth/jwt.ts'], parseBrief(GOOD));
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0], /NOT-to-modify/);
});

test('checkScope: frozen file (exact denylist) → violation', () => {
  const r = checkScope(['db/schema.sql'], parseBrief(GOOD));
  assert.equal(r.ok, false);
});

test('checkScope: off-allowlist file → warning, not violation', () => {
  const r = checkScope(['src/api/other.ts'], parseBrief(GOOD));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /allowlist/);
});

test('checkScope: denylist takes precedence over allowlist phrasing', () => {
  // a file both not-in-allowlist AND in denylist is a violation, reported once
  const r = checkScope(['src/shared/auth/x.ts'], parseBrief(GOOD));
  assert.equal(r.violations.length, 1);
  assert.equal(r.warnings.length, 0);
});

test('checkScope: leading ./ normalised', () => {
  const r = checkScope(['./src/api/healthz.ts'], parseBrief(GOOD));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});

test('checkScope: empty / falsy entries skipped', () => {
  const r = checkScope(['', null, 'src/api/healthz.ts'], parseBrief(GOOD));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});
