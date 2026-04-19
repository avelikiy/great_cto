// Tests for detect.ts — stack detection from fixture directories.
//
// Run: npm run build && node --test tests/detect.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect } from "../dist/detect.js";

function makeFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "gcto-detect-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test("empty directory → no stack", () => {
  const dir = makeFixture({});
  try {
    const result = detect(dir);
    assert.equal(result.stack.length, 0);
    assert.equal(result.languages.length, 0);
    assert.equal(result.hasTests, false);
    assert.equal(result.hasCI, false);
  } finally {
    cleanup(dir);
  }
});

test("Next.js + Stripe detected as commerce-ready stack", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({
      dependencies: { next: "^14", stripe: "^14", react: "^18" },
    }),
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("next.js"));
    assert.ok(result.stack.includes("stripe"));
    assert.ok(result.stack.includes("react"));
    assert.ok(result.stack.includes("nodejs"));
    assert.ok(result.languages.includes("javascript"));
  } finally {
    cleanup(dir);
  }
});

test("TypeScript detected via tsconfig.json OR dep", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({ dependencies: {} }),
    "tsconfig.json": "{}",
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("typescript"));
    assert.ok(result.languages.includes("typescript"));
  } finally {
    cleanup(dir);
  }
});

test("Python + FastAPI detected", () => {
  const dir = makeFixture({
    "requirements.txt": "fastapi==0.110.0\nsqlalchemy==2.0.0\n",
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("python"));
    assert.ok(result.stack.includes("fastapi"));
    assert.ok(result.languages.includes("python"));
  } finally {
    cleanup(dir);
  }
});

test("Terraform project → infrastructure signals", () => {
  const dir = makeFixture({
    "main.tf": `resource "aws_s3_bucket" "logs" { bucket = "x" }`,
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("terraform"));
  } finally {
    cleanup(dir);
  }
});

test("Helm Chart.yaml → helm signal", () => {
  const dir = makeFixture({
    "Chart.yaml": "apiVersion: v2\nname: my-chart\n",
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("helm"));
  } finally {
    cleanup(dir);
  }
});

test("Solidity hardhat project → web3 signals", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({ dependencies: { hardhat: "^2" } }),
    "hardhat.config.ts": "export default {};",
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("solidity") || result.stack.includes("web3"));
  } finally {
    cleanup(dir);
  }
});

test("AI project via OpenAI SDK → ai-system signals", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({ dependencies: { openai: "^4" } }),
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("openai-sdk"));
  } finally {
    cleanup(dir);
  }
});

test("React Native project → mobile signals", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({
      dependencies: { "react-native": "0.73.0", expo: "^50" },
    }),
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("react-native"));
    assert.ok(result.stack.includes("expo"));
  } finally {
    cleanup(dir);
  }
});

test("Go module detected", () => {
  const dir = makeFixture({
    "go.mod": "module example.com/app\n\ngo 1.22\n",
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("go"));
    assert.ok(result.languages.includes("go"));
  } finally {
    cleanup(dir);
  }
});

test("Rust Cargo.toml detected", () => {
  const dir = makeFixture({
    "Cargo.toml": `[package]\nname = "x"\nversion = "0.1"\n`,
  });
  try {
    const result = detect(dir);
    assert.ok(result.stack.includes("rust"));
    assert.ok(result.languages.includes("rust"));
  } finally {
    cleanup(dir);
  }
});

test("packageManager detection: pnpm-lock.yaml", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({}),
    "pnpm-lock.yaml": "lockfileVersion: 9\n",
  });
  try {
    const result = detect(dir);
    assert.equal(result.packageManager, "pnpm");
  } finally {
    cleanup(dir);
  }
});

test("hasTests=true when jest in deps", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
  });
  try {
    const result = detect(dir);
    assert.equal(result.hasTests, true);
  } finally {
    cleanup(dir);
  }
});

test("hasCI=true when .github/workflows exists", () => {
  const dir = makeFixture({
    "package.json": JSON.stringify({}),
    ".github/workflows/test.yml": "name: test\n",
  });
  try {
    const result = detect(dir);
    assert.equal(result.hasCI, true);
  } finally {
    cleanup(dir);
  }
});

test("malformed package.json doesn't crash", () => {
  const dir = makeFixture({
    "package.json": "{ not valid json",
  });
  try {
    const result = detect(dir);
    // Still picks up nodejs from presence
    assert.ok(result.stack.includes("nodejs"));
  } finally {
    cleanup(dir);
  }
});
