// Shared harness for the isolated-HOME plugin-activation E2E (ADR-050; acceptance v4).
//
// WHAT IS REAL: the compiled CLI (`packages/cli/dist`), its `init` command, the embedded-set verifier,
// the activation transaction, the lock and the journal, and the three host files. A scenario spawns
// `node <package>/index.mjs init` with HOME pointing at a temp directory, exactly as a user's shell would.
//
// WHAT IS NOT: the key. The shipped build pins no key yet (EMBEDDED_RELEASE_KEY_NOT_ENROLLED), and a
// pin is a source constant that only a reviewed commit changes. So each scenario builds a throwaway
// package root under os.tmpdir() — a COPY of the compiled CLI whose pin constant is rewritten to the
// fingerprint of an ephemeral Ed25519 key — and signs a fixture plugin set with that key. This is the
// same one-constant change the release build makes with the real fingerprint; nothing in the repository's
// own `dist/` or `src/` is touched, HOME and every file written live under os.tmpdir(), and the shipped
// build is shown to refuse the same set (see the 'shipped build' scenario). The evidence this produces
// confers no release authority: acceptance v4 keeps `authority: NONE` and
// `syntheticEvidenceCanAuthorizeRelease: false`.
//
// The ARCH's `fixtureMode` (outcomes prefixed SIMULATED_, `testing: true`) cannot be reached through
// `init`, so it stays covered by the in-process tests in packages/cli/tests/plugin-activation.test.mjs;
// this harness drives the production path of the same code under a throwaway pin.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeEmbeddedSet, pluginFiles, tempBase, digest } from '../../../packages/cli/tests/helpers/embedded-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..');
const CLI = path.join(REPO, 'packages', 'cli');
export const CRASH_CHILD = path.join(HERE, 'crash-child.mjs');
export const NETWORK_GUARD = path.join(HERE, 'network-guard.mjs');
export const PLUGIN_KEY = 'great_cto@local';
/** Every durable boundary the transaction journals on a fresh machine, in order. */
export const PHASES = ['SNAPSHOTTED', 'PUBLISHED', 'ACTIVATING', 'REGISTRY_WRITTEN', 'SETTINGS_WRITTEN', 'MARKETPLACE_WRITTEN', 'ACTIVE', 'SMOKE_PASSED'];
export { digest };

const PIN = /export const EMBEDDED_RELEASE_KEY_FINGERPRINT\s*=\s*EMBEDDED_RELEASE_KEY_NOT_ENROLLED\s*;/g;
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };

function newKey() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return { pem: privateKey.export({ type: 'pkcs8', format: 'pem' }), fingerprint: digest(createPublicKey(privateKey).export({ type: 'spki', format: 'der' })) };
}

/** A machine: an isolated HOME, a PATH that holds `node` and nothing else we control, and a place for markers. */
export function newMachine(t, { claudeDir = true } = {}) {
  const root = tempBase(t, 'gcto-pa-e2e-');
  const machine = { root, home: path.join(root, 'home'), markers: path.join(root, 'markers'), bin: path.join(root, 'bin'), counter: 0, key: newKey() };
  machine.claudeDir = path.join(machine.home, '.claude');
  machine.stateDir = path.join(machine.home, '.great_cto', 'distribution-trust');
  for (const dir of [machine.home, machine.markers, machine.bin]) fs.mkdirSync(dir, { mode: 0o755 });
  fs.symlinkSync(process.execPath, path.join(machine.bin, 'node'));
  if (claudeDir) fs.mkdirSync(machine.claudeDir, { mode: 0o755 });
  // The reason this harness exists is never to touch the real HOME. Check it, do not assume it.
  const temp = fs.realpathSync(os.tmpdir());
  if (!inside(temp, machine.home)) throw new Error(`isolated HOME ${machine.home} is not under ${temp}`);
  let realHome = '';
  try { realHome = fs.realpathSync(os.homedir()); } catch { /* no home: nothing to collide with */ }
  if (realHome && (realHome === machine.home || inside(machine.home, realHome))) throw new Error('the isolated HOME contains the real home');
  return machine;
}

