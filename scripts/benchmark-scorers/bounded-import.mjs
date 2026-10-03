/** Standalone pinned scorer. Candidate code runs in a restricted second process. */
import { realpathSync,lstatSync,readdirSync,openSync,fstatSync,readSync,closeSync,constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const wrapper=`const input=INPUT_LITERAL;
const clone=structuredClone,serialize=JSON.stringify,append=Function.prototype.call.bind(Array.prototype.push);
const emit=process.stdout.write.bind(process.stdout);
const mod=await import('data:text/javascript;base64,'+Buffer.from(input.code).toString('base64'));
const observations=[];
for(const group of input.groups){
 const state=clone(group.initial),steps=[];let token;
 for(const step of group.steps){
  const before=serialize(state);let result;
  try{result=await mod.run(step.rollback?{state,rollbackToken:token}:{state,input:clone(step.input),dryRun:step.dryRun});}
  catch{result={status:'exception'};}
  if(result?.status==='applied')token=result.rollbackToken;
  append(steps,{result:{status:result?.status,coveredTo:result?.coveredTo},state:clone(state),unchanged:before===serialize(state)});
 }
 append(observations,steps);
}
emit(serialize(observations));`;

function sandboxProfile(root,node){
 // SBPL paths are encoded literals, never policy fragments or shell text.
 const literal=path=>{
  if(/[\x00-\x1f]/.test(path))throw Error('invalid sandbox path');
  return '(literal '+JSON.stringify(path)+')';
 };
 return ['(version 1)','(deny default)','(allow process-exec '+literal(node)+')',
  '(allow file-read* (literal "/") (subpath "/System/Library") (subpath "/usr/lib") (subpath "/usr/share") '+
   literal(node)+' (subpath '+JSON.stringify(root)+'))',
  '(allow file-read-metadata)','(allow sysctl-read)'].join('\n');
}

export function runIsolatedImportCandidate({root,code,groups,timeoutMs=3000}){
 if(process.platform!=='darwin')throw Error('candidate isolation unavailable on this platform');
 root=realpathSync(root);const node=realpathSync(process.execPath);
 if(root==='/'||!lstatSync(root).isDirectory()||/[\x00-\x1f]/.test(root+node)||typeof code!=='string'
  ||Buffer.byteLength(code)>65536||!Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>5000)throw Error('invalid isolated candidate input');
 const data={code,groups:groups.map(g=>({initial:g.initial,steps:g.steps.map(s=>s.rollback?{rollback:true}:{input:s.input,dryRun:s.dryRun})}))};
 const literal=JSON.stringify(data);if(Buffer.byteLength(literal)>262144)throw Error('isolated input exceeds bound');
 const profile=sandboxProfile(root,node);
 const child=spawnSync('/usr/bin/sandbox-exec',['-p',profile,node,'--no-addons','--input-type=module','-'],{
  cwd:root,input:wrapper.replace('INPUT_LITERAL',literal),env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:timeoutMs,maxBuffer:65536,killSignal:'SIGKILL'});
 if(child.error||child.status!==0||child.signal)throw Error('isolated candidate process unavailable');
 let observations;try{observations=JSON.parse(child.stdout);}catch{throw Error('isolated candidate output unavailable');}
 if(!Array.isArray(observations)||observations.length!==groups.length)throw Error('isolated candidate output shape invalid');
 return {observations,pid:child.pid};
}
const text=x=>typeof x==='string'&&x.length>0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
function valid(x){
 if(!x||!text(x.batchId)||!integer(x.from)||!Array.isArray(x.sources)||!x.sources.length||x.sources.length>100
  ||x.sources.some(s=>!s||!text(s.name)||!integer(s.coveredTo)||s.coveredTo<x.from)
  ||new Set(x.sources.map(s=>s.name)).size!==x.sources.length||!Array.isArray(x.rows)||x.rows.length>100)return false;
 const names=new Map(x.sources.map(s=>[s.name,s.coveredTo]));
 return new Set(x.rows.map(r=>r?.id)).size===x.rows.length&&x.rows.every(r=>r&&text(r.id)&&names.has(r.source)
  &&integer(r.time)&&r.time>=x.from&&r.time<=names.get(r.source)&&typeof r.value==='number'&&Number.isFinite(r.value));
}
function canonical(x){
 if(Array.isArray(x))return x.map(canonical);
 if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
 return x;
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function apply(state,x){
 const to=Math.min(...x.sources.map(s=>s.coveredTo));
 return {rows:[...state.rows.filter(r=>r.time<x.from||r.time>to),...x.rows.filter(r=>r.time<=to)]
  .sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)),imports:[...state.imports,x.batchId],revision:state.revision+1};
}
function verifyOracle(o){
 if(o.scenario!=='bounded-import'||!Array.isArray(o.groups)||o.groups.map(g=>g.kind).join()!=='invalid,dry-run,bounded,repeat,rollback'
  ||!Array.isArray(o.protected))throw Error('unsupported import oracle');
 const lengths=[13,2,1,2,3],base=o.groups[2],x=base.steps?.[0]?.input;
 if(!valid(x)||x.sources.length<2||new Set(x.sources.map(s=>s.coveredTo)).size<2)throw Error('incomplete source coverage oracle');
 const to=Math.min(...x.sources.map(s=>s.coveredTo)),initial=base.initial;
 if(!initial||!Array.isArray(initial.rows)||initial.imports?.length!==0||initial.revision!==0
  ||!initial.rows.some(r=>r.time<x.from)||!initial.rows.some(r=>r.time>to)||!initial.rows.some(r=>r.time>=x.from&&r.time<=to)
  ||!x.rows.some(r=>r.time>to)||!x.rows.some(r=>r.time===x.from&&r.value===0)||!x.rows.some(r=>r.time===to))throw Error('incomplete bounded history oracle');
 for(let i=0;i<5;i++){
  const g=o.groups[i];if(!same(g.initial,initial)||!Array.isArray(g.steps)||g.steps.length!==lengths[i])throw Error('incomplete import sequence');
  let current=structuredClone(initial),token;
  for(let j=0;j<g.steps.length;j++){
   const s=g.steps[j];let status,coveredTo;
   if(i===4&&j===1){if(s.rollback!==true||!token)throw Error('missing rollback sequence');current=token;status='rolled-back';}
   else{
    const shouldBeValid=i!==0&&!(i===1&&j===1);
    if(s.rollback||typeof s.dryRun!=='boolean'||valid(s.input)!==shouldBeValid)throw Error('mislabeled import validity');
    if(!shouldBeValid){status='invalid';}
    else{
     if(!same(s.input,x)||s.dryRun!==(i===1))throw Error('changed import sequence');
     coveredTo=to;
     if(s.dryRun)status='preview';
     else if(current.imports.includes(x.batchId))status='duplicate';
     else{token=structuredClone(current);current=apply(current,x);status='applied';}
    }
   }
   if(!same(s.expected,coveredTo===undefined?{status}:{status,coveredTo})||!same(s.state,current))throw Error('changed import expectation');
  }
 }
 // Retain distinct failure classes, not repeated copies of one malformed batch.
 const bad=o.groups[0].steps.map(s=>s.input);
 if(bad[0]?.rows?.[0]?.value!==null||typeof bad[1]?.rows?.[0]?.value!=='string'
  ||Object.hasOwn(bad[2]?.sources?.[1]??{},'coveredTo')||bad[3]?.sources?.length!==0
  ||bad[4]?.sources?.[0]?.name!==bad[4]?.sources?.[1]?.name
  ||bad[5]?.rows?.[0]?.id!==bad[5]?.rows?.[1]?.id
  ||bad[6]?.sources?.some(s=>s.name===bad[6]?.rows?.[0]?.source)
  ||bad[7]?.rows?.[0]?.time<=Math.max(...x.sources.map(s=>s.coveredTo))||bad[8]?.rows?.length!==101
  ||typeof bad[9]?.sources?.[1]?.coveredTo!=='string'||bad[10]?.from!==-1
  ||Number.isInteger(bad[11]?.rows?.[0]?.time)||bad[12]?.batchId!=='')throw Error('incomplete invalid-data coverage');
}
function bounded(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('unsafe candidate file');
  const b=Buffer.alloc(s.size+1);let used=0,n;while(used<b.length&&(n=readSync(fd,b,used,b.length-used,null))>0)used+=n;
  const after=fstatSync(fd);if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('candidate file changed');
  return b.subarray(0,used);
 }finally{closeSync(fd);}
}
function inventory(root){
 const files=new Map();let count=0,total=0;
 function visit(name=''){
  const path=join(root,name),s=lstatSync(path);if(++count>200||s.isSymbolicLink())throw Error('unsafe inventory');
  if(s.isDirectory()){const names=readdirSync(path);if(names.length>200)throw Error('oversized inventory');
   for(const n of names)if(name||n!=='.git')visit(name?name+'/'+n:n);return;}
  const bytes=bounded(path);if((total+=bytes.length)>1048576)throw Error('oversized inventory');files.set(name,bytes);
 }visit();return files;
}
async function score(){
 const root=realpathSync(process.argv[2]),o=JSON.parse(process.argv[3]),sha=x=>createHash('sha256').update(x).digest('hex');verifyOracle(o);
 let files,integrity=false;
 try{files=inventory(root);integrity=Object.keys(o.baseline).every(n=>files.has(n))&&[...files.keys()].every(n=>Object.hasOwn(o.baseline,n))
  &&o.protected.every(n=>sha(files.get(n))===o.baseline[n]);}catch{integrity=false;}
 const pass=[integrity,integrity,integrity,integrity];
 if(integrity){
  const {observations}=runIsolatedImportCandidate({root,code:files.get('src/import/history.mjs').toString('utf8'),groups:o.groups});
  for(let i=0;i<5;i++){
   const g=o.groups[i],actual=observations[i],index=[0,1,2,3,2][i];
   let ok=Array.isArray(actual)&&actual.length===g.steps.length;
   if(ok)for(let j=0;j<actual.length;j++){
    const a=actual[j],s=g.steps[j];ok&&=same(a.result,s.expected)&&same(a.state,s.state);
    if(['invalid','preview','duplicate'].includes(s.expected.status))ok&&=a.unchanged===true;
   }pass[index]&&=ok;
  }
 }
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:o.scenario,criteria:o.criteria.map((text,i)=>({text,state:pass[i]?'passed':'failed',
  evidence:pass[i]?'Isolated importer matched hidden bounded state transitions':'Hidden transition or protected inventory failed; values withheld'}))}));
}
if(process.argv[1]==='-')await score();
