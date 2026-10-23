import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listCodexRuns } from '../../scripts/lib/codex-host-state.mjs';

const repo = resolve(import.meta.dirname, '../..');
const controller = join(repo, 'scripts/codex-pipeline.mjs');
const cli = join(repo, 'packages/cli/index.mjs');
const largeText = 'é漢🙂'.repeat(16384);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'gcto-output-drain-'));
  t.after(() => rmSync(base, { recursive:true, force:true }));
  const root = join(base, 'project'), home = join(base, 'home'), store = join(base, 'runs');
  mkdirSync(root); mkdirSync(home); mkdirSync(store, {mode:0o700});
  const id = randomUUID();
  writeFileSync(join(store, `${id}.json`), JSON.stringify({ version:1, id, root, status:'done', reason:largeText,
    results:{}, attempts:[], queue:[], hostRoutes:{} }));
  const listing = listCodexRuns({root,store});
  const listingFile = join(base, 'listing.json');
  writeFileSync(listingFile, JSON.stringify(listing));
  const env = { PATH:process.env.PATH || '/usr/bin:/bin', HOME:home, USERPROFILE:home, LANG:'C', TZ:'UTC',
    DO_NOT_TRACK:'1', GREAT_CTO_NO_UPDATE_CHECK:'1', GREAT_CTO_TELEMETRY_DRYRUN:'1',
    GREAT_CTO_CODEX_RUNS_DIR:store, GREAT_CTO_TASKS_DIR:join(base,'tasks'), GCTO_LISTING_FILE:listingFile };
  function run(entry, argv, preload = '', overrides = {}) {
    const nodeArgs = [];
    if (preload) {
      const file = join(base, `preload-${randomUUID()}.mjs`);
      writeFileSync(file, preload);
      nodeArgs.push('--import', file);
    }
    const result = spawnSync(process.execPath, [...nodeArgs,entry,...argv], {
      cwd:root, env:{...env,...overrides}, timeout:10000, maxBuffer:2*1024*1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  }
  return {base, root, store, listing, run, env};
}

function completeJson(result, expected, code) {
  assert.equal(result.status, code, String(result.stderr));
  const bytes = Buffer.from(JSON.stringify(expected, null, 2)+'\n');
  assert.ok(bytes.length > 8192, 'fixture must exceed the observed pipe truncation boundary');
  assert.equal(result.stdout.length, bytes.length, 'every UTF-8 byte must reach the pipe');
  assert.equal(digest(result.stdout), digest(bytes));
  assert.doesNotThrow(() => JSON.parse(String(result.stdout)));
}

test('controller list drains large UTF-8 JSON through a real stdout pipe before rc0', t => {
  const f = fixture(t);
  completeJson(f.run(controller, ['list','--dir',f.root]), f.listing, 0);
});

test('controller terminates cleanly when its real pipe reader closes early', {timeout:10000}, async t => {
  const f=fixture(t);
  const child=spawn(process.execPath,[controller,'list','--dir',f.root],{cwd:f.root,env:f.env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null && child.signalCode===null)child.kill('SIGTERM')});
  let stderr='';
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.stdout.once('data',()=>child.stdout.destroy());
  const [code,signal]=await once(child,'exit');
  assert.equal(signal,null);
  assert.equal(code,0,stderr);
  assert.equal(stderr,'');
});

test('controller doctor drains JSON before both readiness exit statuses', t => {
  const f = fixture(t);
  const loader = join(f.base,'doctor-loader.mjs');
  writeFileSync(loader, `import {readFile} from 'node:fs/promises';
    export async function load(url,context,nextLoad) {
      if(!url.endsWith('/scripts/lib/codex-host-state.mjs')) return nextLoad(url,context);
      let source=await readFile(new URL(url),'utf8');
      source=source.replace('export function codexHostDoctor(', 'function originalCodexHostDoctor(');
      source+='\\nexport function codexHostDoctor(){return JSON.parse(readFileSync(process.env.GCTO_DOCTOR_FILE,"utf8"));}';
      return {format:'module',source,shortCircuit:true};
    }`);
  const preload = `import {register} from 'node:module'; register(${JSON.stringify(pathToFileURL(loader).href)});`;
  for (const [state, code] of [['ready',0],['blocked',2]]) {
    const expected = {state,detail:largeText}, file=join(f.base,`${state}.json`);
    writeFileSync(file,JSON.stringify(expected));
    completeJson(f.run(controller,['doctor'],preload,{GCTO_DOCTOR_FILE:file}),expected,code);
  }
});

test('outer CLI finish independently drains large status JSON through a real pipe', t => {
  const f = fixture(t);
  // Supply a complete listing at the collaborator boundary so this assertion
  // isolates outer CLI shutdown from the controller's separate pipe defect.
  const preload = `import cp from 'node:child_process'; import {readFileSync} from 'node:fs';
    import {syncBuiltinESMExports} from 'node:module';
    cp.spawnSync=(command,args)=>{
      if(args?.[0]?.endsWith('/codex-pipeline.mjs') && args[1]==='list')
        return {status:0,stdout:readFileSync(process.env.GCTO_LISTING_FILE,'utf8'),stderr:''};
      throw Error('unexpected fixture subprocess');
    }; syncBuiltinESMExports();
    globalThis.fetch=async()=>{throw Error('unexpected fixture HTTP')};`;
  const expected={schemaVersion:1,state:f.listing.state,runs:f.listing.runs,tasks:[]};
  completeJson(f.run(cli,['status','--host','codex','--json','--dir',f.root],preload),expected,0);
});

