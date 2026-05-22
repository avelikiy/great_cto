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
