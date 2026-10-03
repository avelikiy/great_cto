import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBrowserResourceOwner} from './browser-guardian-resources.mjs';
import {performance} from 'node:perf_hooks';

const timingStages=new Set(['recipe','scorer-import','browser-load','observation','browser-launch','browser-launched','context-create','page-create','dom-content','resource-barrier','dom-observation','observation-complete']);

// Explicit fixed-fixture development probe. No arbitrary executable, oracle,
// path, environment, command, signals or deletion authority is accepted.
export function startBrowserGuardianProbe(mode,emit){
 if(!['normal','dom-refusal'].includes(mode)||typeof emit!=='function')throw Error('probe unavailable');
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot();
 const child=fork(fileURLToPath(new URL('./browser-guardian-probe.mjs',import.meta.url)),[],{
  execPath:process.execPath,execArgv:[],env:{LANG:'C',TZ:'UTC',TMPDIR:root,TMP:root,TEMP:root},
  stdio:['ignore','ignore','ignore','ipc']});
 let registered=false,released=false,closed=false,failed=false,done;
 let stage='launch',failureStage=null,probeStage=null,probeReason=null,directExit=null;
 const startedAt=performance.now(),timings=[];
 const privateDiagnostic=()=>Object.freeze({stage,failureStage,probeStage,probeReason,directExit,
  resource:owner.privateDiagnostic(),descendantQuiescenceVerified:false,benchmarkEligible:false});
 const unavailable=()=>{if(failed)return;failureStage=stage;failed=true;emit({kind:'probe-unavailable',privateDiagnostic:privateDiagnostic(),cleanupAuthorized:false,benchmarkEligible:false});if(child.connected)child.disconnect();};
 const requireObservation=()=>{const snapshot=owner.observe();
  if(snapshot.state!=='OBSERVING')throw Error('probe resource unavailable');return snapshot;};
 child.on('error',()=>unavailable());
 child.on('message',raw=>{
  try{
   stage='resource-frame';
   if(failed||closed||typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error('invalid probe resources');
   const m=JSON.parse(raw);if(JSON.stringify(m)!==raw)throw Error('invalid probe resources');
   if(m.kind==='timing'){
    if(Object.keys(m).sort().join(',')!=='elapsedMs,kind,stage'||!timingStages.has(m.stage)
     ||!Number.isSafeInteger(m.elapsedMs)||m.elapsedMs<0||m.elapsedMs>60000||timings.length>=32
     ||(timings.length&&m.elapsedMs<timings.at(-1).actorElapsedMs))throw Error('invalid probe timing');
    const timing=Object.freeze({stage:m.stage,actorElapsedMs:m.elapsedMs,brokerElapsedMs:Math.floor(performance.now()-startedAt)});
    timings.push(timing);
    // Private diagnostic only: no resources, capability, admission or timer reset.
    emit({kind:'probe-progress',privateTiming:timing,cleanupAuthorized:false,benchmarkEligible:false});
   }else if(m.kind==='resources'){
    if(registered||Object.keys(m).sort().join(',')!=='kind,profilePath,roots')throw Error('invalid probe resources');
    stage='registration';const snapshot=owner.register({scorerPid:child.pid,browserRoots:m.roots,profilePath:m.profilePath});
    if(snapshot.state!=='OBSERVING')throw Error('invalid probe resources');registered=true;
    stage='readiness-observation';
    const observed=requireObservation();stage='ready';
    emit({kind:'probe-ready',snapshot:observed});
   }else if(m.kind==='done'){
    if(!registered||!released||done!==undefined||Object.keys(m).sort().join(',')!=='kind,probeAdmitted'||typeof m.probeAdmitted!=='boolean')throw Error('invalid probe completion');
    stage='completion-observation';requireObservation();done=m.probeAdmitted;stage='completed';
   }else if(m.kind==='failed'){
    if(Object.keys(m).sort().join(',')!=='kind,reason,stage'||!['transport','recipe','scorer-import','browser-load','browser-launch','browser-launched','context-create','page-create','dom-content','resource-barrier','dom-observation','observation'].includes(m.stage)
     ||!['missing-browser-executable','launch-refused','stage-refused'].includes(m.reason)
     ||(m.stage!=='browser-launch'&&m.reason!=='stage-refused'))throw Error('invalid probe failure');
    probeStage=m.stage;probeReason=m.reason;stage='probe-failure';unavailable();
   }else throw Error('probe unavailable');
  }catch{unavailable();}
 });
 // Parent-driven IPC disconnect can omit ChildProcess close notification.
 // exit tracks this direct process only; snapshots never certify descriptor
 // closure, browser-tree quiescence or reaping from that event.
 child.once('exit',(code,signal)=>{closed=true;directExit=Object.freeze({code,signal});stage='direct-exit';const snapshot=owner.observe();
  if(!failed&&snapshot.state!=='OBSERVING')unavailable();
  emit({kind:'probe-ended',code,signal,probeAdmitted:failed?null:done??null,
   snapshot,cleanupAuthorized:false,benchmarkEligible:false});});
 child.send(JSON.stringify({version:1,kind:'init',mode}),error=>{if(error)unavailable();});
 return Object.freeze({
  // Only the private operator channel receives fixture recovery coordinates.
  privateResources:()=>Object.freeze({root,scorerPid:child.pid}),
  privateDiagnostic,
  observe:()=>failed?Object.freeze({...owner.snapshot(),state:'PRESERVED'}):owner.observe(),
  continue(){if(!registered||released||failed||closed)throw Error('probe unavailable');
   stage='continuation-observation';try{requireObservation();}catch{unavailable();throw Error('probe unavailable');}released=true;stage='continuation-sent';
   child.send(JSON.stringify({version:1,kind:'continue'}),error=>{if(error)unavailable();});},
  disconnect(){failed=true;if(child.connected)child.disconnect();}
 });
}
