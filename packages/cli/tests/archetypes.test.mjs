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
    codeStructure: {
      hasRoutesDir: false,
      hasCliEntry: false,
      hasPublicHtml: false,
      hasServerEntry: false,
      hasMonorepo: false,
    },
    scripts: { hasStart: false, hasDev: false, hasBuild: false, hasPublish: false },
    projectSize: "nano",
    readmeKeywords: [],
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

test("MCP SDK → agent-product (MCP is an agent protocol, not just AI wrapper)", () => {
  const pick = pickArchetype(mkDetection(["mcp", "nodejs", "typescript"]));
  assert.equal(pick.primary, "agent-product");
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

// ── Wave 1: code structure + scripts ───────────────────────────────────────

test("Express + routes/ dir → web-service (not library) even if 'library' in stack", () => {
  const pick = pickArchetype(mkDetection(["express", "nodejs", "library"], {
    codeStructure: { hasRoutesDir: true, hasCliEntry: false, hasPublicHtml: false, hasServerEntry: true, hasMonorepo: false },
    scripts: { hasStart: true, hasDev: true, hasBuild: false, hasPublish: false },
  }));
  assert.equal(pick.primary, "web-service");
});

test("plain nodejs + bin entry → cli-tool", () => {
  const pick = pickArchetype(mkDetection(["nodejs", "cli", "library"], {
    codeStructure: { hasRoutesDir: false, hasCliEntry: true, hasPublicHtml: false, hasServerEntry: false, hasMonorepo: false },
  }));
  assert.equal(pick.primary, "cli-tool");
});

test("library wins when no web-service shape and explicit library marker", () => {
  const pick = pickArchetype(mkDetection(["nodejs", "library"], {
    codeStructure: { hasRoutesDir: false, hasCliEntry: false, hasPublicHtml: false, hasServerEntry: false, hasMonorepo: false },
  }));
  assert.equal(pick.primary, "library");
});

// ── Wave 2: agent-product, fintech, healthcare ─────────────────────────────

test("LangChain + Pinecone → agent-product (RAG-style)", () => {
  const pick = pickArchetype(mkDetection(["langchain", "pinecone", "openai-sdk", "nodejs"]));
  assert.equal(pick.primary, "agent-product");
  assert.ok(pick.confidence === "high" || pick.confidence === "medium");
});

test("LangGraph alone → agent-product", () => {
  const pick = pickArchetype(mkDetection(["langgraph", "nodejs"]));
  assert.equal(pick.primary, "agent-product");
});

test("CrewAI → agent-product", () => {
  const pick = pickArchetype(mkDetection(["crewai", "python"]));
  assert.equal(pick.primary, "agent-product");
});

test("Anthropic SDK alone (no vector DB, no agent FW) → ai-system", () => {
  const pick = pickArchetype(mkDetection(["anthropic-sdk", "nodejs"]));
  assert.equal(pick.primary, "ai-system");
});

test("Plaid → fintech (not commerce)", () => {
  const pick = pickArchetype(mkDetection(["plaid", "nodejs", "express"]));
  assert.equal(pick.primary, "fintech");
});

test("FHIR → healthcare", () => {
  const pick = pickArchetype(mkDetection(["fhir", "nodejs"]));
  assert.equal(pick.primary, "healthcare");
});

test("HL7 → healthcare", () => {
  const pick = pickArchetype(mkDetection(["hl7", "python"]));
  assert.equal(pick.primary, "healthcare");
});

// ── Compliance: new archetypes ─────────────────────────────────────────────

test("fintech archetype → pci-dss + sox + kyc-aml", () => {
  const comp = suggestCompliance(mkDetection(["plaid"]), "fintech");
  assert.ok(comp.includes("pci-dss"));
  assert.ok(comp.includes("sox"));
  assert.ok(comp.includes("kyc-aml"));
});

test("healthcare archetype → hipaa + hitech", () => {
  const comp = suggestCompliance(mkDetection(["fhir"]), "healthcare");
  assert.ok(comp.includes("hipaa"));
  assert.ok(comp.includes("hitech"));
});

test("agent-product → eu-ai-act + owasp-llm", () => {
  const comp = suggestCompliance(mkDetection(["langgraph"]), "agent-product");
  assert.ok(comp.includes("eu-ai-act"));
  assert.ok(comp.includes("owasp-llm-top-10"));
});

test("Plaid in stack forces kyc-aml + sox even on web-service archetype", () => {
  const comp = suggestCompliance(mkDetection(["plaid"]), "web-service");
  assert.ok(comp.includes("kyc-aml"));
  assert.ok(comp.includes("sox"));
});

test("FHIR in stack forces hipaa even outside healthcare archetype", () => {
  const comp = suggestCompliance(mkDetection(["fhir"]), "web-service");
  assert.ok(comp.includes("hipaa"));
});

// ── Tie-break priority ─────────────────────────────────────────────────────

test("fintech beats commerce when both Stripe + Plaid present", () => {
  const pick = pickArchetype(mkDetection(["stripe", "plaid", "nodejs"]));
  assert.equal(pick.primary, "fintech");
});

test("agent-product beats ai-system on tied score", () => {
  // forge a tie scenario: low scores but agent-product priority higher
  const pick = pickArchetype(mkDetection(["mcp", "anthropic-sdk", "nodejs"]));
  assert.equal(pick.primary, "agent-product");
});
