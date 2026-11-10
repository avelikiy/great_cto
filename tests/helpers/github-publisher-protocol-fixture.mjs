// Isolated synthetic protocol fixture; duplicated from the frozen publisher suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { encodeReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
import { makeReleaseIndex } from '../../scripts/build-release-artifacts.mjs';
import { signLocalReleaseArtifacts } from '../../scripts/sign-local-release-artifacts.mjs';

const version = '1.2.3', commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const digest = (bytes, algorithm='sha256') => createHash(algorithm).update(bytes).digest('hex');
export function fixture(t) {
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
export function server(f,{existing=false,publicRelease=false}={}){
  const state={release:existing?{id:77,tag_name:`v${version}`,target_commitish:commit,draft:!publicRelease,prerelease:false,author:{login:'avelikiy'}}:null,assets:new Map(),calls:[],downloads:new Set(),login:'avelikiy',push:true,registryStatus:200,registryTamper:false,failUploadAt:null,redirect:null,latest:null,latestStatus:404,expectedLatest:'true',hideByTag:false,forbidCreation:false};
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
    if(parsed.pathname===`/repos/avelikiy/great_cto/releases/tags/v${version}`)return state.release&&!state.hideByTag?Response.json(state.release):new Response('absent',{status:404});
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases'&&method==='POST'){
      assert.equal(state.forbidCreation,false,'explicit resume must never create a release');const body=JSON.parse(opts.body);assert.equal(body.draft,true);assert.equal(body.target_commitish,commit);assert.equal(body.prerelease,false);
      state.release={...body,id:77,author:{login:'avelikiy'}};return Response.json(state.release,{status:201});
    }
    if(parsed.pathname==='/repos/avelikiy/great_cto/releases/77/assets'&&method==='POST'){
      assert.equal(parsed.hostname,'uploads.github.com');if(headers.get('accept')!=='application/vnd.github+json')return Response.json({message:'unsupported upload response media type'},{status:415});assert.equal(headers.get('content-type'),'application/octet-stream');assert.ok(Buffer.isBuffer(opts.body));const name=parsed.searchParams.get('name');
      assert.deepEqual(opts.body,f.files.get(name),'upload body must preserve admitted bytes');if(name===state.failUploadAt)return new Response('failure',{status:500});
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
export const mutations=s=>s.calls.filter(x=>!['GET','HEAD'].includes(x.method));

