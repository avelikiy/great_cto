import {spawnSync} from 'node:child_process';
import {mkdtempSync,realpathSync,lstatSync,opendirSync} from 'node:fs';
import {join,dirname,basename,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';

// Read-only practical ownership observation, NOT a cleanup capability. ps start
// times are not atomic kernel handles; same-UID tampering and late descendants
// remain outside this prototype's proof. No executable identity is attested.
const nativeCodes=new Set(['ETIMEDOUT','ENOBUFS','ENOENT','EACCES','EPERM','EAGAIN','ENOMEM','EMFILE','ENFILE','E2BIG','EINVAL','ENOSYS','EINTR','EIO']);
const nativeSignals=new Set(['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGTRAP','SIGABRT','SIGBUS','SIGFPE','SIGKILL','SIGSEGV','SIGPIPE','SIGALRM','SIGTERM','SIGUSR1','SIGUSR2']);
function inventory(stage,record){
 const startedAt=new Date().toISOString(),start=performance.now();
 const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,uid=,pgid=,stat=,lstart='],
  {env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1048576});
 const errorCode=result.error?(nativeCodes.has(result.error.code)?result.error.code:'UNCLASSIFIED'):null;
 const signal=nativeSignals.has(result.signal)?result.signal:null;
 const diagnostic=Object.freeze({exitCode:Number.isInteger(result.status)?result.status:null,signal,errorCode,
  outcome:errorCode==='ETIMEDOUT'?'timeout':errorCode==='ENOBUFS'?'output-limit':errorCode?'process-error':signal?'signalled':result.status===0?'exited-zero':'nonzero-or-unknown',
  startedAt,finishedAt:new Date().toISOString(),elapsedMs:Math.max(0,Math.round(performance.now()-start)),timeoutMs:1000,
  descendantQuiescenceVerified:false,benchmarkEligible:false});
 record(diagnostic);
 const refuse=reason=>{const error=Error('inventory unavailable');
  error.privateDiagnostic=Object.freeze({stage,reason,inventory:diagnostic});throw error;};
 if(result.status!==0||result.error||result.signal)refuse('process-refused');
 const rows=new Map();
 for(const line of result.stdout.split('\n')){
  if(!line.trim())continue;
  const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
  if(!m||rows.has(Number(m[1]))||rows.size>=16384)refuse('rows-refused');
  rows.set(Number(m[1]),Object.freeze({parent:Number(m[2]),uid:Number(m[3]),group:Number(m[4]),state:m[5],birth:m[6]}));
 }
 if(!rows.size)refuse('rows-refused');return rows;
}
const pid=value=>Number.isSafeInteger(value)&&value>1;
const directory=path=>{
 const s=lstatSync(path);
 if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error('identity changed');
 return Object.freeze({dev:s.dev,ino:s.ino,uid:s.uid});
};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid;

