#!/usr/bin/env node
/** A tag-context signing broker. It has no registry or host-activation operation. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY='avelikiy/great_cto', WORKFLOW='.github/workflows/publish.yml';
const ISSUER='https://token.actions.githubusercontent.com';
export const TRUSTED_ROOT_SHA256='6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66';
const names=v=>[['npm',`great-cto-${v}.tgz`],['plugin',`great-cto-plugin-${v}.tgz`],['inventory','plugin-inventory.json'],['sbom','sbom.cdx.json']];
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
function read(file,max=128*1024*1024){
  const before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.mode&0o7000||before.size>max)throw Error('signing input must be a bounded regular file without links');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const st=fs.fstatSync(fd);if(st.ino!==before.ino||st.dev!==before.dev||st.nlink!==1)throw Error('signing input identity changed');const bytes=fs.readFileSync(fd);const after=fs.fstatSync(fd);if(bytes.length!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw Error('signing input changed');return bytes;}finally{fs.closeSync(fd);}
}

export function assertSigningContext({env,version,commit}){
  if(!STABLE.test(version)||!/^[a-f0-9]{40}$/.test(commit)||env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!==`refs/tags/v${version}`||env.GITHUB_SHA!==commit||env.GITHUB_WORKFLOW_REF!==`${REPOSITORY}/${WORKFLOW}@refs/tags/v${version}`)throw Error('SIGN_ONLY requires the exact trusted GitHub tag-push identity and source SHA');
}
function loadIndex(directory,version){
  const raw=read(join(directory,'release-index.json'),256*1024).toString('utf8');let x;
  try{x=JSON.parse(raw);}catch{throw Error('invalid release index');}
  // The builder emits one of these canonical serializations. Reject duplicate
  // keys/alternate parser interpretations instead of signing ambiguous metadata.
  if(raw!==JSON.stringify(x)+'\n'&&raw!==JSON.stringify(x,null,2)+'\n')throw Error('release index is not canonical JSON');
  if(!exact(x,['schema','package','version','source','publisher','artifacts'])||x.schema!==1||x.package!=='great-cto'||x.version!==version||!STABLE.test(version)||!exact(x.source,['repository','commit','tree','tag'])||x.source.repository!==REPOSITORY||!/^[a-f0-9]{40}$/.test(x.source.commit)||!/^[a-f0-9]{40}$/.test(x.source.tree)||x.source.tag!==`v${version}`||!exact(x.publisher,['workflow'])||x.publisher.workflow!==WORKFLOW||!Array.isArray(x.artifacts)||x.artifacts.length!==4)throw Error('invalid release index policy');
  for(const [i,[kind,filename]] of names(version).entries()){
    const a=x.artifacts[i];if(!exact(a,['kind','filename','size','sha256','sha512'])||a.kind!==kind||a.filename!==filename||!Number.isSafeInteger(a.size)||a.size<1||a.size>128*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256)||!/^[a-f0-9]{128}$/.test(a.sha512))throw Error('invalid indexed artifact');
    const bytes=read(join(directory,filename));if(bytes.length!==a.size||hash('sha256',bytes)!==a.sha256||hash('sha512',bytes)!==a.sha512)throw Error('indexed artifact size or digest mismatch');
  }
  return x;
}
function safeEnv(env){
  const out={};for(const key of ['PATH','HOME','TMPDIR','RUNNER_TEMP','SYSTEMROOT','ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])if(typeof env[key]==='string')out[key]=env[key];
  // No candidate-controlled COSIGN/SIGSTORE/FULCIO/REKOR/TUF overrides survive.
  return out;
}
function operateReleaseArtifacts({directory,version,cosignPath,trustedRootPath,trustedRootSha256=TRUSTED_ROOT_SHA256,env=process.env,run=execFileSync},verificationOnly){
  if(!isAbsolute(directory||'')||fs.lstatSync(directory).isSymbolicLink())throw Error('signing directory must be an absolute private directory');
  directory=fs.realpathSync(directory);const dir=fs.statSync(directory);
  if(!dir.isDirectory()||dir.mode&0o077||(process.getuid&&dir.uid!==process.getuid()))throw Error('signing directory must be owner-only');
  const index=loadIndex(directory,version);
  if(verificationOnly && !['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw Error('verification resume requires trusted tag workflow context');
  assertSigningContext({env:verificationOnly?{...env,GITHUB_EVENT_NAME:'push'}:env,version,commit:index.source.commit});
  const artifacts=[...index.artifacts.map(x=>x.filename),'release-index.json'];
  const members=fs.readdirSync(directory).sort();const expectedMembers=[...artifacts,...(verificationOnly?artifacts.map(n=>n+'.sigstore.json'):[])].sort();
  if(JSON.stringify(members)!==JSON.stringify(expectedMembers))throw Error('unexpected signing directory member or existing bundle');
  for(const name of artifacts){const bundle=join(directory,name+'.sigstore.json');if(verificationOnly)read(bundle,2*1024*1024);else if(fs.existsSync(bundle))throw Error('existing signature bundle; refusing overwrite');}
  if(!isAbsolute(cosignPath||'')||cosignPath.startsWith(directory+sep)||fs.lstatSync(cosignPath).isSymbolicLink()||!fs.statSync(cosignPath).isFile()||fs.statSync(cosignPath).mode&0o022)throw Error('trusted absolute Cosign executable required');
  if(!isAbsolute(trustedRootPath||'')||trustedRootPath===directory||trustedRootPath.startsWith(directory+sep)||trustedRootSha256!==TRUSTED_ROOT_SHA256)throw Error('separately pinned trusted root required');
  const rootBytes=read(trustedRootPath,1024*1024);if(hash('sha256',rootBytes)!==trustedRootSha256)throw Error('trusted root digest mismatch');
  const options={encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],cwd:dirname(cosignPath),env:safeEnv(env)};
  let info;try{info=JSON.parse(String(run(cosignPath,['version','--json'],options)));}catch{throw Error('cannot verify trusted Cosign version');}
  if(info.gitVersion!=='v3.1.4'&&info.gitVersion!=='3.1.4')throw Error('Cosign v3.1.4 is required');
  for(const name of verificationOnly?['release-index.json',...index.artifacts.map(x=>x.filename)]:artifacts){
    const file=join(directory,name),bundle=file+'.sigstore.json',before=hash('sha256',read(file));
    if(!verificationOnly)run(cosignPath,['sign-blob','--yes','--bundle',bundle,file],options);
    if(hash('sha256',read(file))!==before)throw Error('artifact changed during signing');
    read(bundle,2*1024*1024);fs.chmodSync(bundle,0o600);
    run(cosignPath,['verify-blob','--bundle',bundle,'--trusted-root',trustedRootPath,'--certificate-identity',`https://github.com/${REPOSITORY}/${WORKFLOW}@refs/tags/v${version}`,'--certificate-oidc-issuer',ISSUER,'--certificate-github-workflow-repository',REPOSITORY,'--certificate-github-workflow-ref',env.GITHUB_REF,'--certificate-github-workflow-sha',index.source.commit,'--certificate-github-workflow-trigger','push',file],options);
    if(hash('sha256',read(file))!==before)throw Error('artifact changed during verification');
  }
  loadIndex(directory,version);
  return {state:verificationOnly?'VERIFIED':'SIGNED_AND_VERIFIED',version,commit:index.source.commit,tree:index.source.tree,bundles:artifacts.map(name=>name+'.sigstore.json'),authority:run===execFileSync?'ARTIFACT_SIGNATURES_ONLY':'NONE',releaseEligibility:'NOT_CHECKED',published:false,installed:false};
}

export const signReleaseArtifacts = options => operateReleaseArtifacts(options,false);
export const verifyReleaseArtifacts = options => operateReleaseArtifacts(options,true);

/** The publisher resumes only an immutable artifact from this exact successful tag run. */
export function validatePreparedRun({run,artifacts,commit,runId}){
  if(!/^[1-9][0-9]{0,15}$/.test(String(runId))||!Number.isSafeInteger(Number(runId))||!/^[a-f0-9]{40}$/.test(commit)||!run||run.id!==Number(runId)||run.event!=='push'||run.path!==WORKFLOW||run.head_sha!==commit||run.status!=='completed'||run.conclusion!=='success'||run.repository?.full_name!==REPOSITORY||run.head_repository?.full_name!==REPOSITORY||!Array.isArray(artifacts))throw Error('untrusted or incomplete signing run');
  const matches=artifacts.filter(a=>a.name===`release-signed-${commit}`);
  if(matches.length!==1||matches[0].expired!==false||!Number.isSafeInteger(matches[0].id)||matches[0].id<1||!Number.isSafeInteger(matches[0].size_in_bytes)||matches[0].size_in_bytes<1||matches[0].size_in_bytes>512*1024*1024||matches[0].workflow_run?.id!==Number(runId))throw Error('missing, ambiguous or expired signed artifact');
  return matches[0].id;
}
/** Publication requires the signed candidate itself on current public main.
 * SIGN_ONLY intentionally has no such prerequisite: its proof must precede merge.
 */
