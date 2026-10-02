import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {apiCompatibilityBenchmarkFixture} from '../../scripts/lib/api-compatibility-benchmark-fixture.mjs';
import {runIsolatedApiCandidate} from '../../scripts/benchmark-scorers/api-compatibility.mjs';
import {runPinnedBenchmarkScorer} from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import {treeReceipt} from '../../scripts/lib/receipt.mjs';
import {specialistPlan} from '../../scripts/lib/specialist-plan.mjs';
import {RULES} from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/api-compatibility.mjs',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
const repaired="export async function run({request:r,source:s}){\n if(r===null||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>k!=='includeSource')||(Object.hasOwn(r,'includeSource')&&typeof r.includeSource!=='boolean'))return {status:400,body:{error:'invalid_request'}};\n if(s?.available!==true||typeof s.id!=='string'||!s.id||typeof s.asOf!=='string'||!s.asOf||!Number.isSafeInteger(s.count)||s.count<0)return {status:503,body:{error:'source_unavailable'}};\n return {status:200,body:{id:s.id,count:s.count,...(r.includeSource===true?{source:{asOf:s.asOf}}:{})}};\n}\n";
test('API worker cannot read operator, write, spawn or connect even through quoted scope',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),root=join(f.root,'quoted") (allow network*) ('),marker=join(f.operator,'private-marker'),output=join(root,'forbidden');mkdirSync(root);writeFileSync(marker,'operator-owned',{mode:0o600});
 const code=`import{readFileSync,writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{createConnection}from'node:net';
 export async function run(){let read=false,write=false;try{readFileSync(${JSON.stringify(marker)});read=true;}catch{}try{writeFileSync(${JSON.stringify(output)},'bad');write=true;}catch{}
 const child=spawnSync(process.execPath,['-e','console.log(1)']);const network=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:9});s.on('connect',()=>{s.destroy();resolve('connected');});s.on('error',e=>resolve(e.code));});
 return {read,write,spawn:child.status,error:child.error?.code,network,preload:!!process.env.NODE_OPTIONS};}`;
 const result=runIsolatedApiCandidate({root,code,cases:[{input:{}}]}).observations[0].result;
 assert.equal(result.read,false);assert.equal(result.write,false);assert.equal(existsSync(output),false);assert.equal(result.spawn,null);
 assert.equal(result.error,'EPERM');assert.ok(['EPERM','EACCES'].includes(result.network));assert.equal(result.preload,false);
});

function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'api-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=apiCompatibilityBenchmarkFixture(),put=(n,b)=>{mkdirSync(dirname(join(root,n)),{recursive:true});writeFileSync(join(root,n),b);};
 for(const [n,b]of Object.entries(recipe.files))put(n,b);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective boundary']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,base:git(['rev-parse','HEAD']).trim(),score:()=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root)}),setOracle:o=>{
  writeFileSync(oracleFile,JSON.stringify(o));options.oracleSha256=sha(readFileSync(oracleFile));
 }};
}

test('API baseline fails all criteria; repaired handler preserves old clients',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','failed','failed']);
 f.put('src/api/summary.mjs',repaired);const before=treeReceipt(f.root),result=f.score();
 assert.equal(result.accepted,true);assert.notEqual(result.process.pid,process.pid);assert.equal(result.benchmarkEligible,false);
 assert.deepEqual(treeReceipt(f.root),before);assert.ok(!JSON.stringify(result).includes(f.recipe.oracle.cases[0].input.source.id));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T1');
 for(const role of ['api-platform-reviewer','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role),role);
});
for(const mutation of ['legacy-extra','optional-missing','schema-coercion','unknown-accepted','source-default','source-coercion','wrong-count','mutate-input','project-drift','contract-drift','extra-source','hardlink','symlink','oversized']){
 test('API hidden checks refuse '+mutation,{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);let code=repaired;
 if(mutation==='legacy-extra')code=code.replace('r.includeSource===true','true');
 if(mutation==='optional-missing')code=code.replace('r.includeSource===true','false');
 if(mutation==='schema-coercion')code=code.replace("typeof r.includeSource!=='boolean'","false");
 if(mutation==='unknown-accepted')code=code.replace("Object.keys(r).some(k=>k!=='includeSource')",'false');
 if(mutation==='source-default')code=code.replace("{status:503,body:{error:'source_unavailable'}}","{status:200,body:{id:'missing',count:0}}");
 if(mutation==='source-coercion')code=code.replace('!Number.isSafeInteger(s.count)','!Number.isSafeInteger(Number(s.count))');
 if(mutation==='wrong-count')code=code.replace('count:s.count','count:s.count+1');
 if(mutation==='mutate-input')code=code.replace('return {status:200','s.count+=1;return {status:200');
 f.put('src/api/summary.mjs',code);
 if(mutation==='project-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
 if(mutation==='contract-drift')f.put('contracts/legacy-response.json','{}\n');
 if(mutation==='extra-source')f.put('src/extra.mjs','export const extra=true;');
 if(mutation==='hardlink')linkSync(join(f.root,'src/api/summary.mjs'),join(f.operator,'alias'));
 if(mutation==='symlink'){rmSync(join(f.root,'src/api/summary.mjs'));symlinkSync(join(f.operator,'missing'),join(f.root,'src/api/summary.mjs'));}
 if(mutation==='oversized')f.put('src/api/summary.mjs','x'.repeat(65537));
 if(mutation==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['empty','wrong-kind','wrong-response','lost-zero','lost-missing']){
 test('API oracle refuses '+mutation,{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('src/api/summary.mjs',repaired);
 if(mutation==='empty')o.cases=[];
 if(mutation==='wrong-kind')o.cases[0].kind='optional';
 if(mutation==='wrong-response')o.cases[3].expected.body.source={asOf:'invented'};
 if(mutation==='lost-zero'){o.cases[2].input.source.count=17;o.cases[2].expected.body.count=17;}
 if(mutation==='lost-missing')o.cases[12]=o.cases[13];
 f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
test('API isolation refuses broad root, oversized source and deadline',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);assert.throws(()=>runIsolatedApiCandidate({root:'/',code:'',cases:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedApiCandidate({root:f.root,code:'x'.repeat(65537),cases:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedApiCandidate({root:f.root,code:'while(true){}',cases:[],timeoutMs:250}),/process unavailable/);
});
