// Trusted-hook snapshot fixture, not a complete learning lifecycle test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, readlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function runSessionEndSmoke({ hookPath }) {
  const hook = realpathSync(resolve(hookPath));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-session-snapshot-')));
  const project = join(root, 'project'), home = join(root, 'fixture-home');
  const record = join(root, 'calls.json');
  try {
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    mkdirSync(join(home, '.great_cto'), { recursive: true });
    const lessons = join(project, '.great_cto', 'lessons.md');
    writeFileSync(lessons, '# Fixture lessons\n');
    const config = join(home, '.great_cto', 'config.json');
    const configBytes = '{"auto_learn":true}\n';
    writeFileSync(config, configBytes);
    writeFileSync(record, JSON.stringify({ sync: [], async: [] }));
    // Patch only this child process before loading the trusted hook. Do not
    // override HOME/CODEX_HOME. Never spawn real git/bd, merge, or learner.
    const bootstrap = `
      import os from 'node:os';
      import cp from 'node:child_process';
      import {syncBuiltinESMExports} from 'node:module';
      import {readFileSync,writeFileSync} from 'node:fs';
      import {basename} from 'node:path';
      const record=${JSON.stringify(record)};
      const log=(kind,value)=>{const r=JSON.parse(readFileSync(record,'utf8'));r[kind].push(value);writeFileSync(record,JSON.stringify(r));};
      os.homedir=()=>${JSON.stringify(home)};
      cp.spawnSync=(cmd,args)=>{log('sync',{cmd,args});return {status:1,stdout:'',stderr:''};};
      cp.spawn=(cmd,args)=>{
        const merge=cmd==='node' && args.length===1 && basename(args[0])==='lessons-merge.mjs';
        log('async',{merge});
        if(!merge) throw Error('unexpected child refused');
        return {unref(){}};
      };
      syncBuiltinESMExports();
      await import(${JSON.stringify(pathToFileURL(hook).href)});
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
      cwd: project, input: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'fixture-session', reason: 'fixture-snapshot', cwd: project }),
      env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC', GREAT_CTO_AUTO_LEARN: '0' },
      encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
    });
    assert.equal(r.status, 0, `snapshot hook failed: ${r.stderr}`);
    assert.equal(r.stdout, '', 'SessionEnd must not produce a directive');
    const logs = join(project, '.great_cto', 'logs');
    const files = readdirSync(logs).filter(name => /^session-.*-end\.md$/.test(name));
    assert.equal(files.length, 1, 'actual snapshot required, not merely exit zero');
    const snapshot = readFileSync(join(logs, files[0]), 'utf8');
    assert.match(snapshot, /session-id: fixture-/);
    assert.match(snapshot, /reason: fixture-snapshot/);
    assert.match(snapshot, /# Session ended \(auto-capture\)/);
    assert.match(snapshot, /Branch: `unknown`/);
    assert.equal(readlinkSync(join(home, '.great_cto', 'projects', 'project', 'lessons.md')), lessons);
    assert.equal(readFileSync(config, 'utf8'), configBytes);
    assert.equal(readFileSync(lessons, 'utf8'), '# Fixture lessons\n');
    assert.equal(existsSync(join(project, '.great_cto', '.last-auto-learn')), false);
    const calls = JSON.parse(readFileSync(record, 'utf8'));
    assert.ok(calls.sync.length > 0);
    assert.ok(calls.sync.every(call => ['git', 'bd'].includes(call.cmd)), 'unexpected sync command refused');
    assert.deepEqual(calls.async, [{ merge: true }], 'only the intercepted merge launch is expected');
    return {
      snapshotVerified: true, isolatedRegistrationVerified: true,
      actualGitBeadsCaptureVerified: false, actualMergeVerified: false,
      actualLearnerVerified: false, providerCalls: 0,
    };
  } finally {
    // No detached process was launched; only this fresh fixture is removed.
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runSessionEndSmoke({ hookPath: process.argv[2] }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
