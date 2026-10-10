/** Operator-owned corpus snapshot. Hash integrity is not execution attestation. */
import {createHash} from 'node:crypto';
import {realpathSync,lstatSync,openSync,fstatSync,readSync,closeSync,constants,mkdtempSync,mkdirSync,writeFileSync,chmodSync,readdirSync} from 'node:fs';
import {join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scenarios} from './adaptive-benchmark-protocol.mjs';
import {docsBenchmarkFixture} from './docs-benchmark-fixture.mjs';
import {tenantAuthBenchmarkFixture} from './tenant-auth-benchmark-fixture.mjs';
import {billingWebhookBenchmarkFixture} from './billing-webhook-benchmark-fixture.mjs';
import {boundedImportBenchmarkFixture} from './bounded-import-benchmark-fixture.mjs';
import {promptInjectionBenchmarkFixture} from './prompt-injection-benchmark-fixture.mjs';
import {apiCompatibilityBenchmarkFixture} from './api-compatibility-benchmark-fixture.mjs';
import {migrationSafetyBenchmarkFixture} from './migration-safety-benchmark-fixture.mjs';
import {boardAccessibilityBenchmarkFixture} from './board-accessibility-benchmark-fixture.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x)+'\n',same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const safeName=n=>typeof n==='string'&&!isAbsolute(n)&&!n.includes('\\')&&n.split('/').every(p=>p&&p!=='.'&&p!=='..');
const recipes=[
 [docsBenchmarkFixture,'docs-benchmark-fixture.mjs'],[tenantAuthBenchmarkFixture,'tenant-auth-benchmark-fixture.mjs'],
 [billingWebhookBenchmarkFixture,'billing-webhook-benchmark-fixture.mjs'],[boundedImportBenchmarkFixture,'bounded-import-benchmark-fixture.mjs'],
 [promptInjectionBenchmarkFixture,'prompt-injection-benchmark-fixture.mjs'],[apiCompatibilityBenchmarkFixture,'api-compatibility-benchmark-fixture.mjs'],
 [migrationSafetyBenchmarkFixture,'migration-safety-benchmark-fixture.mjs'],[boardAccessibilityBenchmarkFixture,'board-accessibility-benchmark-fixture.mjs']];
const boundary=Object.freeze({benchmarkEligible:false,graphFloorCoverageVerified:false,executionArtifactProvenanceVerified:false,
 providerProvenanceVerified:false,independentAdmissionVerified:false});
const runtimeRequirement=id=>id==='migration-safety'?'PostgreSQL16 trusted fixed interpreter':id==='board-accessibility'?'Chromium static DOM/CSS with operator CSP':
 ['billing-webhook','bounded-import','prompt-injection','api-compatibility'].includes(id)?'macOS restricted candidate subprocess':'trusted fixed Node observer';
