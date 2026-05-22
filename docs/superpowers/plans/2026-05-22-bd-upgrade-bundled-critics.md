# bd upgrade + Bundled Critics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `great-cto upgrade` command and bundle 4 adversarial critic prompt files as package assets so they survive plugin reinstalls and upgrades.

**Architecture:** A new `overlay.ts` module owns two idempotent operations: copy 4 bundled critic files into the installed superpowers cache, and apply 3 upstream SKILL.md patches. A new `upgrade.ts` forces re-clone of companion plugins to their latest semver tag, then calls `applyOverlays()`. `main.ts` grows an `upgrade [plugin]` subcommand. The `init` flow calls `applyOverlays()` unconditionally after companion install — it is always safe to call because it skips already-applied changes.

**Tech Stack:** TypeScript, Node.js ≥ 20, `node:fs`, `node:child_process`, `node:path` — no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/cli/assets/skills/brainstorming/spec-critic-prompt.md` | CREATE | Bundled critic asset — source of truth for spec critic |
| `packages/cli/assets/skills/writing-plans/arch-critic-prompt.md` | CREATE | Bundled critic asset — source of truth for arch critic |
| `packages/cli/assets/skills/finishing-a-development-branch/schema-critic-prompt.md` | CREATE | Bundled critic asset — source of truth for schema critic |
| `packages/cli/assets/skills/finishing-a-development-branch/api-critic-prompt.md` | CREATE | Bundled critic asset — source of truth for API critic |
| `packages/cli/src/overlay.ts` | CREATE | `findSuperpowersDir()`, `copyCriticFiles()`, `patchSkillFiles()`, `applyOverlays()` |
| `packages/cli/src/upgrade.ts` | CREATE | `upgradePlugin()`, `upgradeAll()` — force re-clone + call `applyOverlays()` |
| `packages/cli/src/main.ts` | MODIFY | Call `applyOverlays()` after companion install; add `upgrade` subcommand + help text |
| `packages/cli/tests/overlay.test.mjs` | CREATE | Tests: copy files, patch SKILL.md, idempotency, missing superpowers no-op |
| `packages/cli/tests/upgrade.test.mjs` | CREATE | Tests: result shape, already-latest detection, skipped-on-no-git |
| `packages/cli/package.json` | MODIFY | 2.17.0 → 2.18.0; add `"assets/"` to `files` array |
| `CHANGELOG.md` | MODIFY | v2.18.0 entry |

<!-- arch-critic: APPROVED -->

---

### Task 1: Bundle critic assets

Copy the 4 critic prompt files from the superpowers cache into the CLI package as static assets. These become the source of truth — `overlay.ts` copies them outward to wherever superpowers is installed.

**Files:**
- Create: `packages/cli/assets/skills/brainstorming/spec-critic-prompt.md`
- Create: `packages/cli/assets/skills/writing-plans/arch-critic-prompt.md`
- Create: `packages/cli/assets/skills/finishing-a-development-branch/schema-critic-prompt.md`
- Create: `packages/cli/assets/skills/finishing-a-development-branch/api-critic-prompt.md`

- [ ] **Step 1: Create the asset directory structure**

```bash
mkdir -p packages/cli/assets/skills/brainstorming
mkdir -p packages/cli/assets/skills/writing-plans
mkdir -p packages/cli/assets/skills/finishing-a-development-branch
```

- [ ] **Step 2: Verify source files exist, then copy into assets**

These 4 files were created in a prior development session (adversarial-critics feature) and
exist at the cache paths below. They do NOT ship with upstream obra/superpowers — we own them
100%. Verify they exist before copying:

```bash
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/spec-critic-prompt.md
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/arch-critic-prompt.md
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/schema-critic-prompt.md
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/api-critic-prompt.md
```

All 4 must exist. If any are missing, stop — a previous session created them. Check git log for
`docs/superpowers/plans/2026-05-22-adversarial-critics.md` for context on where they came from.

```bash
cp ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/spec-critic-prompt.md \
   packages/cli/assets/skills/brainstorming/spec-critic-prompt.md

cp ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/arch-critic-prompt.md \
   packages/cli/assets/skills/writing-plans/arch-critic-prompt.md

cp ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/schema-critic-prompt.md \
   packages/cli/assets/skills/finishing-a-development-branch/schema-critic-prompt.md

cp ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/api-critic-prompt.md \
   packages/cli/assets/skills/finishing-a-development-branch/api-critic-prompt.md
