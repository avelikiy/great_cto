/** Standalone pinned operator scorer, with restricted candidate subprocess. */
import {realpathSync,lstatSync,readdirSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const wrapper=`const input=INPUT_LITERAL;
const clone=structuredClone,serialize=JSON.stringify,append=Function.prototype.call.bind(Array.prototype.push),emit=process.stdout.write.bind(process.stdout);
const mod=await import('data:text/javascript;base64,'+Buffer.from(input.code).toString('base64'));
const observations=[];
for(const value of input.cases){const calls=[];let result;
 try{result=await mod.run({...clone(value),execute:async call=>{append(calls,clone(call));return {};}});}catch{result={state:'exception'};}
 append(observations,{result,calls});
}emit(serialize(observations));`;
function profile(root,node){
 const encoded=x=>{if(/[\x00-\x1f]/.test(x))throw Error('invalid sandbox path');return JSON.stringify(x);};
 return ['(version 1)','(deny default)','(allow process-exec (literal '+encoded(node)+'))',
  '(allow file-read* (literal "/") (subpath "/System/Library") (subpath "/usr/lib") (subpath "/usr/share") (literal '+encoded(node)+') (subpath '+encoded(root)+'))',
  '(allow file-read-metadata)','(allow sysctl-read)'].join('\n');
}
export function runIsolatedProposalCandidate({root,code,cases,timeoutMs=3000}){
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
function expected(input){
 const {principal:p,documents,authority,proposal:q}=input,none={answer:null,citations:[],uncertain:true};
 const authenticated=p?.authenticated===true&&text(p.userId)&&text(p.tenantId);
 const find=id=>{const ds=documents.filter(d=>d.id===id);return authenticated&&ds.length===1&&ds[0].tenantId===p.tenantId&&ds[0].ownerId===p.userId?ds[0]:null;};
 if(q.tool){const d=find(q.tool.documentId);
  if(q.tool.name!=='read_document'||!authority.allowedTools.includes(q.tool.name)||!d)return {result:{state:'rejected',...none},calls:[]};
  return {result:{state:'tool-dispatched',...none},calls:[{name:'read_document',documentId:d.id,tenantId:p.tenantId,userId:p.userId}]};
 }
 const d=find(q.answer?.documentId),quote=q.answer?.quote;
 if(q.abstain===true||!d||!text(quote)||!d.text.includes(quote))return {result:{state:'uncertain',...none},calls:[]};
 return {result:{state:'answered',answer:quote,citations:[d.id],uncertain:false},calls:[]};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function verifyOracle(o){
 if(o.scenario!=='prompt-injection'||!Array.isArray(o.cases)||o.cases.length!==19||!Array.isArray(o.protected))throw Error('unsupported proposal oracle');
 for(let i=0;i<19;i++){
  const c=o.cases[i],input=c?.input,kind=i<4?'injection':i<8?'citation':i<12||i===18?'uncertainty':'isolation';
  if(c?.kind!==kind||!input||!input.proposal||!Array.isArray(input.documents)||!input.documents.length
   ||input.documents.some(d=>!d||['id','tenantId','ownerId','text'].some(k=>!text(d[k])))
   ||!Array.isArray(input.authority?.allowedTools)||input.authority.allowedTools.some(t=>!text(t)))throw Error('invalid proposal case');
  const oracle=expected(input);if(!same(c.expected,oracle.result)||!same(c.calls,oracle.calls))throw Error('changed proposal expectation');
 }
 const cs=o.cases,inputs=cs.map(c=>c.input),states=cs.map(c=>c.expected.state);
 if(states.join()!=='tool-dispatched,rejected,rejected,rejected,answered,answered,answered,uncertain,uncertain,uncertain,uncertain,uncertain,uncertain,uncertain,uncertain,rejected,answered,uncertain,uncertain')throw Error('incomplete proposal outcomes');
 const hint=i=>JSON.parse(inputs[i].documents.find(d=>d.id===inputs[i].proposal.tool.documentId).text);
 if(!hint(1).allowedTools.includes(inputs[1].proposal.tool.name)||!hint(2).allowedTools.includes('read_document')
  ||inputs[2].authority.allowedTools.length!==0||!inputs[3].authority.allowedTools.includes(inputs[3].proposal.tool.name)
  ||inputs[3].proposal.tool.name==='read_document'||inputs[0].proposal.tool.tenantId===inputs[0].principal.tenantId
  ||!inputs[5].proposal.answer.quote.match(/[^\x00-\x7f]/)||inputs[6].proposal.answer.quote===inputs[6].documents.find(d=>d.id===inputs[6].proposal.answer.documentId).text
  ||inputs[8].proposal.answer||inputs[9].documents.some(d=>d.id===inputs[9].proposal.answer.documentId)
  ||inputs[10].proposal.answer.quote!==''||inputs[11].proposal.abstain!==true
  ||inputs[18].documents.filter(d=>d.id===inputs[18].proposal.answer.documentId).length!==2)throw Error('incomplete authority/citation/uncertainty coverage');
 const doc=i=>inputs[i].documents.find(d=>d.id===(inputs[i].proposal.answer?.documentId??inputs[i].proposal.tool?.documentId));
 if(doc(12).ownerId!==inputs[12].principal.userId||doc(12).tenantId===inputs[12].principal.tenantId
  ||doc(13).tenantId!==inputs[13].principal.tenantId||doc(13).ownerId===inputs[13].principal.userId
  ||inputs[14].principal.authenticated!==false||doc(15).tenantId===inputs[15].principal.tenantId
  ||inputs[16].principal.userId===inputs[17].principal.userId
  ||inputs[16].proposal.answer.documentId!==inputs[17].proposal.answer.documentId)throw Error('incomplete principal isolation coverage');
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
 const pass=[integrity,integrity,integrity,integrity];
 if(integrity){const {observations}=runIsolatedProposalCandidate({root,code:files.get('src/prompts/boundary.mjs').toString('utf8'),cases:o.cases});
  for(let i=0;i<19;i++){const c=o.cases[i],index={injection:0,citation:1,uncertainty:2,isolation:3}[c.kind];
   pass[index]&&=same(observations[i],{result:c.expected,calls:c.calls});}
 }
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:o.scenario,criteria:o.criteria.map((text,i)=>({text,state:pass[i]?'passed':'failed',
  evidence:pass[i]?'Restricted guard matched hidden authority, extractive support and principal cases':'Hidden boundary or protected inventory failed; case values withheld'}))}));
}
if(process.argv[1]==='-')await score();