export function assertPublicationSource({source,version,commit,expectedTree,run=execFileSync}){
  if(!isAbsolute(source||'')||!STABLE.test(version)||!/^[a-f0-9]{40}$/.test(commit)||(expectedTree!==undefined&&!/^[a-f0-9]{40}$/.test(expectedTree)))throw Error('invalid publication source identity');
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'});
  const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:2*1024*1024,env};
  const git=args=>String(run('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',source,...args],options)).trim();
  const main='refs/remotes/release-admission/main',tag=`refs/release-admission/tags/v${version}`;
  try{
    const shallow=git(['rev-parse','--is-shallow-repository']);
    if(!['true','false'].includes(shallow))throw Error('unknown history state');
    git(['fetch','--no-tags','--no-recurse-submodules','--force','--no-write-fetch-head',...(shallow==='true'?['--unshallow']:[]),'https://github.com/avelikiy/great_cto.git',`+refs/heads/main:${main}`,`+refs/tags/v${version}:${tag}`]);
  }catch{throw Error('current public main and tag fetch unavailable; publication refused');}
  let mainCommit,tagCommit;
  try{mainCommit=git(['rev-parse','--verify',`${main}^{commit}`]);tagCommit=git(['rev-parse','--verify',`${tag}^{commit}`]);}catch{throw Error('current main or tag unavailable');}
  if(!/^[a-f0-9]{40}$/.test(mainCommit)||tagCommit!==commit)throw Error('current tag does not resolve to the exact signed source SHA');
  if(expectedTree!==undefined && git(['rev-parse','--verify',`${commit}^{tree}`])!==expectedTree)throw Error('signed source tree differs from current Git commit');
  try{git(['merge-base','--is-ancestor',commit,main]);}catch{throw Error('exact signed source SHA is not an ancestor of current main');}
  return {state:'EXACT_SOURCE_ON_MAIN',commit,main:mainCommit,tag:`v${version}`};
}

