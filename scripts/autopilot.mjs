#!/usr/bin/env node
// scripts/autopilot.mjs — operate a durable autopilot run (Layer D).
//
//   autopilot.mjs start <vertical> [--live]      start a run; it pauses at the human gate
//   autopilot.mjs inbox                          list runs awaiting a human signature
//   autopilot.mjs show <runId>                   show a run + its audit trail
//   autopilot.mjs approve <runId> --by "<who>" [--note "..."]   sign the gate; run resumes + writes
//   autopilot.mjs reject  <runId> --by "<who>" [--note "..."]   reject; nothing irreversible runs
//   autopilot.mjs runs [--status <s>]            list all runs

import { startRun, approve, reject, getRun, listRuns, pendingGates } from './lib/run-store.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
function flag(name, def = undefined) { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; }

function fmtRun(r) {
  const out = [`run ${r.id}  ·  ${r.vertical}  ·  ${r.status}  (${r.mode})`];
  if (r.owner) out.push(`  accountable owner: ${r.owner}`);
  for (const s of r.steps) {
    if (s.gate) {
      const tag = s.status === 'approved' ? `✅ APPROVED${s.approvedBy ? ' · ' + s.approvedBy : ''}`
        : s.status === 'awaiting-human' ? '⏳ AWAITING SIGNATURE' : s.status;
      out.push(`  🧑‍⚖️ ${s.i + 1}. ${s.does}  → ${tag} (${s.gate})`);
      continue;
    }
    if (s.status === 'gated') { out.push(`  ⏸️ ${s.i + 1}. ${s.does}  [${s.agent}] · awaits approval (irreversible)`); continue; }
    if (s.status === 'blocked-unsafe') { out.push(`  ⛔ ${s.i + 1}. ${s.does}  [${s.agent}] · REFUSED`); continue; }
    const tools = (s.toolCalls || []).map((c) => `${c.connector}:${c.op}${c.ok ? '✓' : '✗'}${c.mode === 'live' ? '·live' : ''}`).join(' ');
    out.push(`  🤖 ${s.i + 1}. ${s.does}  [${s.agent}]${tools ? ' · ' + tools : ''}`);
  }
  if (r.status === 'awaiting-approval') out.push(`\n  → awaiting ${r.signer} to sign ${r.pausedAt}`);
  if (r.audit) out.push('\n  audit: ' + r.audit.map((a) => `${a.event}${a.by ? '(' + a.by + ')' : ''}`).join(' → '));
  return out.join('\n');
}

async function main() {
  if (cmd === 'start') {
    const v = argv[1];
    if (!v) { console.error('usage: autopilot.mjs start <vertical> [--live]'); process.exit(2); }
    const run = await startRun(v, { mode: argv.includes('--live') ? 'live' : 'stub' });
    console.log(fmtRun(run));
    console.log(`\nstarted ${run.id} — ${run.status}`);
  } else if (cmd === 'inbox') {
    const p = pendingGates();
    if (!p.length) { console.log('inbox empty — no runs awaiting a signature'); return; }
    console.log(`${p.length} run(s) awaiting a human signature:\n`);
    for (const g of p) console.log(`  ${g.id}  ·  ${g.vertical}  ·  ${g.gate}\n     ↳ ${g.signer} to sign: ${g.does}`);
  } else if (cmd === 'show') {
    const r = getRun(argv[1]);
    if (!r) { console.error(`run ${argv[1]} not found`); process.exit(1); }
    console.log(fmtRun(r));
  } else if (cmd === 'approve' || cmd === 'reject') {
    const id = argv[1]; const by = flag('by', 'unspecified'); const note = flag('note', '');
    if (!id) { console.error(`usage: autopilot.mjs ${cmd} <runId> --by "<who>" [--note "..."]`); process.exit(2); }
    const run = await (cmd === 'approve' ? approve(id, by, note) : reject(id, by, note));
    console.log(fmtRun(run));
    console.log(`\n${cmd}d ${id} by ${by} — now ${run.status}`);
  } else if (cmd === 'runs') {
    const runs = listRuns({ status: flag('status') });
    if (!runs.length) { console.log('no runs'); return; }
    for (const r of runs) console.log(`  ${r.id}  ·  ${r.vertical.padEnd(14)} ${r.status.padEnd(18)} ${r.createdAt}`);
  } else {
    console.error('usage: autopilot.mjs <start|inbox|show|approve|reject|runs> ...');
    process.exit(2);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
