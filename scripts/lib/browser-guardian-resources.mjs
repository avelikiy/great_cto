import {spawnSync} from 'node:child_process';
import {mkdtempSync,realpathSync,lstatSync} from 'node:fs';
import {join,dirname,basename,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';

// Read-only practical ownership observation, NOT a cleanup capability. ps start
// times are not atomic kernel handles; same-UID tampering and late descendants
// remain outside this prototype's proof. No executable identity is attested.
function inventory(){
 const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,uid=,pgid=,stat=,lstart='],
  {env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1048576});
 if(result.status!==0||result.error)throw Error('inventory unavailable');
 const rows=new Map();
 for(const line of result.stdout.split('\n')){
  if(!line.trim())continue;
  const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);
  if(!m||rows.has(Number(m[1]))||rows.size>=16384)throw Error('inventory unavailable');
  rows.set(Number(m[1]),Object.freeze({parent:Number(m[2]),uid:Number(m[3]),group:Number(m[4]),state:m[5],birth:m[6]}));
 }
 if(!rows.size)throw Error('inventory unavailable');return rows;
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
 inventory();
 const root=realpathSync(mkdtempSync(join(realpathSync(tmpdir()),'great-cto-resource-owner-'))),rootIdentity=directory(root);
 let state='CREATED',registry,profile,profileIdentity;
 const snapshot=(extra={})=>Object.freeze({state,observationAuthority:'unattested-local-os-inventory',
  osQuiescenceVerified:false,resourceClosureVerified:false,cleanupAuthorized:false,
  independentAdmissionVerified:false,benchmarkEligible:false,...extra});
 const preserve=()=>{state='PRESERVED';return snapshot();};
 const checkRoot=()=>{if(!same(directory(root),rootIdentity))throw Error('identity changed');};
 return Object.freeze({
  // Private transport only: never include this path in a public snapshot.
  privateRoot:()=>root,
  snapshot:()=>snapshot(),
  register(input){
   if(state!=='CREATED')return preserve();
   try{
    checkRoot();
    if(!input||Object.keys(input).sort().join(',')!=='browserRoots,profilePath,scorerPid')throw Error('invalid registration');
    const {scorerPid,browserRoots,profilePath}=input;
    if(!pid(scorerPid)||!Array.isArray(browserRoots)||!browserRoots.length||browserRoots.length>16
     ||!browserRoots.every(pid)||new Set(browserRoots).size!==browserRoots.length||browserRoots.includes(scorerPid))throw Error('invalid registration');
    if(typeof profilePath!=='string'||!isAbsolute(profilePath)||dirname(profilePath)!==root
     ||!/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/.test(basename(profilePath)))throw Error('invalid registration');
    const identity=directory(profilePath);if(identity.dev!==rootIdentity.dev)throw Error('invalid registration');
    const table=inventory(),scorer=table.get(scorerPid),uid=process.getuid();
    if(!scorer||scorer.parent!==ownerPid||scorer.uid!==uid||scorer.state.startsWith('Z'))throw Error('invalid registration');
    const captured=new Map([[scorerPid,scorer]]),browsers=new Set(browserRoots);
    for(const id of browserRoots){const p=table.get(id);
     if(!p||p.parent!==scorerPid||p.uid!==uid||p.group!==id||p.group===scorer.group||p.state.startsWith('Z'))throw Error('invalid registration');}
    for(let changed=true;changed;){changed=false;for(const [id,p]of table)if(!browsers.has(id)&&browsers.has(p.parent)){browsers.add(id);changed=true;if(browsers.size>62)throw Error('invalid registration');}}
    for(const id of browsers){const p=table.get(id);if(p.uid!==uid)throw Error('invalid registration');captured.set(id,p);}
    registry=captured;profile=profilePath;profileIdentity=identity;state='OBSERVING';return snapshot({registeredProcesses:registry.size});
   }catch{return preserve();}
  },
  observe(){
   if(state!=='OBSERVING'||!registry?.size)return preserve();
   try{
    checkRoot();const table=inventory();let liveProcesses=0;
    for(const [id,previous]of registry){const current=table.get(id);if(!current)continue;
     if(current.birth!==previous.birth||current.uid!==previous.uid||current.group!==previous.group)throw Error('identity changed');
     if(!current.state.startsWith('Z'))liveProcesses++;
    }
    let profileState='retained';
    try{if(!same(directory(profile),profileIdentity))throw Error('identity changed');}
    catch(error){if(error.code!=='ENOENT')throw error;profileState='removed';}
    return snapshot({registeredProcesses:registry.size,liveProcesses,profileState});
   }catch{return preserve();}
  }
 });
}
