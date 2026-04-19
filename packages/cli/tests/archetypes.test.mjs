// Tests for archetypes.ts — pickArchetype + suggestCompliance.
//
// Run: npm run build && node --test tests/archetypes.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickArchetype, suggestCompliance } from "../dist/archetypes.js";

function mkDetection(stack = [], extras = {}) {
  return {
    stack,
    languages: [],
    signals: {},
    packageManager: null,
    hasTests: false,
    hasCI: false,
    hasExistingGreatCto: false,
    ...extras,
  };
}

test("empty detection → greenfield with low confidence", () => {
  const pick = pickArchetype(mkDetection([]));
  assert.equal(pick.primary, "greenfield");
  assert.equal(pick.confidence, "low");
  assert.ok(pick.rationale.includes("no strong signals"));
});

test("Stripe → commerce (high confidence)", () => {
  const pick = pickArchetype(mkDetection(["stripe", "nodejs", "next.js"]));
  assert.equal(pick.primary, "commerce");
  assert.equal(pick.confidence, "high");
  assert.ok(pick.rationale.includes("Stripe"));
  assert.ok(pick.rationale.includes("PCI-DSS"));
});

test("Solidity → web3", () => {
  const pick = pickArchetype(mkDetection(["solidity", "nodejs"]));
  assert.equal(pick.primary, "web3");
  assert.ok(pick.rationale.includes("Solidity"));
});

test("MCP SDK → ai-system", () => {
  const pick = pickArchetype(mkDetection(["mcp", "nodejs", "typescript"]));
  assert.equal(pick.primary, "ai-system");
  assert.ok(pick.rationale.includes("MCP"));
});

test("LangChain → ai-system", () => {
  const pick = pickArchetype(mkDetection(["langchain", "python"]));
  assert.equal(pick.primary, "ai-system");
});

test("React Native → mobile-app (high)", () => {
  const pick = pickArchetype(mkDetection(["react-native", "expo", "nodejs"]));
  assert.equal(pick.primary, "mobile-app");
  assert.equal(pick.confidence, "high");
});

test("Terraform alone → infra", () => {
  const pick = pickArchetype(mkDetection(["terraform"]));
  assert.equal(pick.primary, "infra");
});

test("Terraform + Helm → infra (higher score)", () => {
  const pick = pickArchetype(mkDetection(["terraform", "helm", "kubernetes"]));
  assert.equal(pick.primary, "infra");
  assert.equal(pick.confidence, "high");
});

test("Next.js only (no payments) → web-service", () => {
  const pick = pickArchetype(mkDetection(["next.js", "react", "nodejs", "typescript"]));
  assert.equal(pick.primary, "web-service");
});

test("Django only → web-service", () => {
  const pick = pickArchetype(mkDetection(["django", "python"]));
  assert.equal(pick.primary, "web-service");
});

test("Plain Node, no framework → library", () => {
  const pick = pickArchetype(mkDetection(["nodejs", "typescript"]));
  assert.equal(pick.primary, "library");
});

test("Plain Go module → library", () => {
  const pick = pickArchetype(mkDetection(["go"]));
  assert.equal(pick.primary, "library");
});

test("Plain Rust Cargo → library", () => {
  const pick = pickArchetype(mkDetection(["rust"]));
  assert.equal(pick.primary, "library");
});

test("Commerce beats web-service when both signals present", () => {
  // Stripe + Next.js — commerce (score 5) should beat web-service (score 1+2=3)
  const pick = pickArchetype(mkDetection(["stripe", "next.js", "react", "nodejs"]));
  assert.equal(pick.primary, "commerce");
});

test("web3 beats web-service when Solidity + Node present", () => {
  const pick = pickArchetype(mkDetection(["solidity", "nodejs", "typescript"]));
  assert.equal(pick.primary, "web3");
});

test("alternatives are returned", () => {
  const pick = pickArchetype(mkDetection(["stripe", "next.js", "react", "nodejs"]));
  // Should include web-service as alternative (next.js triggers it)
  assert.ok(pick.alternatives.length >= 1);
  assert.ok(pick.alternatives.includes("web-service"));
});

// ── suggestCompliance ─────────────────────────────────────

test("commerce archetype → pci-dss + gdpr", () => {
  const detection = mkDetection(["stripe"]);
  const comp = suggestCompliance(detection, "commerce");
  assert.ok(comp.includes("pci-dss"));
  assert.ok(comp.includes("gdpr"));
});

test("ai-system archetype → eu-ai-act", () => {
  const comp = suggestCompliance(mkDetection(["openai-sdk"]), "ai-system");
  assert.ok(comp.includes("eu-ai-act"));
});

test("web3 archetype → soc2", () => {
  const comp = suggestCompliance(mkDetection(["solidity"]), "web3");
  assert.ok(comp.includes("soc2"));
});

test("web-service archetype → gdpr", () => {
  const comp = suggestCompliance(mkDetection(["next.js"]), "web-service");
  assert.ok(comp.includes("gdpr"));
});

test("library archetype → no compliance suggested", () => {
  const comp = suggestCompliance(mkDetection(["nodejs"]), "library");
  assert.equal(comp.length, 0);
});

test("Stripe in stack forces pci-dss regardless of archetype", () => {
  // edge case: user overrides archetype but Stripe is there
  const comp = suggestCompliance(mkDetection(["stripe"]), "web-service");
  assert.ok(comp.includes("pci-dss"));
});
