// Tests for telemetry.ts — default endpoint must be the documented domain,
// never a personal-name workers.dev URL. Also covers env override behavior.
//
// HOME is redirected to a tmpdir before any module is imported so that
// telemetrySubcommand("on"/"off") writes to an isolated config file instead
// of the developer's real ~/.great_cto/telemetry.json.
//
// Run: npm run build && node --test tests/telemetry.test.mjs

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const fakeHome = mkdtempSync(join(tmpdir(), "gc-telemetry-home-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome; // Windows

const { telemetrySubcommand } = await import("../dist/telemetry.js");

test("default telemetry endpoint uses the documented greatcto.systems domain", () => {
  delete process.env.GREAT_CTO_TELEMETRY_ENDPOINT;
  const { output } = telemetrySubcommand("status");
  assert.match(output, /https:\/\/telemetry\.greatcto\.systems\/v1\/event/);
});

test("default telemetry endpoint never contains a personal author name", () => {
  delete process.env.GREAT_CTO_TELEMETRY_ENDPOINT;
  const { output } = telemetrySubcommand("status");
  assert.doesNotMatch(output, /alexander-velikiy/i);
  assert.doesNotMatch(output, /workers\.dev/);
});

test("telemetry on/off subcommands report the same non-personal endpoint", () => {
  delete process.env.GREAT_CTO_TELEMETRY_ENDPOINT;
  const on = telemetrySubcommand("on");
  assert.match(on.output, /https:\/\/telemetry\.greatcto\.systems\/v1\/event/);
  assert.doesNotMatch(on.output, /alexander-velikiy/i);
  telemetrySubcommand("off");
});
