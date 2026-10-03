import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { docsBenchmarkFixture } from '../../scripts/lib/docs-benchmark-fixture.mjs';
import { runPinnedBenchmarkScorer, scorerProcessDiagnostic } from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { RULES } from '../../scripts/hooks/auto-attach-reviewers.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const lifecycleLauncher=fileURLToPath(new URL('../helpers/pinned-scorer-lifecycle.mjs',import.meta.url));
test('scorer cause metadata never copies private text or guesses timeout from elapsed time', () => {
  const diagnostic = scorerProcessDiagnostic({ status: null, signal: 'private signal',
    error: { code: 'private argv', message: 'PRIVATE_PAYLOAD_MUST_NOT_LEAK' }, stdout: 'private stdout', stderr: 'private stderr' },
    { startedAt: 'fixture-start', elapsedMs: 30001, timeoutMs: 250 });
  assert.equal(diagnostic.outcome, 'process-error');assert.equal(diagnostic.errorCode, 'UNCLASSIFIED');
  assert.equal(diagnostic.signal, null);assert.equal(diagnostic.pid, null);assert.equal(diagnostic.exitCode, null);
  assert.equal(diagnostic.elapsedMs, 30001);assert.equal(diagnostic.timeoutMs, 250);
  assert.equal(diagnostic.descendantQuiescenceVerified, false);assert.equal(diagnostic.benchmarkEligible, false);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|PRIVATE_PAYLOAD/);
});
const scorer = readFileSync(new URL('../../scripts/benchmark-scorers/docs-low-risk.mjs', import.meta.url));
function fixture(t) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'pinned-docs-scorer-')));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'candidate'), operator = join(temp, 'operator');
  mkdirSync(root); mkdirSync(operator, { mode: 0o700 });
  const recipe = docsBenchmarkFixture();
  const put = (name, bytes) => { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), bytes); };
  for (const [name, bytes] of Object.entries(recipe.files)) put(name, bytes);
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'defective documentation baseline']);
  const scorerFile = join(operator, 'scorer.mjs'), oracleFile = join(operator, 'oracle.json');
  writeFileSync(scorerFile, scorer, { mode: 0o600 }); writeFileSync(oracleFile, JSON.stringify(recipe.oracle), { mode: 0o600 });
  const options = { root, scorerFile, oracleFile, scorerSha256: sha(scorer), oracleSha256: sha(readFileSync(oracleFile)) };
  const score = overrides => runPinnedBenchmarkScorer({ ...options, expectedReceipt: treeReceipt(root), ...overrides });
  const repair = () => put('docs/README.md', recipe.files['docs/README.md'].replace('guides/getting-started.md', 'guides/quickstart.md').replace('reference/old-api.md', 'reference/api.md'));
  const custom = text => { writeFileSync(scorerFile, text, { mode: 0o600 }); options.scorerSha256 = sha(text); };
  return { root, recipe, options, score, repair, put, custom };
}

for (const [kind, code, outcome, errorCode, signal, exitCode] of [
  ['nonzero', "process.stderr.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK');process.exit(7);", 'nonzero-or-unknown', null, null, 7],
  ['timeout', 'setInterval(()=>{},1000);', 'timeout', 'ETIMEDOUT', 'SIGKILL', null],
  ['output-limit', "process.stdout.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK'.repeat(20000));setInterval(()=>{},1000);", 'output-limit', 'ENOBUFS', 'SIGKILL', null],
  ['signal', "process.kill(process.pid,'SIGKILL');", 'signalled', null, 'SIGKILL', null],
]) test('actual pinned scorer retains safe '+kind+' cause', t => {
  if (kind==='signal'&&!['darwin','linux'].includes(process.platform)) return t.skip('native signal cause NOT CHECKED');
  const f=fixture(t);f.custom(code);const timeoutMs=kind==='timeout'?250:10000;
  assert.throws(()=>f.score({timeoutMs}), error=>{
    assert.match(error.message,/^pinned scorer process did not complete;/);
    const diagnostic=error.processDiagnostic;
    assert.equal(diagnostic.outcome,outcome);assert.equal(diagnostic.errorCode,errorCode);
    assert.equal(diagnostic.signal,signal);assert.equal(diagnostic.exitCode,exitCode);
    assert.equal(diagnostic.timeoutMs,timeoutMs);assert.equal(diagnostic.descendantQuiescenceVerified,false);
    assert.equal(diagnostic.benchmarkEligible,false);assert.ok(diagnostic.pid>1);
    assert.ok(Number.isFinite(Date.parse(diagnostic.startedAt)));assert.ok(Number.isFinite(Date.parse(diagnostic.finishedAt)));
    assert.ok(diagnostic.elapsedMs>=0);if(kind==='timeout')assert.ok(diagnostic.elapsedMs>=250);
    assert.doesNotMatch(error.message,/PRIVATE_PAYLOAD|private stdout|private stderr/);
    assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_PAYLOAD|private stdout|private stderr/);
    assert.ok(!error.message.includes(f.root)&&!error.message.includes(f.options.oracleFile));
    return true;
  });
});

