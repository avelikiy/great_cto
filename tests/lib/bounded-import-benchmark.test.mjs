import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,existsSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { boundedImportBenchmarkFixture } from '../../scripts/lib/bounded-import-benchmark-fixture.mjs';
import { runIsolatedImportCandidate } from '../../scripts/benchmark-scorers/bounded-import.mjs';
import { runPinnedBenchmarkScorer } from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { RULES } from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/bounded-import.mjs',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
const repaired=`const text=x=>typeof x==='string'&&x.length>0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
function valid(x){
 if(!x||!text(x.batchId)||!integer(x.from)||!Array.isArray(x.sources)||!x.sources.length||x.sources.length>100
  ||x.sources.some(s=>!s||!text(s.name)||!integer(s.coveredTo)||s.coveredTo<x.from)
  ||new Set(x.sources.map(s=>s.name)).size!==x.sources.length||!Array.isArray(x.rows)||x.rows.length>100)return false;
 const names=new Map(x.sources.map(s=>[s.name,s.coveredTo]));
 return new Set(x.rows.map(r=>r?.id)).size===x.rows.length&&x.rows.every(r=>r&&text(r.id)&&names.has(r.source)
  &&integer(r.time)&&r.time>=x.from&&r.time<=names.get(r.source)&&typeof r.value==='number'&&Number.isFinite(r.value));
}
export async function run({state,input,dryRun,rollbackToken}){
 if(rollbackToken){state.rows=structuredClone(rollbackToken.rows);state.imports=structuredClone(rollbackToken.imports);state.revision=rollbackToken.revision;return {status:'rolled-back'};}
 if(!valid(input))return {status:'invalid'};
 const coveredTo=Math.min(...input.sources.map(s=>s.coveredTo));
 if(dryRun)return {status:'preview',coveredTo};
 if(state.imports.includes(input.batchId))return {status:'duplicate',coveredTo};
 const token=structuredClone(state);
 state.rows=[...state.rows.filter(r=>r.time<input.from||r.time>coveredTo),...structuredClone(input.rows.filter(r=>r.time<=coveredTo))]
  .sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 state.imports.push(input.batchId);state.revision++;
 return {status:'applied',coveredTo,rollbackToken:token};
}\n`;
function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'bounded-import-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=boundedImportBenchmarkFixture(),put=(name,value)=>{mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),value);};
 for(const [name,bytes]of Object.entries(recipe.files))put(name,bytes);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','broken importer']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');
 writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,base:git(['rev-parse','HEAD']).trim(),setOracle:o=>{
  writeFileSync(oracleFile,JSON.stringify(o));options.oracleSha256=sha(readFileSync(oracleFile));
 },score:()=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root)})};
}
test('actual defective importer fails all criteria; repaired importer passes separate pinned process',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','failed','failed','failed']);
 f.put('src/import/history.mjs',repaired);const before=treeReceipt(f.root),result=f.score();
 assert.equal(result.accepted,true);assert.notEqual(result.process.pid,process.pid);assert.equal(result.benchmarkEligible,false);assert.deepEqual(treeReceipt(f.root),before);
 assert.ok(!JSON.stringify(result).includes(f.recipe.oracle.groups[2].steps[0].input.batchId));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T2');
 for(const role of ['data-platform-reviewer','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role),role);
});
test('isolated import admission refuses broad scope, oversized source and runaway process',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);
 assert.throws(()=>runIsolatedImportCandidate({root:'/',code:'',groups:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedImportCandidate({root:f.root,code:'x'.repeat(65537),groups:[]}),/invalid isolated/);
 assert.throws(()=>runIsolatedImportCandidate({root:f.root,code:'while(true){}',groups:[],timeoutMs:250}),/process unavailable/);
});
test('import worker resource probes cannot reach operator, writes, network or subprocesses',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),marker=join(f.operator,'private-marker'),output=join(f.root,'forbidden-write');writeFileSync(marker,'operator-owned',{mode:0o600});
 const code=`import {readFileSync,writeFileSync} from 'node:fs';import{spawnSync}from'node:child_process';import{createConnection}from'node:net';
 export async function run({state}){let read=false,write=false;
 try{readFileSync(${JSON.stringify(marker)});read=true;}catch{}
 try{writeFileSync(${JSON.stringify(output)},'bad');write=true;}catch{}
 const child=spawnSync(process.execPath,['-e','console.log(1)']);
 const network=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:9});s.on('connect',()=>{s.destroy();resolve('connected');});s.on('error',e=>resolve(e.code));});
 state.probe={read,write,spawn:child.status,spawnError:child.error?.code,network,env:!!process.env.NODE_OPTIONS};return {status:'probe'};}`;
 const result=runIsolatedImportCandidate({root:f.root,code,groups:[{initial:{},steps:[{input:{},dryRun:true}]}]}).observations[0][0].state.probe;
 assert.equal(result.read,false);assert.equal(result.write,false);assert.equal(existsSync(output),false);assert.equal(result.spawn,null);
 assert.equal(result.spawnError,'EPERM');assert.ok(['EPERM','EACCES'].includes(result.network));assert.equal(result.env,false);
});
test('quoted candidate path cannot inject network permission into sandbox policy',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),root=join(f.root,'quoted") (allow network*) (');mkdirSync(root);
 const code=`import{createConnection}from'node:net';export async function run({state}){
 state.network=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:9});s.on('connect',()=>{s.destroy();resolve('connected');});s.on('error',e=>resolve(e.code));});return {status:'probe'};}`;
 const observed=runIsolatedImportCandidate({root,code,groups:[{initial:{},steps:[{input:{},dryRun:true}]}]}).observations[0][0];
 assert.ok(['EPERM','EACCES'].includes(observed.state.network));
});
for(const mutation of ['validation-off','dry-run-off','max-coverage','global-replace','dedup-off','null-to-zero','rollback-noop','rollback-revision','wrong-value','project-drift','extra-source','hardlink','symlink','oversized']){
 test(`hidden import checks refuse ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t);let code=repaired;
  if(mutation==='validation-off')code=code.replace('if(!valid(input))','if(false)');
  if(mutation==='dry-run-off')code=code.replace('if(dryRun)','if(false)');
  if(mutation==='max-coverage')code=code.replace('Math.min','Math.max');
  if(mutation==='global-replace')code=code.replace('...state.rows.filter(r=>r.time<input.from||r.time>coveredTo),','');
  if(mutation==='dedup-off')code=code.replace('if(state.imports.includes(input.batchId))','if(false)');
  if(mutation==='null-to-zero')code=code.replace("typeof r.value==='number'&&Number.isFinite(r.value)","Number.isFinite(Number(r.value))");
  if(mutation==='rollback-noop')code=code.replace('if(rollbackToken){state.rows=structuredClone(rollbackToken.rows);state.imports=structuredClone(rollbackToken.imports);state.revision=rollbackToken.revision;',"if(rollbackToken){");
  if(mutation==='rollback-revision')code=code.replace('state.revision=rollbackToken.revision;','');
  if(mutation==='wrong-value')code=code.replace('input.rows.filter(r=>r.time<=coveredTo)','input.rows.filter(r=>r.time<=coveredTo).map(r=>({...r,value:99}))');
  f.put('src/import/history.mjs',code);
  if(mutation==='project-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
  if(mutation==='extra-source')f.put('src/extra.mjs','throw Error("never load");');
  if(mutation==='hardlink')linkSync(join(f.root,'src/import/history.mjs'),join(f.operator,'aliased'));
  if(mutation==='symlink'){rmSync(join(f.root,'src/import/history.mjs'));symlinkSync(join(f.operator,'missing'),join(f.root,'src/import/history.mjs'));}
  if(mutation==='oversized')f.put('src/import/history.mjs','x'.repeat(65537));
  if(mutation==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);
  else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['empty-sequence','wrong-kind','false-validity','max-bound-expectation','missing-rollback','wrong-state','duplicated-invalid-case']){
 test(`import oracle rejects ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('src/import/history.mjs',repaired);
  if(mutation==='empty-sequence')o.groups[0].steps=[];
  if(mutation==='wrong-kind')o.groups[0].kind='bounded';
  if(mutation==='false-validity')o.groups[0].steps[0].input=o.groups[2].steps[0].input;
  if(mutation==='max-bound-expectation')o.groups[2].steps[0].expected.coveredTo=180;
  if(mutation==='missing-rollback')o.groups[4].steps.splice(1,1);
  if(mutation==='wrong-state')o.groups[2].steps[0].state.rows=[];
  if(mutation==='duplicated-invalid-case')o.groups[0].steps[2]=o.groups[0].steps[0];
  f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
