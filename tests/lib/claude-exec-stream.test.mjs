import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClaudeExec } from '../../scripts/lib/claude-exec.mjs';

function fixture(t, body) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-claude-stream-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'fixture.mjs');
  writeFileSync(bin, '#!/usr/bin/env node\n' + body); chmodSync(bin, 0o700);
  return { cwd: root, bin, prompt: 'Read-only fixture', timeoutMs: 10000 };
}
const result = { type: 'result', is_error: false, result: '{"verdict":"PASS"}', usage: { input_tokens: 1 } };

test('stream observation adds only format/verbose flags and preserves final structured result', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => {\nfor (const ev of [{type:'system',subtype:'init'}, {type:'assistant',message:{content:[{type:'tool_use',id:'call',name:'Read'}]}}, ${JSON.stringify(result)}]) process.stdout.write(JSON.stringify(ev)+'\\n');\n});`);
  const events = [];
  const observed = await runClaudeExec({ ...options, onEvent: ev => events.push(ev) });
  assert.equal(observed.state, 'ok'); assert.equal(observed.finalText, result.result);
  assert.equal(events.length, 3); assert.equal(observed.observationHealth, 'ok');
});

test('stream selects last result and flushes final unterminated line', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(JSON.stringify({type:'result',is_error:false,result:'old'})+'\\n'); process.stdout.write(${JSON.stringify(JSON.stringify(result))}); });`);
  const events = [];
  const observed = await runClaudeExec({ ...options, onEvent: ev => events.push(ev) });
  assert.equal(observed.finalText, result.result); assert.equal(events.length, 2);
});

test('observer failures and malformed lines degrade observations without changing final verdict', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write('invalid-json\\n'); process.stdout.write(${JSON.stringify(JSON.stringify(result) + '\n')}); });`);
  const observed = await runClaudeExec({ ...options, onEvent: () => { throw Error('observer failed'); } });
  assert.equal(observed.state, 'ok'); assert.equal(observed.finalText, result.result);
  assert.equal(observed.observationHealth, 'degraded');
});

test('oversize observation is discarded through newline and later events still arrive', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(JSON.stringify({type:'assistant',message:'x'.repeat(1024*1024+20)})+'\\n'); process.stdout.write(${JSON.stringify(JSON.stringify(result) + '\n')}); });`);
  const events = [];
  const observed = await runClaudeExec({ ...options, onEvent: ev => events.push(ev) });
  assert.equal(observed.state, 'ok'); assert.equal(events.length, 1);
  assert.equal(observed.observationHealth, 'degraded');
});

test('default JSON mode keeps existing flags and does not request stream-json', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { const args = process.argv.slice(2); process.stdout.write(JSON.stringify({type:'result',is_error:false,result:JSON.stringify(args)})); });`);
  const normal = await runClaudeExec(options), args = JSON.parse(normal.finalText);
  assert.equal(args[args.indexOf('--output-format') + 1], 'json'); assert(!args.includes('--verbose'));
  for (const flag of ['--safe-mode','--restricted','--strict-mcp-config','--no-session-persistence','--json-schema']) assert(args.includes(flag));
  const streamed = await runClaudeExec({ ...options, onEvent: () => {} }), streamArgs = JSON.parse(streamed.finalText);
  assert.equal(streamArgs[streamArgs.indexOf('--output-format') + 1], 'stream-json'); assert(streamArgs.includes('--verbose'));
  for (const flag of ['--safe-mode','--restricted','--strict-mcp-config','--no-session-persistence','--json-schema']) assert(streamArgs.includes(flag));
});

test('observation cap does not truncate an oversized final execution result', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(JSON.stringify({type:'result',is_error:false,result:'x'.repeat(1024*1024+20)})); });`);
  const observed = await runClaudeExec({ ...options, onEvent: () => {} });
  assert.equal(observed.state, 'ok'); assert.equal(observed.finalText.length, 1024 * 1024 + 20);
  assert.equal(observed.observationHealth, 'degraded');
});

test('split UTF8 input is preserved in observer events and final text', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { const bytes = Buffer.from(JSON.stringify({type:'result',is_error:false,result:'🙂'})); const split = bytes.indexOf(Buffer.from('🙂')) + 1; process.stdout.write(bytes.subarray(0,split), () => process.stdout.end(bytes.subarray(split))); });`);
  const events = [];
  const observed = await runClaudeExec({ ...options, onEvent: ev => events.push(ev) });
  assert.equal(observed.finalText, '🙂'); assert.equal(events[0].result, '🙂');
  assert.equal(observed.observationHealth, 'ok');
});

test('a blocking final observer cannot accept Claude output after the absolute deadline', async t => {
  const options = fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(${JSON.stringify(JSON.stringify(result))}); });`);
  const observed = await runClaudeExec({ ...options, timeoutMs: 500, onEvent: () => {
    const end = performance.now() + 650; while (performance.now() < end) { /* simulate synchronous storage stall */ }
  } });
  assert.equal(observed.timedOut, true); assert.equal(observed.state, 'unreadable');
  assert.equal(observed.text, null); assert.equal(observed.finalText, null);
});
