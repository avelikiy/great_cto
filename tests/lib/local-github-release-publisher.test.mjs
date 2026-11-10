import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { encodeReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
import { makeReleaseIndex } from '../../scripts/build-release-artifacts.mjs';
import { signLocalReleaseArtifacts } from '../../scripts/sign-local-release-artifacts.mjs';
import { publishLocalGitHubRelease } from '../../scripts/publish-local-github-release.mjs';

const version = '1.2.3', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = (bytes, algorithm='sha256') => createHash(algorithm).update(bytes).digest('hex');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gcto-github-publisher-'))); fs.chmodSync(root,0o700);
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'stage');fs.mkdirSync(directory,{mode:0o700});
  const npmFiles=[{path:'package.json',mode:0o644,bytes:Buffer.from(JSON.stringify({name:'great-cto',version,bin:{'great-cto':'index.mjs'}}))}, ...['index.mjs','dist/main.js','board/packages/board/server.mjs'].map(name=>({path:name,mode:0o644,bytes:Buffer.from('// inert fixture')}))];
  const pluginFiles=['.claude-plugin/plugin.json','.codex-plugin/plugin.json','packages/cli/dist/main.js','packages/cli/index.mjs','packages/board/server.mjs'].map(name=>({path:name,mode:0o644,bytes:Buffer.from(name.endsWith('plugin.json')?JSON.stringify({name:'great-cto',version}):'// inert fixture')}));
  const inventory={schema:1,version,files:pluginFiles.map(f=>({path:f.path,size:f.bytes.length,sha256:digest(f.bytes),mode:f.mode})).sort((a,b)=>a.path.localeCompare(b.path))};
  const blobs=new Map([[`great-cto-${version}.tgz`,encodeReleaseArchive(npmFiles)],[`great-cto-plugin-${version}.tgz`,encodeReleaseArchive(pluginFiles,{prefix:'plugin'})],['plugin-inventory.json',Buffer.from(JSON.stringify(inventory))],['sbom.cdx.json',Buffer.from('{"bomFormat":"CycloneDX"}')]]);
  for(const [name,bytes] of blobs)fs.writeFileSync(path.join(directory,name),bytes,{mode:0o600});
  fs.writeFileSync(path.join(directory,'release-index.json'),JSON.stringify(makeReleaseIndex({version,commit,tree,directory}))+'\n',{mode:0o600});
  const keys=generateKeyPairSync('ed25519'), privateKeyPath=path.join(root,'test-private.pem'),localPublicKeyPath=path.join(root,'test-public.pem');
  fs.writeFileSync(privateKeyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  fs.writeFileSync(localPublicKeyPath,keys.publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
  const localKeyFingerprint=digest(keys.publicKey.export({type:'spki',format:'der'}));
  const signed=signLocalReleaseArtifacts({directory,version,expectedCommit:commit,privateKeyPath,keyFingerprint:localKeyFingerprint});
  const githubTokenFile=path.join(root,'test-token');fs.writeFileSync(githubTokenFile,'test-only-github-token\n',{mode:0o600});
  const files=new Map(fs.readdirSync(directory).sort().map(name=>[name,fs.readFileSync(path.join(directory,name))]));
  const options={directory,version,source:root,approveCommit:commit,approveIndexDigest:signed.indexDigest,approval:'local-owner-release',localPublicKeyPath,localKeyFingerprint,githubTokenFile};
  const run=(binary,args)=>{assert.equal(binary,'git');if(args.includes('--is-shallow-repository'))return'false\n';if(args.some(x=>x.endsWith('^{tree}')))return tree+'\n';if(args.includes('--verify'))return commit+'\n';return'';};
  return{root,directory,options,files,run};
}
function server(f,{existing=false,publicRelease=false}={}){
  const state={release:existing?{id:77,tag_name:`v${version}`,target_commitish:commit,draft:!publicRelease,prerelease:false,author:{login:'avelikiy'}}:null,assets:new Map(),calls:[],downloads:new Set(),login:'avelikiy',push:true,registryStatus:200,registryTamper:false,failUploadAt:null,redirect:null,latest:null,latestStatus:404,expectedLatest:'true'};
  let nextAsset=100;
  const add=(name,bytes)=>{const id=nextAsset++,entry={id,name,size:bytes.length,state:'uploaded',digest:'sha256:'+digest(bytes),bytes};state.assets.set(id,entry);return entry;};
  const record=entry=>{const{bytes,...metadata}=entry;return metadata;};
  const fetchFn=async(url,opts={})=>{
    const parsed=new URL(url),method=opts.method||'GET',headers=new Headers(opts.headers);state.calls.push({url,method,headers,body:opts.body});
    if(parsed.hostname==='registry.npmjs.org'){
      assert.equal(headers.has('authorization'),false);
      if(state.registryStatus!==200)return new Response('registry unavailable',{status:state.registryStatus});
      if(parsed.pathname.endsWith('.tgz'))return new Response(state.registryTamper?Buffer.alloc(f.files.get(`great-cto-${version}.tgz`).length):f.files.get(`great-cto-${version}.tgz`));
      return Response.json({name:'great-cto',version,dist:{integrity:'sha512-'+createHash('sha512').update(f.files.get(`great-cto-${version}.tgz`)).digest('base64')}});
    }
    if(parsed.hostname==='release-assets.githubusercontent.com'){
      assert.equal(headers.has('authorization'),false);const id=Number(parsed.pathname.slice(1));state.downloads.add(id);return new Response(state.assets.get(id).bytes);
    }
    assert.equal(headers.get('authorization'),'Bearer test-only-github-token');
    if(parsed.pathname==='/user')return Response.json({login:state.login});
    if(parsed.pathname==='/repos/avelikiy/great_cto')return Response.json({full_name:'avelikiy/great_cto',permissions:{push:state.push}});
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/latest')return state.latestStatus===200?Response.json(state.latest):new Response('latest unavailable',{status:state.latestStatus});
    if(parsed.pathname===`/repos/avelikiy/great_cto/releases/tags/v${version}`)return state.release?Response.json(state.release):new Response('absent',{status:404});
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases'&&method==='POST'){
      const body=JSON.parse(opts.body);assert.equal(body.draft,true);assert.equal(body.target_commitish,commit);assert.equal(body.prerelease,false);
      state.release={...body,id:77,author:{login:'avelikiy'}};return Response.json(state.release,{status:201});
    }
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/77/assets'&&method==='POST'){
      assert.equal(parsed.hostname,'uploads.github.com');const name=parsed.searchParams.get('name');
      if(name===state.failUploadAt)return new Response('failure',{status:500});
      assert.equal([...state.assets.values()].some(a=>a.name===name),false);
      return Response.json(record(add(name,Buffer.from(opts.body))),{status:201});
    }
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/77/assets')return Response.json([...state.assets.values()].map(record));
    const match=parsed.pathname.match(/^\/repos\/avelikiy\/great_cto\/releases\/assets\/(\d+)$/);
    if(match){const id=Number(match[1]);if(state.redirect)return new Response(null,{status:302,headers:{location:state.redirect==='allowed'?`https://release-assets.githubusercontent.com/${id}`:state.redirect}});state.downloads.add(id);return new Response(state.assets.get(id).bytes);}
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/77'&&method==='PATCH'){
      const body=JSON.parse(opts.body);assert.equal(body.draft,false);assert.equal(body.make_latest,state.expectedLatest);assert.equal(state.assets.size,10);assert.equal(state.downloads.size,10);
      state.release={...state.release,...body};return Response.json(state.release);
    }
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/77')return Response.json(state.release);
    throw Error('unexpected fixture request '+method+' '+url);
  };
  return{state,fetchFn,add};
}
const mutations=s=>s.calls.filter(x=>!['GET','HEAD'].includes(x.method));

