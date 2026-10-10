import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,chmodSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexExec } from '../../scripts/lib/codex-exec.mjs';
import { runClaudeExec } from '../../scripts/lib/claude-exec.mjs';

function fixture(t,script){
 const root=mkdtempSync(join(tmpdir(),'exec-stdin-lifecycle-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const bin=join(root,'fake-cli');writeFileSync(bin,'#!/bin/sh\n'+script+'\n');chmodSync(bin,0o700);return {root,bin};
}
const answers={codex:'{"type":"item.completed","item":{"type":"agent_message","text":"PASS"}}',
 claude:'{"type":"result","result":"PASS"}'};
for(const [host,run]of [['codex',runCodexExec],['claude',runClaudeExec]]){
 test(`${host} closed stdin rejects a valid-looking answer without crashing`,{skip:process.platform==='win32'},async t=>{
  const f=fixture(t,"exec 0<&-\nprintf '%s\\n' '"+answers[host]+"'\nsleep 0.1\nexit 0"),marker='private prompt marker';
  const result=await run({prompt:marker+'x'.repeat(4*1024*1024),cwd:f.root,bin:f.bin,timeoutMs:5000});
  assert.equal(result.state,'unreadable');assert.equal(result.finalText,null);assert.equal(result.text,null);
  assert.ok(result.errors.some(e=>/prompt transport failed: (EPIPE|ECONNRESET)/.test(e)));
  assert.equal(result.timedOut,false);assert.ok(!JSON.stringify(result).includes(marker));
 });
 test(`${host} immediate failure resolves unreadable through real process close`,{skip:process.platform==='win32'},async t=>{
  const f=fixture(t,'exit 1');
  for(let i=0;i<5;i++){
   const result=await run({prompt:'x'.repeat(1024*1024),cwd:f.root,bin:f.bin,timeoutMs:5000});
   assert.equal(result.state,'unreadable');assert.equal(result.text??null,null);assert.equal(result.timedOut,false);
   assert.ok(result.code===1||result.code===null); // group may be aborted on EPIPE
  }
 });
 test(`${host} missing executable with large stdin is a launch failure, not an uncaught EPIPE`,async t=>{
  const f=fixture(t,'exit 1');
  const result=await run({prompt:'x'.repeat(1024*1024),cwd:f.root,bin:join(f.root,'absent'),timeoutMs:5000});
  assert.equal(result.state,'unreadable');assert.equal(result.code,null);assert.ok(result.errors.length>0);
 });
 test(`${host} fully consumed large stdin preserves successful result`,{skip:process.platform==='win32'},async t=>{
  const f=fixture(t,"cat >/dev/null\nprintf '%s\\n' '"+answers[host]+"'");
  const result=await run({prompt:'x'.repeat(1024*1024),cwd:f.root,bin:f.bin,timeoutMs:5000});
  assert.equal(result.state,'ok');assert.equal(result.code,0);assert.equal(result.finalText,'PASS');
  assert.ok(!result.errors.some(e=>e.includes('prompt transport failed')));
 });
}