```

- [ ] **Step 3: Verify all 4 files exist and are non-empty**

```bash
find packages/cli/assets/skills -name "*.md" | sort
wc -l packages/cli/assets/skills/**/*.md packages/cli/assets/skills/**/**/*.md 2>/dev/null | tail -1
```

Expected: 4 files listed, total line count > 200.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/assets/
git commit -m "feat: bundle adversarial critic assets into cli package"
```

---

### Task 2: overlay.ts — idempotent critic installer

Creates `packages/cli/src/overlay.ts` with four exported functions and a test suite.

**Files:**
- Create: `packages/cli/src/overlay.ts`
- Create: `packages/cli/tests/overlay.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/tests/overlay.test.mjs`:

```javascript
// Tests for overlay.ts — critic file copy + SKILL.md patching.
//
// Run: npm run build && node --test tests/overlay.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import built module
const {
  findSuperpowersDir,
  copyCriticFiles,
  patchSkillFiles,
  applyOverlays,
  CRITIC_ASSETS,
  SKILL_PATCHES,
} = await import("../dist/overlay.js");

// ── helpers ────────────────────────────────────────────────────────────────

function makeAssets(dir) {
  for (const asset of CRITIC_ASSETS) {
    const parts = asset.assetRelPath.split("/");
    const subdir = join(dir, ...parts.slice(0, -1));
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(dir, ...parts), `# ${parts.at(-1)} content`);
  }
}

function makeSuperpowers(dir) {
  for (const asset of CRITIC_ASSETS) {
    const skillParts = asset.skillRelPath.split("/");
    mkdirSync(join(dir, ...skillParts.slice(0, -1)), { recursive: true });
  }
  for (const patch of SKILL_PATCHES) {
    const parts = patch.skillRelPath.split("/");
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, patch.skillRelPath), `before\n${patch.searchString}\nafter`);
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

test("CRITIC_ASSETS has 4 entries with non-empty paths", () => {
  assert.equal(CRITIC_ASSETS.length, 4);
  for (const a of CRITIC_ASSETS) {
    assert.ok(a.assetRelPath.length > 0);
    assert.ok(a.skillRelPath.length > 0);
    assert.ok(a.skillRelPath.startsWith("skills/"));
  }
});

test("SKILL_PATCHES has 3 entries with non-empty strings", () => {
  assert.equal(SKILL_PATCHES.length, 3);
  for (const p of SKILL_PATCHES) {
    assert.ok(p.detectString.length > 0);
    assert.ok(p.searchString.length > 0);
    assert.ok(p.replaceWith.includes(p.detectString), "replaceWith must include detectString");
  }
});

test("copyCriticFiles copies all 4 files into superpowers dir", () => {
  const assetsDir = mkdtempSync(join(tmpdir(), "gc-assets-"));
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeAssets(assetsDir);
  makeSuperpowers(spDir);

  const { copied, skipped } = copyCriticFiles(spDir, assetsDir);

  assert.equal(copied.length, 4, `expected 4 copied, got ${copied.length}: ${JSON.stringify(copied)}`);
  assert.equal(skipped.length, 0);
  for (const asset of CRITIC_ASSETS) {
    assert.ok(existsSync(join(spDir, asset.skillRelPath)), `missing ${asset.skillRelPath}`);
  }
});

test("copyCriticFiles overwrites existing files", () => {
  const assetsDir = mkdtempSync(join(tmpdir(), "gc-assets-"));
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeAssets(assetsDir);
  makeSuperpowers(spDir);

  // Pre-populate one dest file with old content
  const destPath = join(spDir, CRITIC_ASSETS[0].skillRelPath);
  writeFileSync(destPath, "old content");

  copyCriticFiles(spDir, assetsDir);

  const newContent = readFileSync(destPath, "utf-8");
  assert.notEqual(newContent, "old content", "file should be overwritten");
});

test("copyCriticFiles returns skipped when asset is missing", () => {
  const assetsDir = mkdtempSync(join(tmpdir(), "gc-assets-empty-"));
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeSuperpowers(spDir);
  // assetsDir is empty — no assets

  const { copied, skipped } = copyCriticFiles(spDir, assetsDir);

  assert.equal(copied.length, 0);
  assert.equal(skipped.length, 4);
});

test("patchSkillFiles applies patch when searchString found", () => {
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeSuperpowers(spDir);

  const { patched, skipped, warnings } = patchSkillFiles(spDir);

  assert.equal(patched.length, 3, `expected 3 patched, got ${patched.length}: ${JSON.stringify(patched)}`);
  assert.equal(skipped.length, 0);
  assert.equal(warnings.length, 0);
  // Each patched file now contains the detectString
  for (const patch of SKILL_PATCHES) {
    const content = readFileSync(join(spDir, patch.skillRelPath), "utf-8");
    assert.ok(content.includes(patch.detectString), `${patch.skillRelPath} should contain detectString`);
  }
});

test("patchSkillFiles is idempotent — skips when detectString already present", () => {
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeSuperpowers(spDir);

  // Apply once
  patchSkillFiles(spDir);

  // Apply again
  const { patched, skipped } = patchSkillFiles(spDir);

  assert.equal(patched.length, 0, "second run should patch nothing");
  assert.equal(skipped.length, 3, "second run should skip all 3");
});

test("patchSkillFiles emits warning when searchString not found (upstream changed)", () => {
  const spDir = mkdtempSync(join(tmpdir(), "gc-sp-"));
  makeSuperpowers(spDir);
  // Overwrite one SKILL.md with content that lacks the searchString
  const patch = SKILL_PATCHES[0];
  writeFileSync(join(spDir, patch.skillRelPath), "completely different upstream content");

  const { warnings } = patchSkillFiles(spDir);

  assert.ok(warnings.some(w => w.includes(patch.skillRelPath)), "should warn about changed upstream");
});

test("applyOverlays returns null superpowersDir when superpowers not installed", () => {
  // Point HOME to a tmpdir with no superpowers
  const fakeHome = mkdtempSync(join(tmpdir(), "gc-home-"));
  const origHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    const result = applyOverlays();
    assert.equal(result.superpowersDir, null);
    assert.equal(result.copiedFiles.length, 0);
  } finally {
    process.env.HOME = origHome;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/cli && npm run build 2>&1 | tail -5
node --test tests/overlay.test.mjs 2>&1 | head -20
```

Expected: compilation error (overlay.ts doesn't exist yet), or import failure.

- [ ] **Step 3: Create `packages/cli/src/overlay.ts`**

```typescript
/**
 * overlay.ts — applies great-cto bundled critic overlays to the installed
 * superpowers plugin.
 *
 * Two idempotent operations:
 * 1. Copy 4 critic prompt files from package assets into superpowers cache
 * 2. Patch 3 upstream SKILL.md files (detect → skip if already applied)
 *
 * Called after every superpowers install and from `great-cto upgrade`.
 */

