/** Controller-owned, offline Docker checks. No host workspace or credentials mounted. */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scan } from './secret-patterns.mjs';
const exec = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

export function validateCheckPolicy(policy) {
  if (!policy || !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(policy.image || '')) throw Error('checks require an image pinned by sha256 digest');
  if (!Array.isArray(policy.inputs) || !policy.inputs.length || policy.inputs.length > 100 || policy.inputs.some(p => typeof p !== 'string')) throw Error('checks require explicit input paths');
  if (!Array.isArray(policy.commands) || !policy.commands.length || policy.commands.length > 10 ||
      policy.commands.some(argv => !Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(a => typeof a !== 'string' || a.includes('\0')))) throw Error('checks require command argv arrays');
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1000 || policy.timeoutMs > 300000) throw Error('checks timeout must be 1000..300000 ms');
  return policy;
}

async function invoke(args, timeout) {
  try {
    const result = await exec('docker', args, { timeout, maxBuffer: 1024 * 1024, encoding: 'utf8' });
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
    const script = 'set -eu\ncp -R /input/. /work/\n' + policy.commands.map(argv => argv.map(quote).join(' ')).join('\n');
    const args = ['run', '--rm', '--pull=never', '--name', name, '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=1', '--user=65534:65534',
      '--mount', `type=bind,source=${input},target=/input,readonly`,
      '--tmpfs', '/work:rw,nosuid,nodev,size=256m,mode=1777', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
      '--workdir=/work', '--env=HOME=/tmp', '--entrypoint=/bin/sh', policy.image, '-c', script];
    const result = await invokeDocker(args, policy.timeoutMs);
    const outcome = result.killed || result.code === null || [125, 126, 127].includes(result.code) ? 'unverifiable' : result.code === 0 ? 'passed' : 'failed';
    return { ...result, state: outcome, startedAt,
      finishedAt: new Date().toISOString(), image: policy.image, commands: policy.commands, files,
      inputDigest: sha(JSON.stringify(files)), policyDigest: sha(JSON.stringify(policy)) };
  } finally {
    // A killed Docker client can leave its container alive. Remove this exact
    // per-invocation container, never another task's container or a broad prune.
    await invokeDocker(['rm', '-f', name], 10000);
    rmSync(stage, { recursive: true, force: true });
  }
}
