import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexExec } from '../../scripts/lib/codex-exec.mjs';

function fixture(t, body) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-codex-observations-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'fixture.mjs');
  writeFileSync(bin, '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end", () => {\n' + body + '\n});'); chmodSync(bin, 0o700);
  return { cwd: root, bin, prompt: 'Read-only fixture', timeoutMs: 10000 };
}
const answer = { type: 'item.completed', item: { type: 'agent_message', text: 'PASS' } };

test('final unterminated event is observed without changing final text', async t => {
  const events = [];
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write(${JSON.stringify(JSON.stringify(answer))});`), onEvent: ev => events.push(ev) });
  assert.equal(result.state, 'ok'); assert.equal(result.finalText, 'PASS'); assert.equal(events.length, 1);
  assert.equal(result.observationHealth, 'ok');
});

test('malformed JSON-looking lines and listener errors degrade observation only', async t => {
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write('{broken\\n' + ${JSON.stringify(JSON.stringify(answer))} + '\\n');`), onEvent: () => { throw Error('observer failed'); } });
  assert.equal(result.state, 'ok'); assert.equal(result.finalText, 'PASS'); assert.equal(result.observationHealth, 'degraded');
});

test('human-readable CLI noise is not reported as corrupt structured observation', async t => {
  const events = [];
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write('CLI informational line\\n' + ${JSON.stringify(JSON.stringify(answer))} + '\\n');`), onEvent: ev => events.push(ev) });
  assert.equal(result.observationHealth, 'ok'); assert.equal(events.length, 1); assert.equal(result.finalText, 'PASS');
});

test('oversized observation recovers at the next newline', async t => {
  const events = [];
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write(JSON.stringify({type:'item.completed',item:{text:'x'.repeat(1024*1024+20)}})+'\\n'); process.stdout.write(${JSON.stringify(JSON.stringify(answer))}+'\\n');`), onEvent: ev => events.push(ev) });
  assert.equal(result.observationHealth, 'degraded'); assert.equal(result.state, 'ok'); assert.equal(events.length, 1);
});

test('oversize final message remains available to the independent execution parser', async t => {
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'x'.repeat(1024*1024+20)}}));`), onEvent: () => {} });
  assert.equal(result.state, 'ok'); assert.equal(result.finalText.length, 1024 * 1024 + 20); assert.equal(result.observationHealth, 'degraded');
});

test('UTF8 split between stdout writes remains intact for observer and final parse', async t => {
  const events = [];
  const result = await runCodexExec({ ...fixture(t, `const bytes=Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'🙂'}})); const split=bytes.indexOf(Buffer.from('🙂'))+1; process.stdout.write(bytes.subarray(0,split),()=>process.stdout.end(bytes.subarray(split)));`), onEvent: ev => events.push(ev) });
  assert.equal(result.finalText, '🙂'); assert.equal(events[0].item.text, '🙂'); assert.equal(result.observationHealth, 'ok');
});

test('observer mode preserves sandbox ephemeral model and stdin flags', async t => {
  const options = fixture(t, `process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(process.argv.slice(2))}}));`);
  const result = await runCodexExec({ ...options, model: 'fixture-model', onEvent: () => {} });
  const args = JSON.parse(result.finalText);
  assert.equal(args[0], 'exec'); assert(args.includes('--json')); assert(args.includes('--ephemeral'));
  assert.equal(args[args.indexOf('-s')+1], 'read-only'); assert.equal(args[args.indexOf('-m')+1], 'fixture-model'); assert.equal(args.at(-1), '-');
});

test('a blocking final observer cannot accept a response after the absolute deadline', async t => {
  const result = await runCodexExec({ ...fixture(t, `process.stdout.write(${JSON.stringify(JSON.stringify(answer))});`), timeoutMs: 500, onEvent: () => {
    const end = performance.now() + 650; while (performance.now() < end) { /* simulate synchronous storage stall */ }
  } });
  assert.equal(result.timedOut, true); assert.equal(result.state, 'unreadable');
  assert.equal(result.text, null); assert.equal(result.finalText, null);
});