export function paths(machine) {
  const plugins = path.join(machine.claudeDir, 'plugins');
  return {
    plugins, cacheRoot: path.join(plugins, 'cache', 'local', 'great_cto'),
    registry: path.join(plugins, 'installed_plugins.json'),
    knownMarketplaces: path.join(plugins, 'known_marketplaces.json'),
    settings: path.join(machine.claudeDir, 'settings.json'),
    marketplace: path.join(plugins, 'marketplaces', 'local', '.claude-plugin', 'marketplace.json'),
  };
}
export const versionDir = (machine, version) => path.join(paths(machine).cacheRoot, version);

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
/** Host files with another plugin and unrelated keys in them, so "left alone" is something a test can see. */
export function seedHost(machine) {
  const p = paths(machine);
  fs.mkdirSync(path.dirname(p.marketplace), { recursive: true, mode: 0o755 });
  writeJson(p.registry, { version: 2, plugins: { 'other@market': [{ scope: 'user', installPath: '/x', version: '1.0.0' }] } });
  writeJson(p.settings, { theme: 'dark', enabledPlugins: { 'other@market': true } });
  writeJson(p.marketplace, { name: 'local', owner: { name: 'Local', email: '' }, plugins: [{ name: 'other', source: '/y', version: '1.0.0', strict: false }] });
}
export const readHost = machine => Object.fromEntries(['registry', 'settings', 'marketplace'].map(name => {
  const file = paths(machine)[name];
  return [name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null];
}));

// ── what "a candidate byte ran" means ────────────────────────────────────────────────────────────────
//
// Every executable member of the fixture set (.mjs, .js, .sh, .py) is replaced by a stand-in that appends
// one JSON line to the package's marker file when it runs: which file, with what arguments. A scenario
// that says "no candidate byte ran" is therefore measured over ALL of them, not over one entry point.
//
// The set holds the entry points the activation or `init` can reach, and tripwires for the ones nothing
// should reach:
//   reached on purpose  packages/cli/index.mjs and scripts/lib/gate-plan.mjs (the smoke, defaultSmoke in
//                       plugin-activation.mjs), and scripts/skill-discover.sh (init runs it from the
//                       activated bytes once activation is done: main.ts, section 4c)
//   tripwires           the board server, the compiled CLI inside the plugin, two hook scripts and the
//                       python MCP server: no scenario here has a reason to run any of them
export const SMOKE_FILES = ['packages/cli/index.mjs', 'scripts/lib/gate-plan.mjs'];
export const AFTER_ACTIVATION_FILES = ['scripts/skill-discover.sh'];
/** What a successful `init` runs of the candidate, in order. Anything else appearing here is a finding. */
export const SUCCESSFUL_INIT_RUNS = [...SMOKE_FILES, ...AFTER_ACTIVATION_FILES];
export const EXECUTABLE = /\.(?:mjs|js|sh|py)$/;
const EXTRA_MEMBERS = [
  ['scripts/lib/gate-plan.mjs', 0o644], ['scripts/skill-discover.sh', 0o755], ['scripts/hooks/session-start.mjs', 0o644],
  ['scripts/hooks/secret-scan.mjs', 0o644], ['mcp-servers/llm-router/server.py', 0o644],
];

/** The stand-in for one executable member: leaves a marker line, then (for the entry point) behaves like the fixture did. */
function standIn(rel, { marker, version, hold }) {
  const m = JSON.stringify(marker), r = JSON.stringify(rel);
  if (rel.endsWith('.sh')) return `#!/bin/sh\nprintf '{"file":"%s","argv":[],"envKeys":null}\\n' '${rel}' >> '${marker}'\n`;
  if (rel.endsWith('.py')) return `import json, sys\nopen(${m}, 'a').write(json.dumps({'file': ${r}, 'argv': sys.argv[1:], 'envKeys': None}) + '\\n')\n`;
  if (rel.endsWith('.js')) return `require('node:fs').appendFileSync(${m}, JSON.stringify({ file: ${r}, argv: process.argv.slice(2), envKeys: Object.keys(process.env).sort() }) + '\\n');\n`;
  const entry = rel === 'packages/cli/index.mjs';
  return [
    "import fs from 'node:fs';",
    `fs.appendFileSync(${m}, JSON.stringify({ file: ${r}, argv: process.argv.slice(2), envKeys: Object.keys(process.env).sort() }) + '\\n');`,
    ...(entry && hold ? [
      'const cell = new Int32Array(new SharedArrayBuffer(4)), deadline = Date.now() + 30000;',
      `while (!fs.existsSync(${JSON.stringify(hold)})) { if (Date.now() > deadline) { console.error('held smoke was never released'); process.exit(3); } Atomics.wait(cell, 0, 0, 20); }`,
    ] : []),
    ...(entry ? [`console.log(${JSON.stringify(version)});`] : ['export {};']),
    '',
  ].join('\n');
}

