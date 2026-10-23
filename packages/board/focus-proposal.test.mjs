import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fleet from './lib/fleet.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reapAndClean } from '../../tests/helpers/reap.mjs';
import { execFileSync } from 'node:child_process';

const evidence = () => ({ version: 1, state: 'planned', advisory: true, planningOnly: false, reusablePass: false,
  scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested', fingerprint: 'b'.repeat(64),
  assessment: { known: true, base: 'a'.repeat(40), fingerprint: 'c'.repeat(64), tier: 'T2', escalatedFromLabel: null,
    files: ['docs/architecture/change.md', 'release/package.json'], reasons: ['deploy:production'] },
  reviewers: [{ agent: 'pci-reviewer', reasons: ['/private/overlay TOKEN_CANARY'], files: ['secret/prompt.txt'] }] });

test('public proposal composes routes and retains reviewers while excluding private metadata', () => {
  assert.equal(typeof fleet.getFocusProposal, 'function');
  const p = fleet.getFocusProposal({ focusId: 'fintech-crypto', host: 'codex', plan: evidence(), base: 'a'.repeat(40) });
  assert.equal(p.assessmentState, 'known');
  assert.deepEqual(p.routeClasses, ['ordinary', 'architecture', 'sensitive', 'publication']);
  for (const role of ['code-reviewer', 'qa-engineer', 'security-officer', 'pci-reviewer']) assert(p.requiredRoles.includes(role));
  assert(p.edges.every(e => e.kind === 'proposed-dependency'));
  assert.doesNotMatch(JSON.stringify(p), /TOKEN_CANARY|private\/overlay|secret\/prompt|startedAt|succeeded/);
});

test('actual HTTP focus resolution never opens own or foreign PROJECT aliases before bounded validation', { timeout: 45000 }, async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-focus-membership-')));
  const root = path.join(tmp, 'own'), foreign = path.join(tmp, 'foreign'), home = path.join(tmp, 'home');
  for (const dir of [root, foreign, home]) fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
  const ownMd = path.join(root, '.great_cto', 'PROJECT.md'), foreignMd = path.join(foreign, '.great_cto', 'PROJECT.md');
  for (const file of [ownMd, foreignMd]) fs.writeFileSync(file, 'archetype: fintech\nproject: metadata-only-alias\n');
  const registry = path.join(home, '.great_cto', 'projects.json'), arm = path.join(tmp, 'armed'), trace = path.join(tmp, 'reads.jsonl');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{slug:'known',name:'Known Project',path:root},{slug:'foreign',path:foreign}] }));
  const probe = path.join(tmp, 'probe.mjs');
  fs.writeFileSync(probe, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const arm=${JSON.stringify(arm)},trace=${JSON.stringify(trace)};
const read=fs.readFileSync,open=fs.openSync;
const check=(file,kind,flags)=>{if(!fs.existsSync(arm)||typeof file!=='string'||!file.endsWith('/.great_cto/PROJECT.md'))return;
 const safe=kind==='open'&&typeof flags==='number'&&(flags&fs.constants.O_NOFOLLOW)!==0&&(flags&fs.constants.O_NONBLOCK)!==0;
 fs.appendFileSync(trace,JSON.stringify({file,kind,safe})+'\\n');
 if(!safe)throw Object.assign(Error('unsafe metadata read blocked by fixture'),{code:'EACCES'});};
fs.readFileSync=function(file,...args){check(file,'read');return read.call(this,file,...args)};
fs.openSync=function(file,flags,...args){check(file,'open',flags);return open.call(this,file,flags,...args)};
syncBuiltinESMExports();`);
  let server;
  try {
    server = await startServerOnFreePort({ entry:path.resolve('packages/board/server.mjs'), cwd:root, portEnv:'PORT',
      readyPath:'/api/focus-registry?project=known', env:{HOME:home,GREAT_CTO_PROJECTS_FILE:registry,GREAT_CTO_NO_UPDATE_CHECK:'1',NODE_OPTIONS:`--import=${probe}`} });
    fs.writeFileSync(arm, 'armed');
    const base = `http://127.0.0.1:${server.port}`;
    const read = async (endpoint, project) => {
      fs.writeFileSync(trace, '');
      const response = await fetch(`${base}/api/${endpoint}?project=${encodeURIComponent(project)}&focus=mental-care&host=codex`);
      const body = await response.json();
      return {status:response.status,body,reads:fs.readFileSync(trace,'utf8').split('\n').filter(Boolean).map(JSON.parse)};
    };
    for (const selected of ['known','Known Project','own',root]) {
      const registryRead = await read('focus-registry',selected);
      assert.equal(registryRead.status,200);
      assert.deepEqual(registryRead.reads,[],`registry must not enumerate PROJECT aliases for ${selected}`);
    }
    for (const selected of ['unknown-project','metadata-only-alias',home]) {
      for (const endpoint of ['focus-registry','focus-proposal']) {
        const unknown = await read(endpoint,selected);
        assert.equal(unknown.status,404);
        assert.deepEqual(unknown.reads,[],'unknown membership must not inspect project metadata');
      }
    }
    const normal = await read('focus-proposal','known');
    assert.equal(normal.status,200);
    assert.deepEqual(normal.reads.map(r=>({file:r.file,kind:r.kind,safe:r.safe})),[{file:ownMd,kind:'open',safe:true}]);
    const privateMd = path.join(home,'private.md'); fs.writeFileSync(privateMd,'archetype: healthcare\n');
    for (const kind of ['symlink','hardlink','fifo']) {
      for (const target of [ownMd,foreignMd]) {
        fs.unlinkSync(target);
        if(kind==='symlink')fs.symlinkSync(privateMd,target);
        else if(kind==='hardlink')fs.linkSync(privateMd,target);
        else execFileSync('mkfifo',[target]);
      }
      for (const selected of ['known','unknown-project']) for (const endpoint of ['focus-registry','focus-proposal']) {
        const result = await read(endpoint,selected);
        assert.equal(result.status,selected==='known'?200:404);
        assert.deepEqual(result.reads,[],`${kind} metadata must never be opened by focus resolution`);
        if(endpoint==='focus-proposal'&&selected==='known')assert.equal(result.body.proposal.requiredRolesComplete,false);
      }
    }
  } finally {
    if(server)await reapAndClean(server.proc,tmp);else fs.rmSync(tmp,{recursive:true,force:true});
  }
});