test('real defective fixture fails, repaired candidate passes in separate pinned process', t => {
  const f = fixture(t), broken = f.score();
  assert.equal(broken.accepted, false);
  assert.deepEqual(broken.criteria.map(c => c.state), ['failed', 'passed']);
  f.repair(); const before = treeReceipt(f.root), fixed = f.score();
  assert.equal(fixed.accepted, true); assert.notEqual(fixed.process.pid, process.pid);
  assert.equal(fixed.process.exitCode, 0); assert.equal(fixed.scorerSha256, sha(scorer));
  assert.equal(fixed.benchmarkEligible, false); assert.deepEqual(fixed.receipt, before);
  assert.deepEqual(treeReceipt(f.root), before);
  assert.ok(!JSON.stringify(fixed).includes('guides/getting-started'));
});

test('fixture creates a T0 documentation diff and independently mandatory review plan', t => {
  const f = fixture(t); f.repair();
  const base = execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const plan = specialistPlan({ root: f.root, base, rules: RULES });
  assert.equal(plan.state, 'planned'); assert.equal(plan.assessment.tier, 'T0');
  assert.deepEqual(plan.reviewers.map(r => r.agent).sort(), ['code-reviewer', 'qa-engineer', 'security-officer']);
  assert.deepEqual(plan.assessment.files, ['docs/README.md']);
});

for (const mutation of ['delete navigation', 'delete target', 'external target', 'parent escape', 'source drift', 'project drift', 'extra executable', 'symlink', 'oversized']) {
  test(`hidden docs oracle refuses ${mutation}`, t => {
    const f = fixture(t); f.repair();
    if (mutation === 'delete navigation') f.put('docs/README.md', '# No links left\n');
    if (mutation === 'delete target') rmSync(join(f.root, 'docs/reference/api.md'));
    if (mutation === 'external target') f.put('docs/README.md', '[Quick start](https://example.invalid)\n[API reference](reference/api.md)\n');
    if (mutation === 'parent escape') f.put('docs/README.md', '[Quick start](../../operator/scorer.mjs)\n');
    if (mutation === 'source drift') f.put('src/status.mjs', 'export const changed = true;\n');
    if (mutation === 'project drift') f.put('.great_cto/PROJECT.md', 'archetype: greenfield\n');
    if (mutation === 'extra executable') f.put('src/additional.mjs', 'throw Error("not documentation");\n');
    if (mutation === 'symlink') { rmSync(join(f.root, 'docs/reference/api.md')); symlinkSync(f.options.scorerFile, join(f.root, 'docs/reference/api.md')); }
    if (mutation === 'oversized') f.put('docs/reference/api.md', 'x'.repeat(65537));
    assert.equal(f.score().accepted, false);
  });
}

test('pinned runner refuses changed code/oracle, inside-project evidence, symlinks and public files', t => {
  const f = fixture(t); f.repair();
  assert.throws(() => f.score({ scorerSha256: 'a'.repeat(64) }), /pin/);
  assert.throws(() => f.score({ oracleSha256: 'a'.repeat(64) }), /pin/);
  f.put('docs/scorer.mjs', scorer);
  assert.throws(() => f.score({ scorerFile: join(f.root, 'docs/scorer.mjs') }), /external/);
  const link = join(f.options.scorerFile, '..', 'linked.mjs'); symlinkSync(f.options.scorerFile, link);
  assert.throws(() => f.score({ scorerFile: link }), /canonical/);
  chmodSync(f.options.scorerFile, 0o644); assert.throws(() => f.score(), /private/);
});