/** The fixture set with every executable member instrumented, plus the entry points and tripwires above. */
function instrumentedFiles(version, { marker, hold, claudeManifest }) {
  const base = pluginFiles(version).map(f => claudeManifest && f.path === '.claude-plugin/plugin.json'
    ? { ...f, bytes: Buffer.from(JSON.stringify({ name: 'great-cto', version, ...claudeManifest })) } : f);
  const members = [...base, ...EXTRA_MEMBERS.map(([path, mode]) => ({ path, bytes: Buffer.alloc(0), mode }))];
  return members.map(f => EXECUTABLE.test(f.path) ? { ...f, bytes: Buffer.from(standIn(f.path, { marker, version, hold })) } : f);
}

/**
 * An "installed npm package": a copy of the compiled CLI beside a signed fixture set at `plugin/`.
 * `pin` is the fingerprint written into the copy's source constant; `null` leaves the shipped
 * NOT_ENROLLED pin, i.e. the build exactly as it ships today.
 */
export function buildPackage(machine, { version, pin = machine.key.fingerprint, hold = false, claudeManifest = null } = {}) {
  const dist = path.join(CLI, 'dist');
  if (!fs.existsSync(path.join(dist, 'main.js'))) {
    throw new Error('packages/cli/dist/main.js is missing: build the CLI first (npm run build in packages/cli). The gate builds it before this step; a missing build is a failure, not a skip.');
  }
  const root = path.join(machine.root, `pkg-${version}-${++machine.counter}`);
  fs.mkdirSync(root, { mode: 0o755 });
  fs.cpSync(dist, path.join(root, 'dist'), { recursive: true });
  fs.cpSync(path.join(CLI, 'assets'), path.join(root, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(CLI, 'index.mjs'), path.join(root, 'index.mjs'));
  const manifest = JSON.parse(fs.readFileSync(path.join(CLI, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, version }, null, 2));
  if (pin) {
    const file = path.join(root, 'dist', 'release-trust.mjs'), source = fs.readFileSync(file, 'utf8');
    const hits = source.match(PIN)?.length ?? 0;
    if (hits !== 1) throw new Error(`expected the key pin once in the copied release-trust.mjs, found ${hits}: this harness no longer matches the source constant`);
    fs.writeFileSync(file, source.replace(PIN, `export const EMBEDDED_RELEASE_KEY_FINGERPRINT = '${pin}';`));
  }
  const name = path.basename(root), marker = path.join(machine.markers, `${name}.jsonl`), release = path.join(machine.markers, `${name}.release`);
  const set = writeEmbeddedSet(root, { version, privateKeyPem: machine.key.pem, files: instrumentedFiles(version, { marker, hold: hold ? release : null, claudeManifest }) });
  return { root, version, set, marker, release, index: path.join(root, 'index.mjs') };
}

/** The marker lines every instrumented member wrote: one per time any candidate byte ran. */
export const executions = pkg => fs.existsSync(pkg.marker) ? fs.readFileSync(pkg.marker, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
/** Which members ran, in order. */
export const ranFiles = pkg => executions(pkg).map(entry => entry.file);

export function cleanEnv(machine, extra = {}) {
  return {
    PATH: `${machine.bin}:/usr/bin:/bin`, HOME: machine.home, TMPDIR: os.tmpdir(),
    GREAT_CTO_NO_BOARD: '1', GREAT_CTO_NO_UPDATE_CHECK: '1', DO_NOT_TRACK: '1', NO_COLOR: '1', ...extra,
  };
}
export function newProject(machine) { return fs.mkdtempSync(path.join(machine.root, 'project-')); }
const initArgs = (pkg, project) => [pkg.index, 'init', '--yes', '--no-telemetry', '--dir', project];

/** Runs the real `init` to completion. */
export function runInit(machine, pkg, { env, nodeArgs = [], project = newProject(machine) } = {}) {
  const r = spawnSync(process.execPath, [...nodeArgs, ...initArgs(pkg, project)], { env: cleanEnv(machine, env), cwd: project, encoding: 'utf8', timeout: 120_000 });
  if (r.error) throw r.error;
  return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, output: r.stdout + r.stderr, project };
}
/** Starts the real `init` and returns without waiting, so a test can act while it runs. */
export function startInit(machine, pkg, { env, project = newProject(machine) } = {}) {
  const child = spawn(process.execPath, initArgs(pkg, project), { env: cleanEnv(machine, env), cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (status, signal) => resolve({ status, signal, output: out, project })); });
  return { child, done };
}

