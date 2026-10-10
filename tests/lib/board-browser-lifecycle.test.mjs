import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lstatSync,rmSync,chmodSync,readdirSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';
import {createHash} from 'node:crypto';
import {boardAccessibilityBenchmarkFixture} from '../../scripts/lib/board-accessibility-benchmark-fixture.mjs';
import {createBrowserGuardianProtocol} from '../../scripts/lib/browser-guardian-protocol.mjs';
import {createBrowserResourceOwner} from '../../scripts/lib/browser-guardian-resources.mjs';

const observer=fileURLToPath(new URL('../../scripts/benchmark-scorers/board-accessibility.mjs',import.meta.url));
// Instrument only this test's trusted child before Playwright loads. Browser API
// has no public process() method; launchServer would exercise a different path.
const program=String.raw`
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
const roots=[],profiles=[],original=cp.spawn;
cp.spawn=function(...args){const child=original(...args);child.once('spawn',()=>{
 roots.push(child.pid);
 for(const arg of args[1]??[])if(arg.startsWith('--user-data-dir='))profiles.push(arg.slice('--user-data-dir='.length));
});return child;};
syncBuiltinESMExports();
const config=JSON.parse(process.argv[1]);
try{
 const {observeBoard,loadPinnedBoardBrowser}=await import(pathToFileURL(config.observer).href);
 const chromium=await loadPinnedBoardBrowser(config.oracle.browser,'/tmp'),launch=chromium.launch;
 let reported=false;
 chromium.launch=async function(...args){
  const browser=await launch.apply(this,args),newContext=browser.newContext;
  browser.newContext=async function(...args){
   const context=await newContext.apply(this,args),newPage=context.newPage;
   context.newPage=async function(...args){
    const page=await newPage.apply(this,args),setContent=page.setContent;
    page.setContent=async function(...args){
     const value=await setContent.apply(this,args);
     if(!reported){reported=true;process.stdout.write(JSON.stringify({kind:'ready',roots,profiles})+'\n');
      await new Promise(r=>process.stdin.once('data',r));}
     return value;
    };return page;
   };return context;
  };return browser;
 };
 const result=await observeBoard(config.html,config.oracle,'/tmp');
 process.stdout.write(JSON.stringify({kind:'done',admitted:result.admitted})+'\n');
}catch{process.stderr.write('trusted browser lifecycle child failed\n');process.exitCode=1;}
`;
const env={PATH:process.env.PATH,LANG:'C',TZ:'UTC'};
function processes(){
 const r=spawnSync('ps',['-axo','pid=,ppid=,pgid=,stat=,lstart='],{env,encoding:'utf8',timeout:5000,maxBuffer:1048576});
 assert.equal(r.status,0,'owned-process inventory must be available');const table=new Map();
 for(const line of r.stdout.split('\n')){const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
  if(m)table.set(Number(m[1]),{parent:Number(m[2]),group:Number(m[3]),state:m[4],birth:m[5]});}
 return table;
}
function ownedTree(roots,owner){
 const table=processes(),owned=new Map();
 for(const pid of roots){const p=table.get(pid);if(p){assert.equal(p.parent,owner,'instrumented browser must belong to test owner');owned.set(pid,p.birth);}}
 for(let changed=true;changed;){changed=false;for(const [pid,p]of table)if(!owned.has(pid)&&owned.has(p.parent)){owned.set(pid,p.birth);changed=true;}}
 return owned;
}
function living(owned){const table=processes();return [...owned].filter(([pid,birth])=>{const p=table.get(pid);return p?.birth===birth&&!p.state.startsWith('Z');});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitGone(owned){for(let i=0;i<50;i++){if(!living(owned).length)return true;await pause(100);}return false;}

for(const mode of ['normal','dom-refusal','owner-term','owner-kill'])test(mode==='owner-kill'?'actual observer abrupt owner death is characterized without cleanup authority':'actual observer browser processes stop after '+mode,{timeout:30000},async t=>{
 if(process.platform!=='darwin'&&process.platform!=='linux')return t.skip('process-tree inventory unsupported; lifecycle NOT CHECKED');
 const recipe=boardAccessibilityBenchmarkFixture();if(!recipe.oracle.browser)return t.skip('Playwright unavailable; lifecycle NOT CHECKED');
 const resources=createBrowserResourceOwner({ownerPid:process.pid}),scratch=resources.privateRoot();
 const scratchIdentity=lstatSync(scratch);
 let html=recipe.files['web/board.html'];if(mode==='dom-refusal')html=html.replace('id="approve"','id="approve" onclick="throw 1"');
 const child=spawn(process.execPath,['--input-type=module','-e',program,JSON.stringify({observer,oracle:recipe.oracle,html,mode})],
  {env:{...env,TMPDIR:scratch,TMP:scratch,TEMP:scratch},stdio:['pipe','pipe','pipe']});
 let output='',errors='',ready,done;const closed=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));
 child.stdout.on('data',b=>{output+=b.toString();assert.ok(output.length<=4096,'bounded public lifecycle output');
  for(const line of output.split('\n').slice(0,-1)){const event=JSON.parse(line);if(event.kind==='ready')ready=event;if(event.kind==='done')done=event;}});
 child.stderr.on('data',b=>{errors+=b.toString();});child.on('error',()=>{});
 let owned=new Map(),exitTimer;
 try{
  for(let i=0;i<100&&!ready&&child.exitCode===null;i++)await pause(100);
  assert.ok(ready,'actual browser must reach static DOM; private child errors withheld');
  assert.ok(ready.roots.length>0&&ready.roots.every(p=>Number.isInteger(p)&&p>1));
  owned=ownedTree(ready.roots,child.pid);
  assert.ok(owned.size>1,'browser root and actual descendant observed before continuation');
  const groupTable=processes(),ownerGroup=groupTable.get(child.pid)?.group;
  assert.ok(Number.isInteger(ownerGroup),'owner process group must be observed');
  assert.ok(ready.roots.every(pid=>{const p=groupTable.get(pid);return p?.group===pid&&p.group!==ownerGroup;}),
   'actual Chromium roots lead distinct process groups; scorer group alone cannot own browser cleanup');
  t.diagnostic(mode+': browser root owns a separate process group from scorer owner');
  assert.equal(ready.profiles.length,1,'one actual Chromium temporary profile must be captured');
  const profile=ready.profiles[0];
  assert.equal(dirname(profile),scratch,'profile must be a direct child of this test private temporary root');
  assert.match(basename(profile),/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/);
  const initial=lstatSync(profile);
  const artifactNames=readdirSync(scratch).filter(name=>/^playwright-artifacts-[A-Za-z0-9]+$/.test(name));
  assert.equal(artifactNames.length,1);
  const artifact=join(scratch,artifactNames[0]),artifactIdentity=lstatSync(artifact);
  assert.ok(initial.isDirectory()&&!initial.isSymbolicLink(),'captured profile must be a real directory');
  assert.equal(initial.uid,process.getuid(),'captured profile belongs to test user');
  const registration=resources.register({scorerPid:child.pid,browserRoots:ready.roots,profilePath:profile});
  // Creator-private fixed metadata only. Record the refusal before cleanup;
  // a PRESERVED snapshot is never rewritten as a successful observation.
  t.diagnostic(mode+': resource registration '+JSON.stringify({snapshot:registration,diagnostic:resources.privateDiagnostic()}));
  assert.equal(registration.state,'OBSERVING');
  assert.ok(resources.observe().liveProcesses>1,'actual scorer and browser inventory must be nonempty');
  assert.equal(resources.observe().registeredScratchDirectories,2,'actual profile and artifacts must both be bound');
  // Replay the observed owned identities through the unactivated protocol.
  // These test-recipe digests are not preregistered trial/OS attestations.
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const protocol=createBrowserGuardianProtocol({attemptId:'lifecycle-'+mode,
   receiptSha256:digest(html),registrationSha256:digest(recipe.oracle)}),binding=protocol.binding();
  let sequence=0;
  const send=(type,payload={})=>protocol.receive(JSON.stringify({version:1,attemptId:binding.attemptId,
   capability:binding.capability,sequence:++sequence,type,...payload}));
  const processIds=[digest(['scorer',child.pid,groupTable.get(child.pid).birth]),
   ...[...owned].map(([pid,birth])=>digest(['browser',pid,birth]))];
  const profileId=digest(['profile',profile,initial.dev,initial.ino,initial.uid]);
  assert.equal(send('ready').state,'READY');
  assert.equal(send('register',{resources:[{id:processIds[0],kind:'scorer'},
   ...processIds.slice(1).map(id=>({id,kind:'browser'})),{id:profileId,kind:'profile'}]}).state,'OBSERVING');
  assert.equal(send('stop',{reason:mode==='owner-kill'?'scorer-death':mode==='owner-term'?'deadline':mode==='dom-refusal'?'dom-refusal':'normal'}).state,'STOPPING');
  if(mode==='owner-kill'||mode==='owner-term')child.kill(mode==='owner-kill'?'SIGKILL':'SIGTERM');
  else{child.stdin.write('continue\n');child.stdin.end();}
  if(mode==='owner-term'){
   assert.ok(await waitGone(owned),'SIGTERM must close captured browser tree while owner is held');
   let removed=false;
   for(let i=0;i<50;i++){try{lstatSync(profile);}catch(error){if(error.code!=='ENOENT')throw error;removed=true;break;}await pause(100);}
   assert.ok(removed,'handled SIGTERM must remove temporary profile');
   // Playwright handles SIGTERM by closing browsers, not by exiting Node.
   // Release this test-only barrier so the interrupted observer can unwind.
   child.stdin.write('continue\n');child.stdin.end();
  }
  const exit=await Promise.race([closed,new Promise((_,reject)=>{exitTimer=setTimeout(()=>reject(Error('observer owner did not terminate')),15000);})]);
  clearTimeout(exitTimer);
  if(mode==='owner-kill'){
   assert.equal(exit.signal,'SIGKILL');
   assert.equal(done,undefined,'killed observer must not emit a completed scoring result');
  }
  else if(mode==='owner-term'){
   assert.equal(exit.code,1,'interrupted observer must report failure after test barrier release');
   assert.equal(done,undefined,'terminated observer must not emit a completed scoring result');
  }
  else{assert.equal(exit.code,0,'actual observer completes without launch error');assert.ok(done);assert.equal(done.admitted,mode==='normal');}
  const stopped=await waitGone(owned);
  if(!stopped){
   // Failure evidence only, before fixture cleanup. Never print argv, paths,
   // environment or capabilities. No diagnostic renews the existing deadline.
   const rows=processes(),remaining=living(owned).slice(0,4).map(([pid,birth])=>{
    const command=spawnSync('/bin/ps',['-p',String(pid),'-o','comm='],
     {env,encoding:'utf8',timeout:250,killSignal:'SIGKILL',maxBuffer:1024});
    return {pid,birth,...rows.get(pid),command:command.status===0?basename(command.stdout.trim()).slice(0,80):'unknown'};
   });
   t.diagnostic(mode+': failed closure before cleanup '+JSON.stringify({owner:child.pid,remaining}));
  }
  if(mode!=='owner-kill')assert.ok(stopped,'captured browser tree must stop without test cleanup assistance');
  t.diagnostic(mode+': captured '+owned.size+' owned processes; stopped before fixture cleanup: '+stopped);
  let retained=false;
  try{const after=lstatSync(profile);assert.equal(after.ino,initial.ino,'profile identity must not change');retained=true;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let artifactsRetained=false;
  try{assert.equal(lstatSync(artifact).ino,artifactIdentity.ino,'artifact identity must not change');artifactsRetained=true;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  t.diagnostic(mode+': temporary profile '+(retained?'retained':'removed')+' before test cleanup');
  if(mode!=='owner-kill'){
   assert.equal(retained,false,'ordinary/refusal browser close must remove temporary profile');
   assert.equal(artifactsRetained,false,'ordinary/refusal browser close must remove temporary artifacts');
  }
  const observation=resources.observe();
  if(mode!=='owner-kill'){
   assert.equal(observation.state,'OBSERVING');
   assert.equal(observation.liveProcesses,0);
   assert.equal(observation.profileState,retained?'retained':'removed');
   assert.equal(observation.artifactsState,artifactsRetained?'retained':'removed');
   assert.equal(observation.retainedScratchDirectories,Number(retained)+Number(artifactsRetained));
  }else{
   assert.ok(['OBSERVING','PRESERVED'].includes(observation.state));
   t.diagnostic('owner-kill: abrupt-death observation before fallback '+JSON.stringify({observation,profileRetained:retained,artifactsRetained}));
  }
  for(const flag of ['cleanupAuthorized','resourceClosureVerified','osQuiescenceVerified','independentAdmissionVerified','benchmarkEligible'])assert.equal(observation[flag],false);
  if(mode==='normal'){
   chmodSync(scratch,0o755);
   assert.equal(resources.observe().state,'PRESERVED','changed root must invalidate an otherwise completed observation');
   chmodSync(scratch,0o700);
  }
  // Abrupt scorer death has no admitted external teardown. Even a zero-count
  // local sample is not closure proof. Never manufacture quiescent on this path.
  const protocolResult=mode==='owner-kill'?send('fault',{reason:'timeout'}):
   send('quiescent',{processes:processIds,profile:profileId,profileState:retained?'retained':'removed'});
  assert.equal(protocolResult.state,mode==='owner-kill'?'PRESERVED':'QUIESCENT');
  assert.equal(protocolResult.cleanupAuthorized,false,'trace consistency never authorizes OS deletion');
  assert.equal(protocolResult.benchmarkEligible,false);
  assert.equal(errors,mode==='owner-term'?'trusted browser lifecycle child failed\n':'','observer child must report only expected bounded error');
 }finally{
  clearTimeout(exitTimer);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  // If the assertion finds an orphan, reclaim only captured owned identities.
  // A reused PID or unrelated browser must never receive this cleanup signal.
  for(const [pid]of living(owned).reverse())try{process.kill(pid,'SIGKILL');}catch{}
  await closed;
  // Only this newly created test root is removable, and only after all captured
  // processes have stopped. A retained crash profile is measured above first.
  if(owned.size&&await waitGone(owned)){
   const current=lstatSync(scratch);
   assert.ok(current.isDirectory()&&!current.isSymbolicLink()&&current.ino===scratchIdentity.ino
    &&current.dev===scratchIdentity.dev&&current.uid===scratchIdentity.uid,'test cleanup root identity must remain unchanged');
   rmSync(scratch,{recursive:true,force:true});
  }
 }
});