export function assertPublishProtection(environment){
  const rule=environment?.protection_rules?.find(r=>r.type==='required_reviewers');
  if(!rule||!Array.isArray(rule.reviewers)||rule.reviewers.length!==1||rule.reviewers[0]?.type!=='User'||rule.reviewers[0]?.reviewer?.login!=='avelikiy')throw Error('preexisting required owner review is missing from publish environment');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--self-test')){
    if(process.argv.length!==3){console.error('--self-test accepts no release arguments');process.exitCode=2;}else{
    // A nested Node test runner would silently skip files under this marker.
    const testEnv={...process.env};delete testEnv.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/lib/release-distribution-publisher.test.mjs',import.meta.url))],{stdio:'inherit',env:testEnv});
    process.exitCode=result.status??1;
    }
  }else{
  try{const args=process.argv.slice(2);const get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};const operation=args.includes('--verify-only')?verifyReleaseArtifacts:signReleaseArtifacts;const r=operation({directory:get('--directory'),version:get('--version'),cosignPath:get('--cosign'),trustedRootPath:get('--trusted-root'),trustedRootSha256:get('--trusted-root-sha256')});process.stdout.write(JSON.stringify(r)+'\n');}catch(error){console.error(`release signing refused: ${error.message}`);process.exitCode=1;}
  }
}
