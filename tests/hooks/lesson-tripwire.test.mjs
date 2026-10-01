// lesson-tripwire — a recorded lesson reaches the model at the moment a call touches
// what it is about, not only at session start where forty others bury it.
//
// Every test builds its own project and HOME; the real lessons are never read.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitLessons, gist, keysOf, buildIndex, matchCall, formatHits } from '../../scripts/hooks/lesson-tripwire.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'lesson-tripwire.mjs');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const LESSONS = `# Project Lessons

## pattern: release-from-main-only

---
date: 2026-09-27
---

**Context:** release.sh pushes the local main ref.

**Decision/Pattern:** Run \`scripts/release.sh\` from main only; on a release branch it tags that branch and pushes a stale main.

**Evidence:**
- file: scripts/release.sh:122

## pattern: never-skip-hooks

**Decision/Pattern:** Do not use \`--no-verify\`; fix what the hook reports.

## pattern: cache-ttl-pricing

**Decision/Pattern:** Price 1-hour cache writes at 2x via \`cacheWriteUsd\` in \`scripts/lib/cost-meter.mjs\`.

## pattern: readme-only

**Decision/Pattern:** Mentions \`README.md\` and nothing specific.
`;

function project(lessons = LESSONS) {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-'));
  const home = mkdtempSync(join(tmpdir(), 'tripwire-home-'));
  made.push(dir, home);
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'lessons.md'), lessons);
  return { dir, home };
}
const hook = ({ dir, home }, payload, env = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ cwd: dir, ...payload }), encoding: 'utf8',
  env: { ...process.env, HOME: home, GREAT_CTO_DISABLE_LESSON_TRIPWIRES: '', ...env },
});

test('splitLessons, gist and keysOf read the lesson format as it is written', () => {
  const ls = splitLessons(LESSONS);
  assert.deepEqual(ls.map((l) => l.title), ['release-from-main-only', 'never-skip-hooks', 'cache-ttl-pricing', 'readme-only']);
  assert.match(gist(ls[0].text), /^Run `scripts\/release\.sh` from main only/);
  assert.deepEqual(keysOf(ls[0].text).sort(), ['scripts/release.sh'], 'the evidence line number is not part of the key');
  assert.deepEqual(keysOf(ls[1].text), ['--no-verify']);
  assert.deepEqual(keysOf(ls[2].text).sort(), ['cacheWriteUsd', 'scripts/lib/cost-meter.mjs']);
  assert.deepEqual(keysOf(ls[3].text), [], 'a generic name is not a key');
});

test('a key most lessons share points at none of them and is dropped', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ title: `l${i}`, text: `**Decision/Pattern:** see \`shared/pipeline.toml\`${i === 0 ? ' and `scripts/only-here.mjs`' : ''}` }));
  const idx = buildIndex(many);
  assert.deepEqual(idx.map((l) => l.keys), [['scripts/only-here.mjs']], 'shared/pipeline.toml is in 6 of 6 — dropped; lessons left with no key drop out');
});

test('matchCall: the edited file, a word of the shell command, an identifier being written', () => {
  const idx = buildIndex(splitLessons(LESSONS));
  const titles = (c) => matchCall(idx, c).map((h) => h.lesson.title);
  assert.deepEqual(titles({ file: 'scripts/release.sh' }), ['release-from-main-only']);
  assert.deepEqual(titles({ words: ['bash', 'scripts/release.sh', '3.43.0'] }), ['release-from-main-only']);
  assert.deepEqual(titles({ words: ['git', 'commit', '--no-verify', '-m', 'x'] }), ['never-skip-hooks']);
  assert.deepEqual(titles({ file: 'src/x.ts', text: 'const usd = cacheWriteUsd(u, p);' }), ['cache-ttl-pricing']);
  assert.deepEqual(titles({ file: 'src/unrelated.ts', text: 'nothing' }), []);
  assert.deepEqual(titles({ words: ['git', 'commit', '-m', 'mentions scripts/release.sh'] }).length, 0, 'a message string is one word, not the path');
});

