import{test}from'node:test';
import assert from'node:assert/strict';
import{fork,spawn,spawnSync}from'node:child_process';
import{fileURLToPath}from'node:url';

const helper=fileURLToPath(new URL('../../scripts/lib/browser-guardian-helper.mjs',import.meta.url));
const hex=n=>n.toString(16).padStart(64,'0');
const init={version:1,kind:'init',attemptId:'ipc-test',receiptSha256:hex(10),registrationSha256:hex(11)};
const env={LANG:'C',TZ:'UTC'};
function fixture(t){
 const child=fork(helper,[],{execPath:process.execPath,execArgv:[],env,stdio:['ignore','pipe','pipe','ipc']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const messages=[],waiters=[];let exited=false;
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>{exited=true;resolve({code,signal});}));
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
for(const kind of ['object','malformed','oversized','duplicate init','future request','duplicate request','extra path'])test('IPC refuses '+kind+' and exits unavailable',async t=>{
 const f=fixture(t);f.sendFrame(init);const ready=await f.next();let raw;
 if(kind==='object')raw={private:'test-sentinel'};
 if(kind==='malformed')raw='{test-sentinel';
 if(kind==='oversized')raw='x'.repeat(32769);
 if(kind==='duplicate init')raw=JSON.stringify(init);
 if(kind==='extra path')raw=JSON.stringify({version:1,kind:'close',path:'test-sentinel'});
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
