// Tests for telemetry.ts — opt-IN client, fire-and-forget POST.
//
// These tests:
//   - verify default state is OPT-OUT
//   - verify all opt-out signals (DO_NOT_TRACK, GREAT_CTO_TELEMETRY=off, CI flags)
//   - verify dryrun mode logs canonical event JSON to stderr
//   - verify schema validation (drops unknown commands/archetypes)
//   - never make real network requests

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const realHome = homedir();
const ENV_KEYS = [
  "DO_NOT_TRACK", "GREAT_CTO_TELEMETRY", "GREAT_CTO_DISABLE_TELEMETRY",
  "GREATCTO_NO_TELEMETRY", "GREAT_CTO_TELEMETRY_DRYRUN", "GREAT_CTO_TELEMETRY_ENDPOINT",
  "CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "BUILDKITE", "JENKINS_URL", "TF_BUILD",
];

function mkHome() {
  const dir = mkdtempSync(join(tmpdir(), "gcto-telemetry-"));
  mkdirSync(join(dir, ".great_cto"), { recursive: true });
  return dir;
}

async function withClean(fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  const savedHome = process.env.HOME;
  process.env.HOME = mkHome();
  try { return await fn(); }
  finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    process.env.HOME = savedHome;
  }
}

// Re-import telemetry module fresh so it sees current env (HOME).
async function loadTelemetry() {
  // Bust import cache via query string:
  const mod = await import(`../dist/telemetry.js?ts=${Date.now()}`);
  return mod;
}

test("default is OPT-OUT (no env, no config)", async () => {
  await withClean(async () => {
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), false, "expected disabled by default");
  });
});

test("opt-in via env var GREAT_CTO_TELEMETRY=on", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), true);
  });
});

test("opt-in via config file", async () => {
  await withClean(async () => {
    writeFileSync(join(process.env.HOME, ".great_cto", "telemetry.json"), '{"enabled":true}');
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), true);
  });
});

test("DO_NOT_TRACK=1 overrides everything", async () => {
  await withClean(async () => {
    writeFileSync(join(process.env.HOME, ".great_cto", "telemetry.json"), '{"enabled":true}');
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.DO_NOT_TRACK = "1";
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), false, "DO_NOT_TRACK must win");
  });
});

test("CI environment auto-disables", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GITHUB_ACTIONS = "true";
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), false, "CI must disable telemetry");
  });
});

test("legacy GREATCTO_NO_TELEMETRY=1 still disables", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GREATCTO_NO_TELEMETRY = "1";
    const t = await loadTelemetry();
    assert.equal(t.isTelemetryEnabled(), false);
  });
});

test("anon_id is 8 hex chars and stable per call", async () => {
  await withClean(async () => {
    const t = await loadTelemetry();
    const id1 = t.computeAnonId();
    const id2 = t.computeAnonId();
    assert.match(id1, /^[0-9a-f]{8}$/, `anon_id format: ${id1}`);
    assert.equal(id1, id2, "anon_id must be deterministic");
  });
});

test("dryrun mode logs canonical event without network call", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = "1";
    const t = await loadTelemetry();

    // Capture stderr.
    const chunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
      await t.sendUsagePing({ cliVersion: "2.7.0", subcommand: "scan", exitCode: 0, durationMs: 12 });
    } finally { process.stderr.write = origWrite; }

    const out = chunks.join("");
    assert.ok(out.includes("[telemetry] would-send:"), `expected dryrun log, got: ${out}`);
    assert.ok(out.includes('"command":"scan"'));
    assert.ok(out.includes('"version":"2.7.0"'));
    assert.ok(/"anon_id":"[0-9a-f]{8}"/.test(out), "must contain anon_id");
  });
});

test("schema validation drops unknown commands", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = "1";
    const t = await loadTelemetry();
    const chunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
      await t.sendUsagePing({ cliVersion: "2.7.0", subcommand: "rm-rf-/", exitCode: 0 });
    } finally { process.stderr.write = origWrite; }
    assert.equal(chunks.join(""), "", "unknown command must produce no event");
  });
});

test("schema validation buckets unknown archetype as 'unknown'", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = "1";
    const t = await loadTelemetry();
    const chunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
      await t.sendInstallPing({ cliVersion: "2.7.0", archetype: "evil-archetype-with-/path", consent: true });
    } finally { process.stderr.write = origWrite; }
    assert.ok(chunks.join("").includes('"archetype":"unknown"'),
      `expected archetype bucketed to 'unknown', got: ${chunks.join("")}`);
  });
});

test("event payload contains no extra/unknown fields", async () => {
  await withClean(async () => {
    process.env.GREAT_CTO_TELEMETRY = "on";
    process.env.GREAT_CTO_TELEMETRY_DRYRUN = "1";
    const t = await loadTelemetry();
    const chunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
      await t.sendUsagePing({ cliVersion: "2.7.0", subcommand: "scan", exitCode: 0, durationMs: 5 });
    } finally { process.stderr.write = origWrite; }
    const m = chunks.join("").match(/would-send:\s*(\{.*\})/);
    assert.ok(m, "expected JSON in dryrun log");
    const payload = JSON.parse(m[1]);
    const allowed = new Set(["ts","version","command","archetype","node","os","exit_code","duration_ms","anon_id"]);
    for (const k of Object.keys(payload)) {
      assert.ok(allowed.has(k), `unexpected field '${k}' in payload — possible PII leak`);
    }
  });
});
