import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,getEventListeners} from 'node:events';
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createScorerReadyObserver,validateScorerReady,readFixtureProcessIdentity,terminateOwnedScorerFixture} from '../helpers/scorer-ready-observer.mjs';
const start='2026-10-26T10:32:49.429Z';
const diagnostic={pid:12345,timeoutMs:1000,startedAt:start,finishedAt:'2026-10-26T10:32:50.435Z'};
const marker={pid:12345,handlerReady:true,publishedAt:'2026-10-26T10:32:49.685Z'};

test('ready validation uses actual scorer window, independently of outer preflight duration',()=>{
 assert.deepEqual(validateScorerReady(marker,diagnostic,12345),marker);
});
for(const [name,change] of [
 ['wrong worker PID',{pid:12346}],
 ['after actual1000ms budget',{publishedAt:'2026-10-26T10:32:50.430Z'}],
 ['before actual process start',{publishedAt:'2026-10-26T10:32:49.428Z'}],
 ['malformed publication timestamp',{publishedAt:'not-a-time'}],
 ['handler not installed',{handlerReady:false}],
])test('ready validation rejects '+name,()=>assert.throws(()=>validateScorerReady({...marker,...change},diagnostic,12345)));

test('observer abort removes filesystem watcher, timers and event listeners',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scorer-observer-abort-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const child=Object.assign(new EventEmitter(),{pid:1234,exitCode:null,signalCode:null});const controller=new AbortController();
 const observer=createScorerReadyObserver({marker:join(root,'ready.json'),launcher:child,signal:controller.signal,processIdentity:()=>null});
 controller.abort();
 await assert.rejects(observer.completed,/aborted/);
 await assert.rejects(observer.ready,/aborted/);
 assert.equal(observer.snapshot().disposed,true);assert.equal(observer.snapshot().watcherClosed,true);assert.equal(observer.snapshot().timerActive,false);
 assert.equal(child.listenerCount('close'),0);assert.equal(child.listenerCount('error'),0);assert.equal(getEventListeners(controller.signal,'abort').length,0);
});

test('observer refuses marker whose live process does not belong to its launcher',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scorer-observer-owner-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const child=Object.assign(new EventEmitter(),{pid:1234,exitCode:null,signalCode:null});
 const observer=createScorerReadyObserver({marker:join(root,'ready.json'),launcher:child,processIdentity:pid=>({pid,ppid:9999,pgid:1234,birth:'fixed-birth'})});
 writeFileSync(join(root,'ready.json'),JSON.stringify(marker));observer.inspect();
 await assert.rejects(observer.completed,/belong/);assert.equal(observer.snapshot().disposed,true);
});

test('cleanup refuses a process group after its launcher creation identity changed',()=>{
 const calls=[],launcher={pid:1234},launcherIdentity={pid:1234,ppid:process.pid,pgid:1234,birth:'original-birth'};
 terminateOwnedScorerFixture({launcher,launcherIdentity,processIdentity:()=>({...launcherIdentity,birth:'reused-birth'}),kill:(...args)=>calls.push(args)});
 assert.deepEqual(calls,[],'a reused PID/group never grants cleanup authority');
});

test('cleanup never signals a closed launcher group even with a matching stale identity',()=>{
 const calls=[],launcher={pid:1234,exitCode:0,signalCode:null},launcherIdentity={pid:1234,ppid:process.pid,pgid:1234,birth:'original-birth'};
 terminateOwnedScorerFixture({launcher,launcherIdentity,processIdentity:()=>launcherIdentity,kill:(...args)=>calls.push(args)});
 assert.deepEqual(calls,[],'closed launcher handle cannot authorize a group signal');
});

test('an identified orphan scorer is signalled individually, never as a reused group',()=>{
 const calls=[],launcher={pid:1234},launcherIdentity={pid:1234,ppid:process.pid,pgid:1234,birth:'original-launcher'};
 const ready={identity:{pid:5678,ppid:1234,pgid:1234,birth:'owned-worker'}};
 terminateOwnedScorerFixture({launcher,launcherIdentity,ready,processIdentity:pid=>pid===1234?null:{...ready.identity,ppid:1},kill:(...args)=>calls.push(args)});
 assert.deepEqual(calls,[[5678,'SIGKILL']]);
});

