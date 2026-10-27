#!/usr/bin/env node
/** Complete a private draft only after every admitted asset reads back exactly. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { admitRelease, getAdmissionInfo, getAdmittedArtifact, readTrustedLocalPublicKey, localReleaseSignatureMessage, parseStrictReleaseIndex } from '../packages/cli/src/release-trust.mjs';
import { assertPublicationSource } from './sign-release-artifacts.mjs';

const REPOSITORY = 'avelikiy/great_cto';
const API = 'https://api.github.com';
const ROOT = `${API}/repos/${REPOSITORY}`;
const CDNS = new Set(['release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const byteMessage = 'GitHub operation failed; response and credential details withheld';

function privateFile(file, limit) {
  if (!path.isAbsolute(file || '') || fs.realpathSync(file) !== path.resolve(file)) throw Error('canonical private publisher file required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a=fs.fstatSync(fd,{bigint:true});
    if (!a.isFile() || a.nlink!==1n || a.size<=0n || a.size>BigInt(limit) || (Number(a.mode)&0o777)!==0o600 || (process.getuid && a.uid!==BigInt(process.getuid()))) throw Error('bounded owner-only regular publisher file required');
    const bytes=fs.readFileSync(fd),b=fs.fstatSync(fd,{bigint:true});
    if (['dev','ino','size','mtimeNs','ctimeNs'].some(k=>a[k]!==b[k]) || bytes.length!==Number(a.size)) throw Error('publisher file changed during read');
    return bytes;
  } finally {fs.closeSync(fd);}
}
async function bytesFrom(response, limit) {
  if (!response.body) throw Error('missing bounded response body');
  const chunks=[];let total=0;
  for await(const chunk of response.body) {
    total+=chunk.length;if(total>limit)throw Error('response exceeds admitted bound');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function jsonFrom(response, allowed=[200]) {
  if (!allowed.includes(response.status)) {await response.body?.cancel();throw Error(`required GitHub response unavailable (${response.status})`);}
  try{return JSON.parse((await bytesFrom(response,1024*1024)).toString('utf8'));}
  catch{throw Error('malformed or oversized GitHub metadata');}
}
function verifyReleaseIdentity(release, version, commit) {
  if (!release || !positiveId(release.id) || release.tag_name!==`v${version}` || release.target_commitish!==commit || typeof release.draft!=='boolean' || release.prerelease!==false || release.author?.login!=='avelikiy') throw Error('existing release owner, source or stable tag identity refused');
}
function freezeSignedFiles(options, ticket) {
  const {directory,version,localPublicKeyPath,localKeyFingerprint}=options;
  const info=getAdmissionInfo(ticket), files=new Map();
  const rawIndex=privateFile(path.join(directory,'release-index.json'),256*1024);
  if(sha(rawIndex)!==info.indexDigest)throw Error('approved release index changed');
  const index=parseStrictReleaseIndex(rawIndex.toString('utf8'));
  const key=readTrustedLocalPublicKey(localPublicKeyPath,localKeyFingerprint);
  files.set('release-index.json',rawIndex);
  for(const artifact of index.artifacts) {
    const admitted=getAdmittedArtifact(ticket,artifact.kind),bytes=privateFile(admitted.path,artifact.size);
    if(bytes.length!==artifact.size || sha(bytes)!==artifact.sha256)throw Error('admitted asset changed before freeze');
    files.set(artifact.filename,bytes);
  }
  for(const [filename,bytes] of [...files]) {
    const proofBytes=privateFile(path.join(directory,filename+'.signature.json'),8192);
    const proof=parseStrictReleaseIndex(proofBytes.toString('utf8'),{maxBytes:8192});
    const expected=['schema','profile','keyFingerprint','filename','indexDigest','signature'].sort();
    if(JSON.stringify(Object.keys(proof).sort())!==JSON.stringify(expected) || proof.schema!==1 || proof.profile!=='local-ed25519' || proof.keyFingerprint!==localKeyFingerprint || proof.filename!==filename || proof.indexDigest!==info.indexDigest || typeof proof.signature!=='string' || !/^[A-Za-z0-9+/]{86}==$/.test(proof.signature)) throw Error('local asset proof identity changed');
    const signature=Buffer.from(proof.signature,'base64');
    if(signature.length!==64 || signature.toString('base64')!==proof.signature || !verify(null,localReleaseSignatureMessage(filename,info.indexDigest,bytes),key.key,signature)) throw Error('local asset proof verification failed');
    files.set(filename+'.signature.json',proofBytes);
  }
  // The immutable in-memory set is independent of later pathname edits. Retain
  // the original admission check too; replaced key/index paths revoke the run.
  getAdmissionInfo(ticket);
  if(version!==info.version || files.size!==10)throw Error('incomplete signed release set');
  return new Map([...files].sort(([a],[b])=>a.localeCompare(b)));
}

/** Explicit owner ship approval does not derive from cryptographic admission.
 * This operation never publishes npm and never replaces or deletes an asset.
 * Failure leaves any private draft intact for inspection and an exact retry.
 */
