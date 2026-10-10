// Unactivated fixed-fixture probe, not an admitted production scorer bootstrap.
// Spawn instrumentation is evidence scaffolding; candidate paths/oracles and
// executable commands are deliberately not accepted on this private channel.
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {boardAccessibilityBenchmarkFixture} from './board-accessibility-benchmark-fixture.mjs';
import {performance} from 'node:perf_hooks';

let started=false,released=false,completed=false,rejectBarrier,releaseBarrier;
let stage='transport';
let failureReason='stage-refused';
const roots=[],profiles=[],original=cp.spawn;
cp.spawn=function(...args){const child=original(...args);child.once('spawn',()=>{
 roots.push(child.pid);
 for(const arg of args[1]??[])if(arg.startsWith('--user-data-dir='))profiles.push(arg.slice('--user-data-dir='.length));
});return child;};
syncBuiltinESMExports();
const barrier=new Promise((resolve,reject)=>{releaseBarrier=resolve;rejectBarrier=reject;});
// A disconnect before observation awaits the barrier must still be handled.
barrier.catch(()=>{});
const send=m=>{if(process.connected)process.send(JSON.stringify(m));};
const startedAt=performance.now();
function enter(value){stage=value;send({kind:'timing',stage,elapsedMs:Math.floor(performance.now()-startedAt)});}
process.on('disconnect',()=>{if(!completed){rejectBarrier(Error('probe disconnected'));process.exitCode=1;}});
if(!process.channel)process.exitCode=1;
else process.on('message',async raw=>{
 try{
  if(typeof raw!=='string'||Buffer.byteLength(raw)>256)throw Error('invalid probe frame');
  const m=JSON.parse(raw);if(JSON.stringify(m)!==raw||m.version!==1)throw Error('invalid probe frame');
  if(started){
   if(released||JSON.stringify(Object.keys(m).sort())!=='["kind","version"]'||m.kind!=='continue')throw Error('invalid probe continuation');
   released=true;releaseBarrier();return;
  }
  if(JSON.stringify(Object.keys(m).sort())!=='["kind","mode","version"]'||m.kind!=='init'||!['normal','dom-refusal'].includes(m.mode))throw Error('invalid probe init');
  started=true;
  enter('recipe');
  const recipe=boardAccessibilityBenchmarkFixture();
  enter('scorer-import');
  const {observeBoard,loadPinnedBoardBrowser}=await import('../benchmark-scorers/board-accessibility.mjs');
  enter('browser-load');
  const chromium=await loadPinnedBoardBrowser(recipe.oracle.browser,process.env.TMPDIR),launch=chromium.launch;
  let reported=false;
  chromium.launch=async function(...args){enter('browser-launch');let browser;
   try{browser=await launch.apply(this,args);}catch(error){
    // Recognize the tool's explicit prerequisite refusal; never forward its
    // message, executable path, launch arguments or native browser logs.
    failureReason=typeof error.message==='string'&&error.message.includes("Executable doesn't exist at ")
     ?'missing-browser-executable':'launch-refused';throw error;
   }
   enter('browser-launched');const newContext=browser.newContext;
   browser.newContext=async function(...args){enter('context-create');const context=await newContext.apply(this,args),newPage=context.newPage;
    context.newPage=async function(...args){enter('page-create');const page=await newPage.apply(this,args),setContent=page.setContent;
     page.setContent=async function(...args){enter('dom-content');const value=await setContent.apply(this,args);
      if(!reported){reported=true;if(profiles.length!==1)throw Error('invalid probe resources');
       enter('resource-barrier');send({kind:'resources',roots,profilePath:profiles[0]});await barrier;enter('dom-observation');}
      return value;};return page;};return context;};return browser;};
  let html=recipe.files['web/board.html'];if(m.mode==='dom-refusal')html=html.replace('id="approve"','id="approve" onclick="throw 1"');
  enter('observation');const result=await observeBoard(html,recipe.oracle,process.env.TMPDIR);
  completed=true;
  enter('observation-complete');
  process.send(JSON.stringify({kind:'done',probeAdmitted:result.admitted}),()=>{if(process.connected)process.disconnect();});
 }catch{process.exitCode=1;send({kind:'failed',stage,reason:failureReason});}
 finally{if(started&&process.connected&&(!released||process.exitCode===1)){
  // Keep a held successful probe connected; terminate only failed execution.
  if(process.exitCode===1)process.disconnect();
 }}
});
