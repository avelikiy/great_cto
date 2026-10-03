/** Trusted operator probe: frozen-input graph construction, never stage execution. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyCorpusRegistration} from './benchmark-corpus-registration.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const mandatory=['code-reviewer','qa-engineer','security-officer'];
// Explicit expectations, not derived from the candidate's selected list.
const contexts=[
 ['docs-low-risk','docs/README.md','T0',[],false],
 ['tenant-auth','src/auth/policy.json','T2',['enterprise-saas-reviewer'],false],
 ['billing-webhook','src/billing/webhook.mjs','T2',['api-platform-reviewer','pci-reviewer'],false],
 ['bounded-import','src/import/history.mjs','T2',['data-platform-reviewer'],false],
 ['prompt-injection','src/prompts/boundary.mjs','T2',['ai-security-reviewer','ai-eval-engineer','ai-prompt-architect'],true],
 ['api-compatibility','src/api/summary.mjs','T1',['api-platform-reviewer'],false],
 ['migration-safety','migrations/plan.json','T2',['api-platform-reviewer','db-migration-reviewer'],false],
 ['board-accessibility','web/board.html','T1',['design-advisor'],true],
];
const list=x=>x==null?[]:Array.isArray(x)?x:[x];
function inventory(root){
 const entries=[];let count=0,total=0;
 function visit(name=''){
  const path=join(root,name),s=lstatSync(path);
  if(++count>4000||s.isSymbolicLink()||!s.isDirectory()&&!s.isFile())throw Error('unsafe delivered inventory');
  if(s.isDirectory()){for(const n of readdirSync(path).sort())visit(name?name+'/'+n:n);return;}
  if(s.size>8*1024*1024||(total+=s.size)>128*1024*1024)throw Error('delivered inventory exceeds bound');
  entries.push([name,s.mode&0o777,sha(readFileSync(path))]);
 }visit();return sha(JSON.stringify(entries));
}
export async function probeFrozenCorpusContexts({pluginRoot,corpusRoot,registrationSha256,fixtureRoot}){
 pluginRoot=realpathSync(pluginRoot);fixtureRoot=realpathSync(fixtureRoot);
 if(!lstatSync(fixtureRoot).isDirectory()||(lstatSync(fixtureRoot).mode&0o077)||readdirSync(fixtureRoot).length)throw Error('private empty fixture root required');
 const registration=verifyCorpusRegistration(corpusRoot,registrationSha256);
 const manifestBytes=readFileSync(join(corpusRoot,'registration.json'));
 assert.equal(sha(manifestBytes),registrationSha256,'registration changed before context copy');
 const manifest=JSON.parse(manifestBytes);
 const before=inventory(pluginRoot),load=name=>import(pathToFileURL(join(pluginRoot,name)).href);
 const {newRun}=await load('scripts/lib/codex-pipeline.mjs');
 const {specialistPlan}=await load('scripts/lib/specialist-plan.mjs');
 const {RULES}=await load('scripts/hooks/auto-attach-reviewers.mjs');
 const graphSha256=sha(readFileSync(join(pluginRoot,'shared/pipeline.toml'))),cases=[];
 const gitEnv={PATH:process.env.PATH,LANG:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const templates=join(fixtureRoot,'templates');mkdirSync(templates,{mode:0o700});
 for(const [id,changedPath,tier,expected,existingRefuses]of contexts){
  const task=manifest.tasks.find(t=>t.id===id);
  assert.ok(task&&!task.protectedNames.includes(changedPath),'context change must be worker-mutable');
  for(const workflow of ['existing-change','phased-change','full-cycle']){
   const root=join(fixtureRoot,id+'-'+workflow);mkdirSync(root,{mode:0o700});
   for(const input of task.inputs){
    const raw=readFileSync(join(corpusRoot,'workers',id,input.name));
    assert.equal(raw.length,input.size);assert.equal(sha(raw),input.sha256);
    const path=join(root,input.name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,raw,{flag:'wx',mode:0o600});
   }
   const git=args=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',
    '-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{cwd:root,env:gitEnv,encoding:'utf8',timeout:10000,maxBuffer:65536});
   git(['init','-q','--template',templates]);git(['add','.']);git(['commit','-qm','frozen baseline']);
   const base=git(['rev-parse','HEAD']).trim();
   // Whitespace-only routing stimulus, not a repaired candidate or acceptance trial.
   const path=join(root,changedPath);writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from('\n')]));
   const plan=specialistPlan({root,base,rules:RULES});
   assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,tier);
   assert.deepEqual(plan.assessment.files,[changedPath]);
   const roles=plan.reviewers.map(r=>r.agent);
   for(const role of [...mandatory,...expected])assert.ok(roles.includes(role),'missing explicit corpus role '+role+' for '+id);
   const args={root,pluginRoot,prompt:'Assess frozen corpus routing only',allowed:['src','docs','web','migrations','contracts'],
    entry:workflow==='full-cycle'?'product-owner':'senior-dev',
    hostRoutes:{'senior-dev':'claude-code','code-reviewer':'codex','qa-engineer':'claude-code','security-officer':'codex'},
    specialistPolicy:{mode:'adaptive',workflow,base}};
   if(workflow==='existing-change'&&existingRefuses){
    assert.throws(()=>newRun(args),/specialist phase unsupported/);
    cases.push({id,workflow,tier,roles,outcome:'expected-refusal'});continue;
   }
   const state=newRun(args);
   assert.equal(state.graphHash,graphSha256);assert.equal(state.attempts.length,0);assert.equal(state.approvals.length,0);
   assert.equal(state.steps,0);assert.equal(state.active,null);assert.equal(state.pending,null);assert.deepEqual(state.results,{});
   assert.equal(state.hostRoutes['senior-dev'],'claude-code');assert.equal(state.hostRoutes['code-reviewer'],'codex');
   for(const role of mandatory){
    assert.deepEqual(list(state.graph[role].next),['devops']);assert.ok(list(state.graph[role].gate).includes('gate:ship'));
    for(const peer of mandatory.filter(p=>p!==role))assert.ok(list(state.graph[role].join).includes(peer));
   }
   for(const gate of ['gate:security','gate:compliance'])assert.ok(list(state.graph['security-officer'].gate).includes(gate));
   if(workflow==='phased-change'){
    for(const role of roles.filter(r=>!mandatory.includes(r)&&r!=='ai-eval-engineer')){
     const key=role+'-prebuild';assert.ok(state.specialistPreparation.roles.includes(key));
     assert.deepEqual(list(state.graph[key].next),['senior-dev']);assert.ok(list(state.graph[key].gate).includes('gate:plan'));
    }
    assert.deepEqual(state.queue,state.specialistPreparation.roles.length?state.specialistPreparation.roles:['senior-dev']);
   }
   if(workflow==='full-cycle'){
    assert.deepEqual(state.queue,['product-owner']);
    for(const role of expected.filter(r=>r!=='ai-eval-engineer'))assert.equal(state.specialistStages[role+'-prebuild']?.role,role);
    for(const [role,next,gate]of [['product-owner','architect','gate:product'],['architect','pm','gate:arch'],['pm','senior-dev','gate:plan']]){
     assert.ok(list(state.graph[role].next).includes(next));assert.ok(list(state.graph[role].gate).includes(gate));
    }
   }
   cases.push({id,workflow,tier,roles,outcome:'constructed'});
  }
 }
 assert.equal(cases.length,24);assert.equal(inventory(pluginRoot),before);verifyCorpusRegistration(corpusRoot,registrationSha256);
 return {version:1,scope:'frozen-corpus-delivered-construction-only',registrationSha256,scenarioCount:registration.scenarioCount,
  graphSha256,deliveredInventoryDigest:before,cases,dispatchAttempts:0,approvalsRecorded:0,providerCalls:null,
  graphFloorCoverageVerified:false,executionArtifactProvenanceVerified:false,independentAdmissionVerified:false,benchmarkEligible:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [pluginRoot,corpusRoot,registrationSha256,fixtureRoot]=process.argv.slice(2);
  console.log(JSON.stringify(await probeFrozenCorpusContexts({pluginRoot,corpusRoot,registrationSha256,fixtureRoot})));
 }catch{console.error('frozen corpus controller probe failed; inspect trusted fixtures locally');process.exitCode=1;}
}
