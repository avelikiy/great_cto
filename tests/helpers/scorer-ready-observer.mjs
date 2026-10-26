// Test-only lifecycle observation. This is not production execution authority.
import {watch,readFileSync} from 'node:fs';
import {dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';

function checkedMarker(value){
 if(!value||Object.keys(value).sort().join(',')!=='handlerReady,pid,publishedAt'||value.handlerReady!==true||!Number.isInteger(value.pid)||value.pid<=1||typeof value.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.publishedAt)||!Number.isFinite(Date.parse(value.publishedAt)))throw Error('invalid scorer ready marker');
 return value;
}
export function validateScorerReady(marker,diagnostic,expectedPid){
 checkedMarker(marker);
 if(marker.pid!==expectedPid||diagnostic?.pid!==expectedPid||diagnostic.timeoutMs!==1000)throw Error('scorer ready PID or deadline mismatch');
 const published=Date.parse(marker.publishedAt),start=Date.parse(diagnostic.startedAt),finish=Date.parse(diagnostic.finishedAt);
 if(!Number.isFinite(start)||!Number.isFinite(finish)||finish<start||published<start||published>start+1000||published>finish)throw Error('scorer ready publication outside actual1000ms process window');
 return marker;
}
export function readFixtureProcessIdentity(pid){
 if(!Number.isInteger(pid)||pid<=1)return null;
 try{
  const parts=execFileSync('ps',['-p',String(pid),'-o','pid=,ppid=,pgid=,lstart='],{encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore'],env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'}}).trim().split(/\s+/);
  if(parts.length<8||Number(parts[0])!==pid||!Number.isInteger(Number(parts[1]))||!Number.isInteger(Number(parts[2])))return null;
  return {pid,ppid:Number(parts[1]),pgid:Number(parts[2]),birth:parts.slice(3).join(' ')};
 }catch{return null;}
}
const sameCreation=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.pgid===b.pgid&&a.birth===b.birth&&typeof a.birth==='string'&&a.birth.length>0;
export function terminateOwnedScorerFixture({launcher,launcherIdentity,ready,processIdentity=readFixtureProcessIdentity,kill=process.kill.bind(process)}){
 // A negative PID is allowed only while the original owner-created launcher is
 // still identified by creation identity and its observed private process group.
 const current=processIdentity(launcher.pid);
 if(launcher.exitCode===null&&launcher.signalCode===null&&launcherIdentity?.pid===launcher.pid&&launcherIdentity.ppid===process.pid&&launcherIdentity.pgid===launcher.pid&&sameCreation(current,launcherIdentity)&&current.ppid===process.pid){
  try{kill(-launcherIdentity.pgid,'SIGKILL');return {groupTerminated:true};}catch(error){if(error.code!=='ESRCH')throw error;}
 }
 // A known scorer may survive a launcher exit. Match its creation identity and
 // original ownership before signalling only that process, never a reused group.
 const scorer=ready?.identity,now=scorer&&processIdentity(scorer.pid);
 if(scorer?.ppid===launcher.pid&&scorer.pgid===launcherIdentity?.pgid&&sameCreation(now,scorer)){
  try{kill(scorer.pid,'SIGKILL');return {groupTerminated:false,scorerTerminated:true};}catch(error){if(error.code!=='ESRCH')throw error;}
 }
 return {groupTerminated:false,scorerTerminated:false};
}

export function createScorerReadyObserver({marker,launcher,signal,processIdentity=readFixtureProcessIdentity,monotonicNow=()=>performance.now()}){
 const start=monotonicNow();let observation=null,readyAt=null,settled=false,disposed=false,watcherClosed=false,timer=null,watcher;
 let readyResolve,readyReject,completeResolve,completeReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const completed=new Promise((resolve,reject)=>{completeResolve=resolve;completeReject=reject;});
 // Both public channels retain their rejection. Attach handlers now because the
 // caller deliberately reads the original diagnostic polling window first.
 ready.catch(()=>undefined);completed.catch(()=>undefined);
 const dispose=()=>{
  if(disposed)return;disposed=true;
  if(timer!==null){clearTimeout(timer);timer=null;}
  if(watcher){watcher.close();watcherClosed=true;}
  launcher.removeListener('close',onClose);launcher.removeListener('error',onError);signal?.removeEventListener('abort',onAbort);
 };
 const fail=error=>{if(settled)return;settled=true;if(!observation)readyReject(error);completeReject(error);dispose();};
 const inspect=()=>{
  if(settled||observation)return;
  let raw;
  try{raw=readFileSync(marker,'utf8');}catch(error){if(error.code==='ENOENT')return;fail(Error('scorer ready marker unreadable'));return;}
  if(Buffer.byteLength(raw)>4096){fail(Error('scorer ready marker size limit'));return;}
  let value;try{value=JSON.parse(raw);}catch{return;}
  try{
   checkedMarker(value);readyAt=monotonicNow();const observedAt=new Date().toISOString(),observedParentElapsedMs=Math.round(readyAt-start);
   // Start the same2000ms budget at actual observation, before the live-identity
   // syscall. Neither publication nor a later diagnostic renews the watchdog.
   timer=setTimeout(()=>fail(Error('launcher exceeded2000ms watchdog after observed scorer readiness')),2000);
   const identity=processIdentity(value.pid);
   if(!identity||identity.pid!==value.pid||identity.ppid!==launcher.pid)throw Error('ready scorer must belong to test-owned launcher while alive');
   observation=Object.freeze({...value,observedAt,observedParentElapsedMs,identity:Object.freeze({...identity})});readyResolve(observation);
  }catch(error){fail(error);}
 };
 function onClose(code,signalValue){
  if(settled)return;inspect();if(settled)return;
  if(!observation){fail(Error('trusted scorer readiness was not observed before launcher completion'));return;}
  // Event-loop congestion may deliver close before the already-due timer.
  // The same monotonic2000ms budget still refuses that late completion.
  if(monotonicNow()-readyAt>2000){fail(Error('launcher exceeded2000ms watchdog after observed scorer readiness'));return;}
  settled=true;completeResolve({code,signal:signalValue});dispose();
 }
 function onError(){fail(Error('owned scorer launcher failed'));}
 function onAbort(){const error=Error('scorer lifecycle observation aborted');error.name='AbortError';fail(error);}
 watcher=watch(dirname(marker),(_event,name)=>{if(name===null||String(name)===basename(marker))inspect();});
 watcher.on('error',()=>fail(Error('scorer readiness watcher failed')));
 launcher.once('close',onClose);launcher.once('error',onError);signal?.addEventListener('abort',onAbort,{once:true});
 if(signal?.aborted)onAbort();
 return {ready,completed,inspect,dispose,snapshot:()=>({observation,disposed,watcherClosed,timerActive:timer!==null,watchdogMs:2000})};
}
