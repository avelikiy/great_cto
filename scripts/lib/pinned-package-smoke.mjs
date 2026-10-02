/** Actual isolated CLI smoke, not workflow/package-closure/provider attestation. */
import { mkdtempSync, realpathSync, mkdirSync, lstatSync, readdirSync, openSync, fstatSync, readSync, writeFileSync, closeSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const extractor = fileURLToPath(new URL('./extract-benchmark-package.py', import.meta.url));
const controllerProbeEntry = fileURLToPath(new URL('./pinned-controller-probe.mjs', import.meta.url));
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1' };
function bytes(path, limit = 8 * 1024 * 1024) {
  if (realpathSync(path) !== resolve(path)) throw Error('noncanonical package file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) throw Error('unsupported package file');
    const buffer = Buffer.alloc(before.size + 1); let used = 0, count;
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    const raw = buffer.subarray(0, used), after = fstatSync(fd);
    if (raw.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('package file changed during read');
    return raw;
  } finally { closeSync(fd); }
}
function inventory(root) {
  const entries = []; let total = 0, count = 0;
  function visit(name = '') {
    if (++count > 4000) throw Error('package inventory exceeds bound');
    const path = join(root, name), info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isDirectory() && !info.isFile()) throw Error('unsafe package inventory');
    if (info.isDirectory()) {
      entries.push([name, 'directory', info.mode & 0o777]);
      for (const child of readdirSync(path).sort()) visit(name ? `${name}/${child}` : child);
    } else {
      total += info.size;
      if (total > 128 * 1024 * 1024) throw Error('package inventory exceeds byte bound');
      entries.push([name, info.mode & 0o777, sha(bytes(path))]);
    }
  }
  visit(); return { digest: sha(JSON.stringify(entries)), files: entries.filter(e => e[1] !== 'directory').length };
}

export function runPinnedPackageSmoke({ artifactFile, artifactSha256, pythonBin = 'python3.12', controllerProbe = false }) {
  if (typeof controllerProbe !== 'boolean') throw Error('controllerProbe must be boolean');
  if (!/^[a-f0-9]{64}$/.test(artifactSha256 || '')) throw Error('exact package byte pin required');
  if (sha(bytes(resolve(artifactFile), 100 * 1024 * 1024)) !== artifactSha256) throw Error('package byte pin mismatch');
  // Preserve this private diagnostic directory on both success and failure.
  const evidenceRoot = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-package-smoke-')));
  try { return smokeExtractedPackage({ artifactFile, artifactSha256, pythonBin, evidenceRoot, controllerProbe }); }
  catch (error) { error.evidenceRoot = evidenceRoot; throw error; }
}

function smokeExtractedPackage({ artifactFile, artifactSha256, pythonBin, evidenceRoot, controllerProbe }) {
  const extracted = join(evidenceRoot, 'extracted'); mkdirSync(extracted, { mode: 0o700 });
  const unpack = spawnSync(pythonBin, ['-I', '-B', extractor, resolve(artifactFile), artifactSha256, extracted], {
    env, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
  writeFileSync(join(evidenceRoot, 'extraction-diagnostics.json'), JSON.stringify({ exitCode: unpack.status,
    stdout: unpack.stdout ?? '', stderr: unpack.stderr ?? '' }), { mode: 0o600 });
  if (unpack.error || unpack.status !== 0) throw Error(`pinned package extraction failed; evidence directory ${evidenceRoot}`);
  const root = join(extracted, 'package'), entry = join(root, 'index.mjs');
  let metadata;
  try { metadata = JSON.parse(bytes(join(root, 'package.json'))); }
  catch { throw Error('unsupported published CLI metadata'); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    || metadata.name !== 'great-cto' || !/^\d+\.\d+\.\d+$/.test(metadata.version || '')
    || metadata.bin?.['great-cto'] !== 'index.mjs') throw Error('unsupported published CLI identity');
  const before = inventory(root), entrySha256 = sha(bytes(entry)), runs = join(evidenceRoot, 'runs');
  const processes = [];
  function invoke(args) {
    const startedAt = new Date().toISOString();
    const child = spawnSync(process.execPath, [entry, ...args], { cwd: evidenceRoot,
      env: { ...env, GREAT_CTO_CODEX_RUNS_DIR: runs }, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
    processes.push({ args, pid: child.pid, exitCode: child.status, startedAt, finishedAt: new Date().toISOString() });
    writeFileSync(join(evidenceRoot, 'process-diagnostics.json'), JSON.stringify({ processes,
      lastOutput: { stdout: child.stdout ?? '', stderr: child.stderr ?? '' } }), { mode: 0o600 });
    if (child.error || child.status !== 0 || child.signal) throw Error(`published CLI ${args[0]} failed; evidence directory ${evidenceRoot}`);
    return child.stdout;
  }
  const version = invoke(['--version']).trim();
  if (version !== metadata.version) throw Error('published CLI version differs from package metadata');
  let listing;
  try { listing = JSON.parse(invoke(['codex-host', 'list'])); }
  catch (error) { if (error.message.startsWith('published CLI')) throw error; throw Error('published controller listing is not JSON'); }
  if (listing.state !== 'ok' || !Array.isArray(listing.runs) || listing.runs.length || listing.unreadable !== 0) throw Error(`isolated controller store is not a valid empty listing; evidence directory ${evidenceRoot}`);
  let controllerAssets = null, controllerProbeProcess = null;
  if (controllerProbe) {
    const fixtures = join(evidenceRoot, 'fixtures'); mkdirSync(fixtures, { mode: 0o700 });
    const startedAt = new Date().toISOString();
    const child = spawnSync(process.execPath, [controllerProbeEntry, join(root, 'board'), fixtures], {
      cwd: evidenceRoot, env: { ...env, GREAT_CTO_CODEX_RUNS_DIR: runs,
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
    writeFileSync(join(evidenceRoot, 'controller-probe-diagnostics.json'), JSON.stringify({ pid: child.pid,
      exitCode: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '' }), { mode: 0o600 });
    if (child.error || child.status !== 0 || child.signal) throw Error(`packaged controller probe failed; evidence directory ${evidenceRoot}`);
    try { controllerAssets = JSON.parse(child.stdout); } catch { throw Error('packaged controller probe is not JSON'); }
    if (!controllerAssets || typeof controllerAssets !== 'object' || Array.isArray(controllerAssets)
      || controllerAssets.version !== 1 || controllerAssets.scope !== 'delivered-controller-construction-and-selection-only'
      || !Array.isArray(controllerAssets.cases) || controllerAssets.cases.length !== 12
      || !Array.isArray(controllerAssets.refusals) || controllerAssets.refusals.length !== 8
      || controllerAssets.dispatchAttempts !== 0 || controllerAssets.approvalsRecorded !== 0
      || controllerAssets.providerCalls !== null || controllerAssets.graphSha256 !== sha(bytes(join(root, 'board/shared/pipeline.toml')))
      || controllerAssets.executionArtifactProvenanceVerified !== false || controllerAssets.benchmarkEligible !== false) throw Error('unsupported packaged controller probe result');
    controllerProbeProcess = { pid: child.pid, exitCode: child.status, startedAt, finishedAt: new Date().toISOString() };
  }
  if (inventory(root).digest !== before.digest || sha(bytes(resolve(artifactFile), 100 * 1024 * 1024)) !== artifactSha256) throw Error('published package changed during smoke execution');
  return { version: 1, scope: 'pinned-delivered-cli-smoke-only', packageVersion: metadata.version,
    artifactSha256, entrySha256, extractedInventoryDigest: before.digest, extractedFiles: before.files,
    evidenceRoot, processes, listingState: listing.state, controllerAssets, controllerProbeProcess, providerCalls: null, approvalsRequested: false,
    executionArtifactProvenanceVerified: false, benchmarkEligible: false };
}
