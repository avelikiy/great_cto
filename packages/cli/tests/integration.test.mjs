// Integration tests — real-shaped project fixtures end-to-end (detect → pickArchetype).
//
// Each fixture is a tiny tmp dir with manifests/files mirroring real-world
// archetypes, validating the full detect.ts + archetypes.ts pipeline.
//
// Run: npm run build && node --test tests/integration.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect } from "../dist/detect.js";
import { pickArchetype, suggestCompliance } from "../dist/archetypes.js";

function fx(setup) {
  const dir = mkdtempSync(join(tmpdir(), "gcto-fx-"));
  setup(dir);
  return dir;
}
function clean(dir) { rmSync(dir, { recursive: true, force: true }); }

function detectAndPick(dir) {
  const d = detect(dir);
  const pick = pickArchetype(d);
  const comp = suggestCompliance(d, pick.primary);
  return { detection: d, pick, comp };
}

// ── Fixture 1: agent-product (LangGraph + vector DB) ──────────────────────
test("integration: agent-rag (LangGraph + Pinecone) → agent-product", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "agent-rag",
      dependencies: {
        "@langchain/langgraph": "^0.2",
        "@pinecone-database/pinecone": "^4",
        "@anthropic-ai/sdk": "^0.30",
      },
    }));
    writeFileSync(join(d, "README.md"), "# AgentRAG\nMulti-agent autonomous RAG.\n");
  });
  try {
    const { pick, comp } = detectAndPick(dir);
    assert.equal(pick.primary, "agent-product");
    assert.equal(pick.confidence, "high");
    assert.ok(comp.includes("eu-ai-act"));
    assert.ok(comp.includes("owasp-llm-top-10"));
  } finally { clean(dir); }
});

// ── Fixture 2: fintech (Plaid) ────────────────────────────────────────────
test("integration: fintech-app (Plaid + Express) → fintech (not commerce)", () => {
  const dir = fx((d) => {
    mkdirSync(join(d, "routes"));
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "fintech-app",
      main: "server.js",
      scripts: { start: "node server.js" },
      dependencies: { plaid: "^25", express: "^4" },
    }));
    writeFileSync(join(d, "server.js"), "// server\n");
  });
  try {
    const { pick, comp } = detectAndPick(dir);
    assert.equal(pick.primary, "fintech");
    assert.ok(comp.includes("kyc-aml"));
    assert.ok(comp.includes("sox"));
    assert.ok(comp.includes("pci-dss"));
  } finally { clean(dir); }
});

// ── Fixture 3: healthcare (FHIR) ──────────────────────────────────────────
test("integration: health-api (FHIR + Express) → healthcare", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "health-api",
      dependencies: { fhir: "^4", express: "^4" },
    }));
  });
  try {
    const { pick, comp } = detectAndPick(dir);
    assert.equal(pick.primary, "healthcare");
    assert.ok(comp.includes("hipaa"));
    assert.ok(comp.includes("hitech"));
  } finally { clean(dir); }
});

// ── Fixture 4: CLI tool ───────────────────────────────────────────────────
test("integration: my-cli (bin field) → cli-tool", () => {
  const dir = fx((d) => {
    mkdirSync(join(d, "bin"));
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "my-cli",
      bin: { "my-cli": "bin/cli.js" },
      main: "index.js",
    }));
  });
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "cli-tool");
    assert.equal(pick.confidence, "high");
  } finally { clean(dir); }
});

// ── Fixture 5: browser extension ──────────────────────────────────────────
test("integration: my-ext (manifest_version 3) → browser-extension", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "manifest.json"), JSON.stringify({ name: "my-ext", manifest_version: 3 }));
  });
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "browser-extension");
    assert.equal(pick.confidence, "high");
  } finally { clean(dir); }
});

// ── Fixture 6: library (publishConfig + files) ────────────────────────────
test("integration: my-lib (publishConfig public) → library", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "my-lib",
      main: "dist/index.js",
      exports: "./dist/index.js",
      publishConfig: { access: "public" },
      files: ["dist/"],
    }));
  });
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "library");
    assert.equal(pick.confidence, "high");
  } finally { clean(dir); }
});

// ── Fixture 7: web-service (Next.js) ──────────────────────────────────────
test("integration: next-app (Next.js + dev/build scripts) → web-service", () => {
  const dir = fx((d) => {
    mkdirSync(join(d, "pages"));
    mkdirSync(join(d, "app"));
    writeFileSync(join(d, "package.json"), JSON.stringify({
      name: "next-app",
      scripts: { dev: "next dev", build: "next build" },
      dependencies: { next: "^14", react: "^18" },
    }));
  });
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "web-service");
    assert.equal(pick.confidence, "high");
  } finally { clean(dir); }
});

// ── Fixture 8: data-platform (pandas + airflow) ───────────────────────────
test("integration: etl-pipeline (pandas + airflow) → data-platform", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "pyproject.toml"),
      `[project]
name = "etl-pipeline"
[tool.poetry.dependencies]
pandas = "^2"
airflow = "^2"
`);
  });
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "data-platform");
  } finally { clean(dir); }
});

// ── Fixture 9: web3 (Hardhat + Solidity) ──────────────────────────────────
test("integration: web3-defi (Hardhat) → web3", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "hardhat.config.js"), "module.exports = {};");
    writeFileSync(join(d, "Token.sol"), "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;");
  });
  try {
    const { pick, comp } = detectAndPick(dir);
    assert.equal(pick.primary, "web3");
    assert.ok(comp.includes("soc2"));
  } finally { clean(dir); }
});

// ── Fixture 10: pure greenfield ───────────────────────────────────────────
test("integration: empty dir → greenfield", () => {
  const dir = fx(() => {});
  try {
    const { pick } = detectAndPick(dir);
    assert.equal(pick.primary, "greenfield");
  } finally { clean(dir); }
});

// ── Fixture 11: project size estimate ─────────────────────────────────────
test("integration: project size — 5 files = nano", () => {
  const dir = fx((d) => {
    for (let i = 0; i < 5; i++) writeFileSync(join(d, `f${i}.js`), "// stub");
  });
  try {
    const { detection } = detectAndPick(dir);
    assert.equal(detection.projectSize, "nano");
  } finally { clean(dir); }
});

// ── Fixture 12: README mining ─────────────────────────────────────────────
test("integration: README hint 'fintech' propagates as readmeKeyword", () => {
  const dir = fx((d) => {
    writeFileSync(join(d, "README.md"), "# Bank App\nA fintech app for ACH transfers.\n");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "stub" }));
  });
  try {
    const { detection } = detectAndPick(dir);
    assert.ok(detection.readmeKeywords.includes("fintech"));
  } finally { clean(dir); }
});
