// security-officer step 4b could not find a secret in history: `git show <sha>:.`
// fails (hidden by 2>/dev/null) and `git log -S "A\|B"` searches a literal string.
// The replacement reads added lines, reports commit/file/kind, never the value, and
// says NOT SCANNED rather than clean when the history cannot be read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanHistory } from '../../scripts/lib/history-secret-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'scripts/lib/history-secret-scan.mjs');
// Assembled at runtime so no fixture in the repository looks like a credential.
const FAKE_AWS = 'AKIA' + 'Q'.repeat(16);
const FAKE_PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

function repo(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-hist-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const git = (...a) => {
    const r = spawnSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  return { d, git, commit(file, text, msg) { fs.writeFileSync(path.join(d, file), text); git('add', file); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD'); } };
}

test('a secret deleted from the code is still found in the commit that added it', async (t) => {
  const r = repo(t);
  const bad = r.commit('config.js', `const key = "${FAKE_AWS}";\n`, 'add config');
  r.commit('config.js', 'const key = process.env.KEY;\n', 'remove key');
  fs.writeFileSync(path.join(r.d, 'id_rsa'), FAKE_PEM + '\n'); r.git('add', 'id_rsa'); r.git('commit', '-q', '-m', 'oops'); r.git('rm', '-q', 'id_rsa'); r.git('commit', '-q', '-m', 'gone');
  const out = await scanHistory({ cwd: r.d });
  assert.equal(out.state, 'scanned');
  assert.deepEqual(out.findings.map((f) => [f.commit, f.file, f.kind]).sort(), [
    [bad.slice(0, 12), 'config.js', 'AWS Access Key ID'],
    [out.findings.find((f) => f.file === 'id_rsa').commit, 'id_rsa', 'PEM private key'],
  ].sort());
  assert.equal(out.partial, false);
});

test('the CLI never prints the value it found', (t) => {
  const r = repo(t);
  r.commit('a.js', `x = "${FAKE_AWS}"\n`, 'a');
  const cli = spawnSync(process.execPath, [CLI, '--cwd', r.d], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /1 finding\(s\), values withheld/);
  assert.match(cli.stdout, /AWS Access Key ID/);
  assert.ok(!cli.stdout.includes(FAKE_AWS) && !cli.stderr.includes(FAKE_AWS), 'the key itself must not appear');
});

test('a clean history is reported as scanned and clean, with the commits read', (t) => {
  const r = repo(t);
  r.commit('a.js', 'x = 1\n', 'a');
  r.commit('a.js', 'x = 2\n', 'b');
  const cli = spawnSync(process.execPath, [CLI, '--cwd', r.d], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /history scanned: all 2 commits — no secret pattern/);
});

test('a directory that is not a repository is NOT SCANNED, never clean', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-nohist-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const cli = spawnSync(process.execPath, [CLI, '--cwd', d], { encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(d) } });
  assert.equal(cli.status, 2);
  assert.match(cli.stdout, /^NOT SCANNED/);
});

test('a repository with no commits yet is scanned and empty, not NOT SCANNED', async (t) => {
  const r = repo(t);
  const out = await scanHistory({ cwd: r.d });
  assert.deepEqual([out.state, out.commits, out.findings.length], ['scanned', 0, 0]);
});

test('a capped walk says how much of the history it read', async (t) => {
  const r = repo(t);
  for (let i = 0; i < 4; i += 1) r.commit('a.js', `x = ${i}\n`, `c${i}`);
  const out = await scanHistory({ cwd: r.d, maxCommits: 2 });
  assert.equal(out.commits, 2);
  assert.equal(out.total, 4);
  assert.equal(out.partial, true);
  const cli = spawnSync(process.execPath, [CLI, '--cwd', r.d, '--max-commits', '2'], { encoding: 'utf8' });
  assert.match(cli.stdout, /2 of 4 commits/);
});

test('security-officer runs the scanner instead of the two lines that could not find anything', () => {
  for (const file of ['agents/security-officer.md', 'agents-full/security-officer.md']) {
    const t = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(t, /history-secret-scan\.mjs/, `${file}: calls the scanner`);
    assert.doesNotMatch(t, /git show \{\}:\./, `${file}: the show line that always printed nothing is gone`);
    assert.doesNotMatch(t, /git log --all -S "BEGIN RSA PRIVATE\\\|/, `${file}: the literal-string pickaxe is gone`);
    assert.match(t, /NOT SCANNED/, `${file}: an unread history is said so`);
  }
});

// Review of 3.75.5 (M4, M5, m8): each of these read as clean.

test('M4a: a file with a non-ASCII name is scanned', async (t) => {
  const r = repo(t);
  r.commit('café.txt', `k = "${FAKE_AWS}"\n`, 'accented name');
  const out = await scanHistory({ cwd: r.d });
  assert.deepEqual(out.findings.map((f) => f.file), ['café.txt']);
});

test('M4b: an added line starting with "++" is content, not a header that hides the rest', async (t) => {
  const r = repo(t);
  r.commit('notes.md', `++ heading\nk = "${FAKE_AWS}"\n`, 'plus-plus line');
  const out = await scanHistory({ cwd: r.d });
  assert.deepEqual(out.findings.map((f) => [f.file, f.kind]), [['notes.md', 'AWS Access Key ID']]);
});

test('M4c: a secret only a merge resolution introduced is found', async (t) => {
  const r = repo(t);
  r.commit('a.txt', 'base\n', 'base');
  const trunk = r.git('rev-parse', '--abbrev-ref', 'HEAD');
  r.git('checkout', '-q', '-b', 'side');
  r.commit('a.txt', 'side\n', 'side');
  r.git('checkout', '-q', trunk);
  r.commit('a.txt', 'main\n', 'main');
  spawnSync('git', ['-C', r.d, 'merge', '-q', 'side'], { encoding: 'utf8' });   // conflicts
  fs.writeFileSync(path.join(r.d, 'a.txt'), `resolved with ${FAKE_AWS}\n`);
  r.git('add', 'a.txt'); r.git('commit', '-q', '--no-edit');
  const merge = r.git('rev-parse', 'HEAD');
  const out = await scanHistory({ cwd: r.d });
  assert.deepEqual(out.findings.map((f) => [f.commit, f.file]), [[merge.slice(0, 12), 'a.txt']]);
});

test('M5: a capped walk with nothing found exits 3 PARTIAL, not 0', (t) => {
  const r = repo(t);
  r.commit('old.js', `k = "${FAKE_AWS}"\n`, 'old secret');
  for (let i = 0; i < 3; i += 1) r.commit('a.js', `x = ${i}\n`, `c${i}`);
  const cli = spawnSync(process.execPath, [CLI, '--cwd', r.d, '--max-commits', '2'], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stdout);
  assert.match(cli.stdout, /^PARTIAL — history scanned: 2 of 4 commits/);
});

test('m8: a shallow clone is PARTIAL, not "all N commits"', (t) => {
  const r = repo(t);
  // The secret is added and then removed, so it lives only in the history a depth-1 clone lacks.
  r.commit('old.js', `k = "${FAKE_AWS}"\n`, 'old secret');
  r.git('rm', '-q', 'old.js'); r.git('commit', '-q', '-m', 'removed');
  r.commit('a.js', 'x = 1\n', 'later');
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-shallow-'));
  t.after(() => fs.rmSync(clone, { recursive: true, force: true }));
  spawnSync('git', ['clone', '-q', '--depth', '1', `file://${r.d}`, clone], { encoding: 'utf8' });
  const cli = spawnSync(process.execPath, [CLI, '--cwd', clone], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stdout);
  assert.match(cli.stdout, /SHALLOW clone/);
});

test('M4c: a secret a merge only carried over from one side stays with the commit that added it', async (t) => {
  const r = repo(t);
  r.commit('a.txt', 'one\ntwo\n', 'base');
  const trunk = r.git('rev-parse', '--abbrev-ref', 'HEAD');
  r.git('checkout', '-q', '-b', 'side');
  const side = r.commit('a.txt', `k = "${FAKE_AWS}"\nside two\n`, 'side adds it');
  r.git('checkout', '-q', trunk);
  r.commit('a.txt', 'main one\nmain two\n', 'main');
  spawnSync('git', ['-C', r.d, 'merge', '-q', 'side'], { encoding: 'utf8' });
  // Keeps the side's line and adds one of its own, so the hunk differs from both
  // parents and --cc shows it: the kept line is '+ ', the new one '++'.
  fs.writeFileSync(path.join(r.d, 'a.txt'), `k = "${FAKE_AWS}"\nresolved\n`);
  r.git('add', 'a.txt'); r.git('commit', '-q', '--no-edit');
  const out = await scanHistory({ cwd: r.d });
  assert.deepEqual(out.findings.map((f) => f.commit), [side.slice(0, 12)]);
});