test('finish waits for completion callbacks even when both writes return true', t => {
  const f = fixture(t);
  const preload = `const rawErr=process.stderr.write.bind(process.stderr);
    for(const [name,stream] of [['stdout',process.stdout],['stderr',process.stderr]]) {
      const raw=stream.write.bind(stream);
      stream.write=function(chunk,...args) {
        if(chunk!=='') return raw(chunk,...args);
        setImmediate(()=>{rawErr('@completed:'+name+'\\n');args.at(-1)();});
        return true;
      };
    }`;
  const r=f.run(cli,['definitely-unknown'],preload);
  assert.equal(r.status,2);
  assert.match(String(r.stderr),/@completed:stdout/);
  assert.match(String(r.stderr),/@completed:stderr/);
});

for (const streamName of ['stdout','stderr']) {
  for (const failure of ['callback-error','throw','close']) {
    test(`finish preserves rc2 without hanging on ${streamName} ${failure}`, t => {
      const f=fixture(t);
      const preload=`const name=process.env.GCTO_ERROR_STREAM,mode=process.env.GCTO_ERROR_MODE;
        const stream=process[name],raw=stream.write.bind(stream),rawErr=process.stderr.write.bind(process.stderr);
        stream.write=function(chunk,...args){
          if(chunk!=='')return raw(chunk,...args);
          rawErr('@barrier-case:'+mode+'\\n');
          const error=Object.assign(Error('fixture stream failure'),{code:'EPIPE'});
          if(mode==='throw')throw error;
          setImmediate(()=>{
            if(mode==='close')stream.emit('close');
            else {args.at(-1)(error);stream.emit('error',error);}
          });return false;
        };`;
      const r=f.run(cli,['definitely-unknown'],preload,{GCTO_ERROR_STREAM:streamName,GCTO_ERROR_MODE:failure});
      assert.equal(r.status,2,String(r.stderr));
      assert.match(String(r.stderr),new RegExp('@barrier-case:'+failure));
    });
  }
}

for (const keepAlive of [false,true]) {
  for (const [command,expected] of [['version',1],['definitely-unknown',2]]) {
    test(`never-completing writes fail closed at rc${expected}, live handle=${keepAlive}`, t => {
      const f=fixture(t);
      const preload=`
        if(process.env.GCTO_KEEP_ALIVE==='1')setInterval(()=>{},10000);
        const raw=process.stdout.write.bind(process.stdout);
        process.stdout.write=function(chunk,...args){return chunk===''?false:raw(chunk,...args)};`;
      const r=f.run(cli,[command],preload,{GCTO_KEEP_ALIVE:keepAlive?'1':'0'});
      assert.equal(r.status,expected,String(r.stderr));
    });
  }
}

test('settlement removes listeners after error/callback/close race', t => {
  const f=fixture(t);
  const preload=`const stream=process.stdout,raw=stream.write.bind(stream),rawErr=process.stderr.write.bind(process.stderr);
    const before={error:stream.listenerCount('error'),close:stream.listenerCount('close'),finish:stream.listenerCount('finish')};
    stream.write=function(chunk,...args){
      if(chunk!=='')return raw(chunk,...args);
      setImmediate(()=>{stream.emit('error',Error('fixture'));args.at(-1)();stream.emit('close');});return false;
    };
    const exit=process.exit;
    process.exit=function(code){
      rawErr('@listener-cleanup:'+JSON.stringify({before,after:{error:stream.listenerCount('error'),close:stream.listenerCount('close'),finish:stream.listenerCount('finish')}})+'\\n');
      exit(code);
    };`;
  const r=f.run(cli,['definitely-unknown'],preload);
  assert.equal(r.status,2,String(r.stderr));
  const line=String(r.stderr).split('\n').find(l=>l.startsWith('@listener-cleanup:'));
  const {before,after}=JSON.parse(line.slice('@listener-cleanup:'.length));
  assert.deepEqual(after,before);
});

test('already closed/destroyed/finished output streams preserve the command exit code', t => {
  for (const property of ['closed','destroyed','writableFinished']) {
    const f=fixture(t);
    const preload=`const rawErr=process.stderr.write.bind(process.stderr);
      Object.defineProperty(process.stdout,process.env.GCTO_CLOSED_PROPERTY,{get(){rawErr('@already-closed\\n');return true;}});`;
    const r=f.run(cli,['definitely-unknown'],preload,{GCTO_CLOSED_PROPERTY:property});
    assert.equal(r.status,2,String(r.stderr));
    assert.match(String(r.stderr),/@already-closed/);
  }
});

test('ended but unfinished stream waits for finish without writing after end', t => {
  const f=fixture(t);
  const preload=`const stream=process.stdout,rawErr=process.stderr.write.bind(process.stderr),raw=stream.write.bind(stream);
    Object.defineProperty(stream,'writableEnded',{get(){setImmediate(()=>{rawErr('@finished-ended\\n');stream.emit('finish')});return true;}});
    stream.write=function(chunk,...args){if(chunk==='')throw Error('write after end');return raw(chunk,...args)};`;
  const r=f.run(cli,['definitely-unknown'],preload);
  assert.equal(r.status,2,String(r.stderr));
  assert.match(String(r.stderr),/@finished-ended/);
});
