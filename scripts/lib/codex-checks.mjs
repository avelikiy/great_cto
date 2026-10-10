/** Controller-owned checks: Docker isolation or explicit trusted local execution. */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { scan } from './secret-patterns.mjs';
import { artifactPath, validateArtifacts, exporter, bundleDigest } from './codex-artifacts.mjs';
const exec = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
export const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;

export function validateCheckPolicy(policy) {
  if (!policy || !['docker', 'local'].includes(policy.backend === undefined ? 'docker' : policy.backend)) throw Error('unsupported checks backend');
  if (policy.backend === 'local') {
    if (policy.trusted !== true) throw Error('local checks require explicit trusted: true; local is not a sandbox');
    if (policy.image !== undefined) throw Error('local checks cannot claim a container image');
  } else if (!/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(policy.image || '')) throw Error('checks require an image pinned by sha256 digest');
  if (!Array.isArray(policy.inputs) || !policy.inputs.length || policy.inputs.length > 100 || policy.inputs.some(p => typeof p !== 'string')) throw Error('checks require explicit input paths');
  if (!Array.isArray(policy.commands) || !policy.commands.length || policy.commands.length > 10 ||
      policy.commands.some(argv => !Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(a => typeof a !== 'string' || a.includes('\0')))) throw Error('checks require command argv arrays');
  if (policy.backend === 'local' && policy.commands.some(argv => argv[0] !== 'node' && !isAbsolute(argv[0]))) throw Error('local executable must be node or an absolute path');
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1000 || policy.timeoutMs > 300000) throw Error('checks timeout must be 1000..300000 ms');
  if (policy.outputs !== undefined) {
    if (!Array.isArray(policy.outputs) || !policy.outputs.length || policy.outputs.length > 50 || new Set(policy.outputs).size !== policy.outputs.length) throw Error('outputs must name 1..50 distinct files');
    policy.outputs.forEach(artifactPath);
  }
  return policy;
}

// No shell, inherited credentials or workspace cwd. This reduces accidental
// exposure, NOT filesystem/network access by trusted code running as the user.
function invokeLocal(executable, args, cwd, timeout) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', size = 0, killed = false;
    const child = spawn(executable, args, { cwd, shell: false, detached: process.platform !== 'win32',
      env: { PATH: dirname(process.execPath), HOME: cwd, TMPDIR: cwd, LANG: 'C', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {}
    };
    const timer = setTimeout(() => { killed = true; stop(); }, timeout);
    const capture = key => data => {
      size += data.length;
      if (size > 16 * 1024 * 1024) { killed = true; stop(); return; }
      if (key === 'stdout') stdout += data.toString('utf8'); else stderr += data.toString('utf8');
    };
    child.stdout.on('data', capture('stdout')); child.stderr.on('data', capture('stderr'));
    child.on('error', error => { clearTimeout(timer); resolve({ code: null, stdout, stderr: error.message, killed }); });
    child.on('close', code => {
      clearTimeout(timer); stop(); // also stop same-process-group descendants
      resolve({ code, stdout, stderr, killed });
    });
  });
}

async function runLocal(policy, input) {
  const runtime = { node: process.version, platform: process.platform, arch: process.arch, executables: {} };
  let stdout = '', stderr = '';
  const deadline = Date.now() + policy.timeoutMs;
  for (const argv of policy.commands) {
    const executable = argv[0] === 'node' ? process.execPath : argv[0];
    try { runtime.executables[executable] = sha(readFileSync(executable)); }
    catch (error) { return { code: null, state: 'unverifiable', stdout, stderr: error.message, runtime }; }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { code: null, killed: true, state: 'unverifiable', stdout, stderr, runtime };
    const result = await invokeLocal(executable, argv.slice(1), input, remaining);
    stdout += result.stdout; stderr += result.stderr;
    if (result.killed || result.code === null || stdout.length + stderr.length > 16 * 1024 * 1024)
      return { ...result, state: 'unverifiable', stdout: stdout.slice(0, 8 * 1024 * 1024), stderr: stderr.slice(0, 8 * 1024 * 1024), runtime };
    if (result.code !== 0) return { ...result, state: 'failed', stdout, stderr, runtime };
  }
  let artifacts = null;
  if (policy.outputs) {
    let bytes = 0;
    artifacts = validateArtifacts(policy.outputs.map(path => {
      let current = input;
      for (const part of path.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) throw Error('symlink artifact');
      }
      const stat = lstatSync(current);
      if (!stat.isFile() || (bytes += stat.size) > 8 * 1024 * 1024) throw Error('invalid or oversized artifact');
      return { path, base64: readFileSync(current).toString('base64') };
    }));
  }
  return { code: 0, state: 'passed', stdout, stderr, runtime, artifacts };
}