test('stale or missing candidate receipt never starts assessment', t => {
  const f = fixture(t), prior = treeReceipt(f.root); f.repair();
  assert.throws(() => f.score({ expectedReceipt: prior }), /receipt differs/);
  assert.throws(() => f.score({ expectedReceipt: null }), /receipt differs/);
  assert.throws(() => f.score({ expectedReceipt: { ...treeReceipt(f.root), truncated: true } }), /receipt differs/);
});
test('invalid private oracle shape or payload produces controlled errors without echo', t => {
  const f = fixture(t);
  for (const text of ['null', '"PRIVATE_PAYLOAD_MUST_NOT_LEAK"', '{"PRIVATE_PAYLOAD_MUST_NOT_LEAK":']) {
    writeFileSync(f.options.oracleFile, text, { mode: 0o600 });
    assert.throws(() => f.score({ oracleSha256: sha(text) }), error => {
      assert.doesNotMatch(error.message, /PRIVATE_PAYLOAD/);
      return /oracle JSON|scenario or criteria/.test(error.message);
    });
  }
});

test('scorer receives no inherited preload, credentials or worker package imports', t => {
  const f = fixture(t); f.repair();
  const keys = ['NODE_OPTIONS', 'BENCHMARK_TEST_SECRET'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) if (old[key] == null) delete process.env[key]; else process.env[key] = old[key]; });
  process.env.NODE_OPTIONS = '--this-invalid-node-option-must-not-be-inherited';
  process.env.BENCHMARK_TEST_SECRET = 'unit sentinel, not a credential';
  f.custom(`if (process.env.NODE_OPTIONS || process.env.BENCHMARK_TEST_SECRET) throw Error('ambient env leaked');\n${scorer}`);
  assert.equal(f.score().accepted, true);
});

for (const kind of ['throw', 'timeout', 'oversized output', 'malformed JSON', 'wrong PID', 'wrong criteria', 'mutate candidate', 'mutate ignored project']) {
  test(`failed scorer ${kind} is unavailable, not an acceptance failure or pass`, t => {
    const f = fixture(t); f.repair();
    const code = {
      throw: "throw Error('PRIVATE_PAYLOAD_MUST_NOT_LEAK');",
      timeout: 'while (true) {}',
      'oversized output': "process.stdout.write('x'.repeat(70000));",
      'malformed JSON': "process.stdout.write('PRIVATE_PAYLOAD_MUST_NOT_LEAK');",
      'wrong PID': `${scorer}`.replace('pid: process.pid', 'pid: -1'),
      'wrong criteria': `${scorer}`.replace("text: 'all target links resolve'", "text: 'wrong criterion'"),
      'mutate candidate': "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2]+'/src/status.mjs', 'modified during scorer'); process.stdout.write('{}');",
      'mutate ignored project': "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2]+'/.great_cto/PROJECT.md', 'ignored policy mutation'); process.stdout.write('{}');",
    }[kind];
    f.custom(code);
    assert.throws(() => f.score({ timeoutMs: 250 }), error => {
      assert.doesNotMatch(error.message, /PRIVATE_PAYLOAD/);
      return /process did not complete|invalid JSON|invalid identity|changed during scoring/.test(error.message);
    });
  });
}

test('fixed lifecycle launcher refuses private input and stale receipt without echo', t=>{
  const f=fixture(t),receipt=treeReceipt(f.root);f.repair();
  for(const [input,reason] of [[JSON.stringify({PRIVATE_PAYLOAD_MUST_NOT_LEAK:true}),'input-shape'],
    ['PRIVATE_PAYLOAD_MUST_NOT_LEAK'.repeat(3000),'input-limit'],
    [JSON.stringify({options:{...f.options,expectedReceipt:receipt,timeoutMs:1000}}),'receipt-refused']]){
    const child=spawnSync(process.execPath,[lifecycleLauncher],{input,env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:10000,maxBuffer:4096});
    assert.equal(child.status,3);assert.equal(child.signal,null);assert.equal(child.stderr,'');
    const records=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(records[0].kind,'launcher-started');assert.equal(records.at(-1).kind,'prelaunch-refused');
    assert.equal(records.at(-1).reason,reason);assert.ok(records.every(r=>!r.processDiagnostic));
    assert.doesNotMatch(child.stdout,/PRIVATE_PAYLOAD/);assert.ok(!child.stdout.includes(f.root));
  }
});

