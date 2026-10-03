import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,mkdirSync,lstatSync,readdirSync,chmodSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {freezeCorpusRegistration} from '../../scripts/lib/benchmark-corpus-registration.mjs';
import {probeFrozenCorpusContexts} from '../../scripts/lib/frozen-corpus-controller-probe.mjs';
import {runtimeImportClosure} from '../../packages/cli/scripts/runtime-import-closure.mjs';
const source=fileURLToPath(new URL('../../',import.meta.url));
function unlock(p){const s=lstatSync(p);if(s.isSymbolicLink())return;chmodSync(p,s.isDirectory()?0o700:0o600);if(s.isDirectory())for(const n of readdirSync(p))unlock(join(p,n));}
function fixture(t){
 const root=realpathSync(mkdtempSync('/tmp/frozen-corpus-probe-'));t.after(()=>{unlock(root);rmSync(root,{recursive:true,force:true});});
 const bundle=freezeCorpusRegistration(root),fixtureRoot=join(root,'trials');mkdirSync(fixtureRoot,{mode:0o700});
 return {root,bundle,args:{pluginRoot:source,corpusRoot:bundle.root,registrationSha256:bundle.manifestSha256,fixtureRoot}};
}
test('actual frozen eight-context source matrix preserves explicit roles/order/refusals without dispatch',async t=>{
 const f=fixture(t),plugin=join(f.root,'delivered-layout');mkdirSync(plugin);
 // A checkout contains links, dependency trees and unrelated files. Exercise a
 // bounded delivered-layout fixture, not a weakened inventory of the whole repo.
 for(const path of runtimeImportClosure(source,[join(source,'scripts/lib/codex-pipeline.mjs'),join(source,'scripts/lib/specialist-plan.mjs'),join(source,'scripts/hooks/auto-attach-reviewers.mjs')])){
  const dest=join(plugin,relative(source,path));mkdirSync(dirname(dest),{recursive:true});copyFileSync(path,dest);
 }
 mkdirSync(join(plugin,'shared'));copyFileSync(join(source,'shared/pipeline.toml'),join(plugin,'shared/pipeline.toml'));
 const r=await probeFrozenCorpusContexts({...f.args,pluginRoot:plugin});
 assert.equal(r.scenarioCount,8);assert.equal(r.cases.length,24);
 assert.equal(r.cases.filter(c=>c.outcome==='expected-refusal').length,2);
 assert.deepEqual(r.cases.filter(c=>c.outcome==='expected-refusal').map(c=>c.id),['prompt-injection','board-accessibility']);
 assert.equal(r.dispatchAttempts,0);assert.equal(r.approvalsRecorded,0);assert.equal(r.providerCalls,null);
 for(const flag of ['benchmarkEligible','graphFloorCoverageVerified','executionArtifactProvenanceVerified','independentAdmissionVerified'])assert.equal(r[flag],false);
});
test('probe refuses changed external registration pin before copying any worker inputs',async t=>{
 const f=fixture(t);await assert.rejects(probeFrozenCorpusContexts({...f.args,registrationSha256:'0'.repeat(64)}),/registration pin changed/);
 assert.deepEqual(readdirSync(f.args.fixtureRoot),[]);
});
test('probe refuses populated or public trial roots',async t=>{
 const f=fixture(t);writeFileSync(join(f.args.fixtureRoot,'preserve'),'operator');
 await assert.rejects(probeFrozenCorpusContexts(f.args),/private empty fixture root/);
 rmSync(join(f.args.fixtureRoot,'preserve'));chmodSync(f.args.fixtureRoot,0o755);
 await assert.rejects(probeFrozenCorpusContexts(f.args),/private empty fixture root/);
});
test('explicit mandatory expectations reject a candidate planner that silently drops security',async t=>{
 const f=fixture(t),plugin=join(f.root,'tampered');mkdirSync(join(plugin,'scripts/lib'),{recursive:true});mkdirSync(join(plugin,'scripts/hooks'));mkdirSync(join(plugin,'shared'));
 const url=name=>JSON.stringify(pathToFileURL(join(source,name)).href);
 writeFileSync(join(plugin,'scripts/lib/codex-pipeline.mjs'),'export {newRun} from '+url('scripts/lib/codex-pipeline.mjs')+';');
 writeFileSync(join(plugin,'scripts/hooks/auto-attach-reviewers.mjs'),'export {RULES} from '+url('scripts/hooks/auto-attach-reviewers.mjs')+';');
 writeFileSync(join(plugin,'scripts/lib/specialist-plan.mjs'),'import {specialistPlan as real} from '+url('scripts/lib/specialist-plan.mjs')+'; export function specialistPlan(a){const p=real(a);p.reviewers=p.reviewers.filter(r=>r.agent!=="security-officer");return p;}');
 writeFileSync(join(plugin,'shared/pipeline.toml'),'tampered fixture only');
 await assert.rejects(probeFrozenCorpusContexts({...f.args,pluginRoot:plugin}),/missing explicit corpus role security-officer/);
});
