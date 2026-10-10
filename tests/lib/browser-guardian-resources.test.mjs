import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,chmodSync,symlinkSync,rmSync,lstatSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createBrowserResourceOwner} from '../../scripts/lib/browser-guardian-resources.mjs';
import {createBrowserGuardianProtocol} from '../../scripts/lib/browser-guardian-protocol.mjs';
const platformOptions={skip:!['darwin','linux'].includes(process.platform)?'OS inventory unsupported; resource ownership NOT CHECKED':false};

for(const mode of ['empty','duplicate','foreign-scorer','outside-profile','symlink-profile','wrong-name','root-mode','pre-registration']){
 test('resource owner preserves '+mode,platformOptions,()=>{
  const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root);
  const profile=join(root,'playwright_chromiumdev_profile-Test123');
  mkdirSync(profile,{mode:0o700});
  mkdirSync(join(root,'playwright-artifacts-Test123'),{mode:0o700});
  try{
   const input={scorerPid:process.pid,browserRoots:[process.pid+1],profilePath:profile};
   if(mode==='empty')input.browserRoots=[];
   if(mode==='duplicate')input.browserRoots=[process.pid+1,process.pid+1];
   if(mode==='outside-profile')input.profilePath='/tmp/playwright_chromiumdev_profile-Test123';
   if(mode==='symlink-profile'){input.profilePath=join(root,'playwright_chromiumdev_profile-Link123');symlinkSync(profile,input.profilePath);}
   if(mode==='wrong-name')input.profilePath=root;
   if(mode==='root-mode')chmodSync(root,0o755);
   const result=mode==='pre-registration'?owner.observe():owner.register(input);
   assert.equal(result.state,'PRESERVED');
   assert.equal(result.cleanupAuthorized,false);
   assert.equal(result.benchmarkEligible,false);
   const diagnostic=owner.privateDiagnostic();
   assert.ok(Object.isFrozen(diagnostic));assert.ok(Object.isFrozen(diagnostic.inventory));
   assert.equal(diagnostic.inventory.timeoutMs,1000);
   assert.equal(diagnostic.inventory.benchmarkEligible,false);
   assert.ok(!JSON.stringify(diagnostic).includes(root));
   assert.ok(!Object.hasOwn(result,'privateDiagnostic')&&!Object.hasOwn(result,'inventory'));
   assert.equal(owner.register(input).state,'PRESERVED','failed owner cannot be revived');
   assert.equal(owner.observe().state,'PRESERVED');
   assert.ok(!JSON.stringify(result).includes(root),'public snapshot withholds private root');
   assert.ok(lstatSync(profile).isDirectory(),'registration never deletes profile');
  }finally{
   const current=lstatSync(root);assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
   rmSync(root,{recursive:true,force:true});
  }
 });
}
test('resource owner rejects caller-selected owner PID',()=>{
 assert.throws(()=>createBrowserResourceOwner({ownerPid:process.pid+1}),/unavailable/);
});
test('resource owner rejects replaced root inode before registration',platformOptions,()=>{
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root),moved=root+'-original';
 renameSync(root,moved);mkdirSync(root,{mode:0o700});const replacement=lstatSync(root);
 try{
  assert.equal(owner.register({scorerPid:process.pid,browserRoots:[process.pid+1],
   profilePath:join(root,'playwright_chromiumdev_profile-Test123')}).state,'PRESERVED');
  assert.equal(lstatSync(moved).ino,identity.ino,'original root must remain untouched');
 }finally{
  assert.equal(lstatSync(root).ino,replacement.ino);rmSync(root,{recursive:true,force:true});
  assert.equal(lstatSync(moved).ino,identity.ino);rmSync(moved,{recursive:true,force:true});
 }
});

