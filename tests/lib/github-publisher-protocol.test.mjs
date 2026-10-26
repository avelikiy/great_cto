import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publishLocalGitHubRelease} from '../../scripts/publish-local-github-release.mjs';
import {fixture,server,mutations} from '../helpers/github-publisher-protocol-fixture.mjs';

const root='/repos/avelikiy/great_cto';
test('binary asset upload requests JSON response and preserves exact octet body',async t=>{
  const f=fixture(t),s=server(f);
  const result=await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});
  const uploads=s.state.calls.filter(c=>new URL(c.url).hostname==='uploads.github.com');
  assert.equal(uploads.length,10);
  for(const c of uploads){assert.equal(c.headers.get('accept'),'application/vnd.github+json');assert.equal(c.headers.get('content-type'),'application/octet-stream');assert.deepEqual(c.body,f.files.get(new URL(c.url).searchParams.get('name')));}
  assert.equal(result.evidence,'SYNTHETIC_ONLY');assert.equal(result.authority,'NONE');
});

test('explicit draft ID resumes missing assets even when tag lookup returns404',async t=>{
  const f=fixture(t),s=server(f,{existing:true});Object.assign(s.state,{hideByTag:true,forbidCreation:true});
  for(const[name,bytes]of [...f.files].slice(0,3))s.add(name,bytes);
  const result=await publishLocalGitHubRelease({...f.options,resumeReleaseId:77},{run:f.run,fetchFn:s.fetchFn});
  assert.equal(result.releaseId,77);assert.equal(s.state.release.draft,false);assert.equal(s.state.assets.size,10);
  assert.equal(s.state.calls.some(c=>new URL(c.url).pathname.includes('/releases/tags/')),false);
  assert.equal(mutations(s.state).filter(c=>c.method==='POST').length,7);
  assert.equal(mutations(s.state).some(c=>new URL(c.url).pathname===root+'/releases'),false);
  assert.equal(s.state.downloads.size,10);
});

test('explicit public release ID stays read-only and preserves binary GET/CDN boundaries',async t=>{
  const f=fixture(t),s=server(f,{existing:true,publicRelease:true});Object.assign(s.state,{hideByTag:true,forbidCreation:true,redirect:'allowed'});
  for(const[name,bytes]of f.files)s.add(name,bytes);
  await publishLocalGitHubRelease({...f.options,resumeReleaseId:77},{run:f.run,fetchFn:s.fetchFn});
  assert.equal(mutations(s.state).length,0);assert.equal(s.state.downloads.size,10);
  assert.equal(s.state.calls.some(c=>new URL(c.url).pathname.includes('/releases/tags/')),false);
  const downloads=s.state.calls.filter(c=>new URL(c.url).hostname==='release-assets.githubusercontent.com');assert.ok(downloads.length>=10);
  for(const c of downloads){assert.equal(c.method,'GET');assert.equal(c.headers.get('accept'),'application/octet-stream');assert.equal(c.headers.has('authorization'),false);}
});

for(const id of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'77',NaN,Infinity,null])test('invalid explicit resume ID refuses before Git/HTTP: '+String(id),async t=>{
  const f=fixture(t),s=server(f);let gitCalls=0;
  await assert.rejects(publishLocalGitHubRelease({...f.options,resumeReleaseId:id},{run:()=>{gitCalls++;throw Error('unexpected Git');},fetchFn:s.fetchFn}),/resume.*ID/i);
  assert.equal(gitCalls,0);assert.equal(s.state.calls.length,0);
});

for(const attack of ['id','owner','tag','target','prerelease','draft-type','missing','oversized'])test('explicit resume '+attack+' refuses without writes or creation fallback',async t=>{
  const f=fixture(t),s=server(f,{existing:true});Object.assign(s.state,{hideByTag:true,forbidCreation:true});
  const fetchFn=async(url,opts)=>{
    const response=await s.fetchFn(url,opts);
    if(new URL(url).pathname===root+'/releases/77'&&(opts.method||'GET')==='GET'){
      if(attack==='missing')return new Response('missing',{status:404});
      if(attack==='oversized')return new Response('x'.repeat(1024*1024+1));
      const value={...s.state.release};
      if(attack==='id')value.id=78;if(attack==='owner')value.author={login:'other'};if(attack==='tag')value.tag_name='v9.9.9';if(attack==='target')value.target_commitish='main';if(attack==='prerelease')value.prerelease=true;if(attack==='draft-type')value.draft='true';
      return Response.json(value);
    }
    return response;
  };
  await assert.rejects(publishLocalGitHubRelease({...f.options,resumeReleaseId:77},{run:f.run,fetchFn}));
  assert.equal(mutations(s.state).length,0);
  assert.equal(s.state.calls.some(c=>new URL(c.url).pathname.includes('/releases/tags/')),false);
});

test('CLI accepts only canonical decimal safe resume IDs before reading synthetic credentials',t=>{
  const f=fixture(t),marker=path.join(f.root,'token-read'),preload=path.join(f.root,'guard.cjs');
  // Only this test's inert credential is observed. Real Git and HTTP are forbidden.
  fs.writeFileSync(preload,`const fs=require('node:fs'),cp=require('node:child_process');const original=fs.openSync;fs.openSync=function(p,...args){if(p===${JSON.stringify(f.options.githubTokenFile)})fs.writeFileSync(${JSON.stringify(marker)},'read');return original.call(this,p,...args)};cp.execFileSync=()=>{throw Error('fixture Git forbidden')};require('node:module').syncBuiltinESMExports();global.fetch=async()=>{throw Error('fixture HTTP forbidden')};`);
  const entry=fileURLToPath(new URL('../../scripts/publish-local-github-release.mjs',import.meta.url));
  const flags=['--directory',f.options.directory,'--version',f.options.version,'--source',f.options.source,'--approve-commit',f.options.approveCommit,'--approve-index-digest',f.options.approveIndexDigest,'--approval',f.options.approval,'--public-key',f.options.localPublicKeyPath,'--key-fingerprint',f.options.localKeyFingerprint,'--github-token-file',f.options.githubTokenFile];
  for(const value of ['1e3','0x4d','077','+77','77.0','0','9007199254740992','NaN']){
    fs.rmSync(marker,{force:true});
    assert.throws(()=>execFileSync(process.execPath,['--require',preload,entry,...flags,'--resume-release-id',value],{stdio:'pipe',env:{PATH:'/usr/bin:/bin'},timeout:10000}));
    assert.equal(fs.existsSync(marker),false,'noncanonical ID must be refused before credential read: '+value);
  }
  assert.throws(()=>execFileSync(process.execPath,['--require',preload,entry,...flags,'--resume-release-id','77'],{stdio:'pipe',env:{PATH:'/usr/bin:/bin'},timeout:10000}));
  assert.equal(fs.existsSync(marker),true,'canonical ID reaches validation with only synthetic credentials');
});
