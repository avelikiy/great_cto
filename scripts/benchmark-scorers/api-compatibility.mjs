/** Standalone pinned operator scorer, with restricted candidate subprocess. */
import {realpathSync,lstatSync,readdirSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const wrapper=`const input=INPUT_LITERAL;
const clone=structuredClone,serialize=JSON.stringify,append=Function.prototype.call.bind(Array.prototype.push),emit=process.stdout.write.bind(process.stdout);
const mod=await import('data:text/javascript;base64,'+Buffer.from(input.code).toString('base64'));
const observations=[];
for(const value of input.cases){const args=clone(value),before=serialize(args);let result;
 try{result=await mod.run(args);}catch{result={status:'exception'};}
 append(observations,{result,unchanged:before===serialize(args)});
}emit(serialize(observations));`;
function profile(root,node){
 const encoded=x=>{if(/[\x00-\x1f]/.test(x))throw Error('invalid sandbox path');return JSON.stringify(x);};
 return ['(version 1)','(deny default)','(allow process-exec (literal '+encoded(node)+'))',
  '(allow file-read* (literal "/") (subpath "/System/Library") (subpath "/usr/lib") (subpath "/usr/share") (literal '+encoded(node)+') (subpath '+encoded(root)+'))',
  '(allow file-read-metadata)','(allow sysctl-read)'].join('\n');
}
export function runIsolatedApiCandidate({root,code,cases,timeoutMs=3000}){
 if(process.platform!=='darwin')throw Error('candidate isolation unavailable on this platform');
 root=realpathSync(root);const node=realpathSync(process.execPath);
 if(root==='/'||!lstatSync(root).isDirectory()||typeof code!=='string'||Buffer.byteLength(code)>65536
  ||!Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>5000)throw Error('invalid isolated candidate input');
 const literal=JSON.stringify({code,cases:cases.map(c=>c.input)});if(Buffer.byteLength(literal)>262144)throw Error('isolated input exceeds bound');
 const args=['-p',profile(root,node),node,'--no-addons','--input-type=module','-'];
 const child=spawnSync('/usr/bin/sandbox-exec',args,{cwd:root,input:wrapper.replace('INPUT_LITERAL',literal),env:{LANG:'C',TZ:'UTC'},
  shell:false,encoding:'utf8',timeout:timeoutMs,maxBuffer:65536,killSignal:'SIGKILL'});
 if(child.error||child.status!==0||child.signal)throw Error('isolated candidate process unavailable');
 let observations;try{observations=JSON.parse(child.stdout);}catch{throw Error('isolated candidate output unavailable');}
 if(!Array.isArray(observations)||observations.length!==cases.length)throw Error('isolated candidate output shape invalid');
 return {observations,pid:child.pid};
}
const text=x=>typeof x==='string'&&x.length>0;
function validRequest(r){return r!==null&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>k==='includeSource')
 &&(!Object.hasOwn(r,'includeSource')||typeof r.includeSource==='boolean');}
function validSource(s){return s?.available===true&&text(s.id)&&text(s.asOf)&&Number.isSafeInteger(s.count)&&s.count>=0;}
function expected({request:r,source:s}){
 if(!validRequest(r))return {status:400,body:{error:'invalid_request'}};
 if(!validSource(s))return {status:503,body:{error:'source_unavailable'}};
 return {status:200,body:{id:s.id,count:s.count,...(r.includeSource===true?{source:{asOf:s.asOf}}:{})}};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function verifyOracle(o){
 if(o.scenario!=='api-compatibility'||!Array.isArray(o.cases)||o.cases.length!==21||!Array.isArray(o.protected))throw Error('unsupported API oracle');
 for(let i=0;i<21;i++){
  const c=o.cases[i],kind=i<3?'legacy':i<5?'optional':i<12?'schema':'missing';
  if(c?.kind!==kind||!c.input||!same(c.expected,expected(c.input))
   ||(i<5?c.expected.status!==200:i<12?c.expected.status!==400:c.expected.status!==503))throw Error('changed API expectation');
 }
 const cs=o.cases.map(c=>c.input),r=i=>cs[i].request,s=i=>cs[i].source;
 if(Object.keys(r(0)).length||r(1).includeSource!==false||s(2).count!==0||r(3).includeSource!==true||s(4).count!==0||r(4).includeSource!==true
  ||r(5)!==null||!Array.isArray(r(6))||typeof r(7).includeSource!=='string'||typeof r(8).includeSource!=='number'
  ||r(9).includeSource!==null||!Object.hasOwn(r(10),'unknown')||s(11)!==null||s(12)!==null||s(13).available!==false
  ||s(14).count!==null||typeof s(15).count!=='string'||s(16).count>=0||Number.isInteger(s(17).count)
  ||s(18).id!==''||s(19).asOf!==''||Number.isSafeInteger(s(20).count))throw Error('incomplete API coverage');
}
function bounded(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('unsafe candidate file');
  const b=Buffer.alloc(s.size+1);let used=0,n;while(used<b.length&&(n=readSync(fd,b,used,b.length-used,null))>0)used+=n;
  const after=fstatSync(fd);if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('candidate file changed');return b.subarray(0,used);
 }finally{closeSync(fd);}
}
function inventory(root){
 const files=new Map();let entries=0,total=0;
 function visit(name=''){
  const path=join(root,name),s=lstatSync(path);if(++entries>200||s.isSymbolicLink())throw Error('unsafe inventory');
  if(s.isDirectory()){const ns=readdirSync(path);if(ns.length>200)throw Error('oversized inventory');for(const n of ns)if(name||n!=='.git')visit(name?name+'/'+n:n);return;}
  const bytes=bounded(path);if((total+=bytes.length)>1048576)throw Error('oversized inventory');files.set(name,bytes);
 }visit();return files;
}
async function score(){
 const root=realpathSync(process.argv[2]),o=JSON.parse(process.argv[3]),sha=x=>createHash('sha256').update(x).digest('hex');verifyOracle(o);
 let files,integrity=false;try{files=inventory(root);integrity=Object.keys(o.baseline).every(n=>files.has(n))&&[...files.keys()].every(n=>Object.hasOwn(o.baseline,n))
  &&o.protected.every(n=>sha(files.get(n))===o.baseline[n]);}catch{integrity=false;}
 const pass=[integrity,integrity,integrity];
 if(integrity){const {observations}=runIsolatedApiCandidate({root,code:files.get('src/api/summary.mjs').toString('utf8'),cases:o.cases});
  for(let i=0;i<21;i++){const c=o.cases[i],index={legacy:0,optional:1,schema:1,missing:2}[c.kind];
   pass[index]&&=same(observations[i].result,c.expected)&&observations[i].unchanged===true;}
 }
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:o.scenario,criteria:o.criteria.map((text,i)=>({text,state:pass[i]?'passed':'failed',
  evidence:pass[i]?'Restricted handler matched hidden API shape, validation and unavailable-source cases':'Hidden API contract or protected inventory failed; values withheld'}))}));
}
if(process.argv[1]==='-')await score();
