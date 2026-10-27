import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { nativeSessionContext } from '../../scripts/hooks/native-session-context.mjs';

const entry = resolve('scripts/hooks/native-session-context.mjs');
function fixture(t, phase = 'implementation') {
 const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'native-startup-')));
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 const project = join(root, 'project'), plugin = join(root, 'plugin');
 fs.mkdirSync(join(project, '.great_cto'), { recursive: true });
 fs.mkdirSync(join(plugin, 'scripts/hooks'), { recursive: true });
 fs.writeFileSync(join(plugin, 'scripts/hooks/operating-rules.md'), 'Selected plugin rules.\n');
 fs.writeFileSync(join(project, '.great_cto/PROJECT.md'), 'phase: ' + phase + '\nPrivate project fixture.\n');
 for (const name of ['brain.md', 'CODEBASE.md', 'HANDOFF.md', 'local.md']) fs.writeFileSync(join(project, '.great_cto', name), 'Owned ' + name + '\n');
 return { root, project, plugin };
}
const selected = f => ({ projectRoot: f.project, pluginRoot: f.plugin });
function snapshot(root) {
 const result = {};
 for (const name of fs.readdirSync(root).sort()) {
  const p = join(root, name), s = fs.lstatSync(p);
  result[name] = s.isDirectory() ? snapshot(p) : { mode: s.mode, bytes: fs.readFileSync(p).toString('base64') };
 }
 return result;
}
test('selected implementation context is private, bounded and grants no authority', async t => {
 const f = fixture(t), before = snapshot(f.root), r = await nativeSessionContext(selected(f));
 assert.equal(r.summary.state, 'CONTEXT_ONLY'); assert.equal(r.summary.authority, 'NONE');
 assert.equal(r.summary.phase, 'implementation');
 assert.deepEqual(r.summary.documents.map(d => d.name), ['operating-rules.md', 'PROJECT.md', 'brain.md', 'CODEBASE.md', 'HANDOFF.md', 'local.md']);
 assert(r.summary.documents.every(d => /^[a-f0-9]{64}$/.test(d.sha256)));
 const context = r.reply.hookSpecificOutput.additionalContext;
 assert.match(context, /Private project fixture/); assert.match(context, /untrusted/i);
 assert(!JSON.stringify(r.summary).includes('Private project fixture')); assert(!JSON.stringify(r.summary).includes(f.root));
 assert(!context.includes(f.root)); assert.deepEqual(snapshot(f.root), before);
});
test('phase selection preserves unknown rather than inventing a successful workflow', async t => {
 for (const phase of ['planning', 'review', 'release', 'unrecognized']) {
  const f = fixture(t, phase), r = await nativeSessionContext(selected(f));
  assert.equal(r.summary.phase, phase === 'unrecognized' ? 'unknown' : phase);
  const names = r.summary.documents.map(d => d.name);
  assert.equal(names.includes('CODEBASE.md'), phase === 'implementation');
  assert.equal(names.includes('brain.md'), phase === 'planning');
  assert.equal(names.includes('HANDOFF.md'), phase !== 'planning' && phase !== 'unrecognized');
  assert(!JSON.stringify(r.summary).includes('gates=0'));
 }
});
test('duplicate phase declarations refuse rather than selecting one authority', async t => {
 const f = fixture(t); fs.appendFileSync(join(f.project, '.great_cto/PROJECT.md'), 'phase: review\n');
 assert.equal((await nativeSessionContext(selected(f))).summary.state, 'REFUSED');
});
test('optional context absence is explicit and does not create files', async t => {
 const f = fixture(t); fs.unlinkSync(join(f.project, '.great_cto/local.md'));
 const before = snapshot(f.root), r = await nativeSessionContext(selected(f));
 assert.equal(r.summary.state, 'CONTEXT_ONLY'); assert(r.summary.missing.includes('local.md'));
 assert.deepEqual(snapshot(f.root), before);
});
test('missing and noncanonical roots refuse with no partial context or paths', async t => {
 const f = fixture(t);
 for (const opts of [{}, { ...selected(f), projectRoot: '.' }, { ...selected(f), pluginRoot: f.project }, { ...selected(f), projectRoot: f.project + '/..' }, { ...selected(f), pluginRoot: join(f.root, 'missing') }]) {
  const r = await nativeSessionContext(opts); assert.equal(r.summary.state, 'REFUSED'); assert.equal(r.reply, null);
  assert(!JSON.stringify(r).includes(f.root)); assert(!JSON.stringify(r).includes('Private project fixture'));
 }
});
test('project and state-directory symlinks are refused', async t => {
 const f = fixture(t), alias = join(f.root, 'alias'); fs.symlinkSync(f.project, alias);
 assert.equal((await nativeSessionContext({ ...selected(f), projectRoot: alias })).summary.state, 'REFUSED');
 fs.renameSync(join(f.project, '.great_cto'), join(f.root, 'state'));
 fs.symlinkSync(join(f.root, 'state'), join(f.project, '.great_cto'));
 assert.equal((await nativeSessionContext(selected(f))).summary.state, 'REFUSED');
});
test('untrusted option shapes and accessors refuse without invocation', async t => {
 const f = fixture(t); let invoked = false;
 const getter = { pluginRoot: f.plugin }; Object.defineProperty(getter, 'projectRoot', { enumerable: true, get() { invoked = true; throw Error('must not invoke'); } });
 for (const options of [null, [], Object.create(selected(f)), getter, { ...selected(f), extra: 'ignored authority' }]) {
  assert.equal((await nativeSessionContext(options)).summary.state, 'REFUSED');
 }
 assert.equal(invoked, false);
});
test('final-file symlinks and hard links are refused, never returned', async t => {
 for (const kind of ['symlink', 'hardlink']) {
  const f = fixture(t), target = join(f.root, 'foreign'), local = join(f.project, '.great_cto/local.md');
  fs.writeFileSync(target, 'Must not appear.'); fs.unlinkSync(local);
  kind === 'symlink' ? fs.symlinkSync(target, local) : fs.linkSync(target, local);
  const r = await nativeSessionContext(selected(f)); assert.equal(r.summary.state, 'REFUSED'); assert.equal(r.reply, null);
 }
});
test('plugin rules intermediate symlink is refused', async t => {
 const f = fixture(t); fs.renameSync(join(f.plugin, 'scripts/hooks'), join(f.root, 'rules'));
 fs.symlinkSync(join(f.root, 'rules'), join(f.plugin, 'scripts/hooks'));
 assert.equal((await nativeSessionContext(selected(f))).summary.state, 'REFUSED');
});
test('per-file, total-byte and serialized-output bounds refuse without partial text', async t => {
 for (const mode of ['file', 'total', 'serialized']) {
  const f = fixture(t);
  if (mode === 'file') fs.writeFileSync(join(f.project, '.great_cto/local.md'), 'x'.repeat(65537));
  if (mode === 'total') for (const n of ['brain.md', 'CODEBASE.md']) fs.writeFileSync(join(f.project, '.great_cto', n), 'x'.repeat(65536));
  if (mode === 'serialized') fs.writeFileSync(join(f.project, '.great_cto/local.md'), '\u0001'.repeat(60000));
  const r = await nativeSessionContext(selected(f)); assert.equal(r.summary.state, 'REFUSED', mode); assert.equal(r.reply, null);
 }
});
test('invalid UTF-8 refuses without exposing partial document bytes', async t => {
 const f = fixture(t); fs.writeFileSync(join(f.project, '.great_cto/local.md'), Buffer.from([0xc0, 0xaf]));
 assert.equal((await nativeSessionContext(selected(f))).summary.state, 'REFUSED');
});
test('descriptor drift during a real read is detected without a production test hook', async t => {
 const f = fixture(t), target = join(f.project, '.great_cto/PROJECT.md'), inode = fs.statSync(target).ino;
 const original = fs.readSync; let changed = false;
 fs.readSync = function(fd, ...args) {
  const n = original.call(this, fd, ...args);
  if (!changed && fs.fstatSync(fd).ino === inode) { changed = true; fs.appendFileSync(target, 'concurrent change\n'); }
  return n;
 };
 syncBuiltinESMExports();
 try { assert.equal((await nativeSessionContext(selected(f))).summary.state, 'REFUSED'); assert(changed); }
 finally { fs.readSync = original; syncBuiltinESMExports(); }
});
test('real stdio drains more than8192bytes and ignores environment/cache authority', { timeout: 15000 }, async t => {
 const f = fixture(t); fs.writeFileSync(join(f.project, '.great_cto/local.md'), 'local text '.repeat(2000));
 fs.writeFileSync(join(f.root, 'secrets.env'), 'Owned secret fixture, must not be read.');
 const before = snapshot(f.root);
 const p = spawnSync(process.execPath, [entry, '--project-root', f.project, '--plugin-root', f.plugin], {
  cwd: f.root, env: { HOME: f.root, PATH: '/usr/bin:/bin', CLAUDE_PLUGIN_ROOT: join(f.root, 'poisoned-cache') }, encoding: 'utf8', timeout: 5000, maxBuffer: 1048576,
 });
 assert.equal(p.status, 0, p.stderr); assert(p.stdout.length > 8192); assert(p.stdout.length <= 262144);
 assert.match(JSON.parse(p.stdout).hookSpecificOutput.additionalContext, /local text/);
 assert(!p.stdout.includes('Owned secret fixture')); assert.deepEqual(snapshot(f.root), before);
});
test('special files refuse without blocking the native child', { timeout: 15000 }, async t => {
 const f = fixture(t), local = join(f.project, '.great_cto/local.md'); fs.unlinkSync(local);
 const fifo = spawnSync('mkfifo', [local], { encoding: 'utf8', timeout: 2000 }); assert.equal(fifo.status, 0);
 const p = spawnSync(process.execPath, [entry, '--project-root', f.project, '--plugin-root', f.plugin], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 3000 });
 assert.equal(p.status, 2, p.stderr); assert.equal(p.stdout, ''); assert.match(p.stderr, /^native startup context refused\n$/);
});
test('unknown CLI options including prototype names refuse even with valid roots', async t => {
 const f = fixture(t);
 for (const option of ['constructor', '__proto__', '--unknown']) {
  const p = spawnSync(process.execPath, [entry, '--project-root', f.project, '--plugin-root', f.plugin, option, 'value'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(p.status, 2); assert.equal(p.stdout, ''); assert.equal(p.stderr, 'native startup context refused\n');
 }
});
test('a closed stdout pipe refuses without an unhandled stack or private path', { timeout: 15000 }, async t => {
 const f = fixture(t); fs.writeFileSync(join(f.project, '.great_cto/local.md'), 'bounded text '.repeat(3000));
 const p = spawn(process.execPath, [entry, '--project-root', f.project, '--plugin-root', f.plugin], { env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
 t.after(() => { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); });
 let stderr = ''; p.stderr.on('data', b => { stderr += b; }); p.stdout.destroy();
 const code = await new Promise((yes, no) => { p.once('error', no); p.once('close', yes); });
 assert.equal(code, 2); assert.equal(stderr, 'native startup context refused\n');
});