test('unapproved or unsigned input refuses with zero network requests',async t=>{
  const f=fixture(t);let calls=0;const fetchFn=async()=>{calls++;throw Error('unexpected');};
  await assert.rejects(publishLocalGitHubRelease({...f.options,approval:undefined},{run:f.run,fetchFn}));
  fs.appendFileSync(path.join(f.directory,'sbom.cdx.json'),'changed');
  await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn}));assert.equal(calls,0);
});
test('draft creation uploads exact ten assets, reads every byte, then publishes last',async t=>{
  const f=fixture(t),s=server(f);const result=await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});
  assert.equal(result.authority,'NONE');assert.equal(result.evidence,'SYNTHETIC_ONLY');assert.equal(result.published,false);
  assert.equal(s.state.release.draft,false);assert.equal(s.state.assets.size,10);
  assert.equal(mutations(s.state).at(-1).method,'PATCH');assert.equal(mutations(s.state).filter(x=>x.method==='POST').length,11);
  for(const asset of s.state.assets.values())assert.deepEqual(asset.bytes,f.files.get(asset.name));
});
test('complete existing public release is read-only and idempotent',async t=>{
  const f=fixture(t),s=server(f,{existing:true,publicRelease:true});for(const[name,bytes]of f.files)s.add(name,bytes);
  await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});assert.equal(mutations(s.state).length,0);assert.equal(s.state.downloads.size,10);
});
test('resume own partial draft uploads only missing assets without replacement',async t=>{
  const f=fixture(t),s=server(f,{existing:true});for(const[name,bytes]of [...f.files].slice(0,3))s.add(name,bytes);
  await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});assert.equal(mutations(s.state).filter(x=>x.method==='POST').length,7);assert.equal(s.state.release.draft,false);
});
test('wrong token owner, source identity and registry failures never mutate GitHub',async t=>{
  for(const attack of ['owner','permission','source','registry404','registrybytes']){
    const f=fixture(t),s=server(f);if(attack==='owner')s.state.login='other';if(attack==='permission')s.state.push=false;if(attack==='registry404')s.state.registryStatus=404;if(attack==='registrybytes')s.state.registryTamper=true;
    const run=attack==='source'?()=>{throw Error('wrong source');}:f.run;
    await assert.rejects(publishLocalGitHubRelease(f.options,{run,fetchFn:s.fetchFn}));assert.equal(mutations(s.state).length,0);
  }
});
test('unexpected, duplicate, changed or incomplete public assets refuse without mutation',async t=>{
  for(const attack of ['unexpected','duplicate','changed','readback','missing','wrongtarget']){
    const f=fixture(t),s=server(f,{existing:true,publicRelease:true});for(const[name,bytes]of f.files)s.add(name,bytes);
    if(attack==='unexpected')s.add('extra.txt',Buffer.from('extra'));
    if(attack==='duplicate'){const[name,bytes]=[...f.files][0];s.add(name,bytes);}
    if(attack==='changed'){const asset=[...s.state.assets.values()][0];asset.bytes=Buffer.alloc(asset.bytes.length);asset.digest='sha256:'+digest(asset.bytes);}
    if(attack==='readback'){const asset=[...s.state.assets.values()][0];asset.bytes=Buffer.alloc(asset.bytes.length);}
    if(attack==='missing')s.state.assets.delete([...s.state.assets.keys()][0]);
    if(attack==='wrongtarget')s.state.release.target_commitish='main';
    await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}));assert.equal(mutations(s.state).length,0);
  }
});
test('upload failure retains a private partial draft and never publishes it',async t=>{
  const f=fixture(t),s=server(f);s.state.failUploadAt=[...f.files.keys()][4];
  await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}));assert.equal(s.state.release.draft,true);assert.ok(s.state.assets.size>0);assert.equal(mutations(s.state).some(x=>x.method==='PATCH'),false);
  s.state.failUploadAt=null;await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});assert.equal(s.state.release.draft,false);
});
test('asset redirects are bounded and never forward GitHub token outside API hosts',async t=>{
  for(const redirect of ['allowed','https://evil.invalid/steal','https://api.github.com.evil.invalid/steal','http://release-assets.githubusercontent.com/1']){
    const f=fixture(t),s=server(f,{existing:true,publicRelease:true});for(const[name,bytes]of f.files)s.add(name,bytes);s.state.redirect=redirect;
    if(redirect==='allowed')await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});else await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}));
    assert.equal(mutations(s.state).length,0);assert.equal(s.state.calls.some(x=>new URL(x.url).hostname==='evil.invalid'),false);
  }
});
test('token file is explicit, canonical, owner-only, outside candidate and never echoed on errors',async t=>{
  for(const attack of ['ambient','permissions','symlink','hardlink','candidate','multiline']){
    const f=fixture(t),s=server(f);if(attack==='ambient')f.options.githubTokenFile=undefined;
    if(attack==='permissions')fs.chmodSync(f.options.githubTokenFile,0o644);
    if(attack==='symlink'){const link=path.join(f.root,'token-link');fs.symlinkSync(f.options.githubTokenFile,link);f.options.githubTokenFile=link;}
    if(attack==='hardlink')fs.linkSync(f.options.githubTokenFile,path.join(f.root,'token-link'));
    if(attack==='candidate')f.options.githubTokenFile=path.join(f.directory,'release-index.json');
    if(attack==='multiline')fs.writeFileSync(f.options.githubTokenFile,'test-only-github-token\nsecondline\n');
    await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}),error=>{assert.equal(error.message.includes('test-only-github-token'),false);return true;});assert.equal(s.state.calls.length,0);
  }
});