test('fixed lifecycle launcher reports a timeout without manufacturing ready evidence', t=>{
  const f=fixture(t);f.custom('setInterval(()=>{},1000);');
  const child=spawnSync(process.execPath,[lifecycleLauncher],{
    input:JSON.stringify({options:{...f.options,expectedReceipt:treeReceipt(f.root),timeoutMs:1000}}),
    env:{LANG:'C',TZ:'UTC'},encoding:'utf8',timeout:10000,maxBuffer:4096});
  assert.equal(child.status,0);assert.equal(child.signal,null);assert.equal(child.stderr,'');
  const records=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(records.map(r=>r.kind),['launcher-started','runner-invoked','runner-unavailable']);
  const diagnostic=records.at(-1).processDiagnostic;
  assert.equal(diagnostic.outcome,'timeout');assert.equal(diagnostic.timeoutMs,1000);
  assert.equal(diagnostic.errorCode,'ETIMEDOUT');assert.equal(diagnostic.signal,'SIGKILL');
  assert.equal(diagnostic.descendantQuiescenceVerified,false);assert.equal(diagnostic.benchmarkEligible,false);
  assert.ok(!child.stdout.includes(f.root));
});

test('timeout remains bounded when trusted scorer handles SIGTERM and stays alive', {timeout:10000}, async t => {
  if (!['darwin','linux'].includes(process.platform)) return t.skip('owned process identity unavailable; hostile signal timeout NOT CHECKED');
  const f=fixture(t), marker=join(f.options.scorerFile,'..','owned-pid.json');
  const oracle=JSON.stringify({...f.recipe.oracle,signalTestMarker:marker});
  writeFileSync(f.options.oracleFile,oracle,{mode:0o600});f.options.oracleSha256=sha(oracle);
  f.custom("import {writeFileSync} from 'node:fs';\nprocess.on('SIGTERM',()=>{});\nwriteFileSync(JSON.parse(process.argv[3]).signalTestMarker,JSON.stringify({pid:process.pid}));\nsetInterval(()=>{},1000);");
  const launcherInput=JSON.stringify({options:{...f.options,expectedReceipt:treeReceipt(f.root),timeoutMs:1000}});
  const child=spawn(process.execPath,[lifecycleLauncher],{env:{LANG:'C',TZ:'UTC'},stdio:['pipe','pipe','pipe']});
  let output='',pid,identity,timer;
  const closed=new Promise((resolve,reject)=>{child.once('close',(code,signal)=>resolve({code,signal}));child.once('error',reject);});
  child.stdout.on('data',b=>{output+=b;});child.stderr.resume();
  child.stdin.end(launcherInput);
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const processIdentity=p=>{const r=spawnSync('ps',['-p',String(p),'-o','pid=,ppid=,lstart='],{encoding:'utf8',timeout:1000});return r.status===0?r.stdout.trim():null;};
  try{
    for(let i=0;i<50&&!pid;i++){try{pid=JSON.parse(readFileSync(marker,'utf8')).pid;}catch{}if(!pid)await pause(20);}
    const readyObserved=Number.isInteger(pid)&&pid>1;
    if(readyObserved){identity=processIdentity(pid);
      assert.equal(Number(identity?.split(/\s+/)[1]),child.pid,'scorer PID must belong to test-owned launcher');}
    const exit=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('launcher exceeded watchdog after scorer deadline')),2000);})]);
    assert.ok(Buffer.byteLength(output)<=4096,'fixed launcher output must remain bounded');
    let records=[];
    try{if(output.trim())records=output.trim().split('\n').map(line=>JSON.parse(line));}
    catch{assert.fail('fixed launcher returned invalid metadata');}
    const last=records.at(-1)??{kind:'no-final-stage'};
    assert.doesNotMatch(output,/PRIVATE_PAYLOAD/);assert.ok(!output.includes(f.root));
    const observation={readyObserved,launcherExit:exit,final:last};
    t.diagnostic('owned launcher observation: '+JSON.stringify(observation));
    assert.ok(readyObserved,'trusted scorer ready not observed within fixed window; '+JSON.stringify(observation));
    assert.equal(records[0]?.kind,'launcher-started');assert.equal(records[0]?.pid,child.pid);
    assert.equal(exit.code,0);assert.equal(exit.signal,null);assert.equal(last.kind,'runner-unavailable');
    assert.equal(last.processDiagnostic.outcome,'timeout');assert.equal(last.processDiagnostic.timeoutMs,1000);
    assert.equal(last.processDiagnostic.pid,pid);assert.equal(last.processDiagnostic.descendantQuiescenceVerified,false);
    assert.equal(processIdentity(pid),null,'timed-out owned scorer must no longer be a live process');
  }finally{
    clearTimeout(timer);
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    if(identity&&processIdentity(pid)===identity)try{process.kill(pid,'SIGKILL');}catch{}
    await closed;
  }
});
