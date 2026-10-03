// Actual HTTP fixture for a trusted board artifact, not a production sandbox.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';

export async function runBoardSmoke({ serverPath, agentsDir }) {
  const server = realpathSync(resolve(serverPath));
  const agents = realpathSync(resolve(agentsDir));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-board-smoke-')));
  const home = join(root, 'fixture-home'), project = join(home, 'dev', 'fixture-project');
  const state = join(root, 'state'), records = join(root, 'calls.json');
  let child, exited;
  try {
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    mkdirSync(state);
    mkdirSync(join(home, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'project: fixture-project\nprimary: web-service\n');
    const names = readdirSync(agents).filter(n => n.endsWith('.md')).sort();
    assert.ok(names.length > 0, 'agent fixture inventory required');
    for (const name of names) copyFileSync(join(agents, name), join(home, '.claude', 'agents', `great_cto-${name}`));
    writeFileSync(join(state, 'notifications.json'), '{"enabled":false}\n');
    writeFileSync(join(state, 'push-subscriptions.json'), '[]\n');
    writeFileSync(records, '{"sync":[],"async":[],"network":[]}');
    const tasks = [{ id: 'fixture-001', title: 'senior-dev: synthetic completed task', status: 'closed', priority: 2,
      labels: ['senior-dev'], owner: 'senior-dev', estimated_minutes: 120,
      created_at: new Date().toISOString(), closed_at: new Date().toISOString() }];
    // Child-local stubs prevent real Beads/models/network side effects. Keep the
    // actual board router, discovery, filesystem readers and HTTP listener.
    const prefix = `
      import os from 'node:os';import cp from 'node:child_process';
      import http from 'node:http';import https from 'node:https';
      import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';
      import {readFileSync,writeFileSync} from 'node:fs';import {basename} from 'node:path';
      const record=${JSON.stringify(records)}, tasks=${JSON.stringify(tasks)};
      const note=(kind,value)=>{const r=JSON.parse(readFileSync(record,'utf8'));r[kind].push(value);writeFileSync(record,JSON.stringify(r));};
      os.homedir=()=>${JSON.stringify(home)};
      const isBd=(cmd,args)=>basename(cmd)==='bd' && args[0]==='list';
      cp.spawnSync=(cmd,args)=>{note('sync',{bd:isBd(cmd,args),git:basename(cmd)==='git'});return isBd(cmd,args)?{status:0,stdout:JSON.stringify(tasks),stderr:''}:{status:1,stdout:'',stderr:''};};
      cp.spawn=(cmd,args)=>{
        const bd=isBd(cmd,args);note('async',{bd,command:basename(cmd)});if(!bd) throw Error('unexpected child refused');
        const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();
        queueMicrotask(()=>{c.stdout.emit('data',JSON.stringify(tasks));c.emit('close',0);});return c;
      };
      const refuse=()=>{note('network',true);throw Error('outgoing fixture network refused');};
      cp.exec=cp.execFile=cp.execSync=cp.execFileSync=cp.fork=(cmd)=>{note('async',{bd:false,git:basename(cmd)==='git',command:basename(cmd)});throw Error('fixture command not executed');};
      globalThis.fetch=async()=>refuse();http.request=http.get=https.request=https.get=refuse;
      syncBuiltinESMExports();
    `;
    const env = { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC', GREAT_CTO_HOME: state,
      GREAT_CTO_DISCOVERY_ROOT: join(home, 'dev'), GREAT_CTO_HOST: '127.0.0.1' };
    const lib = name => pathToFileURL(join(dirname(server), 'lib', name)).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `${prefix}
      const c=await import(${JSON.stringify(lib('config.mjs'))});
      const p=await import(${JSON.stringify(lib('projects.mjs'))});
      console.log(JSON.stringify({paths:[c.GREAT_CTO_DIR,c.PROJECTS_FILE,c.NOTIF_HISTORY_FILE,c.PUSH_SUBS_FILE,c.VAPID_KEYS_FILE,c.SHARE_STATE_FILE],scope:p.getDiscoveryScope()}));
    `], { cwd: project, env, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
    let preflight;
    try { preflight = JSON.parse(r.stdout); } catch { /* refuse */ }
    const expected = { paths: [state, ...['projects.json','notif-history.json','push-subscriptions.json','vapid-keys.json','board-share.json'].map(n => join(state, n))],
      scope: { roots: [join(home, 'dev')], includeClaudeProjects: false } };
    if (r.status !== 0 || JSON.stringify(preflight) !== JSON.stringify(expected)) {
      const error = new Error('NOT CHECKED: board artifact lacks isolated state/discovery support; server not launched');
      error.code = 'BOARD_SMOKE_ISOLATION_UNSUPPORTED'; throw error;
    }
    // Reserve/release an OS-selected port. A subsequent bind collision fails
    // through the owned child's exit; never probe an existing port owner.
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((r, reject) => reservation.close(e => e ? reject(e) : r()));
    child = spawn(process.execPath, ['--input-type=module', '-e', `${prefix}
      const create=http.createServer;
      http.createServer=(...args)=>{const s=create(...args);s.once('listening',()=>process.send({port:s.address().port}));return s;};
      syncBuiltinESMExports();process.argv.push('--no-open');
      await import(${JSON.stringify(pathToFileURL(server).href)});
    `], { cwd: project, env: { ...env, BOARD_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    exited = once(child, 'exit');
    let output = '', timer;
    const listen = await new Promise((ready, reject) => {
      timer = setTimeout(() => reject(new Error('fixture board readiness timeout')), 10000);
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`fixture board exited before listening: ${output.slice(-1000)}`)));
      child.once('message', ready);
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        output += chunk;
        if (output.length > 65536) reject(new Error('fixture board output limit'));
      });
    }).finally(() => clearTimeout(timer));
    assert.equal(listen.port, port, 'owned listener must bind the selected port');
    const endpoints = ['/api/projects','/api/agents-installed','/api/metrics','/api/cost','/api/memory','/api/inbox','/api/resume','/api/decisions','/api/pipeline','/api/logs','/api/tasks'];
    const responses = {};
    for (const endpoint of endpoints) {
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(3000) });
      assert.equal(res.status, 200, `${endpoint} HTTP status`);
      responses[endpoint] = await res.json();
    }
    const projects = responses['/api/projects'];
    const listed = Array.isArray(projects) ? projects : projects.projects;
    assert.deepEqual(listed.map(p => p.path), [project], 'only the private project may be listed');
    const fleet = responses['/api/agents-installed'];
    assert.equal(fleet.total, names.length, 'agent count must match fixture inventory');
    for (const slug of ['continuous-learner','edtech-reviewer','gov-reviewer','insurance-reviewer']) assert.ok(fleet.agents.some(a => a.slug === slug));
    const memory = responses['/api/memory'];
    assert.equal(memory.layers.length, 11);
    assert.deepEqual([...new Set(memory.layers.map(l => l.scope))].sort(), ['global','project']);
    const cost = responses['/api/metrics'].cost;
    assert.equal(cost.source, 'tasks', 'cost fixture must exercise task estimation');
    assert.ok(cost.llm_usd > 0, 'cost ratio cannot vacuously pass');
    assert.ok(cost.human_usd / cost.llm_usd >= 470 && cost.human_usd / cost.llm_usd <= 530);
    const calls = JSON.parse(readFileSync(records, 'utf8'));
    assert.ok(calls.async.every(c => c.bd || c.git), `unexpected subprocess attempt: ${JSON.stringify(calls.async)}`);
    assert.ok(calls.sync.every(c => c.bd || c.git), 'unexpected sync subprocess attempt');
    assert.deepEqual(calls.network, [], 'unexpected outbound network attempt');
    assert.equal(readFileSync(join(state, 'notifications.json'), 'utf8'), '{"enabled":false}\n');
    assert.equal(readFileSync(join(state, 'push-subscriptions.json'), 'utf8'), '[]\n');
    return { endpointsVerified: endpoints.length, agentInventoryVerified: names.length, memoryLayersVerified: 11,
      syntheticTaskRateRatio: cost.human_usd / cost.llm_usd, isolatedDiscoveryVerified: true,
      actualBeadsVerified: false, notificationDeliveryVerified: false, releaseDiscoveryVerified: false, providerCalls: 0 };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); let timer;
      const stopped = await Promise.race([exited.then(() => true), new Promise(r => { timer = setTimeout(() => r(false), 2000); })]);
      clearTimeout(timer);
      if (!stopped) { child.kill('SIGKILL'); await exited; rmSync(root, { recursive: true, force: true }); throw new Error('fixture board required forced cleanup'); }
    }
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runBoardSmoke({ serverPath: process.argv[2], agentsDir: process.argv[3] }))); }
  catch (e) { console.error(e.message); process.exitCode = e.code === 'BOARD_SMOKE_ISOLATION_UNSUPPORTED' ? 77 : 1; }
}
