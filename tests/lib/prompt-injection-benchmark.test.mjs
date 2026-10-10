import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promptInjectionBenchmarkFixture} from '../../scripts/lib/prompt-injection-benchmark-fixture.mjs';
import {runIsolatedProposalCandidate} from '../../scripts/benchmark-scorers/prompt-injection.mjs';
import {runPinnedBenchmarkScorer} from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import {treeReceipt} from '../../scripts/lib/receipt.mjs';
import {specialistPlan} from '../../scripts/lib/specialist-plan.mjs';
import {RULES} from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/prompt-injection.mjs',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
const repaired=`const text=x=>typeof x==='string'&&x.length>0;
export async function run({principal:p,documents,authority,proposal:q,execute}){
 const none={answer:null,citations:[],uncertain:true};
 const authenticated=p?.authenticated===true&&text(p.userId)&&text(p.tenantId);
 const find=id=>{const ds=documents.filter(d=>d.id===id);return authenticated&&ds.length===1&&ds[0].tenantId===p.tenantId&&ds[0].ownerId===p.userId?ds[0]:null;};
 if(q.tool){const d=find(q.tool.documentId);
  if(q.tool.name!=='read_document'||!authority.allowedTools.includes(q.tool.name)||!d)return {state:'rejected',...none};
  await execute({name:'read_document',documentId:d.id,tenantId:p.tenantId,userId:p.userId});return {state:'tool-dispatched',...none};
 }
 const d=find(q.answer?.documentId),quote=q.answer?.quote;
 if(q.abstain===true||!d||!text(quote)||!d.text.includes(quote))return {state:'uncertain',...none};
 return {state:'answered',answer:quote,citations:[d.id],uncertain:false};
}\n`;
function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'proposal-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=promptInjectionBenchmarkFixture(),put=(n,b)=>{mkdirSync(dirname(join(root,n)),{recursive:true});writeFileSync(join(root,n),b);};
 for(const [n,b]of Object.entries(recipe.files))put(n,b);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective boundary']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,base:git(['rev-parse','HEAD']).trim(),score:()=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root)}),setOracle:o=>{
  writeFileSync(oracleFile,JSON.stringify(o));options.oracleSha256=sha(readFileSync(oracleFile));
 }};
}
test('defective proposal guard fails all criteria; repair passes independent process',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','failed','failed','failed']);
 f.put('src/prompts/boundary.mjs',repaired);const before=treeReceipt(f.root),result=f.score();assert.equal(result.accepted,true);
 assert.notEqual(result.process.pid,process.pid);assert.equal(result.benchmarkEligible,false);assert.deepEqual(treeReceipt(f.root),before);
 assert.ok(!JSON.stringify(result).includes(f.recipe.oracle.cases[0].input.principal.userId));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T2');
 for(const role of ['ai-security-reviewer','ai-eval-engineer','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role),role);
});
test('proposal isolation refuses broad root, oversized code and runaway process',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);assert.throws(()=>runIsolatedProposalCandidate({root:'/',code:'',cases:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedProposalCandidate({root:f.root,code:'x'.repeat(65537),cases:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedProposalCandidate({root:f.root,code:'while(true){}',cases:[],timeoutMs:250}),/process unavailable/);
});
test('proposal worker cannot read operator, write, spawn or connect even through quoted scope',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),root=join(f.root,'quoted") (allow network*) ('),marker=join(f.operator,'private-marker'),output=join(root,'forbidden');mkdirSync(root);writeFileSync(marker,'operator-owned',{mode:0o600});
 const code=`import{readFileSync,writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{createConnection}from'node:net';
 export async function run(){let read=false,write=false;try{readFileSync(${JSON.stringify(marker)});read=true;}catch{}try{writeFileSync(${JSON.stringify(output)},'bad');write=true;}catch{}
 const child=spawnSync(process.execPath,['-e','console.log(1)']);const network=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:9});s.on('connect',()=>{s.destroy();resolve('connected');});s.on('error',e=>resolve(e.code));});
 return {read,write,spawn:child.status,error:child.error?.code,network,preload:!!process.env.NODE_OPTIONS};}`;
 const result=runIsolatedProposalCandidate({root,code,cases:[{input:{}}]}).observations[0].result;
 assert.equal(result.read,false);assert.equal(result.write,false);assert.equal(existsSync(output),false);assert.equal(result.spawn,null);
 assert.equal(result.error,'EPERM');assert.ok(['EPERM','EACCES'].includes(result.network));assert.equal(result.preload,false);
});
for(const mutation of ['tenant-off','owner-off','auth-off','authority-off','tool-registry-off','forward-spoof','support-off','abstain-off','ambiguous-off','false-citation','project-drift','extra-source','hardlink','symlink','oversized']){
 test(`hidden proposal checks refuse ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t);let code=repaired;
  if(mutation==='tenant-off')code=code.replace('ds[0].tenantId===p.tenantId','true');
  if(mutation==='owner-off')code=code.replace('ds[0].ownerId===p.userId','true');
  if(mutation==='auth-off')code=code.replace('p?.authenticated===true','true');
  if(mutation==='authority-off')code=code.replace('!authority.allowedTools.includes(q.tool.name)','false');
  if(mutation==='tool-registry-off')code=code.replace("q.tool.name!=='read_document'",'false');
  if(mutation==='forward-spoof')code=code.replace("{name:'read_document',documentId:d.id,tenantId:p.tenantId,userId:p.userId}",'q.tool');
  if(mutation==='support-off')code=code.replace('!d.text.includes(quote)','false');
  if(mutation==='abstain-off')code=code.replace('q.abstain===true','false');
  if(mutation==='ambiguous-off')code=code.replace('ds.length===1','true');
  if(mutation==='false-citation')code=code.replace('citations:[d.id]','citations:["invented"]');
  f.put('src/prompts/boundary.mjs',code);
  if(mutation==='project-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
  if(mutation==='extra-source')f.put('src/extra.mjs','throw Error("never load");');
  if(mutation==='hardlink')linkSync(join(f.root,'src/prompts/boundary.mjs'),join(f.operator,'alias'));
  if(mutation==='symlink'){rmSync(join(f.root,'src/prompts/boundary.mjs'));symlinkSync(join(f.operator,'missing'),join(f.root,'src/prompts/boundary.mjs'));}
  if(mutation==='oversized')f.put('src/prompts/boundary.mjs','x'.repeat(65537));
  if(mutation==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['empty','wrong-kind','wrong-answer','wrong-call','lost-abstain','lost-cross-user']){
 test(`proposal oracle refuses ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('src/prompts/boundary.mjs',repaired);
  if(mutation==='empty')o.cases=[];
  if(mutation==='wrong-kind')o.cases[0].kind='citation';
  if(mutation==='wrong-answer')o.cases[4].expected.answer='unsupported';
  if(mutation==='wrong-call')o.cases[0].calls=[];
  if(mutation==='lost-abstain')o.cases[11].input.proposal.abstain=false;
  if(mutation==='lost-cross-user')o.cases[16]=o.cases[17];
  f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
