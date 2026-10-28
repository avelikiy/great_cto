import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { encodeReleaseArchive, inspectReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
import { isPluginRuntimePath, makeReleaseIndex, buildReleaseArtifacts } from '../../scripts/build-release-artifacts.mjs';
import { signReleaseArtifacts, assertSigningContext } from '../../scripts/sign-release-artifacts.mjs';

const sha = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const version = '1.2.3';
const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const files = {
  'great-cto-1.2.3.tgz': Buffer.from('synthetic npm archive'),
  'great-cto-plugin-1.2.3.tgz': Buffer.from('synthetic plugin archive'),
  'plugin-inventory.json': Buffer.from('{"schema":1,"version":"1.2.3","files":[]}\n'),
  'sbom.cdx.json': Buffer.from('{"bomFormat":"CycloneDX"}\n'),
};
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-publisher-test-')));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function indexed(t) {
  const directory = fixture(t);
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), bytes, {mode:0o600});
  const index = makeReleaseIndex({ version, commit, tree, directory });
  fs.writeFileSync(path.join(directory, 'release-index.json'), JSON.stringify(index) + '\n', {mode:0o600});
  return {directory,index};
}
function rootPolicy(t) { const file=path.join(fixture(t),'trusted-root.json');fs.writeFileSync(file,fs.readFileSync(new URL('../../shared/release-trust-root.json',import.meta.url)),{mode:0o600});return {trustedRootPath:file,trustedRootSha256:sha('sha256',fs.readFileSync(file))}; }
const env = {
  GITHUB_ACTIONS:'true', GITHUB_EVENT_NAME:'push', GITHUB_REF:'refs/tags/v1.2.3', GITHUB_SHA:commit,
  GITHUB_REPOSITORY:'avelikiy/great_cto', GITHUB_WORKFLOW_REF:'avelikiy/great_cto/.github/workflows/publish.yml@refs/tags/v1.2.3',
};

test('runtime allowlist excludes service state and admits required public roots', () => {
  for(const name of ['LICENSE','.claude-plugin/plugin.json','.claude-plugin/marketplace.json','.codex-plugin/plugin.json','.codex-plugin/mcp.json','.agents/plugins/marketplace.json','agents/architect.md','shared/agent-fragments/task-brief.md','commands/start.md','skills/codex-host/SKILL.md','shared/pipeline.toml','scripts/codex-pipeline.mjs','scripts/hooks/guard.mjs','mcp-servers/llm-router/server.py','packages/board/server.mjs','packages/board/public/index.html','packages/cli/index.mjs','packages/cli/package.json']) assert.equal(isPluginRuntimePath(name),true,name);
  for(const name of ['docs/report.md','tests/case.test.mjs','AGENTS.md','CLAUDE.md','.github/workflows/publish.yml','.git/config','.great_cto/state.json','.beads/state.json','.codex/config.toml','.claude/settings.json','.env','scripts/.env.local','skills/private-overlay/context.md','scripts/probe.test.mjs','packages/board/test.test.mjs','packages/cli/src/main.ts','packages/cli/dist/main.js','packages/cli/node_modules/pkg/index.js','scripts/key.pem','scripts/output.log','scripts/archive.tgz','../scripts/code.mjs','scripts\\code.mjs']) assert.equal(isPluginRuntimePath(name),false,name);
});

test('index binds four exact immutable artifact names and hashes without self-reference', t => {
  const {index}=indexed(t);
  assert.deepEqual(Object.keys(index).sort(),['artifacts','package','publisher','schema','source','version']);
  assert.deepEqual(index.source,{repository:'avelikiy/great_cto',commit,tree,tag:'v1.2.3'});
  assert.deepEqual(index.publisher,{workflow:'.github/workflows/publish.yml'});
  assert.deepEqual(index.artifacts.map(x=>x.kind),['npm','plugin','inventory','sbom']);
  for(const a of index.artifacts){assert.equal(a.size,files[a.filename].length);assert.equal(a.sha256,sha('sha256',files[a.filename]));assert.equal(a.sha512,sha('sha512',files[a.filename]));}
  assert.equal(JSON.stringify(index).includes('release-index.json'),false);
});

