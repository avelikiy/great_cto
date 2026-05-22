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
import { semverDescending } from "./semver.js";

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
