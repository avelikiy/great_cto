import {test} from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {existsSync,lstatSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import fs from 'node:fs';
import {withTemporaryPostgres} from '../../scripts/benchmark-scorers/migration-safety.mjs';
const entry=fileURLToPath(new URL('../helpers/migration-init-fault.mjs',import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const mode of ['nonzero','signal','timeout','descendant'])test('failed native initializer preserves scope '+mode,
 {timeout:20000,skip:!['darwin','linux'].includes(process.platform)},async t=>{
 const original=cp.spawnSync,originalRealpath=fs.realpathSync;let root,identity,data,worker,nativeResult;
 const fixtureTools=new Set(['initdb','postgres','psql'].map(name=>'/opt/homebrew/opt/postgresql@16/bin/'+name));
 fs.realpathSync=path=>fixtureTools.has(path)?originalRealpath(process.execPath):originalRealpath(path);
 cp.spawnSync=(bin,args,options)=>{
  // Tool resolution/version are source-owned test seams; all refusal children
  // are native. No PostgreSQL installation/version verdict is claimed here.
  if(args.length===1&&args[0]==='--version')return original(process.execPath,['-e','process.stdout.write("fixture 16.0")'],options);
  if(args.includes('--no-locale')){
   assert.equal(options.timeout,10000);assert.equal(options.maxBuffer,65536);assert.equal(options.shell,false);
   data=args[args.indexOf('-D')+1];root=dirname(data);identity=lstatSync(root);
   nativeResult=original(process.execPath,[entry,mode,data],options);
   if(existsSync(join(data,'worker-ready')))worker=JSON.parse(readFileSync(join(data,'worker-ready'),'utf8'));
   return nativeResult;
  }
  return original(bin,args,options);
 };
 syncBuiltinESMExports();
 t.after(async()=>{
  cp.spawnSync=original;fs.realpathSync=originalRealpath;syncBuiltinESMExports();
  if(worker&&existsSync(root))writeFileSync(join(data,'worker-stop'),'',{mode:0o600});
  if(worker){for(let i=0;i<180;i++){
   const r=original('/bin/ps',['-p',String(worker.pid),'-o','pid=,stat='],{encoding:'utf8',env:{LANG:'C'},timeout:1000});
   if(r.status===1||r.status===0&&/\sZ\S*\s*$/.test(r.stdout))break;
   if(i===179)throw Error('fixed initializer descendant stop unconfirmed');await pause(50);
  }}
  if(root&&existsSync(root)){const current=lstatSync(root);assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
   if(worker)assert.ok(existsSync(join(data,'worker-closed')),'held descriptor closed before test cleanup');
   rmSync(root,{recursive:true,force:true});}
 });
 let actionCalled=false;
 await assert.rejects(withTemporaryPostgres(async()=>{actionCalled=true;}),error=>{
  if(data&&existsSync(join(data,'worker-ready')))worker=JSON.parse(readFileSync(join(data,'worker-ready'),'utf8'));
  assert.equal(error.message,'temporary PostgreSQL initialization unavailable');
  assert.ok(existsSync(join(data,'init-marker')),'failed initializer root must remain, regardless of server guardian absence');
  const d=error.privateDiagnostic;assert.equal(d.stage,'initialization');
  assert.equal(d.exitCode,nativeResult.status);assert.equal(d.signal,nativeResult.signal);
  assert.equal(d.errorCode,nativeResult.error?.code??null);assert.ok(d.elapsedMs>=0);
  assert.equal(d.outcome,mode==='timeout'?'timeout':mode==='signal'?'signalled':'nonzero-or-unknown');
  assert.equal(d.timeoutMs,10000);assert.equal(d.scratchState,'retained');
  assert.equal(d.descendantQuiescenceVerified,false);assert.equal(d.benchmarkEligible,false);
  assert.ok(Object.isFrozen(d));assert.doesNotMatch(JSON.stringify(d),/PRIVATE_INIT|stdout|stderr|temp|data\/|oracle/);
  assert.ok(!JSON.stringify(d).includes(root));return true;
 });
 assert.equal(actionCalled,false);
 if(worker){
  const r=original('/bin/ps',['-p',String(worker.pid),'-o','pid=,stat='],{encoding:'utf8',env:{LANG:'C'},timeout:1000});
  assert.equal(r.status,0);assert.ok(!/\sZ\S*\s*$/.test(r.stdout));
  assert.equal(lstatSync(join(data,'held-descriptor')).ino,worker.ino,'initializer exited but actual descendant still holds this inode');
 }
});
