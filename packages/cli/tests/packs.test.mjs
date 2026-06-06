// Tests for packs.ts — suggestPacks, suggestPackReviewers, suggestPackGates.
//
// Run: npm run build && node --test tests/packs.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPacks, suggestPackReviewers, suggestPackGates, listPacks } from "../dist/packs.js";

function mkDetection(stack = [], readmeKeywords = []) {
  return { stack: stack.map(s => s.toLowerCase()), readmeKeywords };
}

// ── digital-health-pack ────────────────────────────────────────────────────

test("digital-health-pack: wearable keyword triggers pack", () => {
  const d = mkDetection([], ["wearable"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'wearable' keyword");
  assert.ok(match.reviewers.includes("digital-health-reviewer"), "digital-health-reviewer should be in reviewers");
});

test("digital-health-pack: apple watch keyword triggers pack", () => {
  const d = mkDetection([], ["apple watch"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'apple watch' keyword");
});

test("digital-health-pack: mental health keyword triggers pack", () => {
  const d = mkDetection([], ["mental health"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'mental health' keyword");
  assert.ok(match.humanGates.includes("gate:mental-health-protocol"),
    "mental-health-protocol gate should fire");
});

test("digital-health-pack: nutrition AI keyword triggers pack", () => {
  const d = mkDetection([], ["nutrition ai"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'nutrition ai' keyword");
});

test("digital-health-pack: supplement recommendation triggers pack", () => {
  const d = mkDetection([], ["supplement recommendation"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'supplement recommendation' keyword");
  assert.ok(match.humanGates.includes("gate:supplement-safety"), "supplement-safety gate should fire");
});

test("digital-health-pack: garmin keyword triggers pack", () => {
  const d = mkDetection([], ["garmin"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'garmin' keyword");
});

test("digital-health-pack: samsung health keyword triggers pack", () => {
  const d = mkDetection([], ["samsung health"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'samsung health' keyword");
});

test("digital-health-pack: physician review HITL triggers pack with hitl-design gate", () => {
  const d = mkDetection([], ["physician review"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'physician review' keyword");
  assert.ok(match.humanGates.includes("gate:hitl-design"), "hitl-design gate should fire");
});

test("digital-health-pack: reviewer chain includes digital-health-reviewer + ai-clinical-reviewer", () => {
  const d = mkDetection([], ["wearable", "fitness ai"]);
  const reviewers = suggestPackReviewers(d);
  assert.ok(reviewers.includes("digital-health-reviewer"), "digital-health-reviewer should be in reviewer chain");
  assert.ok(reviewers.includes("ai-clinical-reviewer"), "ai-clinical-reviewer should be in reviewer chain");
  assert.ok(reviewers.includes("healthcare-reviewer"), "healthcare-reviewer should be in reviewer chain");
});

test("digital-health-pack: healthkit stack token triggers pack", () => {
  const d = mkDetection(["healthkit"], []);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by healthkit stack token");
});

test("digital-health-pack: wellbeing keyword triggers pack", () => {
  const d = mkDetection([], ["wellbeing"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'wellbeing' keyword");
});

test("digital-health-pack: personalised training keyword triggers pack", () => {
  const d = mkDetection([], ["personalised training"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.ok(match, "digital-health-pack should be triggered by 'personalised training' keyword");
});

// ── existing pack regression ───────────────────────────────────────────────

test("voice-pack: still triggers on 'voice agent' keyword (no regression)", () => {
  const d = mkDetection([], ["voice agent"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "voice-pack");
  assert.ok(match, "voice-pack should still be triggered");
});

test("clinical-pack: still triggers on 'clinical' keyword (no regression)", () => {
  const d = mkDetection([], ["clinical"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "clinical-pack");
  assert.ok(match, "clinical-pack should still be triggered");
});

test("drug-discovery-pack: still triggers on 'drug discovery' keyword (no regression)", () => {
  const d = mkDetection([], ["drug discovery"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "drug-discovery-pack");
  assert.ok(match, "drug-discovery-pack should still be triggered");
});

// ── listPacks includes digital-health-pack ─────────────────────────────────

test("listPacks includes digital-health-pack", () => {
  const packs = listPacks();
  assert.ok(packs.includes("digital-health-pack"), "listPacks must include digital-health-pack");
});

// ── no false positives ────────────────────────────────────────────────────

test("digital-health-pack: generic web project does NOT trigger pack", () => {
  const d = mkDetection(["next.js", "react", "typescript"], ["blog", "content", "marketing"]);
  const packs = suggestPacks(d);
  const match = packs.find(p => p.pack === "digital-health-pack");
  assert.equal(match, undefined, "digital-health-pack should NOT fire for generic web projects");
});

// ── US-market Phase 1: sec-cyber-pack ──────────────────────────────────────

test("sec-cyber-pack: triggers on '10-k' + 'material incident'", () => {
  const m = suggestPacks(mkDetection([], ["10-k", "material incident"])).find(p => p.pack === "sec-cyber-pack");
  assert.ok(m, "sec-cyber-pack should fire");
  assert.ok(m.reviewers.includes("sec-cyber-disclosure-reviewer"));
  assert.ok(m.humanGates.includes("gate:cyber-disclosure-readiness"));
});

test("sec-cyber-pack: triggers on pagerduty stack token", () => {
  const m = suggestPacks(mkDetection(["pagerduty"], [])).find(p => p.pack === "sec-cyber-pack");
  assert.ok(m, "sec-cyber-pack should fire on pagerduty");
});

test("sec-cyber-pack: generic blog does NOT trigger", () => {
  const m = suggestPacks(mkDetection(["next.js"], ["blog", "marketing"])).find(p => p.pack === "sec-cyber-pack");
  assert.equal(m, undefined);
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

test("listPacks includes the two US-market packs", () => {
  const packs = listPacks();
  assert.ok(packs.includes("sec-cyber-pack"));
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
