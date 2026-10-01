// command-subcommands-b — one job, one command (3.40 consolidation, stream B).
//
// Six commands were folded into three: the agent lifecycle into /agent, the POC
// promotion into /poc, on-call into /ownership. A merge like that fails quietly in
// two ways — the dispatch forgets a subcommand (it falls through to the default and
// does the wrong job), or the dispatch names one whose section was never moved (the
// model is told to run instructions that are not there). Both are checked here, and
// so is the thing the merge was for: the old files are gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** The first ```bash block containing `case "$…" in`, i.e. the dispatch. */
function dispatchBlock(md) {
  for (const m of md.matchAll(/```bash\n([\s\S]*?)```/g)) {
    if (/case "\$\w+" in/.test(m[1])) return m[1];
  }
  return null;
}

/** Case labels of the dispatch: `review)`, `status|"")`, `show|map|set|verify)`. */
function caseLabels(block) {
  const labels = new Set();
  for (const m of block.matchAll(/^\s*([\w|"-]+)\)/gm)) {
    for (const l of m[1].split('|')) labels.add(l.replace(/"/g, ''));
  }
  return labels;
}

const COMMANDS = [
  {
    file: 'commands/agent.md',
    subs: ['review', 'evals', 'evolve', 'retire'],
    section: (s) => new RegExp(`^## Subcommand: ${s}\\b`, 'm'),
  },
  {
    file: 'commands/poc.md',
    subs: ['start', 'decide', 'extend', 'status', 'promote'],
    section: (s) => new RegExp(`^## Action: ${s}\\b`, 'm'),
  },
  {
    file: 'commands/ownership.md',
    subs: ['show', 'map', 'set', 'verify', 'oncall'],
    section: (s) => new RegExp(`^## Action: \`${s}\\b`, 'm'),
  },
];

for (const { file, subs, section } of COMMANDS) {
  test(`${file}: the dispatch names every subcommand`, () => {
    const block = dispatchBlock(read(file));
    assert.ok(block, `${file} has no \`case "$…" in\` dispatch block`);
    const labels = caseLabels(block);
    for (const s of subs) assert.ok(labels.has(s), `${file} dispatch does not route \`${s}\``);
  });

  test(`${file}: every subcommand has its own section`, () => {
    const md = read(file);
    for (const s of subs) assert.match(md, section(s), `${file} has no section for \`${s}\``);
  });
}

test('/ownership oncall keeps all four on-call actions', () => {
  const md = read('commands/ownership.md');
  const oncall = md.slice(md.indexOf('## Action: `oncall`'));
  for (const a of ['who', 'schedule', 'handoff', 'escalate']) {
    assert.match(oncall, new RegExp(`^### \`oncall ${a}\\b`, 'm'), `oncall section lost \`${a}\``);
  }
});

test('/poc with an unrecognised first word still starts a POC', () => {
  const block = dispatchBlock(read('commands/poc.md'));
  assert.match(block, /^\s*\*\)\s*ACTION=start\b/m, '`/poc <hypothesis>` must stay a start');
});

test('the folded commands are gone — one job, one command', () => {
  for (const old of ['agent-review', 'agent-retire', 'gen-evals', 'prompt-evolve', 'promote', 'oncall']) {
    assert.ok(!existsSync(path.join(ROOT, 'commands', `${old}.md`)), `commands/${old}.md still ships`);
  }
});
