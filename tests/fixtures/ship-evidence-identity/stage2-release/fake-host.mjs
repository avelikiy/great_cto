#!/usr/bin/env node
// Four-role synthetic transport. Approval fixture only; no publication/model calls.
import {readFileSync, appendFileSync} from 'node:fs';
import {basename, join} from 'node:path';
const host = basename(process.argv[1]).startsWith('claude') ? 'claude-code' : 'codex';
if (process.argv.includes('--version')) {console.log(`${host} synthetic release fixture`); process.exit(0);}
if (process.argv[2] === 'auth') {console.log(JSON.stringify({loggedIn: true, authMethod: 'synthetic-only'})); process.exit(0);}
let prompt = ''; for await (const bytes of process.stdin) prompt += bytes;
const verifier = prompt.includes('You are an independent verifier for the ');
const role = verifier ? prompt.match(/independent verifier for the ([a-z-]+) stage/)?.[1] : prompt.match(/You are the ([a-z-]+) specialist/)?.[1] || prompt.match(/You are (senior-dev|code-reviewer|qa-engineer|security-officer)/)?.[1];
if (!role) {console.error('synthetic release fixture cannot identify role'); process.exit(4);}
for (const relative of ['src/app.mjs', `docs/${role}.md`]) if (!readFileSync(join(process.cwd(), relative), 'utf8').trim()) process.exit(5);
appendFileSync(process.env.SHIP_FIXTURE_CALLS, JSON.stringify({host, kind: verifier ? 'verifier' : 'worker', role, pid: process.pid}) + '\n');
const output = verifier ? {state: 'verified', findings: [], checks: ['actual committed source and named role report inspected by offline verifier process']}
  : {verdict: role === 'senior-dev' ? 'DONE' : role === 'qa-engineer' ? 'PASS' : 'APPROVED', summary: 'Synthetic local candidate review; authority NONE; publication NOT_CHECKED', meta: {report: `docs/${role}.md`}, files: []};
if (host === 'claude-code') console.log(JSON.stringify({type: 'result', is_error: false, structured_output: output, result: JSON.stringify(output)}));
else console.log(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: JSON.stringify(output)}}));