/** Waits for a condition that another process will make true. It fails with a message; it never just times out. */
export async function waitFor(what, condition, { timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/** Every entry under `dir`: type, mode, size, content digest and, when asked, modification time. */
export function snapshot(dir, { times = false } = {}) {
  const out = {};
  const walk = (current, rel) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(current, entry.name), key = rel ? `${rel}/${entry.name}` : entry.name, st = fs.lstatSync(full);
      const stamp = times ? { mtimeMs: st.mtimeMs } : {};
      if (st.isSymbolicLink()) out[key] = { type: 'link', to: fs.readlinkSync(full) };
      else if (st.isDirectory()) { out[key] = { type: 'dir', mode: st.mode & 0o777, ...stamp }; walk(full, key); }
      else out[key] = { type: 'file', mode: st.mode & 0o777, size: st.size, sha256: digest(fs.readFileSync(full)), ...stamp };
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

/** The files of a published directory, recomputed here — not by the adapter's own walker. */
export function inventoryOf(root) {
  const files = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name), key = rel ? `${rel}/${entry.name}` : entry.name, st = fs.lstatSync(full);
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) throw new Error(`${key} is not a regular file or directory`);
      if (st.isDirectory()) { walk(full, key); continue; }
      const bytes = fs.readFileSync(full);
      files.push({ path: key, size: bytes.length, sha256: digest(bytes), mode: st.mode & 0o777 });
    }
  };
  walk(root, '');
  return files.sort((a, b) => a.path < b.path ? -1 : 1);
}

/** Transaction journals under the state directory, as phase lists. */
export function journals(machine) {
  const root = path.join(machine.stateDir, 'plugin'), out = [];
  if (!fs.existsSync(root)) return out;
  for (const installation of fs.readdirSync(root)) {
    const transactions = path.join(root, installation, 'transactions');
    if (!fs.existsSync(transactions)) continue;
    for (const id of fs.readdirSync(transactions)) {
      const file = path.join(transactions, id, 'journal.jsonl');
      if (!fs.existsSync(file)) continue;
      const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
      out.push({ id, file, entries, phases: entries.map(entry => entry.phase) });
    }
  }
  return out;
}
/** The installation's lock owner, pending-transaction pointer and watermark, or null before any activation. */
export function stateRecords(machine) {
  const root = path.join(machine.stateDir, 'plugin');
  const [installation] = fs.existsSync(root) ? fs.readdirSync(root) : [];
  if (!installation) return null;
  const dir = path.join(root, installation), read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  return { dir, pointer: read(path.join(dir, 'transaction.json')), owner: read(path.join(dir, 'lock', 'owner.json')), watermark: read(path.join(dir, 'watermark.json')) };
}

/** Runs the activation exactly as `init` does, in its own process, and dies when `crashAt` is journalled. */
export function crashAt(machine, pkg, phase = '') {
  const r = spawnSync(process.execPath, [CRASH_CHILD, pkg.root, phase], { env: cleanEnv(machine), encoding: 'utf8', timeout: 120_000 });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Runs only the recovery `init` would run, in its own process, and returns its outcome record. */
export function recoverCrashed(machine, pkg) {
  const r = spawnSync(process.execPath, [CRASH_CHILD, pkg.root, '--recover'], { env: cleanEnv(machine), encoding: 'utf8', timeout: 120_000 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`recovery child exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout).result;
}

/** Everything under the Claude directory except the published cache directories: the host's own files. */
export const hostFiles = machine => Object.fromEntries(Object.entries(snapshot(machine.claudeDir)).filter(([key]) => !key.startsWith('plugins/cache')));

export const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
export const tail = (text, n = 1500) => text.length > n ? '…' + text.slice(-n) : text;
