// Tests for flow.ts — compileFlow() + renderFlowMd().
//
// Run: cd packages/cli && npm run build && node --test tests/flow.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { compileFlow, renderFlowMd } from "../dist/flow.js";

function mkDetection(overrides = {}) {
  return {
    stack: [],
    languages: [],
    signals: {},
    packageManager: null,
    hasTests: false,
    hasCI: false,
    hasExistingGreatCto: false,
    codeStructure: {
      hasRoutesDir: false,
      hasCliEntry: false,
      hasPublicHtml: false,
      hasServerEntry: false,
      hasMonorepo: false,
    },
    scripts: { hasStart: false, hasDev: false, hasBuild: false, hasPublish: false },
    projectSize: "medium",
    readmeKeywords: [],
    infraKeywords: [],
    ...overrides,
  };
}

test("greenfield → title is 'New project', low cost, only gate:plan on nano", () => {
  const flow = compileFlow("greenfield", "nano", mkDetection(), [], "low");
  assert.equal(flow.title, "New project");
  assert.ok(flow.costRange.low < 1, `expected low cost, got ${flow.costRange.low}`);
  assert.ok(flow.gates.includes("gate:plan"), "must include gate:plan");
  // nano → only gate:plan (no qa/ship)
  assert.ok(!flow.gates.includes("gate:ship"), "nano greenfield should not have gate:ship");
});

test("fintech + EU jurisdiction → pci-reviewer, gdpr-reviewer, compliance gate", () => {
  const det = mkDetection({
    stack: ["stripe", "nodejs"],
    readmeKeywords: ["gdpr", "eu users"],
    infraKeywords: ["eu-west-1"],
  });
  const flow = compileFlow("fintech", "medium", det, ["pci-dss", "gdpr"], "high");
  assert.ok(flow.agents.includes("pci-reviewer"), "must include pci-reviewer");
  assert.ok(flow.agents.includes("gdpr-reviewer"), "must include gdpr-reviewer");
  assert.ok(flow.gates.some((g) => g.includes("compliance")), "must have compliance gate");
  assert.ok(flow.costRange.low >= 8, `fintech should be deep tier (≥$8), got ${flow.costRange.low}`);
});

test("title includes jurisdiction code when detected", () => {
  const det = mkDetection({ readmeKeywords: ["gdpr", "eu users"] });
  const flow = compileFlow("web-service", "medium", det, ["gdpr"], "medium");
  assert.ok(flow.title.includes("EU"), `title should include 'EU', got: "${flow.title}"`);
});

test("agents are unique and sorted", () => {
  const flow = compileFlow("fintech", "large", mkDetection(), ["pci-dss"], "high");
  const sorted = [...flow.agents].sort();
  assert.deepEqual(flow.agents, sorted, "agents must be sorted");
  const unique = new Set(flow.agents);
  assert.equal(unique.size, flow.agents.length, "agents must be unique");
});

test("renderFlowMd produces valid markdown with _routing block", () => {
  const flow = compileFlow("fintech", "medium", mkDetection(), ["pci-dss"], "high");
  const md = renderFlowMd(flow, "2026-05-23");
  assert.ok(md.includes("# Delivery Flow"), "must have heading");
  assert.ok(md.includes("_routing:"), "must include _routing block");
  assert.ok(md.includes("archetype: fintech"), "must include archetype");
  assert.ok(md.includes("gate:plan"), "must include gate:plan");
  assert.ok(md.includes("## Agents"), "must have Agents section");
  assert.ok(md.includes("## Human gates"), "must have Human gates section");
});

test("cli-tool → baseline cost (≤$3), no compliance gate", () => {
  const flow = compileFlow("cli-tool", "medium", mkDetection(), [], "high");
  assert.ok(flow.costRange.high <= 3, `cli-tool should be baseline tier (≤$3), got $${flow.costRange.high}`);
  assert.ok(!flow.gates.includes("gate:compliance"), "cli-tool should not have compliance gate");
  assert.ok(flow.agents.includes("cli-reviewer"), "must include cli-reviewer");
});

// ── design-advisor wiring (UI-bearing archetypes only) ───────────────────────

test("design-advisor is included for UI-bearing archetypes", () => {
  for (const a of ["web-service", "mobile-app", "cms", "enterprise-saas", "marketplace", "commerce", "game", "edtech"]) {
    const flow = compileFlow(a, "medium", mkDetection(), [], "high");
    assert.ok(flow.agents.includes("design-advisor"), `${a} must include design-advisor`);
  }
});

test("product-builder archetypes (A1–A6) are UI-bearing → include design-advisor", () => {
  for (const a of ["vertical-saas", "booking", "crm", "dashboard", "content-platform", "marketplace-lite"]) {
    const flow = compileFlow(a, "medium", mkDetection(), [], "high");
    assert.ok(flow.agents.includes("design-advisor"), `${a} must include design-advisor`);
  }
});

test("design-advisor is NOT included for non-UI (backend/infra/library) archetypes", () => {
  for (const a of ["cli-tool", "library", "infra", "data-platform", "streaming", "iot-embedded"]) {
    const flow = compileFlow(a, "medium", mkDetection(), [], "high");
    assert.ok(!flow.agents.includes("design-advisor"), `${a} must NOT include design-advisor`);
  }
});
