// `great-cto skills sync`: the three clones the SessionStart hook used to start by itself, now run only
// when the user asks (ADR-050 decision 9; bug 5fz8). The sources, flags and target directories are the
// ones the hook had, so everything that reads ~/.great_cto/{catalog,anthropic-skills,personal-skills}
// finds them where it always did.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKILL_SOURCES, syncSkills, runSkillsCommand } from '../src/skills-sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(HERE, '..', 'index.mjs');

function temp(t, prefix = 'gcto-skills-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/** A git that records its argv and makes the target directory, like a clone that worked. */
function recorder(calls, { failFor = [] } = {}) {
  return (command, args) => {
    calls.push([command, ...args]);
    const target = args.at(-1), url = args.at(-2);
    if (failFor.some(part => url.includes(part))) return { status: 128, stderr: `fatal: unable to access '${url}'\n` };
    fs.mkdirSync(target, { recursive: true });
    return { status: 0, stderr: '' };
  };
}
const quiet = () => { const lines = []; return { lines, io: { log: line => lines.push(String(line)), error: line => lines.push(String(line)) } }; };

test('the sources are exactly the three the SessionStart hook used to clone, into the same directories', () => {
  assert.deepEqual(SKILL_SOURCES.map(s => [s.name, s.url]), [
    ['catalog', 'https://github.com/davila7/claude-code-templates.git'],
    ['anthropic-skills', 'https://github.com/anthropics/skills.git'],
    ['personal-skills', 'https://github.com/avelikiy/ai-agent-skills.git'],
  ]);
});

test('sync clones each missing source with git clone --depth=1 into ~/.great_cto/<name>, and nothing else', t => {
  const home = temp(t), calls = [];
  const results = syncSkills({ home, run: recorder(calls) });
  assert.deepEqual(calls, SKILL_SOURCES.map(s => ['git', 'clone', '--depth=1', s.url, path.join(home, '.great_cto', s.name)]));
  assert.deepEqual(results.map(r => [r.name, r.state]), [['catalog', 'cloned'], ['anthropic-skills', 'cloned'], ['personal-skills', 'cloned']]);
  for (const s of SKILL_SOURCES) assert.ok(fs.statSync(path.join(home, '.great_cto', s.name)).isDirectory(), s.name);
});

test('a source that is already there is left alone: no git call, and the way to refresh it is named', t => {
  const home = temp(t), calls = [];
  fs.mkdirSync(path.join(home, '.great_cto', 'anthropic-skills'), { recursive: true });
  const results = syncSkills({ home, run: recorder(calls) });
  assert.deepEqual(calls.map(c => c.at(-1)), ['catalog', 'personal-skills'].map(n => path.join(home, '.great_cto', n)));
  const present = results.find(r => r.name === 'anthropic-skills');
  assert.equal(present.state, 'present');
  assert.match(present.detail, /git -C .*anthropic-skills pull/);
});

test('one failed clone does not stop the others, and is reported with git\'s own words', t => {
  const home = temp(t), calls = [];
  const results = syncSkills({ home, run: recorder(calls, { failFor: ['anthropics'] }) });
  assert.equal(calls.length, 3, 'all three were tried');
  assert.deepEqual(results.map(r => r.state), ['cloned', 'failed', 'cloned']);
  assert.match(results[1].detail, /unable to access/);
});

test('git missing is a failure with a reason, not a crash', t => {
  const home = temp(t);
  const results = syncSkills({ home, run: () => ({ status: null, error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }), stderr: '' }) });
  assert.deepEqual(results.map(r => r.state), ['failed', 'failed', 'failed']);
  assert.match(results[0].detail, /git is not installed/);
});

test('the command: sync exits 0 when nothing failed and 1 when something did; it prints one line per source', t => {
  const home = temp(t);
  const ok = quiet();
  assert.equal(runSkillsCommand(['sync'], ok.io, { home, run: recorder([]) }), 0);
  assert.equal(ok.lines.filter(l => /catalog|anthropic-skills|personal-skills/.test(l)).length >= 3, true);
  const bad = quiet();
  assert.equal(runSkillsCommand(['sync'], bad.io, { home: temp(t), run: recorder([], { failFor: ['skills.git'] }) }), 1);
  assert.match(bad.lines.join('\n'), /failed/);
});

test('the command: no verb, an unknown verb and --help are usage, and none of them clones anything', t => {
  for (const [argv, code] of [[[], 2], [['bogus'], 2], [['--help'], 0], [['help'], 0]]) {
    const calls = [], out = quiet();
    assert.equal(runSkillsCommand(argv, out.io, { home: temp(t), run: recorder(calls) }), code, argv.join(' '));
    assert.match(out.lines.join('\n'), /great-cto skills sync/);
    assert.deepEqual(calls, []);
  }
});

// ── through the real CLI entry, with a git that is a script ──────────────────

test('great-cto skills sync, run for real with a stand-in git: the three clones happen, with these arguments, only on request', t => {
  const root = temp(t), home = path.join(root, 'home'), bin = path.join(root, 'bin'), log = path.join(root, 'git.log');
  fs.mkdirSync(home); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nfor last; do :; done\nmkdir -p "$last"\n`, { mode: 0o755 });
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, NO_COLOR: '1', DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };

  const quietRun = spawnSync(process.execPath, [INDEX, 'skills'], { env, encoding: 'utf8', cwd: root });
  assert.equal(quietRun.status, 2, quietRun.stdout + quietRun.stderr);
  assert.equal(fs.existsSync(log), false, 'without the verb nothing was cloned');

  const r = spawnSync(process.execPath, [INDEX, 'skills', 'sync'], { env, encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), SKILL_SOURCES.map(s => `clone --depth=1 ${s.url} ${path.join(home, '.great_cto', s.name)}`));
  for (const s of SKILL_SOURCES) assert.ok(fs.statSync(path.join(home, '.great_cto', s.name)).isDirectory());

  const again = spawnSync(process.execPath, [INDEX, 'skills', 'sync'], { env, encoding: 'utf8', cwd: root });
  assert.equal(again.status, 0);
  assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 3, 'a second sync clones nothing more');
});