export async function publishLocalGitHubRelease(options,{run=execFileSync,fetchFn=fetch}={}) {
  if((run===execFileSync)!==(fetchFn===fetch))throw Error('test adapters must isolate both Git and HTTP operations');
  const {directory,version,source,approveCommit,approveIndexDigest,approval,localPublicKeyPath,localKeyFingerprint,githubTokenFile,resumeReleaseId}=options;
  if(approval!=='local-owner-release' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version||'') || !/^[a-f0-9]{40}$/.test(approveCommit||'') || !/^[a-f0-9]{64}$/.test(approveIndexDigest||''))throw Error('exact stable version, commit/index and explicit owner ship approval required');
  if(resumeReleaseId!==undefined && !positiveId(resumeReleaseId))throw Error('explicit resume release ID must be a positive safe integer');
  if(typeof githubTokenFile!=='string' || githubTokenFile===directory || githubTokenFile.startsWith(directory+path.sep))throw Error('GitHub token must be independently supplied outside candidate');
  const token=privateFile(githubTokenFile,1024).toString('utf8');
  if(!/^[A-Za-z0-9_-]{10,512}\n?$/.test(token))throw Error('single-line explicit GitHub token file required');
  const authorization='Bearer '+token.trim();
  const ticket=admitRelease({directory,version,expectedCommit:approveCommit,profile:'local-ed25519',localPublicKeyPath,localKeyFingerprint});
  const info=getAdmissionInfo(ticket);
  if(info.authority!=='ARTIFACT_ADMISSION' || info.evidence!=='LOCAL_ED25519_VERIFIED' || info.indexDigest!==approveIndexDigest)throw Error('approved local release admission mismatch');
  const files=freezeSignedFiles(options,ticket);
  assertPublicationSource({source,version,commit:approveCommit,expectedTree:info.tree,run});
  const request=async(url,method='GET',body,auth=false,binary=false)=>{
    const u=new URL(url);
    if(u.protocol!=='https:' || u.username || u.password || u.port || u.hash)throw Error('publisher endpoint refused');
    if(auth && ![API, 'https://uploads.github.com'].includes(u.origin))throw Error('credential origin refused');
    // Upload bodies are binary, but GitHub returns JSON asset metadata.
    const headers={accept:binary&&method==='GET'?'application/octet-stream':u.origin==='https://registry.npmjs.org'?'application/json':'application/vnd.github+json','accept-encoding':'identity'};
    if(auth){headers.authorization=authorization;headers['X-GitHub-Api-Version']='2022-11-28';}
    if(body!==undefined)headers['content-type']=binary?'application/octet-stream':'application/json';
    try{return await fetchFn(url,{method,redirect:'manual',signal:AbortSignal.timeout(180000),headers,...(body===undefined?{}:{body:binary?body:JSON.stringify(body)})});}
    catch{throw Error(byteMessage);}
  };
  const api=async(route,method='GET',body,allowed=[200])=>jsonFrom(await request(ROOT+route,method,body,true),allowed);
  const recheckRegistry=async()=>{
    const npmBytes=files.get(`great-cto-${version}.tgz`),integrity='sha512-'+createHash('sha512').update(npmBytes).digest('base64');
    const metadataResponse=await request(`https://registry.npmjs.org/great-cto/${version}`);
    if(metadataResponse.status!==200){await metadataResponse.body?.cancel();throw Error('exact npm version is unavailable; GitHub mutation refused');}
    let metadata;try{metadata=JSON.parse((await bytesFrom(metadataResponse,1024*1024)).toString('utf8'));}catch{throw Error('npm readback metadata invalid');}
    if(metadata.name!=='great-cto' || metadata.version!==version || metadata.dist?.integrity!==integrity)throw Error('npm readback identity or digest mismatch');
    const archiveResponse=await request(`https://registry.npmjs.org/great-cto/-/great-cto-${version}.tgz`, 'GET',undefined,false,true);
    if(archiveResponse.status!==200){await archiveResponse.body?.cancel();throw Error('npm tarball readback unavailable');}
    if(!(await bytesFrom(archiveResponse,npmBytes.length)).equals(npmBytes))throw Error('npm tarball readback differs from admitted bytes');
  };
  // npm readback is a prerequisite of every GitHub mutation, not a receipt
  // trusted from the previous local publishing process.
  await recheckRegistry();
  const user=await jsonFrom(await request(API+'/user','GET',undefined,true));
  if(user.login!=='avelikiy')throw Error('explicit GitHub token is not owned by avelikiy');
  const repository=await api('');
  if(repository.full_name!==REPOSITORY || repository.permissions?.push!==true)throw Error('fixed repository write permission unavailable');
  let release;
  if(resumeReleaseId!==undefined){
    // Private drafts may be absent from tag lookup. An explicit ID never falls
    // back to creating a second release when lookup or identity checks fail.
    release=await api(`/releases/${resumeReleaseId}`);
    if(release?.id!==resumeReleaseId)throw Error('resumed release ID differs from explicit request');
  }else{
    const existing=await request(ROOT+`/releases/tags/v${version}`,'GET',undefined,true);
    if(existing.status===404){
      await existing.body?.cancel();
      getAdmissionInfo(ticket);
      release=await api('/releases','POST',{tag_name:`v${version}`,target_commitish:approveCommit,name:`v${version}`,body:`Signed local release ${version}. Source: ${approveCommit}. Owner signatures bind the attached index and artifacts; this is not GitHub OIDC provenance.`,draft:true,prerelease:false,generate_release_notes:false,make_latest:'false'},[201]);
    }else release=await jsonFrom(existing);
  }
  verifyReleaseIdentity(release,version,approveCommit);
  const assetRoute=`/releases/${release.id}/assets?per_page=100&page=1`;
  const inspectAssets=async(requireComplete)=>{
    const assets=await api(assetRoute);
    if(!Array.isArray(assets) || assets.length>files.size || (requireComplete && assets.length!==files.size))throw Error('unexpected or incomplete existing release asset set');
    const seenNames=new Set(),seenIds=new Set();
    for(const asset of assets){
      const expected=files.get(asset.name);
      if(!expected || !positiveId(asset.id) || seenNames.has(asset.name) || seenIds.has(asset.id) || asset.state!=='uploaded' || asset.size!==expected.length || (asset.digest!==undefined && asset.digest!==null && asset.digest!=='sha256:'+sha(expected)))throw Error('unexpected, duplicate or changed release asset metadata');
      seenNames.add(asset.name);seenIds.add(asset.id);
      let url=ROOT+`/releases/assets/${asset.id}`,response;
      for(let redirects=0;redirects<=4;redirects++){
        const u=new URL(url),isApi=u.origin===API;
        if(!isApi && (u.protocol!=='https:' || u.username || u.password || u.port || u.hash || !CDNS.has(u.hostname)))throw Error('release asset redirect origin refused');
        response=await request(url,'GET',undefined,isApi,true);
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');await response.body?.cancel();
          if(!location || redirects===4)throw Error('release asset redirect limit or location refused');
          const next=new URL(location,url);
          if(next.protocol!=='https:' || next.username || next.password || next.port || next.hash || !CDNS.has(next.hostname))throw Error('release asset redirect origin refused');
          url=next.href;continue;
        }
        if(response.status!==200){await response.body?.cancel();throw Error('existing release asset byte readback unavailable');}
        if(!(await bytesFrom(response,expected.length)).equals(expected))throw Error('existing release asset bytes differ');
        break;
      }
    }
    return seenNames;
  };
  let present=await inspectAssets(!release.draft);
  const wasPublic=!release.draft;
  if(release.draft){
    for(const [name,bytes]of files){
      if(present.has(name))continue;
      getAdmissionInfo(ticket);
      const uploaded=await jsonFrom(await request(`https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,'POST',bytes,true,true),[201]);
      if(uploaded.name!==name || !positiveId(uploaded.id) || uploaded.state!=='uploaded' || uploaded.size!==bytes.length)throw Error('uploaded asset identity mismatch; draft retained');
    }
    // Refuse observed concurrent edits and partial uploads before publishing.
    // GitHub REST cannot atomically seal this asset list with the final PATCH.
    present=await inspectAssets(true);
    const current=await api(`/releases/${release.id}`);verifyReleaseIdentity(current,version,approveCommit);
    if(current.draft!==true)throw Error('draft release changed concurrently; refusing publication');
    getAdmissionInfo(ticket);
    assertPublicationSource({source,version,commit:approveCommit,expectedTree:info.tree,run});
    await recheckRegistry();
    const latestResponse=await request(ROOT+'/releases/latest','GET',undefined,true);
    let makeLatest='true';
    if(latestResponse.status===404)await latestResponse.body?.cancel();
    else{
      const latest=await jsonFrom(latestResponse);
      const match=/^v((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))$/.exec(latest.tag_name||'');
      if(!match || latest.draft!==false || latest.prerelease!==false)throw Error('latest release is not an exact stable public version');
      const current=match[1].split('.').map(Number),candidate=version.split('.').map(Number);
      for(let i=0;i<3;i++)if(candidate[i]!==current[i]){makeLatest=candidate[i]>current[i]?'true':'false';break;}
    }
    getAdmissionInfo(ticket);
    release=await api(`/releases/${release.id}`,'PATCH',{draft:false,prerelease:false,make_latest:makeLatest});
    verifyReleaseIdentity(release,version,approveCommit);
    if(release.draft!==false)throw Error('release publication did not read back as public');
  }
  const final=await api(`/releases/${release.id}`);verifyReleaseIdentity(final,version,approveCommit);
  if(final.draft!==false)throw Error('final release is not public');
  await inspectAssets(true);
  const production=run===execFileSync && fetchFn===fetch;
  return{state:production?(wasPublic?'ALREADY_PUBLISHED_BYTE_IDENTICAL':'GITHUB_RELEASE_PUBLISHED_AND_READ_BACK'):'SIMULATED_GITHUB_PUBLICATION_READBACK',version,commit:info.commit,indexDigest:info.indexDigest,releaseId:release.id,url:`https://github.com/${REPOSITORY}/releases/tag/v${version}`,assets:present.size,authority:production?'GITHUB_RELEASE_BYTES_VERIFIED':'NONE',evidence:production?'LOCAL_OWNER_SIGNATURE_NPM_AND_GITHUB_READBACK':'SYNTHETIC_ONLY',releaseEligibility:'NOT_CHECKED',published:production&&!wasPublic,installed:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const allowed=new Set(['--directory','--version','--source','--approve-commit','--approve-index-digest','--approval','--public-key','--key-fingerprint','--github-token-file','--resume-release-id']),flags=new Map();
    for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i],value=process.argv[i+1];if(!allowed.has(name)||flags.has(name)||!value||value.startsWith('--'))throw Error('invalid local GitHub publisher option');flags.set(name,value);}
    const resumeText=flags.get('--resume-release-id');
    if(resumeText!==undefined && (!/^[1-9]\d{0,15}$/.test(resumeText)||!positiveId(Number(resumeText))))throw Error('canonical decimal resume release ID required');
    const result=await publishLocalGitHubRelease({directory:flags.get('--directory'),version:flags.get('--version'),source:flags.get('--source'),approveCommit:flags.get('--approve-commit'),approveIndexDigest:flags.get('--approve-index-digest'),approval:flags.get('--approval'),localPublicKeyPath:flags.get('--public-key'),localKeyFingerprint:flags.get('--key-fingerprint'),githubTokenFile:flags.get('--github-token-file'),resumeReleaseId:resumeText===undefined?undefined:Number(resumeText)});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{console.error('verified GitHub publication refused; partial drafts are retained and credential details withheld');process.exitCode=1;}
}