test('index refuses invalid versions, source identities, missing files and non-regular blobs', t => {
  const {directory}=indexed(t);
  for(const v of ['latest','1.2.3-rc.1','../1.2.3','01.2.3']) assert.throws(()=>makeReleaseIndex({version:v,commit,tree,directory}));
  assert.throws(()=>makeReleaseIndex({version,commit:'bad',tree,directory}));
  fs.rmSync(path.join(directory,'sbom.cdx.json'));
  assert.throws(()=>makeReleaseIndex({version,commit,tree,directory}));
  fs.symlinkSync(path.join(directory,'plugin-inventory.json'),path.join(directory,'sbom.cdx.json'));
  assert.throws(()=>makeReleaseIndex({version,commit,tree,directory}),/regular|link/);
});

test('signing context rejects branches, dispatch, wrong repository or workflow SHA', () => {
  assertSigningContext({env,version,commit});
  for(const bad of [{GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REPOSITORY:'other/project'},{GITHUB_SHA:'c'.repeat(40)},{GITHUB_WORKFLOW_REF:'avelikiy/great_cto/.github/workflows/other.yml@refs/tags/v1.2.3'}]) assert.throws(()=>assertSigningContext({env:{...env,...bad},version,commit}));
});

test('sign and immediate verify use fixed issuer, exact identity and source claims for every blob', t => {
  const {directory,index}=indexed(t),calls=[];
  const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'synthetic verifier executable',{mode:0o700});
  const run=(bin,args,opts)=>{
    calls.push({bin,args,opts});
    if(args[0]==='version') return JSON.stringify({gitVersion:'v3.1.4'});
    if(args[0]==='sign-blob'){const i=args.indexOf('--bundle');fs.writeFileSync(args[i+1],'synthetic signature bundle',{mode:0o600});}
    return '';
  };
  const r=signReleaseArtifacts({directory,version,cosignPath:cosign,...rootPolicy(t),env,run});
  assert.equal(r.state,'SIGNED_AND_VERIFIED');assert.equal(r.published,false);assert.equal(r.installed,false);
  assert.equal(calls.filter(c=>c.args[0]==='sign-blob').length,5);assert.equal(calls.filter(c=>c.args[0]==='verify-blob').length,5);
  for(const c of calls.filter(c=>c.args[0]==='verify-blob')){
    assert.equal(c.args[c.args.indexOf('--certificate-identity')+1],'https://github.com/avelikiy/great_cto/.github/workflows/publish.yml@refs/tags/v1.2.3');
    assert.equal(c.args[c.args.indexOf('--certificate-oidc-issuer')+1],'https://token.actions.githubusercontent.com');
    assert.equal(c.args[c.args.indexOf('--certificate-github-workflow-sha')+1],index.source.commit);
    assert.equal(c.args[c.args.indexOf('--certificate-github-workflow-ref')+1],env.GITHUB_REF);
    assert.equal(c.args.some(a=>a.includes('ignore-tlog')||a.includes('ignore-sct')||a.includes('regexp')),false);
  }
});

test('signing refuses changed indexed bytes before invoking signer and never overwrites bundles', t => {
  const {directory}=indexed(t);let calls=0;const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'fake',{mode:0o700});
  fs.appendFileSync(path.join(directory,'sbom.cdx.json'),'changed');
  assert.throws(()=>signReleaseArtifacts({directory,version,cosignPath:cosign,...rootPolicy(t),env,run:()=>{calls++;return '';}}),/digest|size/);assert.equal(calls,0);
  const second=indexed(t);fs.writeFileSync(path.join(second.directory,'release-index.json.sigstore.json'),'preexisting',{mode:0o600});
  assert.throws(()=>signReleaseArtifacts({directory:second.directory,version,cosignPath:cosign,...rootPolicy(t),env,run:()=>{calls++;return '';}}),/existing|overwrite|member/);assert.equal(calls,0);
});

test('signer failure stops before verification and never implies publication', t => {
  const {directory}=indexed(t);const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'fake',{mode:0o700});let verifies=0;
  assert.throws(()=>signReleaseArtifacts({directory,version,cosignPath:cosign,...rootPolicy(t),env,run:(bin,args)=>{if(args[0]==='version')return '{"gitVersion":"v3.1.4"}';if(args[0]==='verify-blob')verifies++;throw Error('signer unavailable');}}),/signer unavailable/);assert.equal(verifies,0);
});

