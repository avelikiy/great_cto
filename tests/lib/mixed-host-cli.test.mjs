import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newRun } from '../../scripts/lib/codex-pipeline.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const CONTROLLER = join(REPO, 'scripts', 'codex-pipeline.mjs');
const hostSource = role => `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const role = ${JSON.stringify(role)};
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture-1'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'fixture' })); process.exit(0); }
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', async () => {
  const codex = role === 'security-officer';
  if (codex && prompt.includes('independent verifier')) {
    const text = JSON.stringify({ state: 'verified', findings: [], checks: ['fixture inspected actual report'] });
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }));
    process.exit(0);
  }
  const markers = process.env.MIXED_HOST_MARKERS;
  fs.writeFileSync(path.join(markers, role + '.started'), '1');
  const partner = path.join(markers, (codex ? 'qa-engineer' : 'security-officer') + '.started');
  const deadline = Date.now() + 6000;
  while (!fs.existsSync(partner) && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
  if (!fs.existsSync(partner)) { console.error('partner never started'); process.exit(3); }
  const report = 'docs/' + role + '.md';
  const proposal = JSON.stringify({ verdict: codex ? 'APPROVED' : 'PASS', summary: role + ' inspected',
    meta: { report }, files: [{ path: report, before: null, content: role + ' evidence\\n' }] });
  if (codex) console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: proposal } }));
  else console.log(JSON.stringify({ type: 'result', is_error: false, result: proposal, usage: { input_tokens: 1 } }));
});
`;

test('CLI executes both host subprocesses concurrently and clears their gates', t => {
  const base = mkdtempSync(join(tmpdir(), 'mixed-cli-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'), store = join(base, 'store'), markers = join(base, 'markers');
  mkdirSync(root); mkdirSync(store, { mode: 0o700 }); mkdirSync(markers);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-qm', 'fixture']);
  const claude = join(base, 'claude-fixture'), codex = join(base, 'codex-fixture');
  writeFileSync(claude, hostSource('qa-engineer')); writeFileSync(codex, hostSource('security-officer'));
  chmodSync(claude, 0o755); chmodSync(codex, 0o755);
  const state = newRun({ root, pluginRoot: REPO, prompt: 'Review this fixture', allowed: ['docs'],
    entry: 'qa-engineer', hostRoutes: { 'qa-engineer': 'claude-code', 'security-officer': 'codex' } });
  state.queue.push('security-officer');
  const file = join(store, `${state.id}.json`);
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  const env = { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store, GREAT_CTO_CODEX_BIN: codex,
    GREAT_CTO_CLAUDE_BIN: claude, MIXED_HOST_MARKERS: markers, GREAT_CTO_DISABLE_EVENTS: '1' };
  const call = (command, ...rest) => JSON.parse(execFileSync(process.execPath,
    [CONTROLLER, command, state.id, ...rest], { cwd: REPO, env, encoding: 'utf8', timeout: 30000 }));

  const first = call('resume');
  assert.equal(first.status, 'awaiting-gate');
  assert.ok(existsSync(join(markers, 'qa-engineer.started')));
  assert.ok(existsSync(join(markers, 'security-officer.started')));
  let saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.waveHistory[0].status, 'verified');
  assert.deepEqual([saved.results['qa-engineer'].host, saved.results['security-officer'].host], ['claude-code', 'codex']);
  assert.ok(saved.results['qa-engineer'].verification.state === 'verified');
  assert.ok(saved.results['security-officer'].verification.state === 'verified');
  assert.ok(existsSync(join(root, 'docs', 'qa-engineer.md')));
  assert.ok(existsSync(join(root, 'docs', 'security-officer.md')));
  const firstToken = saved.pending.token;
  assert.equal(call('approve', '--token', firstToken).status, 'awaiting-gate');
  saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.notEqual(saved.pending.token, firstToken);
  assert.equal(call('approve', '--token', saved.pending.token).status, 'ready');
  saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.approvals.length, 5); // QA+ship, security+compliance+ship.
  assert.deepEqual(saved.attempts.map(a => a.host), ['claude-code', 'codex']);
  assert.deepEqual(saved.queue, ['devops']); // The shared graph continues into release; this fixture stops before it.
});