import {
  existsSync, readFileSync, writeFileSync, copyFileSync,
  mkdirSync, readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export interface OverlayResult {
  superpowersDir: string | null;
  copiedFiles: string[];
  patchedFiles: string[];
  skippedFiles: string[];
  warnings: string[];
}

export interface CriticAsset {
  /** Relative to assets/skills/ */
  assetRelPath: string;
  /** Relative to superpowers install dir */
  skillRelPath: string;
}

export interface SkillPatch {
  /** Relative to superpowers install dir */
  skillRelPath: string;
  /** If this string is present in the file, the patch is already applied — skip */
  detectString: string;
  /** Text to find in the unpatched file */
  searchString: string;
  /** Full replacement for searchString (must contain detectString) */
  replaceWith: string;
}

export const CRITIC_ASSETS: CriticAsset[] = [
  {
    assetRelPath: "brainstorming/spec-critic-prompt.md",
    skillRelPath: "skills/brainstorming/spec-critic-prompt.md",
  },
  {
    assetRelPath: "writing-plans/arch-critic-prompt.md",
    skillRelPath: "skills/writing-plans/arch-critic-prompt.md",
  },
  {
    assetRelPath: "finishing-a-development-branch/schema-critic-prompt.md",
    skillRelPath: "skills/finishing-a-development-branch/schema-critic-prompt.md",
  },
  {
    assetRelPath: "finishing-a-development-branch/api-critic-prompt.md",
    skillRelPath: "skills/finishing-a-development-branch/api-critic-prompt.md",
  },
];

export const SKILL_PATCHES: SkillPatch[] = [
  // ── brainstorming/SKILL.md ─────────────────────────────────────────────
  // Insert spec-critic dispatch block immediately before the User Review Gate section.
  // Anchor: "\n\n**User Review Gate:**" — this section header is stable across
  // upstream versions regardless of what precedes it in the Self-Review section.
  {
    skillRelPath: "skills/brainstorming/SKILL.md",
    detectString: "spec-critic-prompt.md",
    searchString: "\n\n**User Review Gate:**",
    replaceWith:
      "\n\n" +
      "**After self-review passes, dispatch spec critic:**\n\n" +
      "Dispatch the spec-critic subagent (`./spec-critic-prompt.md`) now.\n" +
      "Substitute all placeholders before dispatching:\n" +
      "- Replace `[SPEC_FILE_PATH]` with the absolute path to the saved spec document\n" +
      "- Replace `[SPEC_NAME]` in the description field with the spec filename (e.g., `2026-05-22-auth-design`)\n\n" +
      "- If REVISION REQUIRED: fix each issue inline, re-dispatch (critic re-reads full spec, not just diff)\n" +
      "- If APPROVED: append `Status: APPROVED` sign-off to the spec document, proceed to User Review Gate\n\n" +
      "Do not proceed to the user review gate until the critic returns APPROVED.\n\n" +
      "**User Review Gate:**",
  },

  // ── writing-plans/SKILL.md ─────────────────────────────────────────────
  // Insert Architecture Critic section before Bite-Sized Task Granularity.
  {
    skillRelPath: "skills/writing-plans/SKILL.md",
    detectString: "arch-critic-prompt.md",
    searchString: "## Bite-Sized Task Granularity",
    replaceWith:
      "## Architecture Critic\n\n" +
      "After designing the File Map, dispatch an architecture critic subagent using `./arch-critic-prompt.md`.\n" +
      "When dispatching, substitute all placeholders:\n" +
      "- Replace `[PLAN_FILE_PATH]` with the absolute path to the plan document\n" +
      "- Replace `[PLAN_NAME]` in the description field with the plan filename\n\n" +
      "**The critic's job is adversarial:** find coupling traps, missing cross-cutting concerns,\n" +
      "circular dependencies, and untestable designs that would cause the implementation to collapse.\n" +
      "The critic is NOT a naming reviewer — stylistic feedback is noise.\n\n" +
      "**Dispatch:** Use model `opus`.\n\n" +
      "**If critic returns REVISION REQUIRED:**\n" +
      "- Fix the file map inline in the plan document\n" +
      "- Re-dispatch the critic (it re-reads the full file map, not just the diff)\n" +
      "- Repeat until APPROVED\n\n" +
      "**If critic returns APPROVED:** append `<!-- arch-critic: APPROVED -->` as a comment\n" +
      "after the File Map table, then proceed to writing bite-sized tasks.\n\n" +
      "**Do not write tasks until the architecture critic approves.** Structural errors found\n" +
      "after tasks are written cascade into every task — far cheaper to catch at the file map stage.\n\n" +
      "## Bite-Sized Task Granularity",
  },

  // ── finishing-a-development-branch/SKILL.md ────────────────────────────
  // Insert Step 1.5 Pre-Ship Critics between Step 1 (tests) and Step 2 (base branch).
  {
    skillRelPath: "skills/finishing-a-development-branch/SKILL.md",
    detectString: "schema-critic-prompt.md",
    searchString: "**If tests pass:** Continue to Step 2.\n\n### Step 2:",
    replaceWith:
      "**If tests pass:** Continue to Step 1.5.\n\n" +
      "### Step 1.5: Pre-Ship Critics\n\n" +
      "Before presenting merge/PR options, check whether the branch contains schema or API changes\n" +
      "that require adversarial review.\n\n" +
      "**Detect migration files** (checks only actual migration/schema files, not docs about them):\n" +
      "```bash\n" +
      "BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)\n" +
      "git diff --name-only \"$BASE\" HEAD \\\n" +
      "  | grep -E \"^(db/migrate/|migrations/|database/migrations/|.*\\.sql$)\" | head -20\n" +
      "```\n\n" +
      "If any files match, confirm with a brief list before dispatching:\n" +
      "```\n" +
      "Detected migration files: [list]. Run schema critic? (y to proceed, n to skip)\n" +
      "```\n\n" +
      "If confirmed → **dispatch schema critic:** use `./schema-critic-prompt.md`.\n" +
      "Substitute all placeholders: `[MIGRATION_FILE_PATHS]` = list of detected files,\n" +
      "`[BRANCH_NAME]` = current branch name (`git branch --show-current`).\n\n" +
      "- If REVISION REQUIRED: fix the migration, re-dispatch (critic re-reads full migration)\n" +
      "- If APPROVED: proceed\n\n" +
      "**Detect API contract files** (routes, controllers, GraphQL, OpenAPI specs only — not test files):\n" +
      "```bash\n" +
      "BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)\n" +
      "git diff --name-only \"$BASE\" HEAD \\\n" +
      "  | grep -E \"^(src/routes/|src/controllers/|src/resolvers/|app/controllers/|api/|graphql/schema)\" \\\n" +
      "  | grep -v '__tests__\\|\\.test\\.\\|\\.spec\\.' | head -20\n" +
      "```\n\n" +
      "If any files match, confirm with a brief list before dispatching:\n" +
      "```\n" +
      "Detected API files: [list]. Run API contract critic? (y to proceed, n to skip)\n" +
      "```\n\n" +
      "If confirmed → **dispatch API contract critic:** use `./api-critic-prompt.md`.\n" +
      "Substitute all placeholders: `[BASE_SHA]` = output of `git merge-base HEAD main`,\n" +
      "`[HEAD_SHA]` = output of `git rev-parse HEAD`, `[BRANCH_NAME]` = `git branch --show-current`.\n\n" +
      "- If REVISION REQUIRED: fix the API changes, re-dispatch\n" +
      "- If APPROVED: proceed\n\n" +
      "**If neither detected or both skipped:** proceed to Step 2 directly.\n\n" +
      "**Do not proceed to Step 2 until all dispatched critics return APPROVED.**\n\n" +
      "### Step 2:",
  },
];

/** Returns the assets/skills directory path, relative to the compiled dist/ output. */
export function getAssetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/overlay.js → ../assets/skills/
  return join(here, "..", "assets", "skills");
}