// Real captured processes, synthetic scratch: NOT Chromium or a production
// supervisor. A fixed caller refuses quiescent for a surviving child. Separate
// guaranteed-retained fixtures exercise identity negatives, without assuming
// whether Playwright happens to remove its scratch after abrupt scorer death.
for(const mode of ['surviving-child','profile-mode','artifact-replacement'])test('registered real-process negative '+mode,
 {...platformOptions,timeout:10000},async t=>{
 const env={LANG:'C',TZ:'UTC'},pause=ms=>new Promise(r=>setTimeout(r,ms));
 const table=()=>{
  const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,uid=,pgid=,stat=,lstart='],
   {env,encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1048576});
  assert.equal(r.status,0);assert.equal(r.error,undefined);const rows=new Map();
  for(const line of r.stdout.split('\n')){if(!line.trim())continue;
   const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);assert.ok(m);
   rows.set(Number(m[1]),{parent:Number(m[2]),uid:Number(m[3]),group:Number(m[4]),state:m[5],birth:m[6]});
  }return rows;
 };
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root);
 const profile=join(root,'playwright_chromiumdev_profile-Negative1'),artifact=join(root,'playwright-artifacts-Negative1');
 mkdirSync(profile,{mode:0o700});mkdirSync(artifact,{mode:0o700});const artifactIdentity=lstatSync(artifact);
 // Self-bounded descendant remains alive after parent SIGKILL. Only fixed Node
 // code and a minimal environment are admitted into this test fixture.
 const program=String.raw`const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),15000);setInterval(()=>{},1000);'],
{detached:true,env:{LANG:'C',TZ:'UTC'},stdio:'ignore'});
child.once('spawn',()=>process.stdout.write(JSON.stringify({pid:child.pid})+'\n'));
child.on('error',()=>process.exit(1));setInterval(()=>{},1000);`;
 const parent=spawn(process.execPath,['-e',program],{env,stdio:['ignore','pipe','ignore']});
 const closed=new Promise(r=>parent.once('close',(code,signal)=>r({code,signal})));
 let childPid,childIdentity,timer,output='';
 const same=p=>p&&p.birth===childIdentity?.birth&&p.uid===childIdentity?.uid&&p.group===childIdentity?.group;
 try{
  const ready=await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('negative fixture readiness unavailable')),3000);
   parent.once('error',reject);parent.stdout.on('data',b=>{
    output+=b.toString();if(output.length>256)return reject(Error('negative fixture frame too large'));
    if(output.includes('\n')){try{resolve(JSON.parse(output.trim()));}catch{reject(Error('negative fixture frame refused'));}}
   });
  });clearTimeout(timer);assert.deepEqual(Object.keys(ready),['pid']);
  assert.ok(Number.isSafeInteger(ready.pid)&&ready.pid>1);childPid=ready.pid;
  childIdentity=table().get(childPid);assert.ok(childIdentity);assert.equal(childIdentity.parent,parent.pid);
  assert.equal(childIdentity.uid,process.getuid());assert.equal(childIdentity.group,childPid);
  assert.equal(owner.register({scorerPid:parent.pid,browserRoots:[childPid],profilePath:profile}).state,'OBSERVING');
  assert.equal(owner.observe().liveProcesses,2);
  parent.kill('SIGKILL');assert.equal((await closed).signal,'SIGKILL');
  const observed=owner.observe();assert.equal(observed.state,'OBSERVING');assert.equal(observed.liveProcesses,1);
  assert.equal(observed.retainedScratchDirectories,2);
  for(const flag of ['osQuiescenceVerified','resourceClosureVerified','cleanupAuthorized','independentAdmissionVerified','benchmarkEligible'])assert.equal(observed[flag],false);
  const protocol=createBrowserGuardianProtocol({attemptId:'negative-'+mode,receiptSha256:'a'.repeat(64),registrationSha256:'b'.repeat(64)});
  const binding=protocol.binding();let sequence=0,quiescentSent=false;
  const send=(type,extra={})=>{if(type==='quiescent')quiescentSent=true;
   return protocol.receive(JSON.stringify({version:1,attemptId:binding.attemptId,capability:binding.capability,sequence:++sequence,type,...extra}));};
  send('ready');send('register',{resources:[{id:'1'.repeat(64),kind:'scorer'},{id:'2'.repeat(64),kind:'browser'},{id:'3'.repeat(64),kind:'profile'}]});
  assert.equal(send('stop',{reason:'scorer-death'}).state,'STOPPING');
  assert.ok(observed.liveProcesses>0,'deterministic survivor must be present before fixture fallback');
  const refused=send('fault',{reason:'timeout'});assert.equal(refused.state,'PRESERVED');
  assert.equal(quiescentSent,false);assert.equal(refused.cleanupAuthorized,false);assert.equal(refused.benchmarkEligible,false);
  if(mode==='profile-mode'){
   chmodSync(profile,0o755);assert.equal(owner.observe().state,'PRESERVED');
   chmodSync(profile,0o700);assert.equal(owner.observe().state,'PRESERVED','restoring mode cannot revive a refused sampler');
  }else if(mode==='artifact-replacement'){
   const holder=join(profile,'held-artifact');renameSync(artifact,holder);mkdirSync(artifact,{mode:0o700});
   assert.equal(owner.observe().state,'PRESERVED');assert.equal(lstatSync(holder).ino,artifactIdentity.ino,'sampler never alters retained original');
  }
  t.diagnostic(mode+': real surviving child; synthetic scratch; protocol PRESERVED; no quiescent, cleanup or admission authority');
 }finally{
  clearTimeout(timer);if(parent.exitCode===null&&parent.signalCode===null)parent.kill('SIGKILL');await closed;
  if(childPid&&same(table().get(childPid)))try{process.kill(childPid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
  let gone=false;
  for(let i=0;childPid&&i<30;i++){const p=table().get(childPid);if(!same(p)||p.state.startsWith('Z')){gone=true;break;}await pause(50);}
  if(childPid&&gone){const current=lstatSync(root);assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
   assert.equal(current.uid,identity.uid);assert.ok(current.isDirectory()&&!current.isSymbolicLink());rmSync(root,{recursive:true,force:true});}
 }
});
