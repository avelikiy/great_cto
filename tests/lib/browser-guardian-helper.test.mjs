import{test}from'node:test';
import assert from'node:assert/strict';
import{fork,spawn,spawnSync}from'node:child_process';
import{fileURLToPath}from'node:url';
import{lstatSync,readdirSync,rmSync}from'node:fs';
import{join}from'node:path';
import{boardAccessibilityBenchmarkFixture}from'../../scripts/lib/board-accessibility-benchmark-fixture.mjs';

const helper=fileURLToPath(new URL('../../scripts/lib/browser-guardian-helper.mjs',import.meta.url));
const hex=n=>n.toString(16).padStart(64,'0');
const init={version:1,kind:'init',attemptId:'ipc-test',receiptSha256:hex(10),registrationSha256:hex(11)};
const env={LANG:'C',TZ:'UTC'};
function fixture(t){
 const child=fork(helper,[],{execPath:process.execPath,execArgv:[],env,stdio:['ignore','pipe','pipe','ipc']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const messages=[],waiters=[];let exited=false;
 const closed=new Promise(resolve=>child.once('exit',(code,signal)=>{exited=true;resolve({code,signal});}));
 child.on('message',m=>{if(waiters.length)waiters.shift()(m);else messages.push(m);});
 const next=async()=>{let timer;try{return await Promise.race([messages.length?Promise.resolve(messages.shift()):new Promise(r=>waiters.push(r)),
  new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('helper message timeout')),3000))]);}finally{clearTimeout(timer);}};
 const send=value=>{if(exited)throw Error('helper already closed');child.send(value);};
 const sendFrame=value=>send(JSON.stringify(value));
 t.after(async()=>{if(!exited)child.kill('SIGKILL');await closed;assert.equal(stdout,'','helper must not publish private IPC data');assert.equal(stderr,'');});
 return{child,closed,next,send,sendFrame};
}
test('actual private helper processes a complete trace, no OS authority',async t=>{
 const f=fixture(t);f.sendFrame(init);const ready=await f.next();assert.equal(ready.kind,'ready');assert.equal(ready.pid,f.child.pid);assert.notEqual(ready.pid,process.pid);
 assert.ok(/^[a-f0-9]{64}$/.test(ready.binding.capability),'private binding required');
 const commands=[['ready',{}],['register',{resources:[{id:hex(1),kind:'scorer'},{id:hex(2),kind:'browser'},{id:hex(3),kind:'profile'}]}],
  ['stop',{reason:'scorer-death'}],['quiescent',{processes:[hex(1),hex(2)],profile:hex(3),profileState:'retained'}]];
 let seq=0;
 for(const[type,payload]of commands){seq++;f.sendFrame({version:1,kind:'step',requestId:seq,raw:JSON.stringify({version:1,attemptId:init.attemptId,
  capability:ready.binding.capability,sequence:seq,type,...payload})});const reply=await f.next();
  assert.equal(reply.kind,'snapshot');assert.equal(reply.requestId,seq);assert.equal(reply.snapshot.sequence,seq);
  assert.equal(reply.snapshot.cleanupAuthorized,false);assert.equal(reply.snapshot.osQuiescenceVerified,false);
  assert.ok(!JSON.stringify(reply.snapshot).includes(ready.binding.capability),'status must not expose capability');
 }
 f.sendFrame({version:1,kind:'close'});assert.equal((await f.next()).kind,'closed');assert.equal((await f.closed).code,0);
});
for(const mode of ['normal','dom-refusal','scorer-kill','helper-kill','parent-disconnect','duplicate-start'])test('external guardian actual browser probe '+mode,{timeout:20000},async t=>{
 if(!['darwin','linux'].includes(process.platform)||!boardAccessibilityBenchmarkFixture().oracle.browser)return t.skip('actual browser resource broker NOT CHECKED');
 const f=fixture(t),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const table=()=>{const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,stat=,lstart='],{env,encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1048576});
  assert.equal(r.status,0);const map=new Map();for(const line of r.stdout.split('\n')){const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);if(m)map.set(Number(m[1]),{parent:Number(m[2]),state:m[3],birth:m[4]});}return map;};
 let root,rootIdentity,owned=new Map();
 const live=()=>{const rows=table();return [...owned].filter(([pid,p])=>{const q=rows.get(pid);return q?.birth===p.birth&&!q.state.startsWith('Z');});};
 const gone=async()=>{for(let i=0;i<60;i++){if(!live().length)return true;await pause(50);}return false;};
 try{
  f.sendFrame(init);const ready=await f.next();assert.equal(ready.kind,'ready');
  const command=(kind,extra={})=>f.sendFrame({version:1,kind,capability:ready.binding.capability,...extra});
  command('probe-start',{mode:mode==='dom-refusal'?'dom-refusal':'normal'});
  const started=await f.next();assert.equal(started.kind,'probe-started');
  root=started.privateResources.root;rootIdentity=lstatSync(root);const scorer=started.privateResources.scorerPid;
  const registered=await f.next();assert.equal(registered.kind,'probe-ready');assert.equal(registered.snapshot.state,'OBSERVING');
  assert.ok(registered.snapshot.liveProcesses>1);assert.equal(registered.snapshot.cleanupAuthorized,false);
  const rows=table();assert.equal(rows.get(scorer)?.parent,f.child.pid,'scorer must be a child of actual external helper');
  owned.set(scorer,rows.get(scorer));
  for(let changed=true;changed;){changed=false;for(const [pid,p]of rows)if(!owned.has(pid)&&owned.has(p.parent)){owned.set(pid,p);changed=true;}}
  assert.ok(owned.size>2,'actual scorer, browser root and descendants are captured');
  const entries=readdirSync(root),profiles=entries.filter(name=>/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/.test(name));
  assert.equal(profiles.length,1,'exactly one profile; other Playwright scratch resources are not a profile');
  const profile=join(root,profiles[0]),profileIdentity=lstatSync(profile);
  const artifacts=entries.filter(name=>/^playwright-artifacts-[A-Za-z0-9]+$/.test(name));assert.equal(artifacts.length,1);
  const artifact=join(root,artifacts[0]),artifactIdentity=lstatSync(artifact);
  assert.ok(artifactIdentity.isDirectory()&&!artifactIdentity.isSymbolicLink());assert.equal(artifactIdentity.uid,process.getuid());
  if(mode==='scorer-kill')process.kill(scorer,'SIGKILL');
  else if(mode==='helper-kill')f.child.kill('SIGKILL');
  else if(mode==='parent-disconnect')f.child.disconnect();
  else if(mode==='duplicate-start')command('probe-start',{mode:'normal'});
  else command('probe-continue');
  if(mode==='duplicate-start'){assert.equal((await f.next()).kind,'unavailable');assert.equal((await f.closed).code,1);}
  else if(mode==='helper-kill'||mode==='parent-disconnect'){
   const exit=await f.closed;if(mode==='helper-kill')assert.equal(exit.signal,'SIGKILL');else assert.equal(exit.code,1);
  }else{
   const ended=await f.next();assert.equal(ended.kind,'probe-ended');assert.equal(ended.snapshot.cleanupAuthorized,false);
   assert.equal(ended.benchmarkEligible,false);
   if(mode==='scorer-kill'){assert.equal(ended.signal,'SIGKILL');assert.equal(ended.probeAdmitted,null);}
   else{assert.equal(ended.code,0);assert.equal(ended.probeAdmitted,mode==='normal');}
  }
  assert.ok(await gone(),'captured scorer/browser must stop before fallback cleanup');
  let retained=false;try{assert.equal(lstatSync(profile).ino,profileIdentity.ino);retained=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.equal(retained,mode==='scorer-kill');
  let artifactsRetained=false;try{assert.equal(lstatSync(artifact).ino,artifactIdentity.ino);artifactsRetained=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.equal(artifactsRetained,mode==='scorer-kill','artifacts follow measured crash lifetime but are not registered by profile-only sampler');
  assert.equal(lstatSync(root).ino,rootIdentity.ino,'guardian retains its private root, never reclaims it');
  if(!['helper-kill','parent-disconnect','duplicate-start'].includes(mode)){
   command('probe-observe');const observation=await f.next();assert.equal(observation.kind,'probe-observation');
   assert.equal(observation.snapshot.liveProcesses,0);assert.equal(observation.snapshot.profileState,retained?'retained':'removed');
   assert.equal(observation.snapshot.independentAdmissionVerified,false);
   f.sendFrame({version:1,kind:'close'});assert.equal((await f.next()).kind,'closed');assert.equal((await f.closed).code,0);
  }
  t.diagnostic(mode+': external helper owns '+owned.size+' captured scorer/browser processes; profile/artifacts '+(retained?'retained':'removed')+' before fixture cleanup');
 }finally{
  if(f.child.exitCode===null&&f.child.signalCode===null)f.child.kill('SIGKILL');await f.closed;
  for(const [pid]of live().reverse())try{process.kill(pid,'SIGKILL');}catch{}
  if(root&&rootIdentity&&owned.size&&await gone()){
   const current=lstatSync(root);assert.ok(current.isDirectory()&&!current.isSymbolicLink());assert.equal(current.ino,rootIdentity.ino);assert.equal(current.dev,rootIdentity.dev);assert.equal(current.uid,process.getuid());
   rmSync(root,{recursive:true,force:true});
  }
 }
});
test('fixed test launcher does not inherit preload, debug args or ambient sentinel',async t=>{
 const prior=process.env.NODE_OPTIONS,marker=process.env.GUARDIAN_IPC_TEST_SENTINEL;
 try{
  process.env.NODE_OPTIONS='--this-invalid-option-must-not-be-inherited';process.env.GUARDIAN_IPC_TEST_SENTINEL='unit-only';
  const f=fixture(t);f.sendFrame(init);const ready=await f.next();assert.equal(ready.kind,'ready');
  assert.equal(ready.runtime.execArgvCount,0);
  assert.ok(!ready.runtime.environmentKeys.includes('NODE_OPTIONS'));
  assert.ok(!ready.runtime.environmentKeys.includes('GUARDIAN_IPC_TEST_SENTINEL'));
  f.sendFrame({version:1,kind:'close'});assert.equal((await f.next()).kind,'closed');assert.equal((await f.closed).code,0);
 }finally{
  if(prior===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=prior;
  if(marker===undefined)delete process.env.GUARDIAN_IPC_TEST_SENTINEL;else process.env.GUARDIAN_IPC_TEST_SENTINEL=marker;
 }
});
test('actual helper SIGKILL is terminal, never a completed scoring result',async t=>{
 const f=fixture(t);f.sendFrame(init);assert.equal((await f.next()).kind,'ready');f.child.kill('SIGKILL');
 const exit=await f.closed;assert.equal(exit.code,null);assert.equal(exit.signal,'SIGKILL');
});
for(const kind of ['object','malformed','oversized','duplicate init','future request','duplicate request','extra path','probe wrong capability','probe caller path','probe unknown mode','probe missing start'])test('IPC refuses '+kind+' and exits unavailable',async t=>{
 const f=fixture(t);f.sendFrame(init);const ready=await f.next();let raw;
 if(kind==='object')raw={private:'test-sentinel'};
 if(kind==='malformed')raw='{test-sentinel';
 if(kind==='oversized')raw='x'.repeat(32769);
 if(kind==='duplicate init')raw=JSON.stringify(init);
 if(kind==='extra path')raw=JSON.stringify({version:1,kind:'close',path:'test-sentinel'});
 if(kind==='probe wrong capability')raw=JSON.stringify({version:1,kind:'probe-start',capability:hex(99),mode:'normal'});
 if(kind==='probe caller path')raw=JSON.stringify({version:1,kind:'probe-start',capability:ready.binding.capability,mode:'normal',path:'test-sentinel'});
 if(kind==='probe unknown mode')raw=JSON.stringify({version:1,kind:'probe-start',capability:ready.binding.capability,mode:'test-sentinel'});
 if(kind==='probe missing start')raw=JSON.stringify({version:1,kind:'probe-continue',capability:ready.binding.capability});
 if(kind==='future request'||kind==='duplicate request'){
  const step={version:1,kind:'step',requestId:1,raw:JSON.stringify({version:1,attemptId:init.attemptId,
   capability:ready.binding.capability,sequence:1,type:'ready'})};
  if(kind==='duplicate request'){f.sendFrame(step);assert.equal((await f.next()).kind,'snapshot');}
  else step.requestId=2;
  raw=JSON.stringify(step);
 }
 f.send(raw);const reply=await f.next();assert.equal(reply.kind,'unavailable');assert.equal(reply.cleanupAuthorized,false);
 assert.ok(!JSON.stringify(reply).includes('test-sentinel'));assert.ok(!JSON.stringify(reply).includes(ready.binding.capability));
 assert.equal((await f.closed).code,1);
});
test('actual parent SIGKILL closes helper IPC and leaves no running owned helper', {timeout:10000},async t=>{
 if(!['darwin','linux'].includes(process.platform))return t.skip('owned process identity unsupported; parent death NOT CHECKED');
 const program=`import{fork}from'node:child_process';const config=JSON.parse(process.argv[1]);
const child=fork(config.helper,[],{execPath:process.execPath,execArgv:[],env:{LANG:'C',TZ:'UTC'},stdio:['ignore','ignore','ignore','ipc']});
child.on('message',m=>{if(m.kind==='ready')process.stdout.write(JSON.stringify({pid:child.pid})+'\\n');});
child.send(JSON.stringify(config.init));`;
 const parent=spawn(process.execPath,['--input-type=module','-e',program,JSON.stringify({helper,init})],{env,stdio:['ignore','pipe','ignore']});
 const closed=new Promise(r=>parent.once('close',r));let output='',pid,identity,owned=false;
 parent.stdout.on('data',b=>{output+=b;});const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const inspect=p=>{const r=spawnSync('ps',['-p',String(p),'-o','pid=,ppid=,stat=,lstart='],{env,encoding:'utf8',timeout:1000});return r.status===0?r.stdout.trim():null;};
 try{
  for(let i=0;i<100&&!output.includes('\n');i++)await pause(20);
  pid=JSON.parse(output.trim()).pid;assert.ok(Number.isInteger(pid)&&pid>1);identity=inspect(pid);
  assert.equal(Number(identity?.split(/\s+/)[1]),parent.pid,'helper belongs to actual owned parent');
  owned=true;
  parent.kill('SIGKILL');await closed;let stopped=false;
  for(let i=0;i<100;i++){const row=inspect(pid);if(!row||row.split(/\s+/)[2].startsWith('Z')){stopped=true;break;}await pause(20);}
  assert.ok(stopped,'helper stops before fallback cleanup after real parent death');
 }finally{
  if(parent.exitCode===null&&parent.signalCode===null)parent.kill('SIGKILL');
  const birth=row=>row?.split(/\s+/).slice(3).join(' ');
  if(owned&&identity&&birth(inspect(pid))===birth(identity))try{process.kill(pid,'SIGKILL');}catch{}
  await closed;
 }
});
