// /inbox reads its data by section, and the sections did not exist.
//
// commands/inbox.md told the agent to read `## OPEN_GATES`, `## P0_OPEN`,
// `## BLOCKED` and nine more. scripts/cmd-data/inbox-data.sh printed none of those
// headings, and had not since it was written on 2026-05-09: every block's output
// ran into the next, and the agent was left to guess where a gate list ended and a
// git log began. `## BLOCKED` was promised and nothing produced it at all.
//
// This runs the real helper in a throwaway project, with `bd` and `gh` replaced
// by stubs on PATH so the result does not depend on this machine's beads store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HELPER = join(ROOT, 'scripts/cmd-data/inbox-data.sh');

const BD_STUB = `#!/usr/bin/env bash
args="$*"
case "$args" in
  *--json*) printf '[{"id":"t-1","title":"gate:ship — checkout","status":"open","created_at":"2026-09-01T00:00:00Z"}]\\n' ;;
  "list --label gate --status open") echo "○ t-1 ● P1 gate:ship — checkout" ;;
  "list --status open --priority 0") echo "○ t-2 ● P0 checkout returns 500" ;;
  "list --status blocked") echo "○ t-3 ● P1 waiting on a decision" ;;
  "list --label production --status open") echo "No issues found." ;;
  *) : ;;
esac
exit 0
`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-inbox-'));
  const bin = join(dir, '.stub-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'bd'), BD_STUB); chmodSync(join(bin, 'bd'), 0o755);
  writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\nexit 0\n'); chmodSync(join(bin, 'gh'), 0o755);
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  writeFileSync(join(dir, '.great_cto/PROJECT.md'), 'archetype: saas\narchetype_confidence: low\narchetype_alternatives: marketplace\n');
  writeFileSync(join(dir, '.great_cto/oncall-schedule.md'), 'Current: someone\n');
  mkdirSync(join(dir, 'docs/rfcs'), { recursive: true });
  writeFileSync(join(dir, 'docs/rfcs/RFC-001-x.md'), 'Status: DRAFT\nReview deadline: 2020-01-01\n');
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'recent work');
  return { dir, bin };
}

function runHelper() {
  const { dir, bin } = fixture();
  try {
    const r = spawnSync('bash', [HELPER], {
      cwd: dir, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOURS: '24' },
    });
    return { out: r.stdout || '', status: r.status };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const { out, status } = runHelper();
const lines = out.split('\n');
const headers = lines.filter((l) => /^## [A-Z0-9_]+$/.test(l)).map((l) => l.slice(3));

test('the helper runs and exits 0', () => {
  assert.equal(status, 0);
});

test('no output line sits outside a section', () => {
  const before = [];
  for (const l of lines) { if (/^## [A-Z0-9_]+$/.test(l)) break; if (l.trim()) before.push(l); }
  assert.deepEqual(before, [], 'everything above the first heading is output the agent cannot place');
});

test('no section is printed empty', () => {
  const empty = [];
  lines.forEach((l, i) => {
    if (!/^## [A-Z0-9_]+$/.test(l)) return;
    const next = lines.slice(i + 1).find((x) => true);
    if (next === undefined || next.trim() === '' || /^## /.test(next)) empty.push(l);
  });
  assert.deepEqual(empty, [], 'a heading with nothing under it reads as a finding');
});

test('the sections the fixture should produce are there', () => {
  for (const s of ['ARCHETYPE_CONFIDENCE', 'OPEN_GATES', 'P0_OPEN', 'BLOCKED', 'RECENT_ACTIVITY', 'RFC_OVERDUE', 'ON_CALL', 'GATE_WAIT']) {
    assert.ok(headers.includes(s), `## ${s} missing; printed: ${headers.join(', ')}`);
  }
});

test('an empty bd list is no section, not a section saying "No issues found."', () => {
  // Found by running the helper against a real store: bd prints that line for an
  // empty list, so OPEN_GATES, P0_OPEN and PRODUCTION_OPEN all appeared — headings
  // that read as "something needs you" — beside a GATE_WAIT saying no gate was open.
  assert.ok(!headers.includes('PRODUCTION_OPEN'), 'the stub listed no production task');
  const onlyEmpty = [];
  lines.forEach((l, i) => {
    if (/^## [A-Z0-9_]+$/.test(l) && /^No .* found\.?$/.test(lines[i + 1] || '')) onlyEmpty.push(l);
  });
  assert.deepEqual(onlyEmpty, []);
});

test('BLOCKED carries blocked tasks, not something else', () => {
  const i = lines.indexOf('## BLOCKED');
  assert.match(lines[i + 1] || '', /waiting on a decision/);
});

test('every section the helper prints is one the command tells the agent about', () => {
  const doc = readFileSync(join(ROOT, 'commands/inbox.md'), 'utf8');
  const missing = [...new Set(headers)].filter((h) => !doc.includes(`## ${h}`));
  assert.deepEqual(missing, [], 'a section the command does not name is output the agent is not told to read');
});

test('the helper and the command name the same sections, both ways', () => {
  // The fixture reaches only some blocks, so this compares the text: a section the
  // helper can emit that the command never mentions, or — the bug this file
  // exists for — a section the command promises that nothing produces.
  const sh = readFileSync(HELPER, 'utf8');
  const emitted = new Set([...sh.matchAll(/^emit ([A-Z0-9_]+) /gm)].map((m) => m[1]));
  emitted.add('STALE_GATES'); emitted.add('GATE_WAIT');       // printed by scripts/lib/flow-metrics.mjs
  const doc = readFileSync(join(ROOT, 'commands/inbox.md'), 'utf8');
  const promised = new Set([...doc.matchAll(/^\| `## ([A-Z0-9_]+)` \|/gm)].map((m) => m[1]));
  assert.ok(emitted.size > 20 && promised.size > 20, `parsed ${emitted.size} emitted and ${promised.size} promised — a pattern stopped matching`);
  assert.deepEqual([...emitted].filter((s) => !promised.has(s)), [], 'emitted but not in the command table');
  assert.deepEqual([...promised].filter((s) => !emitted.has(s)), [], 'promised by the command and produced by nothing');
});

test('the command no longer says the headings are missing', () => {
  const doc = readFileSync(join(ROOT, 'commands/inbox.md'), 'utf8');
  assert.doesNotMatch(doc, /Only `## STALE_GATES` and `## GATE_WAIT` are printed as headings today/);
});