test('changed proof, unknown staged member and wrong approved index refuse before any HTTP',async t=>{
  for(const attack of ['proof','member','index']){
    const f=fixture(t),s=server(f);
    if(attack==='proof')fs.writeFileSync(path.join(f.directory,'release-index.json.signature.json'),'{}');
    if(attack==='member')fs.writeFileSync(path.join(f.directory,'extra.txt'),'unexpected',{mode:0o600});
    if(attack==='index')f.options.approveIndexDigest='0'.repeat(64);
    await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}));assert.equal(s.state.calls.length,0);
  }
});

test('failed asset raw readback preserves a private draft without final PATCH',async t=>{
  const f=fixture(t),s=server(f);
  const fetchFn=async(url,opts)=>{
    const response=await s.fetchFn(url,opts);
    if(new URL(url).pathname.includes('/releases/assets/'))return new Response(Buffer.from('wrong server bytes'));
    return response;
  };
  await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn}));
  assert.equal(s.state.release.draft,true);assert.equal(mutations(s.state).some(x=>x.method==='PATCH'),false);
});

test('transport errors and redirect loops never disclose the token or publish a draft',async t=>{
  for(const attack of ['transport','loop']){
    const f=fixture(t),s=server(f,{existing:true});for(const[name,bytes]of f.files)s.add(name,bytes);
    const fetchFn=async(url,opts)=>{
      if(attack==='transport'&&new URL(url).pathname==='/user')throw Error('Bearer test-only-github-token');
      if(attack==='loop'&&new URL(url).hostname==='release-assets.githubusercontent.com')return new Response(null,{status:302,headers:{location:url}});
      return s.fetchFn(url,opts);
    };
    if(attack==='loop')s.state.redirect='allowed';
    await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn}),error=>{assert.equal(error.message.includes('test-only-github-token'),false);return true;});
    assert.equal(s.state.release.draft,true);assert.equal(mutations(s.state).length,0);
  }
});