/** Compare two semver strings descending (highest first). */
function semverDescending(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Returns the path to the highest installed superpowers version directory, or null.
 * Sorts by semver descending so the latest version wins when multiple exist.
 */
export function findSuperpowersDir(): string | null {
  const base = join(homedir(), ".claude", "plugins", "cache", "local", "superpowers");
  if (!existsSync(base)) return null;
  try {
    const versions = readdirSync(base)
      .filter((v) => v.trim() !== "")
      .sort(semverDescending);
    return versions.length > 0 ? join(base, versions[0]!) : null;
  } catch {
    return null;
  }
}

/**
 * Copy 4 critic prompt files from the bundled assets into the superpowers
 * cache. Always overwrites — the asset is the source of truth.
 */
export function copyCriticFiles(
  superpowersDir: string,
  assetsDir: string,
): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const asset of CRITIC_ASSETS) {
    const src = join(assetsDir, asset.assetRelPath);
    const dest = join(superpowersDir, asset.skillRelPath);

    if (!existsSync(src)) {
      skipped.push(`${asset.assetRelPath} (asset missing)`);
      continue;
    }

    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied.push(asset.skillRelPath);
  }

  return { copied, skipped };
}

/**
 * Apply 3 idempotent patches to upstream SKILL.md files.
 * Each patch checks for its `detectString` first — if present, the patch is
 * already applied and the file is skipped. If the `searchString` anchor is
 * not found (upstream changed significantly), a warning is emitted and the
 * file is skipped rather than corrupted.
 */