function readBounded(path,max=65536,privateFile=false){
 if(realpathSync(path)!==path)throw Error('noncanonical snapshot file');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>max||(privateFile&&(s.mode&0o077)))throw Error('unsafe snapshot file');
  const b=Buffer.alloc(s.size+1);let used=0,n;while(used<b.length&&(n=readSync(fd,b,used,b.length-used,null))>0)used+=n;
  const after=fstatSync(fd);if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('snapshot file changed');return b.subarray(0,used);
 }finally{closeSync(fd);}
}
function binaryPin(name,path){
 try{path=realpathSync(path);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const s=fstatSync(fd);if(!s.isFile()||s.size>268435456)throw Error('unsupported tool file');
   const h=createHash('sha256'),buffer=Buffer.alloc(65536);let total=0,n;while((n=readSync(fd,buffer,0,buffer.length,null))>0){total+=n;if(total>s.size)throw Error('tool changed');h.update(buffer.subarray(0,n));}
   const after=fstatSync(fd);if(total!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('tool changed');
   return {name,state:'available-bytes-not-execution',path,size:s.size,sha256:h.digest('hex')};
  }finally{closeSync(fd);}
 }catch{return {name,state:'unavailable'};}
}
export function corpusRuntimePins(){
 const pins=[binaryPin('node',process.execPath)];
 if(process.platform==='darwin')pins.push(binaryPin('macos-sandbox-exec','/usr/bin/sandbox-exec'));
 else pins.push({name:'macos-sandbox-exec',state:'unsupported-host'});
 const dirs=['/opt/homebrew/opt/postgresql@16/bin','/opt/homebrew/bin','/usr/lib/postgresql/16/bin'];
 for(const name of ['initdb','postgres','psql']){
  let pin={name:'postgresql-'+name,state:'unavailable'};
  for(const dir of dirs){const candidate=binaryPin(pin.name,join(dir,name));if(candidate.state==='available-bytes-not-execution'){pin=candidate;break;}}
  pins.push(pin);
 }
 return {platform:process.platform,nodeVersion:process.version,pins,
  chromiumExecutionPin:'unassessed; Playwright entry pin is not the running Chromium/dependency closure'};
}
export function prepareCorpusRegistration(){
 const files={},tasks=[];
 for(let i=0;i<scenarios.length;i++){
  const scenario=scenarios[i],[factory,generatorName]=recipes[i],recipe=factory(),prefix=scenario.id;
  if(recipe.oracle.scenario!==prefix||!same(recipe.oracle.criteria,scenario.checks))throw Error('recipe taxonomy mismatch');
  const inputs=Object.entries(recipe.files).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>{
   if(!safeName(name)||typeof value!=='string'||Buffer.byteLength(value)>65536||recipe.oracle.baseline[name]!==sha(value))throw Error('recipe baseline mismatch');
   const bytes=Buffer.from(value);files['workers/'+prefix+'/'+name]=bytes;return {name,size:bytes.length,sha256:sha(bytes)};
  });
  if(!same(Object.keys(recipe.oracle.baseline).sort(),inputs.map(x=>x.name).sort()))throw Error('recipe inventory mismatch');
  const oracle=Buffer.from(json(recipe.oracle)),scorerName=prefix+'.mjs';
  const scorer=readBounded(realpathSync(fileURLToPath(new URL('../benchmark-scorers/'+scorerName,import.meta.url))));
  const generator=readBounded(realpathSync(fileURLToPath(new URL(generatorName,import.meta.url))));
  if(oracle.length>65536)throw Error('private oracle exceeds bound');
  files['oracles/'+prefix+'.json']=oracle;files['scorers/'+scorerName]=scorer;files['generators/'+generatorName]=generator;
  tasks.push({id:prefix,cluster:scenario.cluster,tier:scenario.tier,specificationSha256:sha(json(scenario)),criteriaSha256:sha(json(scenario.checks)),
   inputs,workerInputDigest:sha(json(inputs)),protectedNames:[...recipe.oracle.protected].sort(),
   oracle:{path:'oracles/'+prefix+'.json',size:oracle.length,sha256:sha(oracle)},
   scorer:{path:'scorers/'+scorerName,size:scorer.length,sha256:sha(scorer)},
   generator:{path:'generators/'+generatorName,size:generator.length,sha256:sha(generator)},
   admissionPolicyDigest:sha(scorer),runtimeRequirement:runtimeRequirement(prefix),
   browserEntryPin:recipe.oracle.browser??null});
 }
 const manifest={version:1,kind:'operator-frozen-eight-task-corpus',status:'frozen-not-run-ready',taxonomySha256:sha(json(scenarios)),
  tasks,runtime:corpusRuntimePins(),boundary};
 const bytes=Buffer.from(json(manifest));files['registration.json']=bytes;
 return {manifest,files,manifestSha256:sha(bytes)};
}
export function freezeCorpusRegistration(operatorRoot){
 if(!isAbsolute(operatorRoot)||operatorRoot==='/'||realpathSync(operatorRoot)!==operatorRoot)throw Error('canonical private operator directory required');
 const s=lstatSync(operatorRoot);if(!s.isDirectory()||(s.mode&0o077))throw Error('private operator directory required');
 const prepared=prepareCorpusRegistration(),root=mkdtempSync(join(operatorRoot,'corpus-'));const directories=new Set([root]);
 for(const [name,bytes]of Object.entries(prepared.files)){
  const path=join(root,name);mkdirSync(dirname(path),{recursive:true,mode:0o700});
  writeFileSync(path,bytes,{flag:'wx',mode:0o400});let parent=dirname(path);while(parent.startsWith(root)){directories.add(parent);if(parent===root)break;parent=dirname(parent);}
 }
 for(const path of [...directories].sort((a,b)=>b.length-a.length))chmodSync(path,0o500);
 return {root,manifestSha256:prepared.manifestSha256,summary:corpusRegistrationSummary(prepared.manifest)};
}
function inventory(root,expectedFiles){
 const allowedDirectories=new Set(['']);for(const file of expectedFiles){let parent=dirname(file);while(parent!=='.'){allowedDirectories.add(parent);parent=dirname(parent);}}
 const paths=[];let entries=0,total=0;function visit(name=''){
  const path=join(root,name),s=lstatSync(path);if(++entries>250||s.isSymbolicLink()||(s.mode&0o077)||(s.mode&0o222))throw Error('unsafe private corpus inventory');
  if(s.isDirectory()){if(!allowedDirectories.has(name))throw Error('extra corpus directory');for(const n of readdirSync(path))visit(name?name+'/'+n:n);return;}
  const bytes=readBounded(path,name==='registration.json'?131072:65536,true);if((total+=bytes.length)>2097152)throw Error('corpus exceeds bound');paths.push(name);
 }visit();return paths.sort();
}
export function verifyCorpusRegistration(root,expectedSha256,{checkRuntime=true}={}){
 if(!isAbsolute(root)||root==='/'||realpathSync(root)!==root||!hex(expectedSha256)||typeof checkRuntime!=='boolean')throw Error('canonical corpus and external registration pin required');
 const raw=readBounded(join(root,'registration.json'),131072,true);if(sha(raw)!==expectedSha256)throw Error('registration pin changed');
 let m;try{m=JSON.parse(raw);}catch{throw Error('invalid corpus registration');}
 if(m.version!==1||m.kind!=='operator-frozen-eight-task-corpus'||m.status!=='frozen-not-run-ready'||!same(m.boundary,boundary)
  ||m.taxonomySha256!==sha(json(scenarios))||!Array.isArray(m.tasks)||m.tasks.length!==8)throw Error('unsupported registration or eligibility promotion');
 const expected=['registration.json'];
 for(let i=0;i<8;i++){
  const task=m.tasks[i],scenario=scenarios[i];
  if(task.id!==scenario.id||task.cluster!==scenario.cluster||task.tier!==scenario.tier||task.specificationSha256!==sha(json(scenario))
   ||task.criteriaSha256!==sha(json(scenario.checks))||!Array.isArray(task.inputs)||!task.inputs.length||task.inputs.length>100
   ||task.workerInputDigest!==sha(json(task.inputs))||!Array.isArray(task.protectedNames)||task.runtimeRequirement!==runtimeRequirement(task.id))throw Error('task specification or inventory changed');
  const actual={};
  for(const input of task.inputs){if(!safeName(input.name)||Object.hasOwn(actual,input.name)||!hex(input.sha256))throw Error('unsafe worker inventory');
   const path='workers/'+task.id+'/'+input.name;expected.push(path);const bytes=readBounded(join(root,path),65536,true);
   if(bytes.length!==input.size||sha(bytes)!==input.sha256)throw Error('worker input changed');actual[input.name]=input.sha256;}
  const readEvidence=(pin,expectedPath)=>{if(pin.path!==expectedPath||!hex(pin.sha256))throw Error('invalid evidence path/pin');expected.push(pin.path);
   const bytes=readBounded(join(root,pin.path),65536,true);if(bytes.length!==pin.size||sha(bytes)!==pin.sha256)throw Error('corpus evidence changed');return bytes;};
  let oracle;try{oracle=JSON.parse(readEvidence(task.oracle,'oracles/'+task.id+'.json'));}catch{throw Error('private oracle bytes or JSON invalid');}
  if(oracle.version!==1||oracle.scenario!==task.id||!same(oracle.criteria,scenario.checks)||!same(Object.keys(oracle.baseline).sort(),Object.keys(actual).sort())
   ||Object.entries(actual).some(([n,h])=>oracle.baseline[n]!==h)||!same([...oracle.protected].sort(),task.protectedNames)
   ||task.protectedNames.some(n=>!Object.hasOwn(actual,n))||!same(oracle.browser??null,task.browserEntryPin))throw Error('private oracle binding changed');
  const scorer=readEvidence(task.scorer,'scorers/'+task.id+'.mjs');readEvidence(task.generator,'generators/'+recipes[i][1]);
  if(task.admissionPolicyDigest!==sha(scorer))throw Error('admission policy changed');
 }
 if(!same(expected.sort(),inventory(root,expected)))throw Error('extra or missing corpus input');
 if(checkRuntime&&!same(m.runtime,corpusRuntimePins()))throw Error('runtime tool registration changed');
 if(checkRuntime)for(const task of m.tasks)if(task.browserEntryPin){const p=task.browserEntryPin;
  if(typeof p.entry!=='string'||!hex(p.entrySha256)||sha(readBounded(p.entry))!==p.entrySha256)throw Error('browser entry pin changed');}
 return {...corpusRegistrationSummary(m),runtimeBytesChecked:checkRuntime,evidenceLevel:'private snapshot byte-integrity only'};
}
export function corpusRegistrationSummary(manifest){
 if(!Array.isArray(manifest?.tasks)||manifest.tasks.length!==8||manifest.tasks.some((t,i)=>t.id!==scenarios[i].id||t.cluster!==scenarios[i].cluster||t.tier!==scenarios[i].tier
  ||!Array.isArray(t.inputs)||!Array.isArray(t.protectedNames)||!hex(t.workerInputDigest)||!hex(t.oracle?.sha256)||!hex(t.scorer?.sha256)))throw Error('invalid redacted corpus summary');
 return {version:1,scenarioCount:manifest.tasks.length,status:'frozen-not-run-ready',tasks:manifest.tasks.map(t=>({id:t.id,cluster:t.cluster,tier:t.tier,
  inputCount:t.inputs.length,protectedCount:t.protectedNames.length,workerInputDigest:t.workerInputDigest,oracleSha256:t.oracle.sha256,scorerSha256:t.scorer.sha256})),...boundary};
}