test('mixed production and test I/O adapters are refused before any Git or HTTP call',async t=>{
  const f=fixture(t);let calls=0;
  await assert.rejects(publishLocalGitHubRelease(f.options,{fetchFn:async()=>{calls++;throw Error('unexpected');}}),/both Git and HTTP/);
  await assert.rejects(publishLocalGitHubRelease(f.options,{run:()=>{calls++;throw Error('unexpected');}}),/both Git and HTTP/);
  assert.equal(calls,0);
});

test('publishing an older maintenance version never downgrades the latest release pointer',async t=>{
  const f=fixture(t),s=server(f);s.state.latestStatus=200;s.state.latest={tag_name:'v9.0.0',draft:false,prerelease:false};s.state.expectedLatest='false';
  await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});
  const patch=mutations(s.state).find(x=>x.method==='PATCH');assert.equal(JSON.parse(patch.body).make_latest,'false');
  assert.equal(new URL(s.state.calls[s.state.calls.indexOf(patch)-1].url).pathname,'/repos/avelikiy/great_cto/releases/latest');
});

test('unknown or malformed latest release refuses before making the draft public',async t=>{
  for(const attack of ['unavailable','unstable']){
    const f=fixture(t),s=server(f);s.state.latestStatus=attack==='unavailable'?503:200;s.state.latest={tag_name:'v9.0.0-rc.1',draft:false,prerelease:false};
    await assert.rejects(publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn}),/latest|GitHub/);
    assert.equal(s.state.release.draft,true);assert.equal(mutations(s.state).some(x=>x.method==='PATCH'),false);
  }
});

test('latest comparison uses numeric semver and permits equal or newer versions',async t=>{
  for(const[tag_name,expectedLatest]of [['v1.10.0','false'],['v1.2.2','true'],['v1.2.3','true']]){
    const f=fixture(t),s=server(f);Object.assign(s.state,{latestStatus:200,latest:{tag_name,draft:false,prerelease:false},expectedLatest});
    await publishLocalGitHubRelease(f.options,{run:f.run,fetchFn:s.fetchFn});
    assert.equal(JSON.parse(mutations(s.state).find(x=>x.method==='PATCH').body).make_latest,expectedLatest);
  }
});