export function createBrowserResourceOwner({ownerPid}={}){
 if(!['darwin','linux'].includes(process.platform)||typeof process.getuid!=='function'||ownerPid!==process.pid)throw Error('resource observation unavailable');
 let nativeDiagnostic,step='construction-inventory',lastDiagnostic;
 const note=(stage,reason=null)=>{step=stage;lastDiagnostic=Object.freeze({stage,reason,inventory:nativeDiagnostic});};
 const readInventory=stage=>{try{return inventory(stage,value=>{nativeDiagnostic=value;note(stage);});}
  catch(error){const reason=error.privateDiagnostic?.reason;
   note(stage,['process-refused','rows-refused'].includes(reason)?reason:'inventory-refused');throw error;}};
 readInventory('construction-inventory');
 const root=realpathSync(mkdtempSync(join(realpathSync(tmpdir()),'great-cto-resource-owner-'))),rootIdentity=directory(root);
 let state='CREATED',registry,profileName,scratch,removed=new Set();
 const snapshot=(extra={})=>Object.freeze({state,observationAuthority:'unattested-local-os-inventory',
  osQuiescenceVerified:false,resourceClosureVerified:false,cleanupAuthorized:false,
  independentAdmissionVerified:false,benchmarkEligible:false,...extra});
 note('created');
 const preserve=()=>{state='PRESERVED';note(step,lastDiagnostic.reason??'resource-refused');return snapshot();};
 const checkRoot=()=>{if(!same(directory(root),rootIdentity))throw Error('identity changed');};
 const scratchInventory=()=>{
  checkRoot();const entries=new Map(),dir=opendirSync(root);
  try{for(let entry;(entry=dir.readSync());){
   if(entries.size>=8||!/^(?:playwright_chromiumdev_profile|playwright-artifacts)-[A-Za-z0-9]+$/.test(entry.name))throw Error('unknown scratch resource');
   const identity=directory(join(root,entry.name));if(identity.dev!==rootIdentity.dev)throw Error('identity changed');
   entries.set(entry.name,identity);
  }}finally{dir.closeSync();}
  checkRoot();return entries;
 };
 return Object.freeze({
  // Private transport only: never include this path in a public snapshot.
  privateRoot:()=>root,
  // Creator-private cause metadata; never serialized as public authority.
  privateDiagnostic:()=>lastDiagnostic,
  snapshot:()=>snapshot(),
  register(input){
   if(state!=='CREATED')return preserve();
   try{
    note('registration-root');checkRoot();note('registration-shape');
    if(!input||Object.keys(input).sort().join(',')!=='browserRoots,profilePath,scorerPid')throw Error('invalid registration');
    const {scorerPid,browserRoots,profilePath}=input;
    if(!pid(scorerPid)||!Array.isArray(browserRoots)||!browserRoots.length||browserRoots.length>16
     ||!browserRoots.every(pid)||new Set(browserRoots).size!==browserRoots.length||browserRoots.includes(scorerPid))throw Error('invalid registration');
    if(typeof profilePath!=='string'||profilePath.length>4096||!isAbsolute(profilePath)||dirname(profilePath)!==root
     ||!/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/.test(basename(profilePath)))throw Error('invalid registration');
    note('registration-scratch');const capturedScratch=scratchInventory(),name=basename(profilePath);
    if(!capturedScratch.has(name)||capturedScratch.size!==2||[...capturedScratch.keys()].filter(n=>n.startsWith('playwright-artifacts-')).length!==1)throw Error('incomplete scratch registration');
    const table=readInventory('registration-inventory'),scorer=table.get(scorerPid),uid=process.getuid();note('registration-lineage');
    if(!scorer||scorer.parent!==ownerPid||scorer.uid!==uid||scorer.state.startsWith('Z'))throw Error('invalid registration');
    const captured=new Map([[scorerPid,scorer]]),browsers=new Set(browserRoots);
    for(const id of browserRoots){const p=table.get(id);
     if(!p||p.parent!==scorerPid||p.uid!==uid||p.group!==id||p.group===scorer.group||p.state.startsWith('Z'))throw Error('invalid registration');}
    for(let changed=true;changed;){changed=false;for(const [id,p]of table)if(!browsers.has(id)&&browsers.has(p.parent)){browsers.add(id);changed=true;if(browsers.size>63-capturedScratch.size)throw Error('invalid registration');}}
    for(const id of browsers){const p=table.get(id);if(p.uid!==uid)throw Error('invalid registration');captured.set(id,p);}
    // Browser descendants were explicitly captured above. Any other child of
    // the scorer/captured tree is outside the admitted registration, even when
    // it shares this UID. Never silently omit or later adopt that process.
    for(const [id,p]of table)if(!captured.has(id)&&captured.has(p.parent))throw Error('incomplete process registration');
    registry=captured;profileName=name;scratch=capturedScratch;state='OBSERVING';note('registered');return snapshot({registeredProcesses:registry.size,registeredScratchDirectories:scratch.size});
   }catch{return preserve();}
  },
  observe(){
   if(state!=='OBSERVING'||!registry?.size)return preserve();
   try{
    note('observation-root');checkRoot();const table=readInventory('observation-inventory');note('observation-identities');let liveProcesses=0;
    for(const [id,previous]of registry){const current=table.get(id);if(!current)continue;
     if(current.birth!==previous.birth||current.uid!==previous.uid||current.group!==previous.group)throw Error('identity changed');
     if(!current.state.startsWith('Z'))liveProcesses++;
    }
    for(const [id,current]of table)if(!registry.has(id)&&registry.has(current.parent))throw Error('uncaptured descendant');
    note('observation-scratch');const currentScratch=scratchInventory();
    for(const [name,identity]of currentScratch){if(!scratch.has(name)||removed.has(name)||!same(identity,scratch.get(name)))throw Error('identity changed');}
    for(const name of scratch.keys())if(!currentScratch.has(name))removed.add(name);
    note('observed');return snapshot({registeredProcesses:registry.size,liveProcesses,registeredScratchDirectories:scratch.size,
     retainedScratchDirectories:currentScratch.size,profileState:removed.has(profileName)?'removed':'retained',
     artifactsState:removed.size-(removed.has(profileName)?1:0)>0?'removed':'retained'});
   }catch{return preserve();}
  }
 });
}
