// Could the dispatcher dispatch here?
//
// Every way the pipeline broke this week failed by silence. The map was
// resolved against the project instead of the plugin, so thirteen of seventeen
// registered projects hit `return process.exit(0)` and said nothing. The budget
// check was wired into `decideNext` and never passed its arguments, so it never
// ran. Both times the machinery reported success while being unable to act.
//
// `guard-parity` asks whether a guard executes; `declared-consumed` asks whether
// a declaration is consumed. This asks the question underneath both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectPipelineHealth, pipelineMapFor, auditPipelineHealth } from '../../scripts/lib/pipeline-health.mjs';

const sandbox = () => mkdtempSync(join(tmpdir(), 'plh-'));
const clean = (d) => rmSync(d, { recursive: true, force: true });
const project = (dir) => { mkdirSync(join(dir, '.great_cto'), { recursive: true }); return dir; };
const withMap = (dir, body = '[transitions.pm]\non = ["DONE"]\nnext = ["senior-dev"]\n') => {
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared', 'pipeline.toml'), body);
  return dir;
};

// ── Which map would be used ─────────────────────────────────────────────────

test('a project-local map wins, so a project can override the chain deliberately', () => {
  const d = sandbox();
  try {
    withMap(d);
    const plugin = join(sandbox(), 'pipeline.toml');
    assert.equal(pipelineMapFor(d, { pluginMap: plugin }).source, 'project');
  } finally { clean(d); }
});

test('without a local map the plugin supplies one', () => {
  const d = sandbox(), p = sandbox();
  try {
    writeFileSync(join(p, 'pipeline.toml'), '[transitions.pm]\n');
    assert.equal(pipelineMapFor(d, { pluginMap: join(p, 'pipeline.toml') }).source, 'plugin');
  } finally { clean(d); clean(p); }
});

test('no map anywhere is reported as none, never as a default', () => {
  const d = sandbox();
  try {
    assert.deepEqual(pipelineMapFor(d, { pluginMap: '/nowhere.toml' }), { path: null, source: 'none' });
  } finally { clean(d); }
});

// ── A project's ability to run ──────────────────────────────────────────────

test('a directory with no .great_cto is not a fault', () => {
  // The dispatcher is right to stay silent there, and a health check that
  // reported it as broken would train people to ignore the check.
  const d = sandbox();
  try {
    const r = projectPipelineHealth({ slug: 'x', path: d });
    assert.equal(r.state, 'not-a-project');
  } finally { clean(d); }
});

test('a great_cto project with no map anywhere is BLOCKED, and says what happens', () => {
  const d = sandbox();
  try {
    project(d);
    const r = projectPipelineHealth({ slug: 'x', path: d }, { pluginMap: '/nowhere.toml' });
    assert.equal(r.state, 'blocked');
    assert.match(r.why, /exits before reading a verdict/);
  } finally { clean(d); }
});

test('a map that parses to no transitions is blocked too', () => {
  // Silence with a file behind it is still silence.
  const d = sandbox();
  try {
    project(d); withMap(d, '# a map with nothing in it\n');
    const r = projectPipelineHealth({ slug: 'x', path: d });
    assert.equal(r.state, 'blocked');
    assert.match(r.why, /declares no transitions/);
  } finally { clean(d); }
});

test('a project that can dispatch says how many transitions and whose map', () => {
  const d = sandbox();
  try {
    project(d); withMap(d);
    const r = projectPipelineHealth({ slug: 'x', path: d });
    assert.equal(r.state, 'ready');
    assert.match(r.why, /1 transitions, map from the project/);
  } finally { clean(d); }
});

// ── The fleet ───────────────────────────────────────────────────────────────

test('an unreadable registry is not an empty fleet', () => {
  // Reporting "0 projects, all healthy" from a file we could not open is this
  // module's own defect, one level up.
  const r = auditPipelineHealth({ registry: '/nowhere/projects.json' });
  assert.equal(r.state, 'unreadable');
  assert.deepEqual(r.rows, []);
});

test('this machine can dispatch in every registered project', () => {
  // The check that keeps the class closed. When it fails, read the row — it
  // names the project and why the dispatcher would exit before acting.
  const r = auditPipelineHealth();
  assert.notEqual(r.state, 'unreadable', r.why);
  const blocked = r.rows.filter((x) => x.state === 'blocked');
  assert.deepEqual(blocked.map((b) => `${b.slug}: ${b.why}`), []);
});
