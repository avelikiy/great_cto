// `adapt` and `install` are two doors into the same question — what does
// great_cto do on Codex — and for a while they gave different answers.
//
// `codex.ts` had been corrected against a real codex-cli 0.153.4 and says
// plainly that hooks, slash commands and role agents do not carry over.
// `adapt.ts` had not: it still wrote `.codex/hooks.json`, set
// `[features] hooks = true`, pointed at `~/.codex/skills/great_cto` (a path a
// working install does not have), described six role agents as the fleet with a
// comment claiming "full 57-agent routing", and told the user to "restart Codex
// to activate hooks and MCP server".
//
// Six tests covered that generator's output. All six passed. None of them asked
// whether anything read the file.
//
// So the two are tied together here: whatever `adapt` writes for Codex may not
// promise a capability `codexInstallPlan` lists as unsupported. One source of
// truth, checked, rather than two descriptions that agreed once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { codexInstallPlan } from '../dist/codex.js';
import { runAdapt } from '../dist/adapt.js';

const SRC = readFileSync(new URL('../src/adapt.ts', import.meta.url), 'utf8');

// Driven through the real entry point, reading a real PROJECT.md, so the test
// exercises the door a user actually opens.
async function adaptInto(cwd) {
  mkdirSync(path.join(cwd, '.great_cto'), { recursive: true });
  writeFileSync(path.join(cwd, '.great_cto/PROJECT.md'),
    '# Project\n\nprimary: web-fullstack\nai_tools: [codex]\ncompliance: []\n');
  const log = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    const code = await runAdapt({ cwd, dryRun: false });
    assert.equal(code, 0, 'adapt succeeded');
  } finally { console.log = log; }
  return lines.join('\n');
}

test('adapt writes no hooks file for Codex — nothing reads one', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'gc-adapt-'));
  await adaptInto(cwd);
  assert.equal(existsSync(path.join(cwd, '.codex/hooks.json')), false, 'no hooks.json is written');
  assert.ok(existsSync(path.join(cwd, '.codex/great_cto.toml')), 'the MCP fragment is still written');
});

test('the fragment enables nothing Codex cannot run', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'gc-adapt-'));
  await adaptInto(cwd);
  const toml = readFileSync(path.join(cwd, '.codex/great_cto.toml'), 'utf8');

  // Each of these shipped, and each was false on a real install.
  assert.doesNotMatch(toml, /^\s*hooks\s*=\s*true/m, '[features] hooks = true turns on what a plugin cannot reach');
  assert.doesNotMatch(toml, /\.codex\/skills/, '~/.codex/skills is not a path Codex reads');
  assert.doesNotMatch(toml, /^\s*\[agents\./m, 'Codex routes none of our role agents');
  assert.doesNotMatch(toml, /\d+-agent routing/, 'a count that was already stale when written');

  // And the one section that does run is still there.
  assert.match(toml, /\[mcp_servers\.great_cto\]/);
});

test('the fragment states what does not come with it, from the install plan', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'gc-adapt-'));
  await adaptInto(cwd);
  const toml = readFileSync(path.join(cwd, '.codex/great_cto.toml'), 'utf8');
  const plan = codexInstallPlan({ repoDir: '/x', codexOnPath: true });
  assert.ok(plan.notSupported.length >= 3, 'the plan names what is missing');
  for (const line of plan.notSupported) {
    assert.ok(toml.includes(line),
      `the fragment must carry the install plan's own words, verbatim: ${line}`);
  }
});

test('and what it prints says so too', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'gc-adapt-'));
  const printed = await adaptInto(cwd);
  assert.doesNotMatch(printed, /activate hooks/i, 'the sentence that shipped');
  assert.match(printed, /do NOT carry over/, 'it says what is missing instead');
  assert.match(printed, /codex plugin marketplace add/, 'and points at the path that works');
});

test('adapt never tells the user that hooks are now active', () => {
  // The exact sentence that shipped: "Then restart Codex to activate hooks and
  // MCP server." A user who believed it thought secret-scan was guarding them.
  const branch = SRC.slice(SRC.indexOf('case "codex"'), SRC.indexOf('case "claude-code"'));
  assert.ok(branch.length > 100, 'found the branch');
  assert.doesNotMatch(branch, /activate hooks/i);
  assert.match(branch, /do NOT carry over/, 'it says so instead');
});

test('the removed generator stays removed', () => {
  assert.doesNotMatch(SRC, /export function getCodexHooksJson/,
    'a tested generator writing to a path nothing reads is worse than no generator');
  assert.match(SRC, /16430/, 'and the file records why, so it is not re-added from memory');
});
