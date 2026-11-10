import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, chmodSync, rmSync, copyFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS_TEMP_ANCHOR = realpathSync(tmpdir());
const ORIGINAL_ENV_BY_TEST = new WeakMap();
export const REPO = resolve(HERE, '../../../..');
export const CLI = join(REPO, 'scripts/codex-pipeline.mjs');
export const BOUND_CLI = join(REPO, 'scripts/lib/gate-check-bound.mjs');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
export function writeJSON(path, value) {mkdirSync(dirname(path), {recursive: true, mode: 0o700}); writeFileSync(path, JSON.stringify(value), {mode: 0o600}); chmodSync(path, 0o600);}
export function git(f, ...args) {
  const r = spawnSync('/usr/bin/git', args, {cwd: f.root, env: f.env, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`synthetic git ${args[0]} failed: ${r.stderr}`);
  return r.stdout.trim();
}
export function commit(f, message = 'synthetic committed candidate') {git(f, 'add', '-A'); git(f, '-c', 'commit.gpgsign=false', 'commit', '-qm', message, '--allow-empty');}
export const sequentialGraph = `[transitions.qa-engineer]\non = ["PASS", "DONE"]\nproduces = ["report"]\nnext = ["security-officer"]\n[transitions.security-officer]\non = ["APPROVED", "DONE"]\nproduces = ["report"]\ngate = "gate:ship"\nnext = []\n`;
export const parallelGraph = `[transitions.qa-engineer]\non = ["PASS", "DONE"]\nproduces = ["report"]\njoin = ["security-officer"]\ngate = "gate:ship"\nnext = []\n[transitions.security-officer]\non = ["APPROVED", "DONE"]\nproduces = ["report"]\njoin = ["qa-engineer"]\ngate = "gate:ship"\nnext = []\n`;
export function fixture(t, {graph = sequentialGraph, checks = false} = {}) {
  const base = realpathSync(mkdtempSync(join(HARNESS_TEMP_ANCHOR, 'ship-stage2-'))); chmodSync(base, 0o700);
  const f = {base, cleanupFns: []};
  t.after(async () => {try {for (const cleanup of f.cleanupFns) await cleanup();} finally {rmSync(base, {recursive: true, force: true});}});
  for (const key of ['root', 'store', 'runs', 'tasks', 'home', 'bin', 'pluginRoot', 'journals']) {f[key] = join(base, key); mkdirSync(f[key], {mode: 0o700});}
  f.scenarioPath = join(base, 'scenario.json'); f.callsPath = join(base, 'calls.jsonl'); f.bdCallsPath = join(base, 'bd-calls.jsonl');
  writeJSON(f.scenarioPath, {}); writeFileSync(f.callsPath, '', {mode: 0o600}); writeFileSync(f.bdCallsPath, '', {mode: 0o600});
  for (const [name, source] of [['codex', 'fake-host.mjs'], ['claude', 'fake-host.mjs'], ['bd', 'fake-bd.mjs']]) {
    const body = readFileSync(join(HERE, source), 'utf8').replace('#!/usr/bin/env node', `#!${process.execPath}`);
    writeFileSync(join(f.bin, name), body, {mode: 0o700});
  }
  f.env = {PATH: `${f.bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: f.home, TMPDIR: base, LANG: 'C',
    NODE_OPTIONS: `--import=${join(HERE, 'network-deny.mjs')}`, GREAT_CTO_CODEX_RUNS_DIR: f.runs, GREAT_CTO_TASKS_DIR: f.tasks,
    GREAT_CTO_CODEX_BIN: join(f.bin, 'codex'), GREAT_CTO_CLAUDE_BIN: join(f.bin, 'claude'), GREAT_CTO_DISABLE_EVENTS: '1',
    BD_DISABLE_METRICS: '1', BD_DISABLE_EVENT_FLUSH: '1', BD_DOLT_AUTO_PUSH: 'false',
    SHIP_FIXTURE_SCENARIO: f.scenarioPath, SHIP_FIXTURE_CALLS: f.callsPath, SHIP_FIXTURE_BD_CALLS: f.bdCallsPath,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0'};
  mkdirSync(join(f.root, 'src')); mkdirSync(join(f.root, 'docs')); mkdirSync(join(f.root, '.great_cto'));
  writeFileSync(join(f.root, 'src/app.mjs'), 'export const value = 42;\n');
  for (const role of ['qa-engineer', 'security-officer', 'code-reviewer']) writeFileSync(join(f.root, `docs/${role}.md`), `Synthetic prepared ${role} evidence. Authority NONE, publication NOT_CHECKED.\n`);
  writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'primary: web-service\narchetype: web-service\nproject_size: medium\nmode: production\napproval-level: gates-only\ncompliance: []\npacks: []\nqa-extras: []\n');
  mkdirSync(join(f.pluginRoot, 'agents')); mkdirSync(join(f.pluginRoot, 'shared'));
  writeFileSync(join(f.pluginRoot, 'shared/pipeline.toml'), graph);
  for (const role of ['qa-engineer', 'security-officer', 'code-reviewer']) writeFileSync(join(f.pluginRoot, `agents/${role}.md`), `You are ${role}. Inspect committed src/app.mjs and docs/${role}.md. No writes.\n`);
  git(f, 'init', '-q'); git(f, 'config', 'user.name', 'Synthetic Fixture'); git(f, 'config', 'user.email', 'fixture@example.invalid'); git(f, 'config', 'commit.gpgsign', 'false'); commit(f);
  f.registration = {version: 'ship-registration/v1', repositoryId: 'synthetic:repository', projectId: 'synthetic:project',
    gitCommonDirDigest: sha(realpathSync(resolve(f.root, git(f, 'rev-parse', '--git-common-dir')))),
    journalOriginId: 'synthetic:fixed-origin', journalRootDigest: sha(realpathSync(f.journals))};
  f.policy = {version: 'ship-controller-policy/v1', registration: 'registration.json', assignmentLifetimeMs: 1800000,
    journalRoot: f.journals, requiredReviewers: ['qa-engineer', 'security-officer'].map(role => ({role, requiredChecks: checks ? ['independent-verifier', 'configured-checks'] : ['independent-verifier']}))};
  f.policyPath = join(f.store, 'policy.json'); writeJSON(f.policyPath, f.policy); writeJSON(join(f.store, 'registration.json'), f.registration);
  return f;
}
export function scenario(f, delta) {writeJSON(f.scenarioPath, {...readJSON(f.scenarioPath), ...delta});}
export function calls(f) {return readFileSync(f.callsPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);}
export function runFile(f, id) {return join(f.runs, `${id}.json`);}
export function stored(f, id) {return readJSON(runFile(f, id));}
export function invoke(f, args, extra = {}) {return spawnSync(process.execPath, [CLI, ...args], {cwd: f.root, env: {...f.env, ...extra}, encoding: 'utf8', timeout: 20000});}
export function invokeBound(f, id, revision, flags = []) {return spawnSync(process.execPath, [BOUND_CLI, '--dir', f.root, '--store', f.store, '--run', id, '--revision', String(revision), '--json', ...flags], {cwd: f.root, env: f.env, encoding: 'utf8', timeout: 20000});}
export function cliAsync(f, args, extra = {}) {
  return new Promise(resolve => {const child = spawn(process.execPath, [CLI, ...args], {cwd: f.root, env: {...f.env, ...extra}, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = ''; child.stdout.on('data', b => {stdout += b;}); child.stderr.on('data', b => {stderr += b;});
    child.on('close', status => resolve({status, stdout, stderr})); child.on('error', error => resolve({status: null, stdout, stderr: String(error)}));});
}
export function isolated(f, t) {
  if (!ORIGINAL_ENV_BY_TEST.has(t)) ORIGINAL_ENV_BY_TEST.set(t, {...process.env});
  const before = ORIGINAL_ENV_BY_TEST.get(t); for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, f.env);
  t.after(() => {for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, before);});
}
export function leaseOwnerPath(f) {const directory = join(f.tasks, 'leases'); return join(directory, readdirSync(directory).find(name => name.endsWith('.lock')), 'owner.json');}
export function artifactHashes(f) {return ['src/app.mjs', 'docs/qa-engineer.md', 'docs/security-officer.md'].map(path => [path, sha(readFileSync(join(f.root, path)))]);}
