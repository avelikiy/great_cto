#!/usr/bin/env node
// Offline fixture transport only. Never invokes a model, service or real journal.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const host = basename(process.argv[1]).startsWith('claude') ? 'claude-code' : 'codex';
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(`${host} synthetic 0.0.0`); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({loggedIn: true, authMethod: 'synthetic-only'})); process.exit(0); }
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
const scenario = JSON.parse(readFileSync(process.env.SHIP_FIXTURE_SCENARIO, 'utf8'));
const verifier = prompt.includes('You are an independent verifier for the ');
const role = verifier ? prompt.match(/independent verifier for the ([a-z-]+) stage/)?.[1]
  : prompt.match(/You are the ([a-z-]+) specialist/)?.[1] || prompt.match(/Stage: ([a-z-]+)/)?.[1] || prompt.match(/You are ([a-z-]+)/)?.[1]
    || ['qa-engineer', 'security-officer', 'code-reviewer'].find(value => prompt.includes(value)) || 'unknown';
const cwd = process.cwd();
appendFileSync(process.env.SHIP_FIXTURE_CALLS, JSON.stringify({host, kind: verifier ? 'verifier' : 'worker', role, pid: process.pid, cwd, args}) + '\n');
if (scenario.transportFailure === (verifier ? 'verifier' : 'worker')) {
  console.error('synthetic transport failure'); process.exit(7);
}
if (scenario.inspectArtifacts !== false && verifier) {
  for (const relative of [`docs/${role}.md`, 'src/app.mjs']) if (!existsSync(join(cwd, relative))) {console.error('synthetic verifier missing committed artifact'); process.exit(8);}
}
if (scenario.sourceDriftAt === (verifier ? 'verifier' : 'worker')) writeFileSync(join(cwd, 'src/app.mjs'), 'export const value = "drift";\n');
let output;
if (verifier) {
  output = {state: scenario.verifierState || 'verified', findings: scenario.verifierState && scenario.verifierState !== 'verified' ? ['synthetic unresolved finding'] : [], checks: ['read actual committed src/app.mjs and named report']};
  const match = prompt.match(/Frozen parallel review snapshot: (.+)\n/);
  if (match) {try {const wave = JSON.parse(match[1]); if (wave?.id && wave.roles) output.workflowAttestation = {state: 'supported', waveId: wave.id, roles: wave.roles, checks: ['synthetic fixture makes no concurrency claims']};} catch { /* no parallel snapshot */ }}
} else {
  output = {verdict: scenario.workerVerdict || (role === 'security-officer' || role === 'code-reviewer' ? 'APPROVED' : 'PASS'),
    summary: 'Offline synthetic source review, authority NONE, publication NOT_CHECKED',
    meta: {report: scenario.missingArtifact ? 'docs/missing.md' : `docs/${role}.md`, ...scenario.meta},
    files: scenario.workerFiles || []};
}
if (host === 'claude-code') console.log(JSON.stringify({type: 'result', is_error: false, structured_output: output, result: JSON.stringify(output)}));
else console.log(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: JSON.stringify(output)}}));