test('missing or unknown evidence is unavailable and native limits remain explicit', () => {
  assert.equal(typeof fleet.getFocusProposal, 'function');
  const p = fleet.getFocusProposal({ focusId: 'mental-care', host: 'claude-code' });
  assert.equal(p.assessmentState, 'unavailable');
  assert.equal(p.assessmentFingerprint, null);
  assert.deepEqual(p.nodes, []);
  assert(p.limitations.includes('native-causal-coverage-unavailable'));
  assert(p.limitations.includes('no-selective-omission'));
  const bad = fleet.getFocusProposal({ focusId: '<img src=x>', host: '/private/overlay', plan: evidence() });
  assert.equal(bad.focusId, null);
  assert.doesNotMatch(JSON.stringify(bad), /img src|private\/overlay/);
});

test('real focus APIs are read-only, scoped, safe and honest about absent bound evidence', { timeout: 45000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-focus-api-'));
  const root = path.join(tmp, 'project'), home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(root, '.great_cto'), { recursive: true });
  fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(root, '.great_cto', 'PROJECT.md'), 'archetype: fintech\n');
  const stateFile = path.join(root, '.great_cto', 'domain-admission.json');
  const state = '{"queue":["senior-dev"],"token":"TOKEN_CANARY","overlay":"/private/overlay"}';
  fs.writeFileSync(stateFile, state);
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: 'focus-test', path: root }] }));
  let server;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT',
      env: { HOME: home, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_UPDATE_CHECK: '1' } });
    const base = `http://127.0.0.1:${server.port}`;
    const r = await fetch(`${base}/api/focus-registry?project=focus-test`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const result = await r.json();
    assert.deepEqual(result.registry.directions.map(d => d.id), ['fintech-crypto', 'telemedicine', 'venture-pipeline', 'mental-care']);
    assert.equal(result.registry.coreRoles.length, 8);
    assert.equal(result.registry.directions[0].packs.length, 2);
    const p = await (await fetch(`${base}/api/focus-proposal?project=focus-test&focus=mental-care&host=claude-code`)).json();
    assert.equal(p.projectId, result.projectId);
    assert.equal(p.proposal.assessmentState, 'unavailable');
    assert(p.proposal.requiredRoles.includes('pci-reviewer'));
    assert(p.proposal.requiredRoles.includes('regulated-reviewer'));
    assert(p.proposal.limitations.includes('native-enforcement-not-attested'));
    assert.doesNotMatch(JSON.stringify([result, p]), /TOKEN_CANARY|private\/overlay|gcto-focus-api-/);
    for (const endpoint of ['focus-registry', 'focus-proposal']) {
      assert.equal((await fetch(`${base}/api/${endpoint}?project=unknown-project`)).status, 404);
      assert.equal((await fetch(`${base}/api/${endpoint}?project=focus-test`, { method: 'POST' })).status, 405);
    }
    assert.equal(fs.readFileSync(stateFile, 'utf8'), state);
    const declaration = path.join(root, '.great_cto', 'PROJECT.md');
    const privateDeclaration = path.join(home, 'private-project.md');
    fs.writeFileSync(privateDeclaration, 'archetype: healthcare\nprivate-overlay: TOKEN_CANARY\n');
    fs.unlinkSync(declaration); fs.symlinkSync(privateDeclaration, declaration);
    const linked = await (await fetch(`${base}/api/focus-proposal?project=focus-test&focus=mental-care&host=codex`)).json();
    assert.equal(linked.proposal.assessmentState, 'unavailable');
    assert(!linked.proposal.requiredRoles.includes('healthcare-reviewer'), 'a metadata symlink must not read a private declaration');
    assert.equal(linked.proposal.requiredRolesComplete, false);
    fs.unlinkSync(declaration); fs.linkSync(privateDeclaration, declaration);
    const hardlinked = await (await fetch(`${base}/api/focus-proposal?project=focus-test&focus=mental-care&host=codex`)).json();
    assert(!hardlinked.proposal.requiredRoles.includes('healthcare-reviewer'), 'a metadata hardlink must not read a private declaration');
    assert.equal(hardlinked.proposal.requiredRolesComplete, false);
  } finally {
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
