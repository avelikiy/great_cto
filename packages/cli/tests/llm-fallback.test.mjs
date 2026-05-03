// Unit tests for the LLM fallback module — no real network calls.
//
// Run: npm run build && node --test tests/llm-fallback.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldUseLlmFallback,
  buildPrompt,
  parseLlmResponse,
} from "../dist/llm-fallback.js";

// ── shouldUseLlmFallback ─────────────────────────────────────────────────

test("shouldUseLlmFallback: no API key → skip", () => {
  const orig = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = shouldUseLlmFallback({ heuristicConfidence: "low", forceUse: false, forceSkip: false });
    assert.equal(r.use, false);
    assert.match(r.reason, /no ANTHROPIC_API_KEY/);
  } finally {
    if (orig) process.env.ANTHROPIC_API_KEY = orig;
  }
});

test("shouldUseLlmFallback: --no-llm flag → skip even with key", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  try {
    const r = shouldUseLlmFallback({ heuristicConfidence: "low", forceUse: false, forceSkip: true });
    assert.equal(r.use, false);
    assert.match(r.reason, /--no-llm/);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test("shouldUseLlmFallback: GREATCTO_NO_LLM=1 → skip", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.GREATCTO_NO_LLM = "1";
  try {
    const r = shouldUseLlmFallback({ heuristicConfidence: "low", forceUse: false, forceSkip: false });
    assert.equal(r.use, false);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GREATCTO_NO_LLM;
  }
});

test("shouldUseLlmFallback: low confidence + key → use", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  try {
    const r = shouldUseLlmFallback({ heuristicConfidence: "low", forceUse: false, forceSkip: false });
    assert.equal(r.use, true);
    assert.match(r.reason, /low heuristic/);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test("shouldUseLlmFallback: high confidence → skip (unless --use-llm)", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  try {
    const r1 = shouldUseLlmFallback({ heuristicConfidence: "high", forceUse: false, forceSkip: false });
    assert.equal(r1.use, false);
    const r2 = shouldUseLlmFallback({ heuristicConfidence: "high", forceUse: true, forceSkip: false });
    assert.equal(r2.use, true);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

// ── buildPrompt ──────────────────────────────────────────────────────────

test("buildPrompt: includes stack and README excerpt", () => {
  const p = buildPrompt({
    readme: "# My App\nA banking app for ACH transfers.",
    stack: ["nodejs", "express", "plaid"],
    readmeKeywords: ["fintech"],
  });
  assert.ok(p.includes("nodejs, express, plaid"));
  assert.ok(p.includes("My App"));
  assert.ok(p.includes("fintech"));
  assert.ok(p.includes("agent-product"));   // archetype list
  assert.ok(p.includes("JSON object"));     // schema instruction
});

test("buildPrompt: truncates README to 2KB", () => {
  const big = "x".repeat(10_000);
  const p = buildPrompt({ readme: big, stack: [], readmeKeywords: [] });
  // Output should not contain the full 10k payload
  assert.ok(p.length < 6000);
});

test("buildPrompt: handles empty stack/readme", () => {
  const p = buildPrompt({ readme: "", stack: [], readmeKeywords: [] });
  assert.ok(p.includes("(no detected stack)"));
  assert.ok(p.includes("(no README)"));
});

// ── parseLlmResponse ─────────────────────────────────────────────────────

test("parseLlmResponse: clean JSON → ok", () => {
  const r = parseLlmResponse(`{"archetype":"fintech","confidence":"high","rationale":"Plaid integration"}`);
  assert.ok(r);
  assert.equal(r.archetype, "fintech");
  assert.equal(r.confidence, "high");
  assert.equal(r.rationale, "Plaid integration");
});

test("parseLlmResponse: strips markdown code fences", () => {
  const r = parseLlmResponse('```json\n{"archetype":"library","confidence":"medium","rationale":"npm package"}\n```');
  assert.ok(r);
  assert.equal(r.archetype, "library");
});

test("parseLlmResponse: invalid archetype → null", () => {
  const r = parseLlmResponse(`{"archetype":"super-app","confidence":"high","rationale":"x"}`);
  assert.equal(r, null);
});

test("parseLlmResponse: invalid confidence → null", () => {
  const r = parseLlmResponse(`{"archetype":"library","confidence":"definitely","rationale":"x"}`);
  assert.equal(r, null);
});

test("parseLlmResponse: missing field → null", () => {
  const r = parseLlmResponse(`{"archetype":"library","confidence":"high"}`);
  assert.equal(r, null);
});

test("parseLlmResponse: malformed JSON → null", () => {
  assert.equal(parseLlmResponse("not json"), null);
  assert.equal(parseLlmResponse(""), null);
  assert.equal(parseLlmResponse("{ invalid"), null);
});

test("parseLlmResponse: caps rationale at 200 chars", () => {
  const long = "x".repeat(500);
  const r = parseLlmResponse(`{"archetype":"library","confidence":"high","rationale":"${long}"}`);
  assert.ok(r);
  assert.ok(r.rationale.length <= 200);
});
