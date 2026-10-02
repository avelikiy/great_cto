/** Pinned operator driver. Only bounded declarative plans, never candidate SQL. */
import {realpathSync,lstatSync,readdirSync,openSync,fstatSync,readSync,closeSync,constants,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(x,names)=>x&&typeof x==='object'&&!Array.isArray(x)&&same(Object.keys(x).sort(),names.sort());
export function validateMigrationPlan(p){
 if(!keys(p,['version','expand','rollback','timeouts','privileges'])||p.version!==1
  ||!keys(p.expand,['preserveLegacy','nullable'])||!keys(p.rollback,['removeAdded','preserveRows'])
  ||!keys(p.timeouts,['lockMs','statementMs'])||!keys(p.privileges,['readerWrite','migratorSuperuser'])
  ||[p.expand.preserveLegacy,p.expand.nullable,p.rollback.removeAdded,p.rollback.preserveRows,p.privileges.readerWrite,p.privileges.migratorSuperuser].some(x=>typeof x!=='boolean')
  ||!Number.isInteger(p.timeouts.lockMs)||p.timeouts.lockMs<0||p.timeouts.lockMs>1000
  ||!Number.isInteger(p.timeouts.statementMs)||p.timeouts.statementMs<0||p.timeouts.statementMs>2000)throw Error('unsupported migration plan');
 return p;
}
export function postgresTools(){
 for(const dir of ['/opt/homebrew/opt/postgresql@16/bin','/opt/homebrew/bin','/usr/lib/postgresql/16/bin'])try{
  const tools=Object.fromEntries(['initdb','postgres','psql'].map(n=>[n,realpathSync(join(dir,n))]));
  for(const path of Object.values(tools)){const r=spawnSync(path,['--version'],{env:{LANG:'C'},encoding:'utf8',timeout:2000,shell:false});
   if(r.error||r.status!==0||!r.stdout.includes(' 16.'))throw Error('unsupported PostgreSQL version');}
  return tools;
 }catch{}
 throw Error('PostgreSQL16 tools unavailable');
}
const guardian=`import{spawn}from'node:child_process';
const server=spawn(process.argv[1],process.argv.slice(2),{stdio:['ignore','ignore','ignore'],env:{LANG:'C'}});
let stopping=false,timer;function stop(){if(stopping)return;stopping=true;server.kill('SIGINT');timer=setTimeout(()=>server.kill('SIGKILL'),4000);}
process.stdin.resume();process.stdin.on('end',stop);process.stdin.on('error',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
server.on('error',()=>process.exit(1));server.on('close',code=>{clearTimeout(timer);process.exit(stopping?0:code||1);});`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function terminal(child){return new Promise(resolve=>{child.on('error',()=>resolve({failed:true}));child.on('close',(code,signal)=>resolve({code,signal}));});}
export async function withTemporaryPostgres(action){
 const tools=postgresTools(),temp=realpathSync(mkdtempSync('/tmp/gcto-migration-'));
 if(!/^\/(?:private\/)?tmp\/gcto-migration-[A-Za-z0-9]+$/.test(temp))throw Error('unsafe generated cluster scope');
 const data=join(temp,'data'),socket=join(temp,'socket');mkdirSync(socket,{mode:0o700});
 let child,closed,shutdown=false;
 try{
  const init=spawnSync(tools.initdb,['-D',data,'-U','bench_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],
   {env:{LANG:'C'},encoding:'utf8',timeout:10000,maxBuffer:65536,shell:false});
  if(init.error||init.status!==0)throw Error('temporary PostgreSQL initialization unavailable');
  child=spawn(process.execPath,['--input-type=module','-e',guardian,tools.postgres,'-D',data,'-c',"listen_addresses=",'-c','unix_socket_directories='+socket,'-c','unix_socket_permissions=0700','-c','max_connections=12'],
   {env:{LANG:'C'},stdio:['pipe','ignore','ignore'],shell:false});closed=terminal(child);child.stdin.on('error',()=>{});
  const sql=(role,body,timeout=2000)=>{
   if(!['bench_admin','bench_reader','bench_migrator'].includes(role)||typeof body!=='string'||Buffer.byteLength(body)>32768)throw Error('invalid trusted SQL invocation');
   const r=spawnSync(tools.psql,['-X','-q','-t','-A','-h',socket,'-p','5432','-U',role,'-d','postgres','--set=ON_ERROR_STOP=1','--set=VERBOSITY=verbose'],
    {input:body,env:{LANG:'C',PGCONNECT_TIMEOUT:'1'},encoding:'utf8',timeout,maxBuffer:32768,shell:false});
   return {ok:!r.error&&r.status===0&&!r.signal,value:r.stdout?.trim(),code:r.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??null};
  };
  let ready=false;const deadline=performance.now()+3000;
  while(performance.now()<deadline){if(sql('bench_admin','SELECT 1;',1000).value==='1'){ready=true;break;}if(child.exitCode!==null)break;await sleep(25);}
  if(!ready)throw Error('temporary PostgreSQL startup unavailable');
  const holder=()=>{
   const c=spawn(tools.psql,['-X','-q','-t','-A','-h',socket,'-p','5432','-U','bench_reader','-d','postgres','--set=ON_ERROR_STOP=1'],
    {env:{LANG:'C',PGCONNECT_TIMEOUT:'1',PGAPPNAME:'bench-reader-holder'},stdio:['pipe','pipe','ignore'],shell:false});
   const done=terminal(c);c.stdin.on('error',()=>{});let output='';
   const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('reader lock unavailable')),2000);
    c.stdout.on('data',b=>{output+=b;if(output.includes('HOLDER_READY')){clearTimeout(timer);resolve();}});c.on('close',()=>{clearTimeout(timer);reject(Error('reader closed before lock'));});});
   c.stdin.write('BEGIN; SELECT id,amount FROM public.accounts ORDER BY id;\n\\echo HOLDER_READY\n');
   return {ready,release:async()=>{c.stdin.end('ROLLBACK;\n\\q\n');await done;}};
  };
  return await action({sql,holder,tools,temp});
 }finally{
  if(child){child.stdin.end();const result=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),6000);closed.then(value=>{clearTimeout(timer);resolve(value);});});shutdown=!!result&&result.code===0;
   if(!shutdown)throw Error('temporary PostgreSQL shutdown unconfirmed');}
  if(!child||shutdown)rmSync(temp,{recursive:true,force:true});
 }
}
function verifyRows(rows){if(!Array.isArray(rows)||rows.length!==2||rows[0]?.id!==1||rows[0]?.amount!==0||rows[1]?.id!==2
 ||!Number.isSafeInteger(rows[1]?.amount)||rows[1].amount<1||rows[1].amount>65536||rows.some(r=>!keys(r,['id','amount'])))throw Error('invalid migration oracle rows');}
