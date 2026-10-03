import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBrowserResourceOwner} from './browser-guardian-resources.mjs';

// Explicit fixed-fixture development probe. No arbitrary executable, oracle,
// path, environment, command, signals or deletion authority is accepted.
export function startBrowserGuardianProbe(mode,emit){
 if(!['normal','dom-refusal'].includes(mode)||typeof emit!=='function')throw Error('probe unavailable');
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot();
 const child=fork(fileURLToPath(new URL('./browser-guardian-probe.mjs',import.meta.url)),[],{
  execPath:process.execPath,execArgv:[],env:{LANG:'C',TZ:'UTC',TMPDIR:root,TMP:root,TEMP:root},
  stdio:['ignore','ignore','ignore','ipc']});
 let registered=false,released=false,closed=false,failed=false,done;
 const unavailable=()=>{if(failed)return;failed=true;emit({kind:'probe-unavailable',cleanupAuthorized:false,benchmarkEligible:false});if(child.connected)child.disconnect();};
 child.on('error',()=>unavailable());
 child.on('message',raw=>{
  try{
   if(failed||closed||typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error('invalid probe resources');
   const m=JSON.parse(raw);if(JSON.stringify(m)!==raw)throw Error('invalid probe resources');
   if(m.kind==='resources'){
    if(registered||Object.keys(m).sort().join(',')!=='kind,profilePath,roots')throw Error('invalid probe resources');
    const snapshot=owner.register({scorerPid:child.pid,browserRoots:m.roots,profilePath:m.profilePath});
    if(snapshot.state!=='OBSERVING')throw Error('invalid probe resources');registered=true;
    emit({kind:'probe-ready',snapshot:owner.observe()});
   }else if(m.kind==='done'){
    if(!registered||!released||done!==undefined||Object.keys(m).sort().join(',')!=='kind,probeAdmitted'||typeof m.probeAdmitted!=='boolean')throw Error('invalid probe completion');
    done=m.probeAdmitted;
   }else throw Error('probe unavailable');
  }catch{unavailable();}
 });
 child.once('close',(code,signal)=>{closed=true;emit({kind:'probe-ended',code,signal,
  probeAdmitted:done??null,snapshot:owner.observe(),cleanupAuthorized:false,benchmarkEligible:false});});
 child.send(JSON.stringify({version:1,kind:'init',mode}),error=>{if(error)unavailable();});
 return Object.freeze({
  // Only the private operator channel receives fixture recovery coordinates.
  privateResources:()=>Object.freeze({root,scorerPid:child.pid}),
  observe:()=>failed?Object.freeze({...owner.snapshot(),state:'PRESERVED'}):owner.observe(),
  continue(){if(!registered||released||failed||closed)throw Error('probe unavailable');released=true;
   child.send(JSON.stringify({version:1,kind:'continue'}),error=>{if(error)unavailable();});},
  disconnect(){failed=true;if(child.connected)child.disconnect();}
 });
}
