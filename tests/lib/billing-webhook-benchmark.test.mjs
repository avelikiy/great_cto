import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,linkSync,symlinkSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash,randomBytes } from 'node:crypto';
import { billingWebhookBenchmarkFixture } from '../../scripts/lib/billing-webhook-benchmark-fixture.mjs';
import { runIsolatedBillingCandidate } from '../../scripts/benchmark-scorers/billing-webhook.mjs';
import { runPinnedBenchmarkScorer } from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { RULES } from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/billing-webhook.mjs',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
const repaired=`import {createHmac,timingSafeEqual} from 'node:crypto';
export async function handle({state,rawBody,signature,signingSecret,charge}) {
 const expected=createHmac('sha256',signingSecret).update(rawBody).digest();
 if(typeof signature!=='string'||!/^([a-f0-9]){64}$/.test(signature)||!timingSafeEqual(expected,Buffer.from(signature,'hex'))) return {status:401};
 const e=JSON.parse(rawBody);
 if(state.seen.includes(e.id)||(state.versions[e.subscriptionId]?.version??0)>=e.version)return {status:200};
 if(e.status==='paid'&&!state.charged.includes(e.invoiceId)){await charge({invoiceId:e.invoiceId,amount:e.amount});state.charged.push(e.invoiceId);}
 state.seen.push(e.id);state.versions[e.subscriptionId]={version:e.version,status:e.status};return {status:200};
}\n`;
function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'billing-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=billingWebhookBenchmarkFixture();
 const put=(name,bytes)=>{mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),bytes);};
 for(const [name,bytes]of Object.entries(recipe.files))put(name,bytes);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','broken billing handler']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');
 writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,setOracle:oracle=>{
  writeFileSync(oracleFile,JSON.stringify(oracle));options.oracleSha256=sha(readFileSync(oracleFile));
 },base:git(['rev-parse','HEAD']).trim(),score:()=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root)})};
}
test('actual defective billing code fails; repaired code passes isolated pinned scorer',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),broken=f.score();assert.equal(broken.accepted,false);assert.deepEqual(broken.criteria.map(c=>c.state),['failed','failed','failed','failed']);
 f.put('src/billing/webhook.mjs',repaired);const before=treeReceipt(f.root),fixed=f.score();
 assert.equal(fixed.accepted,true);assert.notEqual(fixed.process.pid,process.pid);assert.equal(fixed.benchmarkEligible,false);assert.deepEqual(treeReceipt(f.root),before);
 assert.ok(!JSON.stringify(fixed).includes(f.recipe.oracle.signingSecret));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T2');
 for(const role of ['pci-reviewer','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role));
});
test('candidate cannot read operator contents, write fixture, connect network or spawn processes',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),marker=join(f.operator,'private-marker');writeFileSync(marker,'operator-owned',{mode:0o600});
 const output=join(f.root,'forbidden-write');
 const code=`import {readFileSync,writeFileSync} from 'node:fs';import{spawnSync}from'node:child_process';import{createConnection}from'node:net';
 export async function handle(){let read=false,write=false;
 try{readFileSync(${JSON.stringify(marker)});read=true;}catch{}
 try{writeFileSync(${JSON.stringify(output)},'bad');write=true;}catch{}
 const child=spawnSync(process.execPath,['-e','console.log(1)']);
 const network=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:9});s.on('connect',()=>{s.destroy();resolve('connected');});s.on('error',e=>resolve(e.code));});
 return {read,write,spawn:child.status,spawnError:child.error?.code,network,env:!!process.env.NODE_OPTIONS};}`;
 const result=runIsolatedBillingCandidate({root:f.root,code,groups:[{deliveries:[{}]}],signingSecret:randomBytes(32).toString('hex')}).observations[0].results[0];
 assert.equal(result.read,false);assert.equal(result.write,false);assert.equal(existsSync(output),false);
 assert.equal(result.spawn,null);assert.equal(result.spawnError,'EPERM');assert.ok(['EPERM','EACCES'].includes(result.network));assert.equal(result.env,false);
});
test('equivalent object field order does not change billing behavior score',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);f.put('src/billing/webhook.mjs',repaired.replace('invoiceId:e.invoiceId,amount:e.amount','amount:e.amount,invoiceId:e.invoiceId')
  .replace('version:e.version,status:e.status','status:e.status,version:e.version'));
 assert.equal(f.score().accepted,true);
});
test('isolation failure and runaway candidate never fall back to unprotected execution',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t);
 const signingSecret=randomBytes(32).toString('hex');
 assert.throws(()=>runIsolatedBillingCandidate({root:f.root,code:'while(true){}',groups:[],signingSecret,timeoutMs:250}),/process unavailable/);
 assert.throws(()=>runIsolatedBillingCandidate({root:f.root,code:'x'.repeat(65537),groups:[],signingSecret}),/invalid isolated/);
 assert.throws(()=>runIsolatedBillingCandidate({root:'/',code:'',groups:[],signingSecret}),/invalid isolated/);
});
for(const mutation of ['empty','wrong-signature','wrong-charge','wrong-status','duplicate-invoice']){
 test(`billing scorer refuses corrupted oracle ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('src/billing/webhook.mjs',repaired);
  if(mutation==='empty')o.groups[2].deliveries=[];
  if(mutation==='wrong-signature')o.groups[2].deliveries[0].signature='invalid';
  if(mutation==='wrong-charge')o.groups[4].charges=2;
  if(mutation==='wrong-status')o.groups[3].statuses=[200];
  if(mutation==='duplicate-invoice')o.groups[5].deliveries[1]=o.groups[5].deliveries[0];
  f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
for(const kind of ['hardlink','symlink']){
 test(`billing scorer refuses ${kind} inventory`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t),path=join(f.root,'src/billing/webhook.mjs');f.put('src/billing/webhook.mjs',repaired);
  if(kind==='hardlink')linkSync(path,join(f.operator,'aliased-handler'));
  else{rmSync(path);symlinkSync(join(f.operator,'unavailable-handler'),path);}
  if(kind==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);
  else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['no-signature','signature-format-only','wrong-invoice','no-dedup','no-version','no-invoice-dedup','protected-drift','extra-source']){
 test(`billing oracle refuses ${mutation}`,{skip:process.platform!=='darwin'},t=>{
  const f=fixture(t);let code=repaired;
  if(mutation==='no-signature')code=code.split('\n').filter(line=>!line.includes('return {status:401}')).join('\n');
  if(mutation==='signature-format-only')code=code.replace("||!timingSafeEqual(expected,Buffer.from(signature,'hex'))",'');
  if(mutation==='wrong-invoice')code=code.replace('invoiceId:e.invoiceId','invoiceId:e.invoiceId+"-wrong"');
  if(mutation==='no-dedup')code=code.replace("state.seen.includes(e.id)","false").replace("(state.versions[e.subscriptionId]?.version??0)>=e.version","false");
  if(mutation==='no-version')code=code.replace("(state.versions[e.subscriptionId]?.version??0)>=e.version","false");
  if(mutation==='no-invoice-dedup')code=code.replace("!state.charged.includes(e.invoiceId)","true");
  f.put('src/billing/webhook.mjs',code);
  if(mutation==='protected-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
  if(mutation==='extra-source')f.put('src/new.mjs','throw Error("do not import");');
  assert.equal(f.score().accepted,false);
 });
}