export async function runMigrationPlan(plan,rows){
 validateMigrationPlan(plan);verifyRows(rows);
 return withTemporaryPostgres(async({sql,holder})=>{
  const must=(role,text)=>{const r=sql(role,text);if(!r.ok)throw Error('trusted migration setup unavailable');return r.value;};
  must('bench_admin','REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE ROLE bench_reader LOGIN; CREATE ROLE bench_migrator LOGIN; CREATE TABLE public.accounts(id integer PRIMARY KEY,amount integer NOT NULL); ALTER TABLE public.accounts OWNER TO bench_migrator; CREATE SCHEMA private; CREATE TABLE private.secrets(id integer); INSERT INTO private.secrets VALUES(1);'+
   'INSERT INTO public.accounts VALUES '+rows.map(r=>'('+r.id+','+r.amount+')').join(',')+'; GRANT SELECT ON public.accounts TO bench_reader;'+
   (plan.privileges.readerWrite?'GRANT INSERT,UPDATE,DELETE ON public.accounts TO bench_reader;':'')+(plan.privileges.migratorSuperuser?'ALTER ROLE bench_migrator SUPERUSER;':''));
  const legacy='SELECT coalesce(json_agg(t),\'[]\'::json) FROM (SELECT id,amount FROM public.accounts ORDER BY id)t;';
  const read=()=>{const r=sql('bench_reader',legacy);return r.ok&&same(JSON.parse(r.value),rows);};
  const settings="SET LOCAL lock_timeout='"+plan.timeouts.lockMs+"ms'; SET LOCAL statement_timeout='"+plan.timeouts.statementMs+"ms'; ";
  const addition='ALTER TABLE public.accounts ADD COLUMN display_name text'+(plan.expand.nullable?'':' NOT NULL')+';';
  const apply='BEGIN; '+settings+addition+(plan.expand.preserveLegacy?'':'ALTER TABLE public.accounts DROP COLUMN amount;')+' COMMIT;';
  const h=holder();let locks=false;
  try{await h.ready;
   if(must('bench_admin',"SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='bench-reader-holder' AND l.relation='public.accounts'::regclass AND l.mode='AccessShareLock' AND l.granted;")!=='1')throw Error('reader lock not attested');
   const start=performance.now(),attempt=sql('bench_migrator','BEGIN; '+settings+addition+' COMMIT;',1500);
   locks=attempt.code==='55P03'&&performance.now()-start<1200&&read();
  }finally{await h.release();}
  const statement=sql('bench_migrator','BEGIN; '+settings+'SELECT pg_sleep(3); COMMIT;',1500);locks&&=statement.code==='57014';
  const applied=sql('bench_migrator',apply).ok;
  const reader=applied&&read()&&sql('bench_reader','SELECT id,amount,display_name FROM public.accounts ORDER BY id;').ok;
  const write=sql('bench_reader','BEGIN; INSERT INTO public.accounts(id,amount) VALUES(99,99); ROLLBACK;');
  const update=sql('bench_reader','BEGIN; UPDATE public.accounts SET id=10 WHERE id=1; ROLLBACK;');
  const remove=sql('bench_reader','BEGIN; DELETE FROM public.accounts WHERE id=1; ROLLBACK;');
  const roles=must('bench_admin',"SELECT rolsuper::int||','||rolcreatedb::int||','||rolcreaterole::int FROM pg_roles WHERE rolname='bench_migrator';");
  const foreign=sql('bench_migrator','SELECT * FROM private.secrets;'),readerForeign=sql('bench_reader','SELECT * FROM private.secrets;');
  const create=sql('bench_migrator','CREATE ROLE forbidden_role;'),database=sql('bench_migrator','CREATE DATABASE forbidden_database;');
  const privileges=roles==='0,0,0'&&[write,update,remove,foreign,readerForeign,create,database].every(r=>r.code==='42501');
  const rollback=sql('bench_migrator','BEGIN; '+settings+(plan.rollback.preserveRows?'':'DELETE FROM public.accounts;')+
   (plan.rollback.removeAdded?'ALTER TABLE public.accounts DROP COLUMN display_name;':'')+' COMMIT;');
  const restored=applied&&rollback.ok&&read()&&must('bench_admin',"SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='display_name';")==='0';
  const reapplied=restored&&sql('bench_migrator',apply).ok&&read();
  return {passed:[!!(restored&&reapplied),!!reader,!!locks,!!privileges]};
 });
}
function bounded(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{
 const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('unsafe candidate file');const b=Buffer.alloc(s.size+1);let used=0,n;
 while(used<b.length&&(n=readSync(fd,b,used,b.length-used,null))>0)used+=n;const after=fstatSync(fd);
 if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('candidate changed');return b.subarray(0,used);
}finally{closeSync(fd);}}
function inventory(root){const files=new Map();let count=0,total=0;function visit(name=''){
 const path=join(root,name),s=lstatSync(path);if(++count>200||s.isSymbolicLink())throw Error('unsafe inventory');
 if(s.isDirectory()){const ns=readdirSync(path);if(ns.length>200)throw Error('oversized inventory');for(const n of ns)if(name||n!=='.git')visit(name?name+'/'+n:n);return;}
 const bytes=bounded(path);if((total+=bytes.length)>1048576)throw Error('oversized inventory');files.set(name,bytes);
}visit();return files;}
async function score(){
 const root=realpathSync(process.argv[2]),o=JSON.parse(process.argv[3]);if(o.scenario!=='migration-safety'||!Array.isArray(o.protected))throw Error('invalid migration oracle');verifyRows(o.rows);
 let files,integrity=false;try{files=inventory(root);integrity=Object.keys(o.baseline).every(n=>files.has(n))&&[...files.keys()].every(n=>Object.hasOwn(o.baseline,n))&&o.protected.every(n=>sha(files.get(n))===o.baseline[n]);}catch{}
 let passed=[false,false,false,false];if(integrity){let plan;try{plan=validateMigrationPlan(JSON.parse(files.get('migrations/plan.json').toString('utf8')));}catch{}
  if(plan)passed=(await runMigrationPlan(plan,o.rows)).passed;}
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:o.scenario,criteria:o.criteria.map((text,i)=>({text,state:passed[i]?'passed':'failed',
  evidence:passed[i]?'Temporary PostgreSQL observed rollback/readers/deadlines/role contracts':'Migration behavior or protected inventory failed; private rows withheld'}))}));
}
if(process.argv[1]==='-')await score();
