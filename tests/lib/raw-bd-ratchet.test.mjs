/**
 * Raw `bd` calls outside the task store may only go down.
 *
 * The task store (scripts/lib/task-store.mjs) is meant to be the one door to
 * tracker tasks: it is where a failed read stays a failure and where a write gets
 * an actor. Callers move to it in a later phase. Until they have, this ratchet
 * keeps the debt from growing: a new script, hook or prompt that reaches for `bd`
 * directly fails here and is pointed at `tracker` instead.
 *
 * Three counts, because the three kinds of caller are fixed in different ways:
 *   code     a process launch of `bd` from JavaScript or TypeScript
 *   shell    a `bd <subcommand>` line in a shell script
 *   prompts  a `bd <subcommand>` instruction in an agent, command or skill file
 *
 * The numbers are frozen at what the repository held when the store was added.
 * Lower one when you move a caller; never raise one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Frozen on 2026-11-11, when scripts/lib/task-store.mjs was added.
const FROZEN = { code: 12, shell: 36, prompts: 155 };

/** The only file allowed to launch bd. */
const BACKEND = 'scripts/lib/task-backend-beads.mjs';

const SUBCOMMANDS = 'create|update|close|list|show|dep|ready|search|comment|comments|label|stats';
const LAUNCH = /(?:spawnSync|execFileSync|execFile|execSync|exec|spawn|safeRun)\(\s*(?:BD_BIN|['"]bd['"])/g;
const INSTRUCTION = new RegExp(`(^|[^\\w./-])bd (?:${SUBCOMMANDS})\\b`);

export function countLaunches(source) {
  const code = source.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  return [...code.matchAll(LAUNCH)].length;
}
export function countShellLines(source) {
  return source.split('\n').filter((l) => !/^\s*#/.test(l) && INSTRUCTION.test(l)).length;
}
export function countPromptLines(source) {
  return source.split('\n').filter((l) => INSTRUCTION.test(l)).length;
}

function walk(dir, keep, out = []) {
  let entries;
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const rel = join(dir, e);
    let st;
    try { st = statSync(join(ROOT, rel)); } catch { continue; }
    if (st.isDirectory()) walk(rel, keep, out);
    else if (keep(rel)) out.push(rel);
  }
  return out;
}
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function measure() {
  const isTest = (p) => /\.test\.(mjs|ts|js)$/.test(p);
  const codeFiles = ['scripts', 'packages/board/lib', 'packages/cli/src']
    .flatMap((d) => walk(d, (p) => /\.(mjs|ts|js)$/.test(p) && !isTest(p) && p !== BACKEND));
  const shellFiles = walk('scripts', (p) => p.endsWith('.sh'));
  const promptFiles = ['agents', 'commands', 'skills'].flatMap((d) => walk(d, (p) => p.endsWith('.md')));
  const tally = (files, count) => {
    const per = files.map((f) => [f, count(read(f))]).filter(([, n]) => n > 0);
    return { total: per.reduce((s, [, n]) => s + n, 0), per };
  };
  return {
    code: tally(codeFiles, countLaunches),
    shell: tally(shellFiles, countShellLines),
    prompts: tally(promptFiles, countPromptLines),
  };
}

test('the counters find what they are meant to find', () => {
  // A ratchet that matches nothing passes forever.
  assert.equal(countLaunches(`const r = spawnSync('bd', ['list']);\n// spawnSync('bd', ['quoted in a comment'])\nexecFileSync(BD_BIN, a);`), 2);
  assert.equal(countLaunches(`spawnSync('git', ['status'])`), 0);
  assert.equal(countShellLines(`# bd list in a comment\nid=$(bd create "x")\n  bd close "$id" || true\necho abd list`), 2);
  assert.equal(countPromptLines('Run `bd ready` first.\nThen bd update <id> --status in_progress\nNothing here about beads.'), 2);
  assert.equal(countPromptLines('node scripts/tracker.mjs list'), 0);
  const now = measure();
  assert.ok(now.code.total > 0 && now.shell.total > 0 && now.prompts.total > 0, 'the walk reached real files');
});

test('the backend really is the only exempt file, and it does launch bd', () => {
  assert.ok(countLaunches(read(BACKEND)) >= 1, `${BACKEND} no longer launches bd — the exemption points at nothing`);
});

for (const kind of ['code', 'shell', 'prompts']) {
  test(`raw bd ${kind} calls outside the task store: frozen at ${FROZEN[kind]}, only shrinking`, () => {
    const { total, per } = measure()[kind];
    const where = per.sort((a, b) => b[1] - a[1]).slice(0, 12).map(([f, n]) => `${n}  ${relative('.', f)}`).join('\n  ');
    assert.ok(total <= FROZEN[kind],
      `${total} raw bd ${kind} call(s), up from ${FROZEN[kind]}. New code goes through the task store ` +
      `(scripts/lib/task-store.mjs, or \`node scripts/tracker.mjs …\` from a shell or a prompt), where a failed ` +
      `read is not an empty answer. Largest holders:\n  ${where}`);
    if (total < FROZEN[kind]) {
      assert.fail(`down to ${total} — lower FROZEN.${kind} to ${total} so the ratchet keeps holding`);
    }
  });
}
