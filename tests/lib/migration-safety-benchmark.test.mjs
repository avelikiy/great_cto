import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {migrationSafetyBenchmarkFixture} from '../../scripts/lib/migration-safety-benchmark-fixture.mjs';
import {postgresTools,withTemporaryPostgres,runMigrationPlan} from '../../scripts/benchmark-scorers/migration-safety.mjs';
import {spawn} from 'node:child_process';
import {runPinnedBenchmarkScorer} from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import {treeReceipt} from '../../scripts/lib/receipt.mjs';
import {specialistPlan} from '../../scripts/lib/specialist-plan.mjs';
import {RULES} from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/migration-safety.mjs',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'migration-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=migrationSafetyBenchmarkFixture(),put=(n,b)=>{mkdirSync(dirname(join(root,n)),{recursive:true});writeFileSync(join(root,n),b);};
 for(const [n,b]of Object.entries(recipe.files))put(n,b);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective boundary']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,base:git(['rev-parse','HEAD']).trim(),score:()=>{
  try{const result=runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root),timeoutMs:30000,stageDiagnostics:true});
   t.diagnostic('migration scorer stages: '+JSON.stringify(result.stageTimings));return result;
  }catch(error){t.diagnostic('migration scorer failure stages: '+JSON.stringify(error.stageTimings??[]));throw error;}
 },setOracle:o=>{
  writeFileSync(oracleFile,JSON.stringify(o));options.oracleSha256=sha(readFileSync(oracleFile));
 }};
}


const repaired={version:1,expand:{preserveLegacy:true,nullable:true},rollback:{removeAdded:true,preserveRows:true},timeouts:{lockMs:100,statementMs:1000},privileges:{readerWrite:false,migratorSuperuser:false}};
let available=true;try{postgresTools();}catch{available=false;}
const pg={skip:available?false:'PostgreSQL16 tools unavailable; runtime NOT CHECKED'};
test('real PostgreSQL baseline fails4 contracts; repair passes pinned scorer',pg,t=>{
 const f=fixture(t);assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','failed','failed','failed']);
 f.put('migrations/plan.json',JSON.stringify(repaired));const before=treeReceipt(f.root),result=f.score();
 assert.equal(result.accepted,true);assert.equal(result.benchmarkEligible,false);assert.notEqual(result.process.pid,process.pid);assert.deepEqual(treeReceipt(f.root),before);
 assert.ok(!JSON.stringify(result).includes(JSON.stringify(f.recipe.oracle.rows)));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T2');
 for(const role of ['db-migration-reviewer','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role),role);
});
for(const [mutation,index] of [['drop-legacy',1],['not-null',1],['no-rollback',0],['delete-rows',0],['no-lock-timeout',2],['no-statement-timeout',2],['reader-write',3],['superuser',3]]){
 test('database observation refuses '+mutation,pg,t=>{
 const f=fixture(t),p=structuredClone(repaired);
 if(mutation==='drop-legacy')p.expand.preserveLegacy=false;
 if(mutation==='not-null')p.expand.nullable=false;
 if(mutation==='no-rollback')p.rollback.removeAdded=false;
 if(mutation==='delete-rows')p.rollback.preserveRows=false;
 if(mutation==='no-lock-timeout')p.timeouts.lockMs=0;
 if(mutation==='no-statement-timeout')p.timeouts.statementMs=0;
 if(mutation==='reader-write')p.privileges.readerWrite=true;
 if(mutation==='superuser')p.privileges.migratorSuperuser=true;
 f.put('migrations/plan.json',JSON.stringify(p));const result=f.score();assert.equal(result.accepted,false);assert.equal(result.criteria[index].state,'failed');
 if(['reader-write','superuser'].includes(mutation))assert.deepEqual(result.criteria.slice(0,3).map(c=>c.state),['passed','passed','passed']);
 });
}
for(const mutation of ['unknown-sql','string-timeout','negative-timeout','missing-field','project-drift','schema-drift','extra-source','hardlink','symlink','oversized']){
 test('migration plan and protected inventory refuse '+mutation,t=>{
 const f=fixture(t),p=structuredClone(repaired);
 if(mutation==='unknown-sql')p.sql='DROP DATABASE postgres;';
 if(mutation==='string-timeout')p.timeouts.lockMs='100;SELECT 1';
 if(mutation==='negative-timeout')p.timeouts.lockMs=-1;
 if(mutation==='missing-field')delete p.rollback.preserveRows;
 f.put('migrations/plan.json',JSON.stringify(p));
 if(mutation==='project-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
 if(mutation==='schema-drift')f.put('contracts/schema.sql','SELECT 1;');
 if(mutation==='extra-source')f.put('migrations/raw.sql','SELECT 1;');
 if(mutation==='hardlink')linkSync(join(f.root,'migrations/plan.json'),join(f.operator,'alias'));
 if(mutation==='symlink'){rmSync(join(f.root,'migrations/plan.json'));symlinkSync(join(f.operator,'missing'),join(f.root,'migrations/plan.json'));}
 if(mutation==='oversized')f.put('migrations/plan.json','x'.repeat(65537));
 if(mutation==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['no-rows','lost-zero','unsafe-amount','duplicate-id']){
 test('migration oracle refuses '+mutation,t=>{
 const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('migrations/plan.json',JSON.stringify(repaired));
 if(mutation==='no-rows')o.rows=[];
 if(mutation==='lost-zero')o.rows[0].amount=10;
 if(mutation==='unsafe-amount')o.rows[1].amount='1);SELECT 1';
 if(mutation==='duplicate-id')o.rows[1].id=1;
 f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
test('temporary cluster has no TCP listener and cleans after failure',pg,async()=>{
 let path;await assert.rejects(withTemporaryPostgres(async({sql,temp})=>{
 path=temp;assert.equal(sql('bench_admin','SHOW listen_addresses;').value,'');
 assert.equal(parseInt(sql('bench_admin','SHOW unix_socket_permissions;').value,8),0o700);
 throw Error('intentional action failure');
 }),/intentional action failure/);assert.equal(existsSync(path),false);
});
test('guardian stops PostgreSQL when owning scorer is killed',pg,async t=>{
 const url=new URL('../../scripts/benchmark-scorers/migration-safety.mjs',import.meta.url).href;
 const code='import{withTemporaryPostgres}from'+JSON.stringify(url)+'; await withTemporaryPostgres(async({temp})=>{console.log(JSON.stringify({temp}));await new Promise(()=>{});});';
 const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{LANG:'C'},stdio:['ignore','pipe','ignore']});let temp;
 const done=new Promise(resolve=>child.on('close',resolve));
 try{
 temp=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('guardian startup deadline')),10000);
 child.stdout.on('data',b=>{out+=b;if(out.includes('\n')){clearTimeout(timer);resolve(JSON.parse(out.trim()).temp);}});});
 child.kill('SIGKILL');await done;
 for(let i=0;i<120&&existsSync(join(temp,'data/postmaster.pid'));i++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(existsSync(join(temp,'data/postmaster.pid')),false);assert.equal(existsSync(join(temp,'socket/.s.PGSQL.5432')),false);
 }finally{child.kill('SIGKILL');await done;if(temp&&!existsSync(join(temp,'data/postmaster.pid')))rmSync(temp,{recursive:true,force:true});}
});