async function invoke(args, timeout) {
  try {
    const result = await exec('docker', args, { timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: Number.isInteger(error.code) ? error.code : null, stdout: error.stdout || '', stderr: error.stderr || error.message, killed: !!error.killed };
  }
}

export async function runChecks(state, { safePath, invokeDocker = invoke } = {}) {
  const policy = validateCheckPolicy(state.checkPolicy);
  const stage = mkdtempSync(join(tmpdir(), 'great-cto-checks-'));
  const input = join(stage, 'input'); mkdirSync(input);
  const name = `great-cto-check-${randomUUID()}`;
  const files = {}; let bytes = 0;
  const startedAt = new Date().toISOString();
  try {
    const copy = path => {
      const source = safePath(state.root, path, state.allowed);
      const stat = lstatSync(source);
      if (stat.isDirectory()) { for (const child of readdirSync(source).sort()) copy(`${path}/${child}`); return; }
      if (!stat.isFile()) throw Error(`unsupported check input: ${path}`);
      if (files[path]) return;
      if (stat.size > 20 * 1024 * 1024) throw Error('checks snapshot too large');
      const content = readFileSync(source); bytes += content.length;
      if (bytes > 20 * 1024 * 1024 || Object.keys(files).length >= 2000) throw Error('checks snapshot too large');
      if (scan(content.toString('utf8')).some(f => f.severity === 'block')) throw Error(`secret blocked in check input: ${path}`);
      const target = join(input, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content);
      files[path] = sha(content);
    };
    for (const path of policy.inputs) copy(path);
    if (!Object.keys(files).length) throw Error('empty checks snapshot');
    if (policy.backend === 'local') {
      const result = await runLocal(policy, input);
      return { ...result, backend: 'local', isolation: 'none', trusted: true, startedAt,
        finishedAt: new Date().toISOString(), image: null, commands: policy.commands, files,
        artifacts: result.artifacts ?? null, artifactDigest: result.artifacts ? bundleDigest(result.artifacts) : null,
        inputDigest: sha(JSON.stringify(files)), policyDigest: sha(JSON.stringify(policy)) };
    }
    const commands = policy.commands.map(argv => argv.map(shellQuote).join(' ') + (policy.outputs ? ' 1>&2' : '')).join('\n');
    const script = 'set -eu\ncp -R /input/. /work/\n' + commands + (policy.outputs ? `\nnode -e ${shellQuote(exporter)} ${shellQuote(JSON.stringify(policy.outputs))}` : '');
    const args = ['run', '--rm', '--pull=never', '--name', name, '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=1', '--user=65534:65534',
      '--mount', `type=bind,source=${input},target=/input,readonly`,
      '--tmpfs', '/work:rw,nosuid,nodev,size=256m,mode=1777', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
      '--workdir=/work', '--env=HOME=/tmp', '--entrypoint=/bin/sh', policy.image, '-c', script];
    const result = await invokeDocker(args, policy.timeoutMs);
    const outcome = result.killed || result.code === null || [125, 126, 127].includes(result.code) ? 'unverifiable' : result.code === 0 ? 'passed' : 'failed';
    let artifacts = null;
    if (outcome === 'passed' && policy.outputs) {
      artifacts = validateArtifacts(JSON.parse(result.stdout));
      if (JSON.stringify(artifacts.map(a => a.path).sort()) !== JSON.stringify([...policy.outputs].sort())) throw Error('exported artifact set differs from policy');
      result.stdout = '[artifact data retained separately]';
    }
    return { ...result, backend: 'docker', isolation: 'container', state: outcome, startedAt,
      artifacts, artifactDigest: artifacts ? bundleDigest(artifacts) : null,
      finishedAt: new Date().toISOString(), image: policy.image, commands: policy.commands, files,
      inputDigest: sha(JSON.stringify(files)), policyDigest: sha(JSON.stringify(policy)) };
  } finally {
    // A killed Docker client can leave its container alive. Remove this exact
    // per-invocation container, never another task's container or a broad prune.
    if (policy.backend !== 'local') await invokeDocker(['rm', '-f', name], 10000);
    rmSync(stage, { recursive: true, force: true });
  }
}
