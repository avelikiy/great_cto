/** Trusted standalone scorer: candidate executes in a separate restricted process. */
import { readFileSync, realpathSync, lstatSync, readdirSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const wrapper = `import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
const serialize=JSON.stringify, clone=structuredClone, append=Function.prototype.call.bind(Array.prototype.push);
const emit=process.stdout.write.bind(process.stdout);
const mod=await import('data:text/javascript;base64,'+Buffer.from(input.code).toString('base64'));
const observations=[];
for(const group of input.groups){
 const state={seen:[],versions:{},charged:[]},calls=[],results=[],traces=[];
 const charge=async value=>append(calls,clone(value));
 for(const delivery of group.deliveries){
  const before=serialize(state),count=calls.length;
  let result;try{result=await mod.handle({state,...delivery,signingSecret:input.signingSecret,charge});}catch{result={status:'exception'};}
  append(results,clone(result));append(traces,{unchanged:before===serialize(state),newCharges:calls.length-count});
 }
 append(observations,{state,calls,results,traces});
}
emit(serialize(observations));`;

export function runIsolatedBillingCandidate({root,code,groups,signingSecret,timeoutMs=3000}) {
  if(process.platform!=='darwin') throw Error('candidate isolation unavailable on this platform');
  root=realpathSync(root); const node=realpathSync(process.execPath);
  if(root==='/' || !lstatSync(root).isDirectory() || /[\x00-\x1f]/.test(root+node) || typeof code!=='string'
    || Buffer.byteLength(code)>65536 || !Number.isInteger(timeoutMs) || timeoutMs<250 || timeoutMs>5000) throw Error('invalid isolated candidate input');
  const q=JSON.stringify;
  // Root-directory data admission is needed for Node bootstrap; it does not
  // grant reads of descendants. No writable paths, network or process fork.
  const profile=`(version 1)(deny default)(allow process-exec (literal ${q(node)}))
    (allow file-read* (literal "/") (subpath "/System/Library") (subpath "/usr/lib") (subpath "/usr/share")
      (literal ${q(node)}) (subpath ${q(root)})) (allow file-read-metadata)(allow sysctl-read)`;
  const input=JSON.stringify({code,groups:groups.map(g=>({deliveries:g.deliveries})),signingSecret});
  if(Buffer.byteLength(input)>262144) throw Error('isolated input exceeds bound');
  const child=spawnSync('/usr/bin/sandbox-exec',['-p',profile,node,'--no-addons','--input-type=module','-'],{
    cwd:root,input:wrapper.replace("JSON.parse(readFileSync(0,'utf8'))",JSON.stringify(JSON.parse(input))),
    env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:timeoutMs,maxBuffer:65536,killSignal:'SIGKILL'});
  // Input is embedded in the trusted stdin program (never in process argv).
  if(child.error || child.status!==0 || child.signal) throw Error('isolated candidate process unavailable');
  let observations;try{observations=JSON.parse(child.stdout);}catch{throw Error('isolated candidate output unavailable');}
  if(!Array.isArray(observations)||observations.length!==groups.length) throw Error('isolated candidate output shape invalid');
  return {observations,pid:child.pid};
}

function bounded(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('unsafe candidate file');
  const buffer=Buffer.alloc(s.size+1);let used=0,n;
  while(used<buffer.length&&(n=readSync(fd,buffer,used,buffer.length-used,null))>0)used+=n;
  const after=fstatSync(fd);if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('candidate file changed');
  return buffer.subarray(0,used);
 }finally{closeSync(fd);}
}
function inventory(root){
 const files=new Map();let entries=0,total=0;
 function visit(name=''){
  const path=join(root,name),stat=lstatSync(path);if(++entries>200||stat.isSymbolicLink())throw Error('unsafe inventory');
  if(stat.isDirectory()){const children=readdirSync(path);if(children.length>200)throw Error('oversized inventory');
   for(const child of children)if(name||child!=='.git')visit(name?name+'/'+child:child);return;}
  const bytes=bounded(path);total+=bytes.length;if(total>1048576)throw Error('oversized inventory');files.set(name,bytes);
 }visit();return files;
}
async function score(){
 const root=realpathSync(process.argv[2]),oracle=JSON.parse(process.argv[3]),sha=x=>createHash('sha256').update(x).digest('hex');
 if(oracle.scenario!=='billing-webhook'||!Array.isArray(oracle.groups)||oracle.groups.length!==6
  || oracle.groups.map(g=>g.kind).join()!=='signature,signature,duplicate,out-of-order,double-charge,double-charge'
  || !Array.isArray(oracle.protected)||! /^[a-f0-9]{64}$/.test(oracle.signingSecret)
  || typeof oracle.subscriptionId!=='string'||!oracle.subscriptionId)throw Error('unsupported billing oracle');
 // Validate coverage before executing the worker; empty or mislabeled sequences
 // must not turn a broken candidate into a successful measurement.
 const lengths=[1,1,3,3,2,2],charges=[0,0,1,0,1,2];
 const latest=[null,null,{version:1,status:'paid'},{version:3,status:'cancelled'},
  {version:2,status:'paid'},{version:2,status:'paid'}];
 const events=[];
 for(let i=0;i<6;i++){
  const g=oracle.groups[i];
  if(!Array.isArray(g.deliveries)||g.deliveries.length!==lengths[i]
   ||!Array.isArray(g.statuses)||g.statuses.length!==lengths[i]
   ||!g.statuses.every(s=>s===(i<2?401:200))||g.charges!==charges[i]
   ||JSON.stringify(g.latest)!==JSON.stringify(latest[i]))throw Error('incomplete billing oracle');
  const parsed=[];
  for(const d of g.deliveries){
   if(typeof d.rawBody!=='string'||typeof d.signature!=='string')throw Error('invalid billing delivery');
   const valid=d.signature===createHmac('sha256',oracle.signingSecret).update(d.rawBody).digest('hex');
   if(valid!==(i>=2))throw Error('mislabeled billing signature');
   if(i>=2){const e=JSON.parse(d.rawBody);
    if(e.subscriptionId!==oracle.subscriptionId||typeof e.id!=='string'||!e.id
     ||!Number.isInteger(e.version)||e.version<1||!['paid','cancelled'].includes(e.status)
     ||(e.status==='paid'&&(typeof e.invoiceId!=='string'||!e.invoiceId||e.amount!==1200)))throw Error('invalid billing event');
    parsed.push(e);
   }
  }events.push(parsed);
 }
 if(events[2].some(e=>JSON.stringify(e)!==JSON.stringify(events[2][0]))
  ||events[2][0].version!==1||events[2][0].status!=='paid'
  ||events[3].map(e=>e.version).join()!=='3,1,2'||events[3].map(e=>e.status).join()!=='cancelled,paid,paid'
  ||new Set(events[3].map(e=>e.id)).size!==3
  ||[4,5].some(i=>events[i].map(e=>e.version).join()!=='1,2'||events[i].some(e=>e.status!=='paid')||events[i][0].id===events[i][1].id)
  ||events[4][0].invoiceId!==events[4][1].invoiceId||events[5][0].invoiceId===events[5][1].invoiceId)throw Error('incomplete billing sequence semantics');
 let files,integrity=false;
 try{files=inventory(root);integrity=Object.keys(oracle.baseline).every(n=>files.has(n))
  &&[...files.keys()].every(n=>Object.hasOwn(oracle.baseline,n))
  &&oracle.protected.every(n=>sha(files.get(n))===oracle.baseline[n]);}catch{integrity=false;}
 const pass=[integrity,integrity,integrity,integrity];
 if(integrity){
  const {observations}=runIsolatedBillingCandidate({root,code:files.get('src/billing/webhook.mjs').toString('utf8'),groups:oracle.groups,signingSecret:oracle.signingSecret});
  for(let i=0;i<oracle.groups.length;i++){
   const g=oracle.groups[i],o=observations[i],index={signature:0,duplicate:1,'out-of-order':2,'double-charge':3}[g.kind];
   let ok=Array.isArray(o.results)&&o.results.length===g.statuses.length&&g.statuses.every((s,j)=>o.results[j]?.status===s)
     &&Array.isArray(o.calls)&&o.calls.length===g.charges
     &&(g.latest===null?o.state?.versions?.[oracle.subscriptionId]==null:
      o.state?.versions?.[oracle.subscriptionId]?.version===g.latest.version
      &&o.state?.versions?.[oracle.subscriptionId]?.status===g.latest.status
      &&Object.keys(o.state.versions[oracle.subscriptionId]).sort().join()==='status,version');
   const accepted=i<2?[]:(i===2||i===3?events[i].slice(0,1):events[i]);
   const expectedCalls=[...new Map(accepted.filter(e=>e.status==='paid').map(e=>[e.invoiceId,{invoiceId:e.invoiceId,amount:e.amount}])).values()];
   ok&&=JSON.stringify(o.state?.seen)===JSON.stringify(accepted.map(e=>e.id))
    &&JSON.stringify(o.state?.charged)===JSON.stringify(expectedCalls.map(c=>c.invoiceId))
    &&o.calls.every((c,j)=>c?.invoiceId===expectedCalls[j]?.invoiceId&&c?.amount===expectedCalls[j]?.amount
     &&Object.keys(c).sort().join()==='amount,invoiceId')
    &&Object.keys(o.state?.versions??{}).join()===(i<2?'':oracle.subscriptionId);
   if(g.kind==='signature')ok&&=o.state.seen.length===0&&o.state.charged.length===0&&o.traces.every(t=>t.unchanged&&t.newCharges===0);
   if(g.kind==='duplicate')ok&&=o.state.seen.length===1&&o.traces.slice(1).every(t=>t.unchanged&&t.newCharges===0);
   if(g.kind==='out-of-order')ok&&=o.traces.slice(1).every(t=>t.unchanged&&t.newCharges===0);
   if(g.kind==='double-charge')ok&&=new Set(o.calls.map(c=>c.invoiceId)).size===g.charges&&o.calls.every(c=>c.amount===1200);
   pass[index]&&=ok;
  }
 }
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:oracle.scenario,
  criteria:oracle.criteria.map((text,i)=>({text,state:pass[i]?'passed':'failed',evidence:pass[i]
   ?'Isolated candidate behavior matched hidden event sequence and protected inventory'
   :'Hidden sequence or protected inventory failed; event values withheld'}))}));
}
if(process.argv[1]==='-')await score();