test('the hook adds the lesson before the call, once per session, and never blocks', () => {
  const p = project();
  const payload = { tool_name: 'Bash', session_id: `s${Date.now()}`, tool_input: { command: 'bash scripts/release.sh 3.43.0 --skip-bump' } };
  const first = hook(p, payload);
  assert.equal(first.status, 0);
  const ctx = JSON.parse(first.stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'PreToolUse');
  assert.equal(ctx.permissionDecision, undefined, 'a reminder, not a decision');
  assert.match(ctx.additionalContext, /release-from-main-only.*scripts\/release\.sh.*from main only/s);
  assert.equal(hook(p, payload).stdout, '', 'the same lesson is not repeated in the session');
});

test('an edit trips on its file; silent with the opt-out, with no lessons, or on a broken payload', () => {
  const p = project();
  const edit = { tool_name: 'Edit', session_id: `e${Date.now()}`, tool_input: { file_path: join(p.dir, 'scripts/lib/cost-meter.mjs'), new_string: 'x' } };
  assert.match(JSON.parse(hook(p, edit).stdout).hookSpecificOutput.additionalContext, /cache-ttl-pricing/);
  assert.equal(hook(p, { ...edit, session_id: 'opt' }, { GREAT_CTO_DISABLE_LESSON_TRIPWIRES: '1' }).stdout, '');
  assert.equal(hook(project('# empty\n'), { ...edit, session_id: 'none' }).stdout, '');
  const bad = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
});

test('at most two lessons per call, and the output stays short', () => {
  const lessons = Array.from({ length: 5 }, (_, i) => `## pattern: p${i}\n\n**Decision/Pattern:** ${'x'.repeat(400)} \`scripts/hot.sh\`\n`).join('\n');
  const idx = buildIndex(splitLessons(lessons), 2); // no IDF cut: every lesson shares the key on purpose here
  const text = formatHits(matchCall(idx, { file: 'scripts/hot.sh' }));
  assert.equal((text.match(/^- "/gm) || []).length, 2);
  assert.ok(text.length <= 700);
});

// ── Noise, measured ─────────────────────────────────────────────────────────
import { shellActionWords } from '../../scripts/hooks/lesson-tripwire.mjs';
import { readFileSync as readText, existsSync as exists } from 'node:fs';

test('a command that only reads a file does not trip on it; one that runs or writes it does', () => {
  // The first noise the tripwire produced (2026-09-28): a grep over the board's
  // index.html raised the lesson about the board's blocked-session view.
  for (const reader of ['grep -n x packages/board/public/index.html', 'git log -- scripts/release.sh', 'sed -n 1,5p scripts/release.sh', 'cat scripts/release.sh | head']) {
    assert.deepEqual(shellActionWords(reader), [], reader);
  }
  assert.ok(shellActionWords('bash scripts/release.sh 3.45.0').includes('scripts/release.sh'));
  assert.ok(shellActionWords('sed -i s/a/b/ scripts/release.sh').includes('scripts/release.sh'));
  assert.ok(shellActionWords('cat a && node scripts/release.sh').includes('scripts/release.sh'), 'the reader drops out, the runner stays');
});

test('each hint is recorded in the project events log — facts only — and nothing is created outside a project', () => {
  const p = project();
  const r = hook(p, { tool_name: 'Bash', session_id: `ev${Date.now()}`, tool_input: { command: 'bash scripts/release.sh 1.0.0' } });
  assert.ok(r.stdout, 'it hinted');
  const events = readText(join(p.dir, '.great_cto', 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const e = events.at(-1);
  assert.equal(e.kind, 'hint');
  assert.equal(e.hook, 'lesson-tripwire');
  assert.equal(e.host, 'claude');
  assert.equal(e.chars, JSON.parse(r.stdout).hookSpecificOutput.additionalContext.length);
  assert.ok(!JSON.stringify(e).includes('from main only'), 'what the hint said is not recorded');
  const bare = mkdtempSync(join(tmpdir(), 'tripwire-bare-'));
  made.push(bare);
  hook({ dir: bare, home: p.home }, { tool_name: 'Bash', session_id: 'b', tool_input: { command: 'bash scripts/release.sh' } });
  assert.equal(exists(join(bare, '.great_cto')), false, 'no .great_cto is created where there was none');
});
