import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {isPluginRuntimePath} from '../../scripts/build-release-artifacts.mjs';

for (const args of [['1.2.3'], ['1.2.3','--skip-bump'], ['1.2.3','--skip-push'], ['1.2.3','--skip-release']]) {
  test(`legacy release ${args.join(' ')} refuses before subprocess mutation`, t => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-entrypoint-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const marker=path.join(dir,'calls');
    for(const name of ['git','npm','node','gh']) fs.writeFileSync(path.join(dir,name),'#!/bin/sh\nprintf invoked >> "$RELEASE_MUTATION_MARKER"\nexit 97\n',{mode:0o700});
    const result=spawnSync('/bin/bash',[new URL('../../scripts/release.sh',import.meta.url).pathname,...args],{encoding:'utf8',cwd:dir,timeout:10000,env:{PATH:dir+':/usr/bin:/bin',HOME:dir,RELEASE_MUTATION_MARKER:marker}});
    assert.equal(result.error,undefined);
    assert.equal(result.status,1);
    assert.match(result.stderr,/verified.*artifact|artifact.*admission/i);
    assert.equal(fs.existsSync(marker),false,'no git/npm/node/gh process may run before refusal');
    assert.deepEqual(fs.readdirSync(dir).sort(),['gh','git','node','npm']);
  });
}

test('source-only local release tools are absent from the distributed runtime',()=>{
  for(const file of ['scripts/sign-local-release-artifacts.mjs','scripts/publish-local-release.mjs','scripts/publish-local-github-release.mjs']) assert.equal(isPluginRuntimePath(file),false,file);
});

test('publication rejects an index tree that differs from its actual signed source commit',async t=>{
  const {execFileSync}=await import('node:child_process');
  const {assertPublicationSource}=await import('../../scripts/sign-release-artifacts.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-source-tree-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source'), remote=path.join(dir,'remote.git');fs.mkdirSync(source);
  const git=(cwd,args)=>execFileSync('git',['-c','commit.gpgsign=false','-c','tag.gpgsign=false','-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(source,['init','--quiet','--initial-branch=main']);git(source,['config','user.name','Synthetic fixture']);git(source,['config','user.email','fixture@example.invalid']);
  fs.writeFileSync(path.join(source,'content'),'synthetic source');git(source,['add','content']);git(source,['commit','--quiet','-m','synthetic source']);
  const commit=git(source,['rev-parse','HEAD']), tree=git(source,['rev-parse','HEAD^{tree}']);
  git(source,['tag','v1.2.3']);git(dir,['clone','--quiet','--bare',source,remote]);
  const run=(bin,args,opts)=>execFileSync(bin,args.map(a=>a==='https://github.com/avelikiy/great_cto.git'?remote:a),opts);
  assert.throws(()=>assertPublicationSource({source,version:'1.2.3',commit,expectedTree:'0'.repeat(40),run}),/source tree differs/);
  assert.equal(assertPublicationSource({source,version:'1.2.3',commit,expectedTree:tree,run}).state,'EXACT_SOURCE_ON_MAIN');
});