export function patchSkillFiles(superpowersDir: string): {
  patched: string[];
  skipped: string[];
  warnings: string[];
} {
  const patched: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const patch of SKILL_PATCHES) {
    const filePath = join(superpowersDir, patch.skillRelPath);

    if (!existsSync(filePath)) {
      warnings.push(`${patch.skillRelPath} not found — skipping patch`);
      continue;
    }

    const content = readFileSync(filePath, "utf-8");

    if (content.includes(patch.detectString)) {
      skipped.push(patch.skillRelPath);
      continue;
    }

    if (!content.includes(patch.searchString)) {
      warnings.push(
        `${patch.skillRelPath} — anchor string not found (upstream may have changed); skipping`,
      );
      continue;
    }

    writeFileSync(filePath, content.replace(patch.searchString, patch.replaceWith), "utf-8");
    patched.push(patch.skillRelPath);
  }

  return { patched, skipped, warnings };
}

/**
 * Apply all overlays to the installed superpowers plugin.
 *
 * @param superpowersDirOverride - Pass an explicit path (used by `upgrade` command).
 *   Defaults to auto-detecting the installed superpowers version directory.
 */
export function applyOverlays(superpowersDirOverride?: string): OverlayResult {
  const dir = superpowersDirOverride ?? findSuperpowersDir();
  const assetsDir = getAssetsDir();

  if (!dir) {
    return {
      superpowersDir: null,
      copiedFiles: [],
      patchedFiles: [],
      skippedFiles: [],
      warnings: ["superpowers not installed — skipping overlay"],
    };
  }

  const { copied, skipped: skippedCopy } = copyCriticFiles(dir, assetsDir);
  const { patched, skipped: skippedPatch, warnings } = patchSkillFiles(dir);

  return {
    superpowersDir: dir,
    copiedFiles: copied,
    patchedFiles: patched,
    skippedFiles: [...skippedCopy, ...skippedPatch],
    warnings,
  };
}
```

- [ ] **Step 4: Build and run tests**

```bash
cd packages/cli && npm run build 2>&1 | tail -10
node --test tests/overlay.test.mjs
```

Expected: all tests pass. Sample output:
```
✔ CRITIC_ASSETS has 4 entries with non-empty paths (Xms)
✔ SKILL_PATCHES has 3 entries with non-empty strings (Xms)
✔ copyCriticFiles copies all 4 files into superpowers dir (Xms)
✔ copyCriticFiles overwrites existing files (Xms)
✔ copyCriticFiles returns skipped when asset is missing (Xms)
✔ patchSkillFiles applies patch when searchString found (Xms)
✔ patchSkillFiles is idempotent — skips when detectString already present (Xms)
✔ patchSkillFiles emits warning when searchString not found (upstream changed) (Xms)
✔ applyOverlays returns null superpowersDir when superpowers not installed (Xms)
ℹ tests 9
ℹ pass 9
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/overlay.ts packages/cli/tests/overlay.test.mjs
git commit -m "feat: add overlay.ts — idempotent critic file installer and SKILL.md patcher"
```

---

### Task 3: upgrade.ts — force re-clone + overlay

Creates `packages/cli/src/upgrade.ts` with `upgradePlugin()` and `upgradeAll()`.

**Files:**
- Create: `packages/cli/src/upgrade.ts`
- Create: `packages/cli/tests/upgrade.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/tests/upgrade.test.mjs`:

```javascript
// Tests for upgrade.ts — force re-clone companion plugins + apply overlays.
//
// HOME is redirected to a tmpdir before any module is imported so that
// upgradeAll() targets an isolated cache instead of the real ~/.claude.
// This prevents tests from mutating the developer's installed plugins.
//
// Run: npm run build && node --test tests/upgrade.test.mjs

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// ── Isolate HOME before importing any module that uses homedir() ───────────
// upgrade.ts and overlay.ts both call homedir() inside functions, so setting
// HOME here (before the dynamic imports below) ensures they see the fake HOME.
const fakeHome = mkdtempSync(join(tmpdir(), "gc-upgrade-home-"));
const realHome = process.env.HOME;
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome; // Windows

// ── Module imports (must come AFTER HOME is set) ────────────────────────────
const { upgradeAll } = await import("../dist/upgrade.js");
const { COMPANION_PLUGINS } = await import("../dist/companion.js");

// ── Tests ────────────────────────────────────────────────────────────────────

test("COMPANION_PLUGINS has superpowers and beads", () => {
  const names = COMPANION_PLUGINS.map((p) => p.name);
  assert.ok(names.includes("superpowers"), "missing superpowers");
  assert.ok(names.includes("beads"), "missing beads");
});

