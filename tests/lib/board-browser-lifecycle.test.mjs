import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,realpathSync,lstatSync,rmSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {boardAccessibilityBenchmarkFixture} from '../../scripts/lib/board-accessibility-benchmark-fixture.mjs';

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
 const r=spawnSync('ps',['-axo','pid=,ppid=,stat=,lstart='],{env,encoding:'utf8',timeout:5000,maxBuffer:1048576});
 assert.equal(r.status,0,'owned-process inventory must be available');const table=new Map();
 for(const line of r.stdout.split('\n')){const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
  if(m)table.set(Number(m[1]),{parent:Number(m[2]),state:m[3],birth:m[4]});}
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

for(const mode of ['normal','dom-refusal','owner-term','owner-kill'])test('actual observer browser processes stop after '+mode,{timeout:30000},async t=>{
 if(process.platform!=='darwin'&&process.platform!=='linux')return t.skip('process-tree inventory unsupported; lifecycle NOT CHECKED');
 const recipe=boardAccessibilityBenchmarkFixture();if(!recipe.oracle.browser)return t.skip('Playwright unavailable; lifecycle NOT CHECKED');
 const scratch=realpathSync(mkdtempSync(join(tmpdir(),'great-cto-owned-browser-')));
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
  assert.equal(ready.profiles.length,1,'one actual Chromium temporary profile must be captured');
  const profile=ready.profiles[0];
  assert.equal(dirname(profile),scratch,'profile must be a direct child of this test private temporary root');
  assert.match(basename(profile),/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/);
  const initial=lstatSync(profile);
  assert.ok(initial.isDirectory()&&!initial.isSymbolicLink(),'captured profile must be a real directory');
  assert.equal(initial.uid,process.getuid(),'captured profile belongs to test user');
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
  if(mode==='owner-kill')assert.equal(exit.signal,'SIGKILL');
  else if(mode==='owner-term'){
   assert.equal(exit.code,1,'interrupted observer must report failure after test barrier release');
   assert.equal(done,undefined,'terminated observer must not emit a completed scoring result');
  }
  else{assert.equal(exit.code,0,'actual observer completes without launch error');assert.ok(done);assert.equal(done.admitted,mode==='normal');}
  assert.ok(await waitGone(owned),'captured browser tree must stop without test cleanup assistance');
  t.diagnostic(mode+': captured '+owned.size+' owned processes; none remained running before cleanup');
  let retained=false;
  try{const after=lstatSync(profile);assert.equal(after.ino,initial.ino,'profile identity must not change');retained=true;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  t.diagnostic(mode+': temporary profile '+(retained?'retained':'removed')+' before test cleanup');
  if(mode!=='owner-kill')assert.equal(retained,false,'ordinary/refusal browser close must remove temporary profile');
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
