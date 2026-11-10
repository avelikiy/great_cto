import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {activateNpmRelease} from '../src/release-activation.mjs';

test('activation environment lets real npm resolve isolated configuration without loading ambient config', t => {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gcto-npm-config-')));
  fs.chmodSync(root,0o700);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const prefix=path.join(root,'prefix'),pkg=path.join(prefix,'lib/node_modules/great-cto'),bin=path.join(prefix,'bin/great-cto');
  fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(path.dirname(bin),{recursive:true});
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'great-cto',version:'3.70.1',bin:{'great-cto':'index.mjs'}}));
  fs.writeFileSync(path.join(pkg,'index.mjs'),'previous',{mode:0o755});fs.symlinkSync('../lib/node_modules/great-cto/index.mjs',bin);
  const archive=path.join(root,'candidate.tgz');fs.writeFileSync(archive,'fixture',{mode:0o600});
  const admission={},info={version:'3.71.1',source:{commit:'a'.repeat(40)},isProduction:false};
  const files=[{path:'index.mjs',bytes:Buffer.from('next'),mode:0o755},{path:'package.json',bytes:Buffer.from(JSON.stringify({name:'great-cto',version:info.version,bin:{'great-cto':'index.mjs'}})),mode:0o644}];
  let probes=0, npmProbe;
  const access={getAdmissionInfo:()=>info,getAdmittedArtifact:()=>({path:archive,sha256:createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}),inspectNpmPayload:()=>({version:info.version,files})};
  const run=(command,args,options)=>{
    if(args.includes('install')){
      // Real npm, read-only: this was the failure before any package replacement.
      const npm=npmProbe=spawnSync('npm',['--version'],{...options,timeout:30000});probes++;
      if(npm.status!==0)return npm;
      const user=options.env.NPM_CONFIG_USERCONFIG,global=options.env.NPM_CONFIG_GLOBALCONFIG;
      assert.notEqual(user,global);
      for(const f of [user,global]){assert.equal(fs.readFileSync(f,'utf8'),'');assert.equal(fs.statSync(f).mode&0o777,0o600);assert.ok(f.startsWith(root+path.sep));}
      assert.equal(options.env.NODE_OPTIONS,undefined);assert.equal(options.env.NPM_TOKEN,undefined);
      for(const file of files)fs.writeFileSync(path.join(pkg,file.path),file.bytes,{mode:file.mode});
    }
    return {status:0,stdout:args.includes('--version')?info.version+'\n':'[]\n'};
  };
  const result=activateNpmRelease(admission,{binaryPath:bin,stateRoot:path.join(root,'state'),npmPath:process.execPath,testing:{fixtureRoot:root,access,run}});
  assert.equal(probes,1);assert.equal(npmProbe.status,0,npmProbe.stderr||npmProbe.error?.message);assert.match(npmProbe.stdout.trim(),/^\d+\.\d+\.\d+$/);assert.equal(result.state,'SIMULATED_SMOKE_PASSED');assert.equal(result.authority,'NONE');
});
