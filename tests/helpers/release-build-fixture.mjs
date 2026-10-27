import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { encodeReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
const version='1.2.3';
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gcto-companion-release-')));fs.chmodSync(root,0o700);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
export function releaseBuildFixture(t,{packExtra=[],packVersion=version,sourceDependency=false,packedMain='export {};',trackedDist=false}={}) {
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
  git(['init','--quiet']);git(['config','user.name','avelikiy']);git(['config','user.email','avelikiy@users.noreply.github.com']);git(['add','.']);if(trackedDist)git(['add','--force','packages/cli/dist']);git(['commit','--quiet','-m','synthetic fixture']);
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
