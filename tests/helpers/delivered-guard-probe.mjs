// Trusted local test entrypoint. Executes an operator-selected, already extracted
// candidate; byte pins are test expectations, not independent runtime admission.
// No model calls, gate approval, shared-store mutation or fixture-root deletion.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,realpathSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha = value => createHash('sha256').update(value).digest('hex');
let raw=''; for await (const chunk of process.stdin) {
  raw+=chunk; if(Buffer.byteLength(raw)>8192) throw Error('oversized test configuration');
}
const config=JSON.parse(raw),root=realpathSync(config.packageRoot);
const names=['agent-execution-budget.mjs','scoped-review-reuse.mjs'];
for(const name of names) assert.equal(sha(readFileSync(join(root,'board/scripts/lib',name))),config.pins[name]);
const fixtureRoot=realpathSync(mkdtempSync(join(tmpdir(),'great-cto-delivered-guards-')));
const project=join(fixtureRoot,'project'); mkdirSync(project);
const budgetModule=await import(pathToFileURL(join(root,'board/scripts/lib',names[0])).href);
const scopeModule=await import(pathToFileURL(join(root,'board/scripts/lib',names[1])).href);
const policy=join(fixtureRoot,'policy.json');
writeFileSync(policy,JSON.stringify({maxConcurrent:2,maxDepth:1,maxCallsPerRun:24,runId:'delivered-guard-fixture'}),{mode:0o600});
const budget=budgetModule.readExecutionBudget(project,{env:{GREAT_CTO_AGENT_BUDGET_FILE:policy,GREAT_CTO_AGENT_BUDGET_STORE:join(fixtureRoot,'store')}});
const request=(callId,host='codex')=>({callId,host,role:'worker',depth:1});
const leases=budgetModule.requireAgents(budget,[request('codex'),request('claude','claude-code')]);
assert.equal(budgetModule.budgetSnapshot(budget).active.length,2);
assert.match(budgetModule.reserveAgents(budget,[request('third')]).error,/concurrency/);
const ledgerPath=join(budget.store,'ledger.json'),ledgerBefore=readFileSync(ledgerPath,'utf8');
for(const field of ['leases','calls','retired']) {
  const corrupt=JSON.parse(ledgerBefore);corrupt[field]=[];writeFileSync(ledgerPath,JSON.stringify(corrupt));
  const before=readFileSync(ledgerPath,'utf8');
  assert.throws(()=>budgetModule.requireAgents(budget,[request('corrupt')]),/ledger\/policy mismatch/);
  assert.equal(readFileSync(ledgerPath,'utf8'),before);
  writeFileSync(ledgerPath,ledgerBefore);
}
for(const lease of leases) budgetModule.releaseAgent(budget,lease);
const ledger=JSON.parse(readFileSync(ledgerPath,'utf8'));ledger.nextFence=Number.MAX_SAFE_INTEGER-1;
writeFileSync(ledgerPath,JSON.stringify(ledger));
assert.match(budgetModule.reserveAgents(budget,[request('wave-a'),request('wave-b','claude-code')]).error,/fence/);
assert.equal(budgetModule.budgetSnapshot(budget).active.length,0);
const [last]=budgetModule.requireAgents(budget,[request('last')]);
assert.equal(last.fence,Number.MAX_SAFE_INTEGER);
assert.equal(budgetModule.requireAgents(budget,[request('last')])[0].token,last.token);
assert.match(budgetModule.reserveAgents(budget,[request('overflow')]).error,/fence/);
budgetModule.releaseAgent(budget,last);
mkdirSync(join(project,'src'));mkdirSync(join(project,'.great_cto'));
writeFileSync(join(project,'src/auth.mjs'),'export const secure=true;');
writeFileSync(join(project,'.great_cto/PROJECT.md'),'archetype: fintech\n');
const git=args=>execFileSync('/usr/bin/git',args,{cwd:project,env:{PATH:'/usr/bin:/bin',LANG:'C',TZ:'UTC',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},stdio:['ignore','ignore','ignore'],timeout:5000});
git(['init','-q']);git(['add','.']);
const role='pci-reviewer',state={id:'guard-fixture',root:project,prompt:'Review payment boundary',graphHash:'fixed-test-graph',
  graph:{[role]:{on:['PASS'],produces:['report'],gate:['gate:ship']}},specialistPolicy:{workflow:'existing-change'},specialistReview:{roles:[role]}};
assert.equal(scopeModule.scopedReviewInput(state,role,['src/auth.mjs']).binding.version,2);
for(const name of ['*.mjs','[a]uth.mjs','????.mjs']) {
  const path='src/'+name;writeFileSync(join(project,path),'literal tracked input');
  assert.throws(()=>scopeModule.scopedReviewInput(state,role,[path]));
  git(['--literal-pathspecs','add','--',path]);
  assert.equal(scopeModule.scopedReviewInput(state,role,[path]).binding.inputs[0].path,path);
}
linkSync(join(project,'src/auth.mjs'),join(fixtureRoot,'auth-alias'));
assert.throws(()=>scopeModule.scopedReviewInput(state,role,['src/auth.mjs']),/unsupported evidence artifact/);
for(const name of names) assert.equal(sha(readFileSync(join(root,'board/scripts/lib',name))),config.pins[name]);
console.log(JSON.stringify({scope:'pinned-delivered-guard-regression-only',fixtureRoot,
  checks:['shared-cross-host-cap','malformed-map-refusal','whole-wave-safe-fences','last-safe-replay-release','scope-version-2','literal-untracked-refusal','literal-tracked-acceptance','hardlink-refusal'],
  providerCalls:null,approvalsRecorded:0,executionArtifactProvenanceVerified:false,descendantQuiescenceVerified:false,benchmarkEligible:false}));