test('tag workflow is sign-only and every JSR path fails closed', () => {
  const publish=fs.readFileSync(new URL('../../.github/workflows/publish.yml',import.meta.url),'utf8');
  const jsr=fs.readFileSync(new URL('../../.github/workflows/jsr-publish.yml',import.meta.url),'utf8');
  assert.match(publish,/SIGN_ONLY/);assert.match(publish,/sign-release-artifacts\.mjs/);
  const tagJobs=publish.split('\n  publish_guard:')[0];
  assert.doesNotMatch(tagJobs,/merge-base|assertPublicationSource/);
  assert.equal((publish.match(/assertPublicationSource\(\{/g)||[]).length,2);
  assert.doesNotMatch(tagJobs,/npm publish|gh release (?:create|upload)|secrets\.NPM_TOKEN|NODE_AUTH_TOKEN/);
  assert.match(publish,/if: github\.event_name == 'workflow_dispatch' && inputs\.operation == 'publish-verified'/);
  assert.match(publish,/needs: publish_guard/);
  assert.match(publish,/name: great-cto-publish/);
  assert.match(publish,/validatePreparedRun/);
  assert.match(publish,/assertPublishProtection/);
  assert.match(publish,/--verify-only/);
  assert.match(publish,/\['publish',file,'--provenance','--access','public','--ignore-scripts'/);
  assert.doesNotMatch(publish,/secrets\.NPM_TOKEN|--clobber/);
  assert.doesNotMatch(jsr,/npx jsr publish|npm publish|id-token: write|tags:\s*\n\s*- 'v\*'/);
  assert.match(jsr,/not implemented|blocked|BLOCKED/i);
});

function buildFixture(t,{packExtra=[],packVersion=version,sourceDependency=false,packedMain='export {};',trackedDist=false}={}) {
  const base=fixture(t),source=path.join(base,'source'),directory=path.join(base,'release');fs.mkdirSync(source);
  const contents={
    '.gitignore':'packages/cli/dist/\n',
    'LICENSE':'MIT synthetic fixture license',
    '.claude-plugin/plugin.json':JSON.stringify({name:'great-cto',version,agents:['./agents-full/architect.md','./agents-full/senior-dev.md'],types:'./types/index.d.ts',mcpServers:{router:{command:'python3',args:['${CLAUDE_PLUGIN_ROOT}/mcp-servers/llm-router/server.py']}}}),
    '.claude-plugin/marketplace.json':'{}',
    '.codex-plugin/plugin.json':JSON.stringify({name:'great-cto',version,skills:'./skills/',mcpServers:'./.codex-plugin/mcp.json',hooks:'./.codex-plugin/hooks.json',interface:{composerIcon:'./assets/icon.svg'}}),
    '.codex-plugin/mcp.json':'{}', '.codex-plugin/hooks.json':'{}',
    '.agents/plugins/marketplace.json':'{}',
    'skills/great_cto/SKILL.md':'public runtime skill', 'agents/architect.md':'public role',
    'agents-full/architect.md':'full public architecture contract',
    'agents-full/senior-dev.md':'full public implementation contract',
    'types/index.d.ts':'export type State = {};',
    'hooks/hooks.json':JSON.stringify({modules:['./gates-pane.tsx']}),
    'hooks/gates-pane.tsx':'export {};',
    'commands/start.md':'public command', 'scripts/runtime.mjs':'export {};',
    'shared/pipeline.toml':'# runtime', 'assets/icon.svg':'<svg/>',
    'packages/board/server.mjs':'export {};',
    'mcp-servers/llm-router/server.py':'# public local MCP runtime',
    'mcp-servers/llm-router/tests/private.test.py':'not runtime',
    'packages/cli/index.mjs':'#!/usr/bin/env node\n',
    'packages/cli/src/main.ts':'export {};',
    'packages/cli/src/state-home.mjs':'export const stateHome = () => null;',
    'packages/cli/src/private-state.mjs':'export const readPrivateState = () => null;',
    'packages/board/lib/config.mjs':"import {stateHome} from '../../cli/src/state-home.mjs';",
    'packages/board/push-adapter.mjs':"import {readPrivateState} from '../cli/src/private-state.mjs';",
    'scripts/build-release-artifacts.mjs':"import '../packages/cli/src/release-archive.mjs';",
    'scripts/sign-release-artifacts.mjs':'export {};',
    'scripts/judge-calibrate.mjs':"import '../tests/eval/runner.mjs';",
    'scripts/lib/prompt-size.mjs':"import '../../tests/eval/runner.mjs';",
    'packages/cli/scripts/bundle-board.mjs':'// trusted build fixture',
    'packages/cli/package.json':JSON.stringify({name:'great-cto',version,...(sourceDependency?{dependencies:{unadmitted:'1.0.0'}}:{})}),
    'docs/private-report.md':'not a runtime artifact',
    'tests/runtime.test.mjs':'not a runtime artifact',
    'skills/private-overlay/customer.md':'not a runtime artifact',
  };
  for(const [name,value] of Object.entries(contents)){const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
  if(trackedDist)for(const name of ['bootstrap.js','installer.js','llm-fallback.js','settings.js','ui.js']){const file=path.join(source,'packages/cli/dist',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export const legacy = true;');}
  fs.chmodSync(path.join(source,'packages/cli/index.mjs'),0o755);
  const git=args=>execFileSync('git',['-c','commit.gpgsign=false','-C',source,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init','--quiet']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','.']);if(trackedDist)git(['add','--force','packages/cli/dist']);git(['commit','--quiet','-m','synthetic fixture']);
  const calls=[];let packs=0;
  const run=(bin,args,opts)=>{
    calls.push({bin,args});
    if(bin==='git')return execFileSync(bin,args,opts);
    if(bin==='npm'&&args[0]==='run'){
      if(trackedDist)assert.equal(fs.existsSync(path.join(source,'packages/cli/dist/bootstrap.js')),false,'verified tracked legacy output removed before compiler');
      fs.mkdirSync(path.join(source,'packages/cli/dist'),{recursive:true});
      for(const name of ['main.js','archetypes.js','release-trust.mjs'])fs.writeFileSync(path.join(source,'packages/cli/dist',name),'export {};');
      return '';
    }
    if(bin===process.execPath)return '';
    if(bin==='npm'&&args[0]==='pack'){
      packs++;const manifest=Buffer.from(JSON.stringify({name:'great-cto',version:packVersion}));
      const bytes=encodeReleaseArchive([{path:'package.json',bytes:manifest,mode:0o644},{path:'index.mjs',bytes:Buffer.from(''),mode:0o755},{path:'dist/main.js',bytes:Buffer.from(packedMain),mode:0o644},{path:'dist/archetypes.js',bytes:Buffer.from('export {};'),mode:0o644},{path:'dist/release-trust.mjs',bytes:Buffer.from('export {};'),mode:0o644},{path:'board/packages/board/server.mjs',bytes:Buffer.from('export {};'),mode:0o644},...packExtra]);
      fs.writeFileSync(path.join(directory,`great-cto-${version}.tgz`),bytes);
      return JSON.stringify([{filename:`great-cto-${version}.tgz`,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')}]);
    }
    throw Error('unexpected fixture command');
  };
  return{source,directory,run,calls,git,get packs(){return packs;}};
}

test('builder packs npm once and includes complete same-build dist with exact inventory', async t => {
  const f=buildFixture(t);const result=await buildReleaseArtifacts(f);
  assert.equal(result.state,'PREPARED');assert.equal(result.published,false);assert.equal(result.signed,false);assert.equal(f.packs,1);
  const inventory=JSON.parse(fs.readFileSync(path.join(f.directory,'plugin-inventory.json')));
  const entries=inspectReleaseArchive(fs.readFileSync(path.join(f.directory,`great-cto-plugin-${version}.tgz`)),{prefix:'plugin'});
  assert.deepEqual(inventory.files,entries.map(x=>({path:x.path,size:x.bytes.length,sha256:sha('sha256',x.bytes),mode:x.mode})));
  assert(entries.some(x=>x.path==='packages/cli/dist/release-trust.mjs'));
  assert(entries.some(x=>x.path==='mcp-servers/llm-router/server.py'));
  assert.equal(entries.some(x=>x.path.includes('/tests/')),false);
  assert.equal(entries.some(x=>/docs\/|tests\/|private-overlay/.test(x.path)),false);
  assert.equal(entries.find(x=>x.path==='packages/cli/index.mjs').mode,0o755);
  const sbom=JSON.parse(fs.readFileSync(path.join(f.directory,'sbom.cdx.json')));assert.equal(sbom.bomFormat,'CycloneDX');assert.match(sbom.metadata.properties[0].value,/production.*development.*excluded/);
  const index=JSON.parse(fs.readFileSync(path.join(f.directory,'release-index.json')));assert.equal(index.source.commit,f.git(['rev-parse','HEAD']).trim());
  for(const a of index.artifacts)assert.equal(a.sha256,sha('sha256',fs.readFileSync(path.join(f.directory,a.filename))));
  assert.equal(JSON.stringify(index).includes(f.source),false);
  assert.equal(f.calls.find(c=>c.bin==='npm'&&c.args[0]==='pack').args.includes('--ignore-scripts'),true);
});

test('builder refuses unsafe source/output state before packing', async t => {
  const f=buildFixture(t);fs.writeFileSync(path.join(f.source,'untracked.txt'),'unreviewed');
  await assert.rejects(buildReleaseArtifacts(f),/clean/);assert.equal(f.packs,0);
  const second=buildFixture(t);await assert.rejects(buildReleaseArtifacts({...second,directory:path.join(second.source,'output')}),/outside/);assert.equal(second.packs,0);
  const third=buildFixture(t,{sourceDependency:true});await assert.rejects(buildReleaseArtifacts(third),/dependency/);assert.equal(third.packs,0);
});

test('builder refuses link substitution and source/package identity mismatch', async t => {
  const f=buildFixture(t);fs.rmSync(path.join(f.source,'scripts/runtime.mjs'));fs.symlinkSync(path.join(f.source,'agents/architect.md'),path.join(f.source,'scripts/runtime.mjs'));f.git(['add','.']);f.git(['commit','--quiet','-m','synthetic symlink']);
  await assert.rejects(buildReleaseArtifacts(f),/special|invalid|symlink/);assert.equal(f.packs,0);
  const second=buildFixture(t,{packVersion:'1.2.4'});await assert.rejects(buildReleaseArtifacts(second),/identity/);assert.equal(second.packs,1);
});

test('builder refuses package service files even when a packer includes them', async t => {
  const f=buildFixture(t,{packExtra:[{path:'tests/internal.mjs',bytes:Buffer.from('not public runtime'),mode:0o644}]});
  await assert.rejects(buildReleaseArtifacts(f),/unapproved/);assert.equal(f.packs,1);
});

test('protected resume requires exact successful push run and a single immutable signed artifact', async () => {
  const { validatePreparedRun }=await import('../../scripts/sign-release-artifacts.mjs');
  const run={id:123,event:'push',path:'.github/workflows/publish.yml',head_sha:commit,status:'completed',conclusion:'success',repository:{full_name:'avelikiy/great_cto'},head_repository:{full_name:'avelikiy/great_cto'}};
  const artifacts=[{id:456,name:`release-signed-${commit}`,expired:false,size_in_bytes:12345,workflow_run:{id:123}}];
  assert.equal(validatePreparedRun({run,artifacts,commit,runId:'123'}),456);
  for(const delta of [{event:'pull_request'},{head_sha:'d'.repeat(40)},{path:'.github/workflows/other.yml'},{conclusion:'failure'},{repository:{full_name:'other/project'}}])assert.throws(()=>validatePreparedRun({run:{...run,...delta},artifacts,commit,runId:'123'}));
  assert.throws(()=>validatePreparedRun({run,artifacts:[...artifacts,...artifacts],commit,runId:'123'}));
  assert.throws(()=>validatePreparedRun({run,artifacts:[{...artifacts[0],expired:true}],commit,runId:'123'}));
});

test('publication environment must already require the named repository owner review', async () => {
  const { assertPublishProtection }=await import('../../scripts/sign-release-artifacts.mjs');
  assertPublishProtection({protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'avelikiy'}}]}]});
  for(const value of [{},{protection_rules:[]},{protection_rules:[{type:'wait_timer'}]},{protection_rules:[{type:'required_reviewers',reviewers:[{type:'User',reviewer:{login:'other'}}]}]}])assert.throws(()=>assertPublishProtection(value));
});

test('verification-only resume never signs and still pins the original push certificate', async t => {
  const {verifyReleaseArtifacts}=await import('../../scripts/sign-release-artifacts.mjs');
  const {directory}=indexed(t);const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'fake',{mode:0o700});
  for(const name of [...Object.keys(files),'release-index.json'])fs.writeFileSync(path.join(directory,name+'.sigstore.json'),'synthetic signed fixture',{mode:0o600});
  const calls=[];const run=(bin,args)=>{calls.push(args);return args[0]==='version'?'{"gitVersion":"v3.1.4"}':'';};
  const r=verifyReleaseArtifacts({directory,version,cosignPath:cosign,...rootPolicy(t),env:{...env,GITHUB_EVENT_NAME:'workflow_dispatch'},run});
  assert.equal(r.state,'VERIFIED');assert.equal(r.authority,'NONE');assert.equal(calls.some(x=>x[0]==='sign-blob'),false);
  assert.equal(calls.filter(x=>x[0]==='verify-blob').length,5);
  assert(calls.filter(x=>x[0]==='verify-blob').every(x=>x[x.indexOf('--certificate-github-workflow-trigger')+1]==='push'));
});


test('independent artifact comparison checks exact packed bytes rather than version text', async t => {
  const {compareReleaseArtifactSets}=await import('../../scripts/build-release-artifacts.mjs');
  const a=indexed(t),b=indexed(t);assert.equal(compareReleaseArtifactSets(a.directory,b.directory).state,'BYTE_IDENTICAL');
  fs.appendFileSync(path.join(b.directory,'sbom.cdx.json'),'changed');assert.throws(()=>compareReleaseArtifactSets(a.directory,b.directory),/bind|differ/);
});


test('builder rejects preexisting ignored dist and packed dist that differs from the new build', async t => {
  const stale=buildFixture(t);fs.mkdirSync(path.join(stale.source,'packages/cli/dist'));fs.writeFileSync(path.join(stale.source,'packages/cli/dist/old.js'),'old code');
  await assert.rejects(buildReleaseArtifacts(stale),/preexisting.*dist/);assert.equal(stale.packs,0);
  const changed=buildFixture(t,{packedMain:'export const stale = true;'});
  await assert.rejects(buildReleaseArtifacts(changed),/compiled.*differ/);assert.equal(changed.packs,1);
});


test('signing sanitizes trust overrides and rejects wrong versions or failed verification', t => {
  const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'fake',{mode:0o700});
  const a=indexed(t);let versionCalls=0;
  assert.throws(()=>signReleaseArtifacts({...a,version,cosignPath:cosign,...rootPolicy(t),env,run:()=>{versionCalls++;return '{"gitVersion":"v3.0.0"}';}}),/3.1.4/);assert.equal(versionCalls,1);
  const b=indexed(t);let signed=0,verified=0;
  assert.throws(()=>signReleaseArtifacts({...b,version,cosignPath:cosign,...rootPolicy(t),env:{...env,COSIGN_YES:'true',SIGSTORE_ROOT_FILE:'untrusted',REKOR_URL:'untrusted',TUF_ROOT:'untrusted'},run:(bin,args,opts)=>{
    for(const key of ['COSIGN_YES','SIGSTORE_ROOT_FILE','REKOR_URL','TUF_ROOT'])assert.equal(key in opts.env,false);
    if(args[0]==='version')return '{"gitVersion":"v3.1.4"}';
    if(args[0]==='sign-blob'){signed++;fs.writeFileSync(args[args.indexOf('--bundle')+1],'synthetic bundle',{mode:0o600});return '';}
    verified++;throw Error('signature verification failed');
  }}),/signature verification failed/);assert.equal(signed,1);assert.equal(verified,1);
});


test('builder supports clean tracked legacy dist only with explicit private-checkout authority', async t => {
  const denied=buildFixture(t,{trackedDist:true});
  await assert.rejects(buildReleaseArtifacts(denied),/fresh.checkout/);
  assert.equal(fs.readFileSync(path.join(denied.source,'packages/cli/dist/bootstrap.js'),'utf8'),'export const legacy = true;');
  const f=buildFixture(t,{trackedDist:true});
  const result=await buildReleaseArtifacts({...f,freshCheckout:true});assert.equal(result.state,'PREPARED');assert.equal(f.packs,1);
  const entries=inspectReleaseArchive(fs.readFileSync(path.join(f.directory,`great-cto-plugin-${version}.tgz`)),{prefix:'plugin'});
  assert.equal(entries.some(x=>x.path==='packages/cli/dist/bootstrap.js'),false);
  const extra=buildFixture(t,{trackedDist:true});fs.writeFileSync(path.join(extra.source,'packages/cli/dist/untracked.js'),'ignored stale');
  await assert.rejects(buildReleaseArtifacts({...extra,freshCheckout:true}),/preexisting.*dist/);assert.equal(extra.packs,0);
  assert.equal(fs.existsSync(path.join(extra.source,'packages/cli/dist/bootstrap.js')),true,'refusal must precede any cleanup');
});

test('publisher refuses approved index/archive/bundle limits before invoking crypto', async t => {
  const cosign=path.join(fixture(t),'cosign');fs.writeFileSync(cosign,'fake',{mode:0o700});let calls=0;
  const run=()=>{calls++;return '{"gitVersion":"v3.1.4"}';};
  const oversizedIndex=indexed(t);fs.truncateSync(path.join(oversizedIndex.directory,'release-index.json'),256*1024+1);
  assert.throws(()=>signReleaseArtifacts({...oversizedIndex,version,cosignPath:cosign,...rootPolicy(t),env,run}),/bounded/);
  const oversizedArchive=indexed(t);oversizedArchive.index.artifacts[0].size=128*1024*1024+1;fs.writeFileSync(path.join(oversizedArchive.directory,'release-index.json'),JSON.stringify(oversizedArchive.index)+'\n');
  assert.throws(()=>signReleaseArtifacts({...oversizedArchive,version,cosignPath:cosign,...rootPolicy(t),env,run}),/invalid indexed artifact/);
  const oversizedPack=indexed(t);fs.truncateSync(path.join(oversizedPack.directory,`great-cto-${version}.tgz`),128*1024*1024+1);
  assert.throws(()=>makeReleaseIndex({version,commit,tree,directory:oversizedPack.directory}),/bounded/);
  const oversizedBundle=indexed(t);for(const name of [...Object.keys(files),'release-index.json'])fs.writeFileSync(path.join(oversizedBundle.directory,name+'.sigstore.json'),'synthetic bundle');
  fs.truncateSync(path.join(oversizedBundle.directory,'release-index.json.sigstore.json'),2*1024*1024+1);
  const {verifyReleaseArtifacts}=await import('../../scripts/sign-release-artifacts.mjs');
  assert.throws(()=>verifyReleaseArtifacts({...oversizedBundle,version,cosignPath:cosign,...rootPolicy(t),env,run}),/bounded/);assert.equal(calls,0);
});


test('plugin includes manifest role, types, hooks module and local MCP runtime closure', async t => {
  const f=buildFixture(t);await buildReleaseArtifacts(f);
  const entries=inspectReleaseArchive(fs.readFileSync(path.join(f.directory,`great-cto-plugin-${version}.tgz`)),{prefix:'plugin'});
  const paths=new Set(entries.map(x=>x.path));
  for(const name of ['LICENSE','agents-full/architect.md','agents-full/senior-dev.md','types/index.d.ts','hooks/hooks.json','hooks/gates-pane.tsx','mcp-servers/llm-router/server.py'])assert(paths.has(name),name);
});

test('plugin refuses missing or private manifest role/types/module references', async t => {
  for(const name of ['agents-full/senior-dev.md','types/index.d.ts','hooks/hooks.json','hooks/gates-pane.tsx']){
    const f=buildFixture(t);fs.rmSync(path.join(f.source,name));f.git(['add','-u']);f.git(['commit','--quiet','-m','synthetic missing runtime']);
    await assert.rejects(buildReleaseArtifacts(f),/manifest runtime|module runtime/);
  }
  const f=buildFixture(t);const file=path.join(f.source,'.claude-plugin/plugin.json');const manifest=JSON.parse(fs.readFileSync(file));manifest.agents=['./skills/private-overlay/customer.md'];fs.writeFileSync(file,JSON.stringify(manifest));f.git(['add','.']);f.git(['commit','--quiet','-m','synthetic private reference']);
  await assert.rejects(buildReleaseArtifacts(f),/manifest runtime/);
});


test('source-only self-test forwards actual test results without release operations', t => {
  for(const name of ['build-release-artifacts.mjs','sign-release-artifacts.mjs']){
    const root=fixture(t),scripts=path.join(root,'scripts'),tests=path.join(root,'tests/lib');fs.mkdirSync(scripts);fs.mkdirSync(tests,{recursive:true});
    const script=path.join(scripts,name);fs.copyFileSync(new URL('../../scripts/'+name,import.meta.url),script);
    const denied=spawnSync(process.execPath,[script,'--self-test','--out',path.join(root,'release')],{encoding:'utf8',timeout:30000});assert.equal(denied.status,2);assert.equal(fs.existsSync(path.join(root,'release')),false);
    const testFile=path.join(tests,'release-distribution-publisher.test.mjs');
    fs.writeFileSync(testFile,"import {test} from 'node:test';test('actual source self-test fixture',()=>{throw Error('fixture failure');});");
    const failed=spawnSync(process.execPath,[script,'--self-test'],{encoding:'utf8',timeout:30000});assert.equal(failed.status,1,failed.stdout+failed.stderr);assert.match(failed.stdout,/fixture failure/);
    fs.writeFileSync(testFile,"import {test} from 'node:test';test('actual source self-test fixture',()=>{});");
    const passed=spawnSync(process.execPath,[script,'--self-test'],{encoding:'utf8',timeout:30000});assert.equal(passed.status,0);assert.match(passed.stdout,/# pass 1/);
    assert.doesNotMatch(passed.stdout+passed.stderr,/PREPARED|SIGNED_AND_VERIFIED|release signing refused/);
  }
});


test('plugin delivers only the two approved public source helpers and excludes source-only tooling', async t => {
  const f=buildFixture(t);await buildReleaseArtifacts(f);
  const entries=inspectReleaseArchive(fs.readFileSync(path.join(f.directory,`great-cto-plugin-${version}.tgz`)),{prefix:'plugin'});const paths=new Set(entries.map(x=>x.path));
  for(const name of ['packages/cli/src/state-home.mjs','packages/cli/src/private-state.mjs'])assert(paths.has(name),name);
  for(const name of ['scripts/build-release-artifacts.mjs','scripts/sign-release-artifacts.mjs','scripts/judge-calibrate.mjs','scripts/lib/prompt-size.mjs','packages/cli/src/main.ts','tests/eval/runner.mjs'])assert.equal(paths.has(name),false,name);
});

test('builder refuses a final snapshot whose relative runtime import targets omitted test sources', async t => {
  const f=buildFixture(t);fs.writeFileSync(path.join(f.source,'scripts/runtime.mjs'),"import '../tests/eval/runner.mjs';");f.git(['add','.']);f.git(['commit','--quiet','-m','synthetic missing runtime import']);
  await assert.rejects(buildReleaseArtifacts(f),/runtime import missing/);
});

test('SIGN_ONLY accepts an off-main candidate while publication requires exact current main and tag', async t => {
  const {assertPublicationSource}=await import('../../scripts/sign-release-artifacts.mjs');
  const root=fixture(t),source=path.join(root,'source'),remote=path.join(root,'origin.git');fs.mkdirSync(source);
  const git=(cwd,args)=>execFileSync('git',['-c','commit.gpgsign=false','-c','tag.gpgsign=false','-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(source,['init','--quiet','--initial-branch=main']);git(source,['config','user.name','Fixture']);git(source,['config','user.email','fixture@example.invalid']);
  fs.writeFileSync(path.join(source,'base'),'base');git(source,['add','.']);git(source,['commit','--quiet','-m','base']);
  git(source,['checkout','--quiet','-b','candidate']);fs.writeFileSync(path.join(source,'candidate'),'candidate');git(source,['add','.']);git(source,['commit','--quiet','-m','candidate']);
  const candidate=git(source,['rev-parse','HEAD']).trim();git(source,['tag','v1.2.3']);git(root,['clone','--quiet','--bare',source,remote]);
  const run=(bin,args,opts)=>execFileSync(bin,args.map(arg=>arg==='https://github.com/avelikiy/great_cto.git'?remote:arg),opts);
  assertSigningContext({env:{...env,GITHUB_SHA:candidate},version,commit:candidate});
  assert.throws(()=>assertPublicationSource({source,version,commit:candidate,run}),/not.*main|main.*ancestor/);
  git(source,['checkout','--quiet','main']);git(source,['merge','--quiet','--no-ff','candidate','-m','preserve candidate SHA']);git(source,['push','--quiet',remote,'main']);
  assert.equal(assertPublicationSource({source,version,commit:candidate,run}).state,'EXACT_SOURCE_ON_MAIN');
  git(remote,['update-ref','refs/tags/v1.2.3',git(source,['rev-parse','main']).trim()]);
  assert.throws(()=>assertPublicationSource({source,version,commit:candidate,run}),/tag.*SHA|tag.*source/);
  git(remote,['update-ref','-d','refs/heads/main']);
  assert.throws(()=>assertPublicationSource({source,version,commit:candidate,run}),/fetch|main|unavailable/);
  assert.throws(()=>assertPublicationSource({source,version,commit:candidate,run:()=>{throw Error('network unavailable');}}),/unavailable/);
});
