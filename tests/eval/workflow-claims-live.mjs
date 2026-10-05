#!/usr/bin/env node
/** Read-only archived-report audit plus isolated real Claude rework. Never inherits approvals. */
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createFixtureBase } from './lib/mixed-host-fixture-store.mjs';

const sourceFile = process.argv[2], runtimeRoot = resolve(process.argv[3] || '.');
if (!sourceFile) throw Error('Usage: workflow-claims-live.mjs archived-run.json runtime-root');
const original = JSON.parse(readFileSync(sourceFile, 'utf8'));
const qa = original.attempts.find(a => a.role === 'qa-engineer' && a.workerCallId);
if (!qa) throw Error('Archived QA wave attempt missing');
const waveId = qa.workerCallId.slice(0, qa.workerCallId.lastIndexOf(':'));
const history = original.waveHistory.find(w => w.id === waveId);
if (!history || !history.roles.includes('qa-engineer')) throw Error('Frozen wave evidence missing');
const frozen = { id: waveId, roles: history.roles, hosts: history.hosts, receipt: qa.inputReceipt };
const { newRun, runStage, verifyStage } = await import(pathToFileURL(join(runtimeRoot, 'scripts/lib/codex-pipeline.mjs')));
const base = createFixtureBase(), root = join(base, 'project'), pluginRoot = join(base, 'policy');
mkdirSync(root); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
for (const name of ['src', 'tests']) cpSync(join(original.root, name), join(root, name), { recursive: true });
mkdirSync(join(root, 'docs'));
cpSync(join(original.root, 'docs'), join(root, 'docs'), { recursive: true, filter: path => !path.endsWith('/qa-report.md') });
const report = readFileSync(join(original.root, 'docs/qa-report.md'), 'utf8');
writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.qa-engineer]\non=["PASS"]\nproduces=["report"]\ngate="gate:qa"\nnext=[]\n');
execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'add', '.']);
execFileSync('git', ['-C', root, '-c', 'user.name=avelikiy', '-c', 'user.email=avelikiy@users.noreply.github.com', 'commit', '-qm', 'isolated report rework fixture']);
const state = newRun({ root, pluginRoot, entry: 'qa-engineer', allowed: ['docs'], maxAttempts: 3,
  hostRoutes: { 'qa-engineer': 'claude-code' }, prompt: 'Inspect src/add.mjs and tests/test.mjs. Produce docs/qa-report.md with meta.report. State only inspected facts, explicitly disclose no independent runtime test execution. Do not claim parallel security review or production acceptance. Fix any verifier findings. This is a report-only audit; do not modify implementation or operate gates.' });
const save = s => writeFileSync(join(base, 'audit-state.json'), JSON.stringify(s, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ base, runtimeRoot, historicalActorInjected: true }));
const proposal = { verdict: 'PASS', summary: 'Archived QA report replay for fresh verification; not a live worker result', meta: { report: 'docs/qa-report.md' }, files: [{ path: 'docs/qa-report.md', before: null, content: report }] };
// Only the initial historical actor response is injected. The verifier is real,
// and the retry uses the default real Claude runner and real Codex verifier.
await runStage(state, { runners: { 'claude-code': async () => ({ state: 'ok', code: 0, errors: [], finalText: JSON.stringify(proposal) }) },
  save, verify: (s, role, p, execute) => verifyStage({ ...s, wave: frozen, dispatchEvidence: original.dispatchEvidence,
    results: Object.fromEntries(Object.entries(original.results).filter(([r]) => ['product-owner', 'architect', 'pm', 'senior-dev', 'code-reviewer'].includes(r))) }, role, p, execute) });
assert.equal(state.attempts[0].verification.state, 'rework', 'real verifier must reject the historical unsupported workflow claim');
assert.equal(state.status, 'ready'); assert.equal(state.approvals.length, 0);
const rejection = state.attempts[0].verification;
while (state.status === 'ready' && state.attempts.length < 3) await runStage(state, { save });
save(state);
console.log(JSON.stringify({ status: state.status, reason: state.reason, rework: state.rework, attempts: state.attempts.map(a => ({ number: a.number, status: a.status, verification: a.verification })) }));
assert.equal(state.results['qa-engineer']?.verification.state, 'verified');
assert.equal(state.status, 'awaiting-gate'); assert.equal(state.approvals.length, 0);
assert.equal(state.pending.role, 'qa-engineer');
writeFileSync(join(base, 'audit-state.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ base, runtimeRoot, archivedRunUnchanged: true, historicalActorInjected: true,
  rejection, correctedHost: state.results['qa-engineer'].host, correctedVerification: state.results['qa-engineer'].verification,
  status: state.status, approvals: state.approvals.length, report: join(root, 'docs/qa-report.md') }, null, 2));
