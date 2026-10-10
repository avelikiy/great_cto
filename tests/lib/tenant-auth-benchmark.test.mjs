import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tenantAuthBenchmarkFixture } from '../../scripts/lib/tenant-auth-benchmark-fixture.mjs';
import { runPinnedBenchmarkScorer } from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { RULES } from '../../scripts/hooks/auto-attach-reviewers.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const scorer = readFileSync(new URL('../../scripts/benchmark-scorers/tenant-auth.mjs', import.meta.url));
function fixture(t) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'tenant-auth-benchmark-')));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp,'candidate'), operator = join(temp,'operator'); mkdirSync(root); mkdirSync(operator,{mode:0o700});
  const recipe = tenantAuthBenchmarkFixture();
  const put = (name, value) => { mkdirSync(dirname(join(root,name)),{recursive:true}); writeFileSync(join(root,name),value); };
  for (const [name, value] of Object.entries(recipe.files)) put(name,value);
  const git = args => execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
  git(['init','-q']); git(['add','.']); git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective policy']);
  const base = git(['rev-parse','HEAD']).trim(), scorerFile = join(operator,'scorer.mjs'), oracleFile = join(operator,'oracle.json');
  writeFileSync(scorerFile,scorer,{mode:0o600}); writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
  const options = {root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
  const policy = {requireAuthenticated:true,enforceTenant:true,enforceOwner:true,auditFields:['action','outcome','userId','tenantId','documentId']};
  return {root,base,recipe,put,policy,options,repair:()=>put('src/auth/policy.json',JSON.stringify(policy)+'\n'),
    score:(overrides={})=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root),...overrides})};
}
test('oracle category labels cannot replace missing behavioral coverage',t=>{
  const f=fixture(t); f.repair(); f.recipe.oracle.cases[0].kind='anonymous';
  const raw=JSON.stringify(f.recipe.oracle); writeFileSync(f.options.oracleFile,raw,{mode:0o600});
  assert.throws(()=>f.score({oracleSha256:sha(raw)}),/pinned scorer process did not complete/);
});
test('defective tenant policy fails three criteria, repair passes separate pinned scorer', t => {
  const f = fixture(t); assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','passed','failed','failed']);
  f.repair(); const before = treeReceipt(f.root), result = f.score();
  assert.equal(result.accepted,true); assert.notEqual(result.process.pid,process.pid); assert.equal(result.benchmarkEligible,false);
  assert.deepEqual(treeReceipt(f.root),before); assert.deepEqual(result.receipt,before);
  for(const input of f.recipe.oracle.cases) assert.ok(!JSON.stringify(result).includes(input.request.bearer));
  const plan = specialistPlan({root:f.root,base:f.base,rules:RULES});
  assert.equal(plan.state,'planned'); assert.equal(plan.assessment.tier,'T2');
  for(const role of ['enterprise-saas-reviewer','code-reviewer','qa-engineer','security-officer']) assert.ok(plan.reviewers.some(r=>r.agent===role));
});
for(const mutation of ['tenant-off','owner-off','auth-off','deny-all','empty-audit','credential-audit','invalid-json','extra-policy-key','handler-drift','project-drift','extra-code','policy-link','oversized']) {
  test(`hidden tenant checks refuse ${mutation}`,t=>{
    const f=fixture(t); f.repair();
    if(mutation==='tenant-off') f.policy.enforceTenant=false;
    if(mutation==='owner-off') f.policy.enforceOwner=false;
    if(mutation==='auth-off') f.policy.requireAuthenticated=false;
    if(mutation==='empty-audit') f.policy.auditFields=[];
    if(mutation==='credential-audit') f.policy.auditFields.push('bearer');
    if(mutation==='extra-policy-key') f.policy.override=true;
    f.repair();
    if(mutation==='deny-all') f.put('src/auth/policy.json','{}');
    if(mutation==='invalid-json') f.put('src/auth/policy.json','{');
    if(mutation==='handler-drift') f.put('src/service.mjs',"throw Error('candidate code must never execute');");
    if(mutation==='project-drift') f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
    if(mutation==='extra-code') f.put('src/new.mjs','throw Error("never load");');
    if(mutation==='policy-link') {rmSync(join(f.root,'src/auth/policy.json')); symlinkSync(join(f.root,'README.md'),join(f.root,'src/auth/policy.json'));}
    if(mutation==='oversized') f.put('src/auth/policy.json','x'.repeat(65537));
    assert.equal(f.score().accepted,false);
  });
}
