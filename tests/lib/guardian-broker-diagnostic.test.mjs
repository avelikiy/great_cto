import {test} from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {lstatSync,readdirSync,rmSync} from 'node:fs';
import {startBrowserGuardianProbe} from '../../scripts/lib/browser-guardian-broker.mjs';
const entry=fileURLToPath(new URL('../helpers/guardian-probe-fault.mjs',import.meta.url));
for(const mode of ['valid','invalid'])test('broker private native failure stage '+mode,
 {skip:!['darwin','linux'].includes(process.platform),timeout:5000},async t=>{
 const original=cp.fork;let child,exit;
 cp.fork=(path,args,options)=>{
  assert.ok(path.endsWith('/browser-guardian-probe.mjs'));assert.deepEqual(args,[]);
  assert.deepEqual(options.execArgv,[]);
  child=original(entry,[mode],options);
  exit=new Promise(resolve=>child.once('exit',resolve));return child;
 };
 syncBuiltinESMExports();
 let broker,root,identity,timer;
 t.after(async()=>{
  cp.fork=original;syncBuiltinESMExports();clearTimeout(timer);
  if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGKILL');
  if(exit)await exit;
  if(root){const current=lstatSync(root);assert.equal(current.ino,identity.ino);
   assert.equal(current.dev,identity.dev);assert.deepEqual(readdirSync(root),[]);
   rmSync(root,{recursive:true,force:true});}
 });
 const events=[];let ended;
 const end=new Promise(resolve=>ended=resolve);
 broker=startBrowserGuardianProbe('normal',event=>{events.push(event);if(event.kind==='probe-ended')ended(event);});
 root=broker.privateResources().root;identity=lstatSync(root);
 const result=await Promise.race([end,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('fixed probe did not exit')),3000))]);
 await exit;assert.equal(result.code,7);assert.equal(result.probeAdmitted,null);
 const refusal=events.find(event=>event.kind==='probe-unavailable');assert.ok(refusal);
 const d=refusal.privateDiagnostic;
 assert.equal(d.failureStage,mode==='valid'?'probe-failure':'resource-frame');
 assert.equal(d.probeStage,mode==='valid'?'browser-launch':null);
 assert.equal(d.directExit,null,'failure publication precedes direct exit');
 assert.ok(Object.isFrozen(d));assert.equal(d.benchmarkEligible,false);
 assert.equal(d.descendantQuiescenceVerified,false);
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_STAGE|stdout|stderr|capability|profilePath/);
 assert.ok(!JSON.stringify(d).includes(root));
 assert.equal(broker.privateDiagnostic().directExit.code,7);
 assert.equal(broker.privateDiagnostic().failureStage,d.failureStage);
 assert.ok(!Object.hasOwn(result.snapshot,'privateDiagnostic'));
 assert.equal(result.snapshot.cleanupAuthorized,false);assert.equal(result.snapshot.benchmarkEligible,false);
});