test('observed readiness starts the unchanged2000ms watchdog and disposal clears it',{timeout:10000},async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scorer-observer-watchdog-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const child=Object.assign(new EventEmitter(),{pid:1234,exitCode:null,signalCode:null});
 const observer=createScorerReadyObserver({marker:join(root,'ready.json'),launcher:child,processIdentity:pid=>({pid,ppid:1234,pgid:1234,birth:'fixed-birth'})});
 writeFileSync(join(root,'ready.json'),JSON.stringify(marker));observer.inspect();
 const ready=await observer.ready;assert.equal(ready.pid,12345);assert.equal(observer.snapshot().watchdogMs,2000);
 await assert.rejects(observer.completed,/watchdog/);assert.equal(observer.snapshot().timerActive,false);assert.equal(observer.snapshot().watcherClosed,true);
});

test('late close cannot pass before an already-due watchdog timer is delivered',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scorer-observer-late-close-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const child=Object.assign(new EventEmitter(),{pid:1234,exitCode:null,signalCode:null});let monotonic=0;
 const observer=createScorerReadyObserver({marker:join(root,'ready.json'),launcher:child,monotonicNow:()=>monotonic,processIdentity:pid=>({pid,ppid:1234,pgid:1234,birth:'fixed-birth'})});
 writeFileSync(join(root,'ready.json'),JSON.stringify(marker));observer.inspect();await observer.ready;
 monotonic=2001;child.emit('close',0,null);
 await assert.rejects(observer.completed,/watchdog/);assert.equal(observer.snapshot().watchdogMs,2000);assert.equal(observer.snapshot().timerActive,false);
});

test('abort cleanup terminates only the identity-verified owned fixture group',{timeout:10000},async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scorer-observer-live-abort-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const markerPath=join(root,'ready.json');
 const workerCode="const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.env.SCORER_FIXTURE_MARKER,JSON.stringify({pid:process.pid,handlerReady:true,publishedAt:new Date().toISOString()}));setInterval(()=>{},1000);";
 const launcherCode="const{spawn}=require('node:child_process');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{const worker=spawn(process.execPath,['-e',"+JSON.stringify(workerCode)+"],{env:{SCORER_FIXTURE_MARKER:JSON.parse(input).marker},stdio:'ignore'});worker.once('exit',()=>process.exit(0));});";
 const child=spawn(process.execPath,['-e',launcherCode],{detached:true,env:{LANG:'C',TZ:'UTC'},stdio:['pipe','ignore','ignore']});
 const closed=new Promise((resolve,reject)=>{child.once('close',(code,signal)=>resolve({code,signal}));child.once('error',reject);});
 let launcherIdentity,observer;
 try{
  launcherIdentity=readFixtureProcessIdentity(child.pid);assert.equal(launcherIdentity?.pgid,child.pid);assert.equal(launcherIdentity?.ppid,process.pid);
  const controller=new AbortController();const signal=AbortSignal.any([controller.signal,t.signal]);
  observer=createScorerReadyObserver({marker:markerPath,launcher:child,signal});
  child.stdin.end(JSON.stringify({marker:markerPath}));const ready=await observer.ready;
  assert.equal(ready.identity.ppid,child.pid);assert.equal(ready.identity.pgid,child.pid);
  controller.abort();await assert.rejects(observer.completed,/aborted/);
 }finally{
  terminateOwnedScorerFixture({launcher:child,launcherIdentity,ready:observer?.snapshot().observation});
  // No worker has launched if setup failed before stdin. EOF makes that
  // fixture refuse instead of leaving a launcher waiting for input.
  if(!child.stdin.writableEnded)child.stdin.end();
  observer?.dispose();await closed;
 }
 // SIGKILL reaches the whole group at once, but a worker already reparented to
 // init stays visible to ps for a few ms while it is torn down; under load that
 // read raced it (2 of 5 isolated runs). Wait for it, bounded: a survivor still fails.
 const gone=async pid=>{for(let i=0;i<40&&readFixtureProcessIdentity(pid)!==null;i++)await new Promise(r=>setTimeout(r,50));return readFixtureProcessIdentity(pid);};
 assert.equal(await gone(child.pid),null);
 assert.equal(await gone(observer.snapshot().observation.pid),null);
 assert.equal(observer.snapshot().watcherClosed,true);assert.equal(observer.snapshot().timerActive,false);
});
