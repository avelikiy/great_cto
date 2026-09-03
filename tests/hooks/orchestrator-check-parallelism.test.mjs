/**
 * The measured-parallelism line in the SubagentStart contract print.
 *
 * The line is produced inside a `try { … } catch {}` — deliberately, because a
 * hook that cannot read a journal still has a contract to print. But that catch
 * will just as happily swallow a renamed export, a moved file, or a syntax error
 * in the module it imports, and the only symptom is one missing line in a wall
 * of hook output that nobody diffs.
 *
 * So the line is asserted here. Without this test the whole measurement can stop
 * working and every run still looks exactly the same — which is the defect the
 * measurement was added to fix, reproduced one level up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, 'scripts', 'hooks', 'orchestrator-check.mjs');

function runHookIn(cwd) {
  return execFileSync('node', [HOOK], { cwd, input: '', encoding: 'utf8', timeout: 20000 });
}

/** A throwaway project with its own contract and journal. */
function project({ journalLines = [], maxStreams = 5 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gc-orch-'));
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared', 'orchestrator.toml'),
    `[parallelism]\nmax_parallel_streams = ${maxStreams}\n`);
  mkdirSync(join(root, '.great_cto'), { recursive: true });
  writeFileSync(join(root, '.great_cto', 'pipeline-runs.jsonl'),
    journalLines.map((o) => JSON.stringify(o)).join('\n') + (journalLines.length ? '\n' : ''));
  // The hook imports ../lib/agent-runs.mjs relative to its own path, so it reads
  // the repository's module wherever the project lives.
  return root;
}

const at = (min) => new Date(Date.UTC(2026, 8, 3, 12, min, 0)).toISOString();

test('the contract print carries a measured line beside the declared ceiling', () => {
  const out = runHookIn(project());
  assert.match(out, /Max parallel streams\s+: 5/);
  assert.match(out, /Measured so far\s+:/, 'the measured line must be printed');
});

test('overlapping journal rows are reported as parallel, against the ceiling', () => {
  const root = project({ journalLines: [
    { v: 1, agent: 'architect', outcome: 'stop', started_at: at(0), ts: at(10) },
    { v: 1, agent: 'pm', outcome: 'stop', started_at: at(5), ts: at(15) },
  ] });
  assert.match(runHookIn(root), /Measured so far\s+: peak 2 of 5 streams/);
});

test('a serial journal says serial', () => {
  const root = project({ journalLines: [
    { v: 1, agent: 'architect', outcome: 'stop', started_at: at(0), ts: at(5) },
    { v: 1, agent: 'pm', outcome: 'stop', started_at: at(5), ts: at(10) },
  ] });
  assert.match(runHookIn(root), /Measured so far\s+: serial/);
});

test('rows with no start time say NOT MEASURED — never serial', () => {
  // The distinction the whole feature exists for: nobody timed these runs, and
  // reporting that as "serial" would be a measurement the code never took.
  const root = project({ journalLines: [
    { v: 1, agent: 'architect', outcome: 'stop', started_at: null, ts: at(5) },
  ] });
  const out = runHookIn(root);
  assert.match(out, /Measured so far\s+: parallelism NOT MEASURED/);
  assert.doesNotMatch(out, /Measured so far\s+: serial/);
});

test('a project with no journal at all still prints the contract', () => {
  const root = mkdtempSync(join(tmpdir(), 'gc-orch-bare-'));
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared', 'orchestrator.toml'), '[parallelism]\nmax_parallel_streams = 5\n');
  const out = runHookIn(root);
  assert.match(out, /ORCHESTRATOR CONTRACT/);
  assert.match(out, /Measured so far\s+: parallelism NOT MEASURED/);
});
