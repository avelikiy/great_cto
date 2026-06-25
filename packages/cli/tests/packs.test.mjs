// Tests for packs.ts — suggestPacks, suggestPackReviewers, suggestPackGates.
//
// Run: npm run build && node --test tests/packs.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPacks, listPacks } from "../dist/packs.js";

function mkDetection(stack = [], readmeKeywords = []) {
  return { stack: stack.map(s => s.toLowerCase()), readmeKeywords };
}

// ── existing pack regression ───────────────────────────────────────────────

test("voice-pack: still triggers on 'voice agent' keyword (no regression)", () => {
  const d = mkDetection([], ["voice agent"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "voice-pack");
  assert.ok(match, "voice-pack should still be triggered");
});

// ── US-market Phase 1: adtech-privacy-pack ─────────────────────────────────

test("adtech-privacy-pack: triggers on 'meta pixel'", () => {
  const m = suggestPacks(mkDetection([], ["meta pixel"])).find(p => p.pack === "adtech-privacy-pack");
  assert.ok(m, "adtech-privacy-pack should fire");
  assert.ok(m.reviewers.includes("adtech-privacy-reviewer"));
  assert.ok(m.reviewers.includes("us-privacy-reviewer"));
  assert.ok(m.humanGates.includes("gate:tracking-consent"));
});

test("adtech-privacy-pack: triggers on fbevents stack token", () => {
  const m = suggestPacks(mkDetection(["fbevents"], [])).find(p => p.pack === "adtech-privacy-pack");
  assert.ok(m, "adtech-privacy-pack should fire on fbevents");
});

test("adtech-privacy-pack: triggers on 'session replay'", () => {
  const m = suggestPacks(mkDetection([], ["session replay"])).find(p => p.pack === "adtech-privacy-pack");
  assert.ok(m, "adtech-privacy-pack should fire on session replay");
});

test("listPacks includes the US-market packs", () => {
  const packs = listPacks();
  assert.ok(packs.includes("adtech-privacy-pack"));
});

// ── US-market Phase 3: us-ai-pack ──────────────────────────────────────────

test("us-ai-pack: triggers on 'colorado ai act'", () => {
  const m = suggestPacks(mkDetection([], ["colorado ai act"])).find(p => p.pack === "us-ai-pack");
  assert.ok(m, "us-ai-pack should fire");
  assert.ok(m.reviewers.includes("us-ai-reviewer"));
  assert.ok(m.humanGates.includes("gate:ai-governance"));
});

test("us-ai-pack: triggers on 'nist ai rmf' and 'consequential decision'", () => {
  assert.ok(suggestPacks(mkDetection([], ["nist ai rmf"])).find(p => p.pack === "us-ai-pack"));
  assert.ok(suggestPacks(mkDetection([], ["consequential decision"])).find(p => p.pack === "us-ai-pack"));
});

test("us-ai-pack: generic web project does NOT trigger", () => {
  const m = suggestPacks(mkDetection(["next.js"], ["blog", "marketing"])).find(p => p.pack === "us-ai-pack");
  assert.equal(m, undefined);
});

test("listPacks includes us-ai-pack", () => {
  assert.ok(listPacks().includes("us-ai-pack"));
});
