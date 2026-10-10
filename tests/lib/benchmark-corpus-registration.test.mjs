import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,chmodSync,readdirSync,lstatSync,rmSync,mkdirSync,symlinkSync,linkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runPinnedBenchmarkScorer} from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import {treeReceipt} from '../../scripts/lib/receipt.mjs';
import {prepareCorpusRegistration,freezeCorpusRegistration,verifyCorpusRegistration,corpusRegistrationSummary} from '../../scripts/lib/benchmark-corpus-registration.mjs';
import {scenarios} from '../../scripts/lib/adaptive-benchmark-protocol.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('returned preparation cannot promote shared eligibility boundary',()=>{
 const prepared=prepareCorpusRegistration();
 assert.throws(()=>{prepared.manifest.boundary.benchmarkEligible=true;},TypeError);
 assert.equal(prepareCorpusRegistration().manifest.boundary.benchmarkEligible,false);
 assert.equal(corpusRegistrationSummary(prepared.manifest).benchmarkEligible,false);
});
function unlock(path){const s=lstatSync(path);if(s.isSymbolicLink())return;if(s.isDirectory()){chmodSync(path,0o700);for(const n of readdirSync(path))unlock(join(path,n));}else chmodSync(path,0o600);}
function fixture(t){
 const parent=realpathSync(mkdtempSync('/tmp/corpus-registration-'));t.after(()=>{unlock(parent);rmSync(parent,{recursive:true,force:true});});
 const bundle=freezeCorpusRegistration(parent),manifest=JSON.parse(readFileSync(join(bundle.root,'registration.json')));
 const write=(name,bytes)=>{const path=join(bundle.root,name);chmodSync(path,0o600);writeFileSync(path,bytes);chmodSync(path,0o400);};
 const repin=m=>{const raw=JSON.stringify(m)+'\n';write('registration.json',raw);return sha(raw);};
 return {...bundle,parent,manifest,write,repin,verify:(pin=bundle.manifestSha256,options)=>verifyCorpusRegistration(bundle.root,pin,options)};
}
test('actual private sealed snapshot covers exactly eight tasks and checks runtime bytes',t=>{
 const f=fixture(t),result=f.verify();assert.equal(result.scenarioCount,8);assert.deepEqual(result.tasks.map(x=>x.id),scenarios.map(s=>s.id));
 assert.equal(result.runtimeBytesChecked,true);assert.equal(result.benchmarkEligible,false);assert.equal(result.independentAdmissionVerified,false);
 assert.equal(result.executionArtifactProvenanceVerified,false);assert.equal(result.graphFloorCoverageVerified,false);assert.equal(result.providerProvenanceVerified,false);
 assert.equal(result.status,'frozen-not-run-ready');assert.equal(lstatSync(f.root).mode&0o777,0o500);
 for(const task of f.manifest.tasks){assert.equal(lstatSync(join(f.root,task.oracle.path)).mode&0o777,0o400);assert.equal(lstatSync(join(f.root,task.scorer.path)).mode&0o777,0o400);}
 const billing=JSON.parse(readFileSync(join(f.root,'oracles/billing-webhook.json'))),board=JSON.parse(readFileSync(join(f.root,'oracles/board-accessibility.json')));
 const publicText=JSON.stringify(result);assert.ok(!publicText.includes(billing.signingSecret));assert.ok(!publicText.includes(billing.subscriptionId));assert.ok(!publicText.includes(board.target));
 assert.equal(f.verify(undefined,{checkRuntime:false}).runtimeBytesChecked,false);
});
test('fresh snapshots have distinct private oracle pins; previous pin cannot validate a new corpus',t=>{
 const a=fixture(t),b=fixture(t);assert.notEqual(a.manifestSha256,b.manifestSha256);assert.throws(()=>b.verify(a.manifestSha256),/registration pin changed/);
 assert.notEqual(a.manifest.tasks[2].oracle.sha256,b.manifest.tasks[2].oracle.sha256);
});
test('frozen external scorer and oracle execute against separate writable Git trial, not the snapshot',t=>{
 const f=fixture(t),task=f.manifest.tasks[0],trial=join(f.parent,'trial');mkdirSync(trial,{mode:0o700});
 for(const input of task.inputs){const destination=join(trial,input.name);mkdirSync(join(destination,'..'),{recursive:true});writeFileSync(destination,readFileSync(join(f.root,'workers/'+task.id+'/'+input.name)),{mode:0o600});}
 const git=args=>execFileSync('git',['-C',trial,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args]);
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective docs']);
 const score=()=>runPinnedBenchmarkScorer({root:trial,scorerFile:join(f.root,task.scorer.path),scorerSha256:task.scorer.sha256,
  oracleFile:join(f.root,task.oracle.path),oracleSha256:task.oracle.sha256,expectedReceipt:treeReceipt(trial)});
 assert.equal(score().accepted,false);
 writeFileSync(join(trial,'docs/README.md'),'# Service\n[Quick start](guides/quickstart.md)\n[API reference](reference/api.md)\n');
 const result=score();assert.equal(result.accepted,true);assert.equal(result.benchmarkEligible,false);assert.notEqual(result.process.pid,process.pid);
 assert.equal(f.verify().scenarioCount,8); // original sealed blueprints and evidence remain unchanged
});
for(const name of ['workers/api-compatibility/src/api/summary.mjs','oracles/billing-webhook.json','scorers/prompt-injection.mjs','generators/board-accessibility-benchmark-fixture.mjs']){
 test('changed frozen bytes refuse '+name,t=>{const f=fixture(t);f.write(name,'corrupt\n');assert.throws(()=>f.verify(),/changed|invalid/);});
}
for(const mutation of ['lost-task','duplicate-task','wrong-tier','changed-criteria','runtime-downgrade','eligibility-upgrade','admission-upgrade','tool-drift','path-traversal']){
 test('even a re-pinned malformed manifest refuses '+mutation,t=>{
  const f=fixture(t),m=structuredClone(f.manifest);
  if(mutation==='lost-task')m.tasks.pop();
  if(mutation==='duplicate-task')m.tasks[7]=m.tasks[6];
  if(mutation==='wrong-tier')m.tasks[0].tier='T2';
  if(mutation==='changed-criteria')m.tasks[0].criteriaSha256='0'.repeat(64);
  if(mutation==='runtime-downgrade')m.tasks[2].runtimeRequirement='unprotected subprocess';
  if(mutation==='eligibility-upgrade')m.boundary.benchmarkEligible=true;
  if(mutation==='admission-upgrade')m.boundary.independentAdmissionVerified=true;
  if(mutation==='tool-drift')m.runtime.pins[0].sha256='0'.repeat(64);
  if(mutation==='path-traversal')m.tasks[0].scorer.path='../escape';
  assert.throws(()=>f.verify(f.repin(m)));
 });
}
test('malformed private JSON errors do not echo private content',t=>{
 const f=fixture(t),m=structuredClone(f.manifest),marker='private-value-not-for-reporting',raw='{'+marker;
 const task=m.tasks[2];f.write(task.oracle.path,raw);task.oracle.sha256=sha(raw);task.oracle.size=Buffer.byteLength(raw);
 try{f.verify(f.repin(m));assert.fail('corrupt private JSON accepted');}catch(e){assert.match(e.message,/private oracle bytes or JSON invalid/);assert.ok(!e.message.includes(marker));}
});
for(const mutation of ['missing-input','extra-input','empty-directory','symlink','hardlink','writable-file','writable-root','public-file']){
 test('sealed inventory refuses '+mutation,t=>{
  const f=fixture(t),path=join(f.root,'workers/docs-low-risk/docs/README.md');
  if(mutation==='missing-input'){chmodSync(join(f.root,'workers/docs-low-risk/docs'),0o700);rmSync(path);chmodSync(join(f.root,'workers/docs-low-risk/docs'),0o500);}
  if(mutation==='extra-input'){chmodSync(f.root,0o700);writeFileSync(join(f.root,'unexpected'),'extra',{mode:0o400});chmodSync(f.root,0o500);}
  if(mutation==='empty-directory'){chmodSync(f.root,0o700);mkdirSync(join(f.root,'unexpected'),{mode:0o500});chmodSync(f.root,0o500);}
  if(mutation==='symlink'){chmodSync(join(f.root,'workers/docs-low-risk/docs'),0o700);rmSync(path);symlinkSync(join(f.root,'oracles/billing-webhook.json'),path);chmodSync(join(f.root,'workers/docs-low-risk/docs'),0o500);}
  if(mutation==='hardlink')linkSync(path,join(f.parent,'alias'));
  if(mutation==='writable-file')chmodSync(path,0o600);
  if(mutation==='writable-root')chmodSync(f.root,0o700);
  if(mutation==='public-file')chmodSync(path,0o444);
  assert.throws(()=>f.verify());
 });
}
test('scope, external pin and runtime-check type are mandatory',t=>{
 const f=fixture(t);assert.throws(()=>verifyCorpusRegistration('/',f.manifestSha256));assert.throws(()=>f.verify(''));
 assert.throws(()=>f.verify(undefined,{checkRuntime:0}));chmodSync(f.parent,0o755);assert.throws(()=>freezeCorpusRegistration(f.parent),/private operator directory/);chmodSync(f.parent,0o700);
});
test('redacted summary rejects injected private values in identifiers or pins',t=>{
 const f=fixture(t),m=structuredClone(f.manifest);m.tasks[0].oracle.sha256='private-marker';assert.throws(()=>corpusRegistrationSummary(m),/invalid redacted corpus summary/);
 m.tasks[0].oracle.sha256=f.manifest.tasks[0].oracle.sha256;m.tasks[0].id='private-marker';assert.throws(()=>corpusRegistrationSummary(m));
});
