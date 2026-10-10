import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdirSync,lstatSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBrowserResourceOwner} from '../../scripts/lib/browser-guardian-resources.mjs';
const entry=fileURLToPath(new URL('../helpers/guardian-lineage-fixture.mjs',import.meta.url));
const faultEntry=fileURLToPath(new URL('../helpers/guardian-inventory-fault.mjs',import.meta.url));
const causes={nonzero:['nonzero-or-unknown','process-refused'],timeout:['timeout','process-refused'],
 'output-limit':['output-limit','process-refused'],signal:['signalled','process-refused'],'invalid-rows':['exited-zero','rows-refused']};
for(const phase of ['before-registration','late-scorer','inherited-descriptor',...Object.keys(causes).map(mode=>'observation-'+mode)])test('unregistered lineage preserves '+phase,
 {timeout:20000,skip:!['darwin','linux'].includes(process.platform)},async t=>{
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root);
 const profile=join(root,'playwright_chromiumdev_profile-Lineage123');mkdirSync(profile,{mode:0o700});
 mkdirSync(join(root,'playwright-artifacts-Lineage123'),{mode:0o700});
 const scorer=fork(entry,['scorer'],{execPath:process.execPath,execArgv:[],env:{LANG:'C',TZ:'UTC'},stdio:['ignore','ignore','ignore','ipc']});
 const exited=new Promise(resolve=>scorer.once('exit',(code,signal)=>resolve({code,signal})));
 const messages=[],waiters=[];let browserClosed=false;
 scorer.on('message',message=>{if(message.kind==='browser-close')browserClosed=true;
  if(waiters.length)waiters.shift()(message);else messages.push(message);});
 async function next(){let timer;try{return await Promise.race([messages.length?Promise.resolve(messages.shift()):new Promise(r=>waiters.push(r)),
  new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('lineage fixture message timeout')),12000))]);}finally{clearTimeout(timer);}}
 t.after(async()=>{
  if(scorer.connected)scorer.send({kind:'close'});
  const result=await exited;assert.deepEqual(result,{code:0,signal:null});
  assert.equal(browserClosed,true,'fixed child tree and inherited pipe must close before fixture cleanup');
  const current=lstatSync(root);assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
  assert.equal(current.uid,process.getuid());assert.ok(current.isDirectory()&&!current.isSymbolicLink());
  rmSync(root,{recursive:true,force:true});
 });
 scorer.send({kind:'init',profilePath:profile});const ready=await next();assert.equal(ready.kind,'ready');
 const registration={scorerPid:scorer.pid,browserRoots:[ready.browserPid],profilePath:profile};
 if(phase!=='before-registration')assert.equal(owner.register(registration).state,'OBSERVING');
 if(phase.startsWith('observation-')){
  const mode=phase.slice('observation-'.length),original=cp.spawnSync;
  cp.spawnSync=(bin,args,options)=>{
   assert.equal(bin,'/bin/ps');assert.equal(options.timeout,1000);assert.equal(options.maxBuffer,1048576);
   assert.equal(options.killSignal,'SIGKILL');return original(process.execPath,[faultEntry,mode],options);
  };
  syncBuiltinESMExports();let snapshot;
  try{snapshot=owner.observe();}finally{cp.spawnSync=original;syncBuiltinESMExports();}
  assert.equal(snapshot.state,'PRESERVED');
  const diagnostic=owner.privateDiagnostic();
  assert.equal(diagnostic.stage,'observation-inventory');assert.equal(diagnostic.reason,causes[mode][1]);
  assert.equal(diagnostic.inventory.outcome,causes[mode][0]);
  assert.ok(Object.isFrozen(diagnostic));assert.ok(Object.isFrozen(diagnostic.inventory));
  assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_PAYLOAD|stdout|stderr|capability|profilePath/);
  assert.ok(!JSON.stringify(diagnostic).includes(root));
  for(const key of ['osQuiescenceVerified','resourceClosureVerified','cleanupAuthorized','independentAdmissionVerified','benchmarkEligible'])assert.equal(snapshot[key],false);
  assert.ok(!Object.hasOwn(snapshot,'privateDiagnostic')&&!Object.hasOwn(snapshot,'inventory'));
  owner.observe();assert.deepEqual(owner.privateDiagnostic(),diagnostic,'preserved owner retains actual observation refusal');
  assert.ok(lstatSync(join(profile,'held-descriptor')).isFile(),'live fixed fixture descriptor is not deleted by refusal');
  return;
 }
 scorer.send({kind:phase==='inherited-descriptor'?'late-browser':'late-scorer'});
 const late=await next();assert.equal(late.kind,'late-ready');assert.equal(late.fileIno,ready.fileIno);
 const snapshot=phase==='before-registration'?owner.register(registration):owner.observe();
 assert.equal(snapshot.state,'PRESERVED');
 for(const key of ['osQuiescenceVerified','resourceClosureVerified','cleanupAuthorized','independentAdmissionVerified','benchmarkEligible'])assert.equal(snapshot[key],false);
 assert.equal(lstatSync(root).ino,identity.ino);assert.ok(lstatSync(join(profile,'held-descriptor')).isFile());
 if(phase==='inherited-descriptor'){
  scorer.send({kind:'exit-browser'});assert.equal((await next()).kind,'browser-exit');
  assert.equal(browserClosed,false,'direct exit must precede close while descendant holds inherited stdout');
  const live=spawnSync('/bin/ps',['-p',String(late.pid),'-o','pid=,uid=,stat='],{env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:1000,maxBuffer:4096});
  assert.equal(live.status,0);const row=live.stdout.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/);
  assert.ok(row);assert.equal(Number(row[1]),late.pid);assert.equal(Number(row[2]),process.getuid());
  assert.equal(row[3].startsWith('Z'),false,'the inherited descriptor holder must still be running');
  assert.equal(owner.observe().state,'PRESERVED');
  assert.equal((await next()).kind,'browser-close');
 }
});
