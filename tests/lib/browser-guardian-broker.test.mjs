import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {startBrowserGuardianProbe} from '../../scripts/lib/browser-guardian-broker.mjs';
import {boardAccessibilityBenchmarkFixture} from '../../scripts/lib/board-accessibility-benchmark-fixture.mjs';

// Test-only fault seams in this isolated Node test process. Real fork, real
// resource owner, real Chromium and filesystem; no fabricated OS verdicts.
for(const phase of ['readiness','completion'])test('broker rejects changed resources before '+phase,{timeout:20000},async t=>{
 if(!['darwin','linux'].includes(process.platform)||!boardAccessibilityBenchmarkFixture().oracle.browser)return t.skip('real browser broker transition NOT CHECKED');
 const originalFork=cp.fork,originalOpen=fs.opendirSync,env={LANG:'C',TZ:'UTC'};
 let broker,root,rootIdentity,scorer,scorerClosed,owned=new Map(),injected=false,enumerations=0;
 const events=[];let resolveEnd;const end=new Promise(r=>resolveEnd=r);
 const table=()=>{const r=cp.spawnSync('/bin/ps',['-axo','pid=,ppid=,uid=,stat=,lstart='],{env,encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1048576});
  assert.equal(r.status,0);const map=new Map();for(const line of r.stdout.split('\n')){const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);if(m)map.set(Number(m[1]),{parent:Number(m[2]),uid:Number(m[3]),state:m[4],birth:m[5]});}return map;};
 const capture=()=>{const rows=table();assert.equal(rows.get(scorer.pid)?.parent,process.pid);
  owned.set(scorer.pid,rows.get(scorer.pid));
  for(let changed=true;changed;){changed=false;for(const [pid,p]of rows)if(!owned.has(pid)&&owned.has(p.parent)){assert.equal(p.uid,process.getuid());owned.set(pid,p);changed=true;}}
  assert.ok(owned.size>2,'actual live scorer/browser tree must be captured before mutation');
 };
 const inject=()=>{assert.equal(injected,false);injected=true;fs.mkdirSync(join(root,'unknown-'+phase),{mode:0o700});};
 cp.fork=function(...args){const child=originalFork(...args);scorer=child;
  scorerClosed=new Promise(r=>child.once('exit',r));
  if(phase==='completion')child.prependListener('message',raw=>{if(typeof raw==='string'&&JSON.parse(raw).kind==='done')inject();});
  return child;};
 fs.opendirSync=function(path,...args){
  // First enumeration registers the real directory set. Second enumeration
  // is readiness re-observation, after registration and before ready emission.
  if(phase==='readiness'&&root===path&&++enumerations===2){capture();inject();}
  return originalOpen(path,...args);
 };
 syncBuiltinESMExports();let timer;
 const live=()=>{const rows=table();return [...owned].filter(([pid,p])=>{const q=rows.get(pid);return q?.birth===p.birth&&q.uid===p.uid&&!q.state.startsWith('Z');});};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const gone=async()=>{for(let i=0;i<60;i++){if(!live().length)return true;await pause(50);}return false;};
 try{
  broker=startBrowserGuardianProbe('normal',event=>{
   events.push(event);
   if(event.kind==='probe-ready'){assert.equal(phase,'completion');capture();broker.continue();}
   if(event.kind==='probe-ended')resolveEnd(event);
  });
  root=broker.privateResources().root;rootIdentity=fs.lstatSync(root);
  const result=await Promise.race([end,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('broker refusal did not terminate')),10000))]);
  clearTimeout(timer);assert.equal(injected,true);assert.ok(events.some(e=>e.kind==='probe-unavailable'));
  assert.equal(events.filter(e=>e.kind==='probe-ready').length,phase==='completion'?1:0);
  assert.equal(result.probeAdmitted,null,'invalid resource scope cannot emit an admitted completion');
  assert.equal(result.snapshot.state,'PRESERVED');assert.equal(result.cleanupAuthorized,false);assert.equal(result.benchmarkEligible,false);
  assert.ok(await gone(),'owned scorer/browser stop before fallback, not by test assistance');
  assert.ok(fs.lstatSync(join(root,'unknown-'+phase)).isDirectory(),'broker preserves unknown entry');
  assert.equal(fs.lstatSync(root).ino,rootIdentity.ino);assert.equal(broker.observe().state,'PRESERVED');
 }finally{
  clearTimeout(timer);cp.fork=originalFork;fs.opendirSync=originalOpen;syncBuiltinESMExports();
  broker?.disconnect();
  if(scorer&&scorer.exitCode===null&&scorer.signalCode===null)scorer.kill('SIGKILL');
  if(scorerClosed)await scorerClosed;
  for(const [pid]of live().reverse())try{process.kill(pid,'SIGKILL');}catch{}
  if(root&&rootIdentity&&owned.size&&await gone()){
   const current=fs.lstatSync(root);assert.ok(current.isDirectory()&&!current.isSymbolicLink());assert.equal(current.ino,rootIdentity.ino);assert.equal(current.dev,rootIdentity.dev);assert.equal(current.uid,process.getuid());
   fs.rmSync(root,{recursive:true,force:true});
  }
 }
});
