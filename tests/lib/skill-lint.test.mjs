// skill-lint — skills/*/SKILL.md are checked like agents are (agent-prompt-lint):
// frontmatter that loads, a name that matches its directory, a description the
// model can route on, a size budget, no dangling repo references, no private paths.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintSkills, parseFrontmatter } from '../../scripts/skill-lint.mjs';

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESC = 'A description long enough for the model to route on, well over forty characters.';

function repo(skills, extraFiles = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-lint-'));
  made.push(root);
  for (const [name, text] of Object.entries(skills)) {
    fs.mkdirSync(path.join(root, 'skills', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', name, 'SKILL.md'), text);
  }
  for (const [rel, text] of Object.entries(extraFiles)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const skill = (name, body = 'Body.\n', desc = DESC) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`;
const rules = (r, name) => r.errors.filter((e) => e.skill === name).map((e) => e.rule);

test('parseFrontmatter reads block scalars, nested maps and lists', () => {
  const fm = parseFrontmatter('---\nname: x\ndescription: >\n  folded\n  text\nmetadata:\n  a: 1\ntags:\n  - one\n---\nbody');
  assert.equal(fm.data.name, 'x');
  assert.equal(fm.data.description, 'folded text');
  assert.equal(fm.body, 'body');
});

test('a clean skill has no findings', () => {
  const root = repo({ good: skill('good', 'See `scripts/lib/real.mjs` and [ref](references/a.md).\n') },
    { 'scripts/lib/real.mjs': '', 'skills/good/references/a.md': '' });
  const r = lintSkills({ repoRoot: root });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.skills, 1);
});

test('each error kind is reported against its skill', () => {
  const root = repo({
    'no-fm': 'just text, no frontmatter\n',
    'bad-yaml': '---\nname: bad-yaml\n: broken\n---\nbody\n',
    'wrong-name': skill('other-name'),
    'no-desc': '---\nname: no-desc\n---\nbody\n',
    'short-desc': skill('short-desc', 'b\n', 'too short'),
    'long-desc': skill('long-desc', 'b\n', 'x'.repeat(1025)),
    'dangling': skill('dangling', 'Run `scripts/lib/missing.mjs` and read [gone](gone.md).\n'),
    'private': skill('private', 'Log is at /Users/someone/work/log.txt and /home/dev/x.\n'),
  });
  const r = lintSkills({ repoRoot: root });
  assert.deepEqual(rules(r, 'no-fm'), ['SK-001']);
  assert.deepEqual(rules(r, 'bad-yaml'), ['SK-001']);
  assert.deepEqual(rules(r, 'wrong-name'), ['SK-002']);
  assert.deepEqual(rules(r, 'no-desc'), ['SK-003']);
  assert.deepEqual(rules(r, 'short-desc'), ['SK-003']);
  assert.deepEqual(rules(r, 'long-desc'), ['SK-003']);
  assert.deepEqual(rules(r, 'dangling'), ['SK-005', 'SK-005']);
  assert.deepEqual(rules(r, 'private'), ['SK-006', 'SK-006']);
});

test('placeholders, URLs, anchors and globs are not dangling references', () => {
  const root = repo({ ok: skill('ok', [
    'See [site](https://example.com), [top](#top), [mail](mailto:a@b.c).',
    'Write `scripts/{name}.mjs`, `agents/<slug>.md`, `skills/*/SKILL.md`, `scripts/lib/…`.',
    'Home is `/Users/<username>/` or `$HOME`.',
  ].join('\n')) });
  const r = lintSkills({ repoRoot: root });
  assert.deepEqual(r.errors, []);
});

test('body over 20 KB warns; an allow-listed heavy skill does not', () => {
  const big = 'x'.repeat(21 * 1024);
  const root = repo({ heavy: skill('heavy', big), 'ui-ux-pro-max': skill('ui-ux-pro-max', big) });
  const r = lintSkills({ repoRoot: root });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.map((w) => `${w.skill}:${w.rule}`), ['heavy:SK-004']);
});

test('CLI exits 1 on errors and 0 on warnings only', () => {
  const bin = path.join(REPO, 'scripts', 'skill-lint.mjs');
  const bad = repo({ bad: skill('mismatch') });
  assert.throws(() => execFileSync(process.execPath, [bin, '--root', bad], { stdio: 'pipe' }), (e) => e.status === 1);
  const warn = repo({ heavy: skill('heavy', 'x'.repeat(21 * 1024)) });
  const out = execFileSync(process.execPath, [bin, '--root', warn], { encoding: 'utf8' });
  assert.match(out, /heavy/);
});

test('the real repo lints with 0 errors', () => {
  const r = lintSkills({ repoRoot: REPO });
  assert.ok(r.skills >= 40, `expected the repo's skills, saw ${r.skills}`);
  assert.deepEqual(r.errors, [], r.errors.map((e) => `${e.skill} ${e.rule} ${e.msg}`).join('\n'));
});