test("upgradeAll returns one result per companion plugin (isolated HOME)", async () => {
  // With an empty fake HOME, no plugins are installed.
  // upgradeAll will try ls-remote (may succeed or skip if no network/git).
  // All results must have a valid status — "skipped" is acceptable.
  const results = await upgradeAll();
  assert.equal(results.length, COMPANION_PLUGINS.length);
  for (const r of results) {
    assert.ok(
      ["upgraded", "already_latest", "skipped"].includes(r.status),
      `unexpected status '${r.status}' for ${r.name}`,
    );
    assert.ok(typeof r.name === "string" && r.name.length > 0);
    assert.ok(typeof r.fromVersion === "string");
    assert.ok(typeof r.toVersion === "string");
  }
});

test("upgradeAll result names match COMPANION_PLUGINS names", async () => {
  const results = await upgradeAll();
  const resultNames = results.map((r) => r.name).sort();
  const pluginNames = COMPANION_PLUGINS.map((p) => p.name).sort();
  assert.deepEqual(resultNames, pluginNames);
});

test("upgradeAll does not touch real HOME", () => {
  // Verify HOME was not restored mid-test (sanity check)
  assert.equal(process.env.HOME, fakeHome, "HOME must still point to tmpdir");
  assert.notEqual(fakeHome, realHome, "fakeHome must differ from real HOME");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/cli && node --test tests/upgrade.test.mjs 2>&1 | head -10
```

Expected: `ERR_MODULE_NOT_FOUND` — `dist/upgrade.js` doesn't exist yet.

- [ ] **Step 3: Create `packages/cli/src/upgrade.ts`**

```typescript
/**
 * upgrade.ts — force re-clone companion plugins to their latest semver tag,
 * then re-apply great-cto overlays.
 *
 * `great-cto upgrade [plugin]`
 *   plugin: "superpowers" | "beads" | undefined → all
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { COMPANION_PLUGINS, type CompanionPlugin, installCompanionPlugin } from "./companion.js";
import { applyOverlays } from "./overlay.js";

export interface UpgradeResult {
  name: string;
  status: "upgraded" | "already_latest" | "skipped";
  fromVersion: string;
  toVersion: string;
  reason?: string;
}

function getPluginCacheDir(name: string): string {
  return join(homedir(), ".claude", "plugins", "cache", "local", name);
}

/** Compare two semver strings descending (highest first). */
function semverDescending(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Returns the highest installed semver version for a plugin, or null. */
function getInstalledVersion(name: string): string | null {
  const base = getPluginCacheDir(name);
  if (!existsSync(base)) return null;
  try {
    const versions = readdirSync(base)
      .filter((v) => v.trim() !== "")
      .sort(semverDescending);
    return versions.length > 0 ? versions[0]! : null;
  } catch {
    return null;
  }
}

/** Detect the highest semver tag from a remote repo without cloning. */
function detectLatestTag(repoUrl: string): string | null {
  try {
    const out = execFileSync("git", ["ls-remote", "--tags", repoUrl], {
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tags = out
      .split("\n")
      .map((line) => line.match(/refs\/tags\/v?([0-9]+\.[0-9]+\.[0-9]+)(?!\^)/)?.[1])
      .filter((t): t is string => !!t)
      .sort((a, b) => {
        const pa = a.split(".").map(Number);
        const pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          const d = (pb[i] ?? 0) - (pa[i] ?? 0);
          if (d !== 0) return d;
        }
        return 0;
      });
    return tags[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Force-upgrade a single companion plugin to its latest semver tag.
 * If already on the latest tag, re-applies overlays and returns `already_latest`.
 */
export async function upgradePlugin(plugin: CompanionPlugin): Promise<UpgradeResult> {
  const { name, repoUrl } = plugin;

  const currentVersion = getInstalledVersion(name);
  const latestTag = detectLatestTag(repoUrl);
  const latestVersion = latestTag ?? "main";

  // Already on latest — just re-apply overlays in case they were missing
  if (currentVersion && currentVersion === latestVersion) {
    if (name === "superpowers") {
      applyOverlays(join(getPluginCacheDir(name), currentVersion));
    }
    return { name, status: "already_latest", fromVersion: currentVersion, toVersion: latestVersion };
  }

  // Remove the old version directory before re-cloning
  if (currentVersion) {
    const oldDir = join(getPluginCacheDir(name), currentVersion);
    try {
      rmSync(oldDir, { recursive: true, force: true });
    } catch (e) {
      return {
        name,
        status: "skipped",
        fromVersion: currentVersion,
        toVersion: latestVersion,
        reason: `failed to remove old version: ${(e as Error).message}`,
      };
    }
  }

  // Re-install via companion installer (handles clone + settings enable).
  // `installCompanionPlugin` may return "already_present" if another version dir
  // exists despite the rmSync above (e.g., orphan dirs from a prior failed upgrade).
  // Treat both "installed" and "already_present" as success — the plugin is present.
  const result = installCompanionPlugin(plugin);

  if (result.status === "skipped") {
    return {
      name,
      status: "skipped",
      fromVersion: currentVersion ?? "—",
      toVersion: latestVersion,
      reason: result.reason,
    };
  }

  // "installed" | "already_present" → plugin is present; apply overlays
  if (name === "superpowers") {
    const newDir = join(getPluginCacheDir(name), result.version);
    applyOverlays(newDir);
  }

  return {
    name,
    status: "upgraded",
    fromVersion: currentVersion ?? "—",
    toVersion: result.version,
  };
}

/** Upgrade all companion plugins. Never throws — best-effort for each. */
export async function upgradeAll(): Promise<UpgradeResult[]> {
  const results: UpgradeResult[] = [];
  for (const plugin of COMPANION_PLUGINS) {
    try {
      results.push(await upgradePlugin(plugin));
    } catch (e) {
      results.push({
        name: plugin.name,
        status: "skipped",
        fromVersion: "—",
        toVersion: "—",
        reason: (e as Error).message,
      });
    }
  }
  return results;
}
```

- [ ] **Step 4: Build and run tests**

```bash
cd packages/cli && npm run build 2>&1 | tail -5
node --test tests/upgrade.test.mjs
```

Expected: all 3 tests pass. The `upgradeAll` test will either hit the network (upgraded/already_latest) or skip if no git — all valid statuses.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/upgrade.ts packages/cli/tests/upgrade.test.mjs
git commit -m "feat: add upgrade.ts — force re-clone companions to latest tag"
```

---

### Task 4: Wire applyOverlays into init flow + add upgrade subcommand

Modifies `main.ts` in two ways:
1. Call `applyOverlays()` after companion install (idempotent — safe on every init)
2. Add `great-cto upgrade [plugin]` subcommand

**Files:**
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Add `upgrade` to CliArgs command type and parseArgs**

Locate the exact line with `grep -n "chat-only-hint" packages/cli/src/main.ts | head -1`.
Replace the `command` type union in the `CliArgs` interface to add `"upgrade"`:

```typescript
// Find: | "leash" | "chat-only-hint" | "unknown";
// Replace with:
  command: "init" | "help" | "version" | "board" | "register" | "scan" | "list-rules" | "ci" | "mcp" | "adapt" | "serve" | "webhook" | "report" | "leash" | "upgrade" | "chat-only-hint" | "unknown";
```

Locate the `upgrade` insertion point with `grep -n '"board"' packages/cli/src/main.ts | head -3`.
Add the upgrade case immediately after the `board` case in `parseArgs`:

```typescript
// After: else if (a === "board") args.command = "board";
    else if (a === "upgrade") args.command = "upgrade";
```

- [ ] **Step 2: Add upgrade to the help text**

In `printHelp()`, add to the usage section (after the `leash` line):

```typescript
// ADD after: npx great-cto leash
  npx great-cto upgrade [superpowers|beads]   Re-clone companions to latest tag + re-apply overlays
```

And add a `Upgrade:` section after the `Board:` section:

```typescript
${bold("Upgrade:")}
  great-cto upgrade              Upgrade superpowers + beads to latest, re-apply critic overlays
  great-cto upgrade superpowers  Upgrade superpowers only
  great-cto upgrade beads        Upgrade beads only
  ${dim("(Safe to run any time — idempotent if already on latest)")}
```

- [ ] **Step 3: Add runUpgrade function**

Add this function before the `main()` function:

```typescript
async function runUpgrade(rawArgv: string[]): Promise<number> {
  const { upgradePlugin, upgradeAll } = await import("./upgrade.js");
  const { success, warn, log, dim } = await import("./ui.js");
  const { COMPANION_PLUGINS } = await import("./companion.js");

  // Optional positional: great-cto upgrade [plugin-name]
  const upgradeIdx = rawArgv.indexOf("upgrade");
  const pluginArg = upgradeIdx >= 0 ? rawArgv[upgradeIdx + 1] : undefined;
  const targetPlugin = pluginArg && !pluginArg.startsWith("--") ? pluginArg : undefined;

  let results;
  if (targetPlugin) {
    const plugin = COMPANION_PLUGINS.find((p) => p.name === targetPlugin);
    if (!plugin) {
      const { error } = await import("./ui.js");
      error(`unknown plugin '${targetPlugin}'. Valid: ${COMPANION_PLUGINS.map((p) => p.name).join(", ")}`);
      return 2;
    }
    results = [await upgradePlugin(plugin)];
  } else {
    results = await upgradeAll();
  }

  for (const r of results) {
    if (r.status === "upgraded") {
      success(`${r.name} ${r.fromVersion} → ${r.toVersion}`);
    } else if (r.status === "already_latest") {
      log(`  ${dim(`${r.name} ${r.toVersion} already at latest (overlays re-applied)`)}`);
    } else {
      warn(`${r.name} skipped — ${r.reason ?? "unknown reason"}`);
    }
  }

  return 0;
}
```

- [ ] **Step 4: Add upgrade dispatch in main()**

Locate the `leash` dispatch block with: `grep -n '"leash"' packages/cli/src/main.ts | grep "command ==="`.
Add the upgrade dispatch immediately after the closing brace of the `leash` block:

```typescript
  if (args.command === "upgrade") {
    try {
      const code = await runUpgrade(rawArgv);
      process.exit(code);
    } catch (e) {
      error((e as Error).message);
      process.exit(1);
    }
  }
```

- [ ] **Step 5: Call applyOverlays after companion install in runInit()**

Locate the companion install block with: `grep -n "installAllCompanions" packages/cli/src/main.ts`.
Find the `for (const r of companions)` loop that prints the install results.
After the closing brace of that `for` loop, add:

```typescript
    // Apply bundled critic overlays (idempotent — skips already-applied changes)
    try {
      const { applyOverlays } = await import("./overlay.js");
      applyOverlays();
    } catch { /* best-effort — overlay failure must not block init */ }
```

- [ ] **Step 6: Build and run full test suite**

```bash
cd packages/cli && npm run build 2>&1 | tail -5
npm test 2>&1 | tail -20
```

Expected: all existing tests pass + the new overlay and upgrade tests pass.

- [ ] **Step 7: Smoke test the upgrade command manually**

```bash
node dist/main.js upgrade --help 2>&1 | head -5
node dist/main.js upgrade superpowers 2>&1
```

Expected: either `superpowers X.Y.Z already at latest` or `superpowers X.Y.Z → A.B.C`.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/main.ts
git commit -m "feat: add upgrade subcommand + wire applyOverlays into init flow"
```

---

### Task 5: package.json + CHANGELOG (v2.18.0)

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update package.json**

In `packages/cli/package.json`, make two changes:

1. Bump version: `"version": "2.17.0"` → `"version": "2.18.0"`

2. Add `"assets/"` to the `files` array:
```json
"files": [
  "index.mjs",
  "dist/",
  "assets/",
  "agentshield-rules/",
  "postinstall.mjs",
  "README.md"
],
```

- [ ] **Step 2: Add CHANGELOG entry**

At the top of `CHANGELOG.md` (after `# Changelog\n\nAll notable changes...`), insert:

```markdown
## v2.18.0 — 2026-05-22

### Added — bd upgrade + Bundled Adversarial Critics

**`great-cto upgrade [plugin]`** — force re-clone companion plugins (superpowers, beads) to
their latest semver tag, then re-apply critic overlays. Safe to run any time — idempotent
if already on latest.

- **`packages/cli/src/upgrade.ts`** — `upgradePlugin()`, `upgradeAll()`
- **`packages/cli/src/overlay.ts`** — `applyOverlays()`, `copyCriticFiles()`, `patchSkillFiles()`
  — idempotent critic installer called on every `init` and `upgrade`
- **`packages/cli/assets/skills/`** — 4 adversarial critic prompt files bundled as package assets:
  - `brainstorming/spec-critic-prompt.md` — attacks specs before planning
  - `writing-plans/arch-critic-prompt.md` — attacks file structure before tasks are written
  - `finishing-a-development-branch/schema-critic-prompt.md` — attacks DB migrations before ship
  - `finishing-a-development-branch/api-critic-prompt.md` — attacks API changes before ship

---

```

- [ ] **Step 3: Build and run tests one final time**

```bash
cd packages/cli && npm run build && npm test 2>&1 | tail -15
```

Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json CHANGELOG.md
git commit -m "chore: bump to v2.18.0 — bd upgrade + bundled adversarial critics"
```

---

## Self-Review

**Spec coverage:**
- ✓ Bundle 4 critic assets → Task 1
- ✓ overlay.ts copy + patch + idempotency → Task 2
- ✓ upgrade.ts force re-clone + overlays → Task 3
- ✓ `great-cto upgrade [plugin]` CLI subcommand → Task 4
- ✓ applyOverlays called on every init → Task 4 Step 5
- ✓ package.json `files` includes `assets/` → Task 5
- ✓ Version bump → Task 5

**Placeholder scan:** No TBD/TODO found. All code blocks complete.

**Type consistency:**
- `applyOverlays(superpowersDirOverride?: string)` — called in upgrade.ts with explicit dir ✓
- `upgradePlugin(plugin: CompanionPlugin)` — `CompanionPlugin` imported from `companion.ts` ✓
- `OverlayResult` shape consistent between definition and usage ✓
- `UpgradeResult.status` values (`"upgraded" | "already_latest" | "skipped"`) match between definition and `upgradeAll()` ✓
- `already_present` from `installCompanionPlugin` handled explicitly in `upgradePlugin` ✓
- Both `findSuperpowersDir` and `getInstalledVersion` sort by `semverDescending` ✓
- Upgrade tests set `process.env.HOME` before imports → no real `~/.claude` mutation ✓

---
Status: APPROVED
Critic verdict: The plan is solid enough to execute — critic asset paths, idempotency via detectString, semver-aware version detection, isolated-HOME tests, and explicit handling of `already_present` from `installCompanionPlugin` all align with the existing `companion.ts` interface and the current upstream SKILL.md contents.
