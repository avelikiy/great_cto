#!/usr/bin/env node
/** Publish only an already authenticated, explicitly approved immutable tarball. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { admitRelease, getAdmissionInfo, getAdmittedArtifact } from '../packages/cli/src/release-trust.mjs';
import { assertPublicationSource } from './sign-release-artifacts.mjs';
import { check as checkLease } from './lib/release-lease.mjs';

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const OWNER_APPROVAL = 'local-owner-release';
function trustedFile(file, max, privateMode = false) {
  if (!path.isAbsolute(file || '') || fs.realpathSync(file) !== path.resolve(file)) throw Error('canonical publisher input required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    if (!a.isFile() || a.nlink !== 1n || a.size <= 0n || a.size > BigInt(max) || (Number(a.mode) & (privateMode ? 0o777 : 0o022)) !== (privateMode ? 0o600 : 0) || (process.getuid && a.uid !== BigInt(process.getuid()) && (privateMode || a.uid !== 0n))) throw Error('unsafe publisher input permissions, ownership or size');
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd, { bigint: true });
    if (['dev','ino','size','mtimeNs','ctimeNs'].some(k => a[k] !== b[k]) || bytes.length !== Number(a.size)) throw Error('publisher input changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function writePrivate(file, bytes) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
// npm stages a publish until the owner approves it with 2FA. 3.72.0 (27.10.2026):
// the first run staged the version and printed only "refused"; the rerun hit E409
// "Cannot publish over previously staged version". npm's error code is a fixed
// vocabulary (E409, EOTP, E403) — the one part of a failure safe to name. Nothing
// else of the child's output leaves this function.
const STAGED_HINT = version => `npm holds great-cto@${version} STAGED, awaiting the owner's 2FA approval (npmjs.com, or npm stage approve with npm >= 11.15); approve it, then rerun to read the bytes back`;
function npmFailure(error) {
  const text = String(error?.stderr ?? '');
  return { code: /npm error code (E[A-Z0-9]{2,15})\b/.exec(text)?.[1] ?? null, staged: /previously staged version/i.test(text) };
}
const redact = text => String(text).replace(/_authToken=\S+/g, '_authToken=<withheld>').replace(/\bnpm_[A-Za-z0-9]{16,}/g, '<withheld>');
async function boundedResponse(response, limit) {
  if (!response.body) throw Error('registry response has no body');
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.length;
    if (size > limit) throw Error('registry response exceeds admitted bound');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Crypto admission is independent of full-gate/ship approval. The caller must
 * explicitly name that approval's exact commit and index digest; this command
 * cannot manufacture or infer it from a valid signature. Injectable I/O is only
 * a test adapter and never returns production publication authority.
 */
export async function publishLocalRelease(options, { run = execFileSync, fetchFn = fetch, lease = checkLease } = {}) {
  if (fetchFn !== fetch && run === execFileSync) throw Error('test registry adapter requires a non-executing process adapter');
  const { directory, version, source, approveCommit, approveIndexDigest, approval, localPublicKeyPath, localKeyFingerprint, npmPath, npmSha256, npmAuthFile } = options;
  if (approval !== OWNER_APPROVAL || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '') || !/^[a-f0-9]{40}$/.test(approveCommit || '') || !/^[a-f0-9]{64}$/.test(approveIndexDigest || '')) throw Error('explicit stable version, full-gate and owner ship approval for exact commit/index required');
  const ticket = admitRelease({ directory, version, expectedCommit: approveCommit, profile: 'local-ed25519', localPublicKeyPath, localKeyFingerprint });
  const info = getAdmissionInfo(ticket);
  if (info.authority !== 'ARTIFACT_ADMISSION' || info.evidence !== 'LOCAL_ED25519_VERIFIED' || info.indexDigest !== approveIndexDigest) throw Error('approved local artifact identity mismatch');
  const admitted = getAdmittedArtifact(ticket, 'npm');
  const originalBytes = trustedFile(admitted.path, admitted.size, true);
  if (hash(originalBytes) !== admitted.sha256 || originalBytes.length !== admitted.size) throw Error('admitted tarball changed');
  if (!/^[a-f0-9]{64}$/.test(npmSha256 || '') || hash(trustedFile(npmPath, 16*1024*1024)) !== npmSha256) throw Error('independently pinned npm executable required');
  fs.accessSync(npmPath, fs.constants.X_OK);
  if (npmPath === directory || npmPath.startsWith(directory+path.sep) || npmAuthFile === directory || npmAuthFile?.startsWith(directory+path.sep)) throw Error('candidate cannot supply publisher tool or credentials');
  const auth = trustedFile(npmAuthFile, 16*1024, true);
  if (!/^\/\/registry\.npmjs\.org\/:_authToken=[^\s\x00-\x1f\x7f]+\n?$/.test(auth.toString('utf8'))) throw Error('explicit registry-only npm authentication file required');
  assertPublicationSource({ source, version, commit: approveCommit, expectedTree: info.tree, run });
  const metadataURL = `https://registry.npmjs.org/great-cto/${info.version}`;
  const request = url => fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { accept: url === metadataURL ? 'application/json' : 'application/octet-stream', 'accept-encoding': 'identity' } });
  const integrity = 'sha512-'+createHash('sha512').update(originalBytes).digest('base64');
  const metadata = async response => {
    let value;
    try { value=JSON.parse((await boundedResponse(response, 1024*1024)).toString('utf8')); } catch { throw Error('registry metadata unavailable or malformed'); }
    if (value.name !== 'great-cto' || value.version !== info.version || value.dist?.integrity !== integrity) throw Error('immutable registry identity or bytes differ');
  };
  const existing = await request(metadataURL);
  let didPublish=false;
  if (existing.status === 200) await metadata(existing);
  else if (existing.status === 404) {
    await existing.body?.cancel();
    // Only a first publication needs the claim; reading back a version already
    // published (the rerun after 2FA) does not, and must keep working after release.
    const claim = lease({ version: info.version, commit: approveCommit });
    if (!claim.ok) throw Error(`release lease: ${claim.why}`);
    const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-local-publish-')));
    fs.chmodSync(temporary, 0o700);
    try {
      const userConfig = path.join(temporary, 'npmrc'), globalConfig = path.join(temporary, 'global-npmrc');
      writePrivate(userConfig, auth); writePrivate(globalConfig, Buffer.from(''));
      // Freeze a separate owned copy so npm cannot race edits of the downloaded
      // artifact. Lifecycle hooks and ambient npm/NODE_OPTIONS config are absent.
      const tarball = path.join(temporary, `great-cto-${info.version}.tgz`);
      writePrivate(tarball, originalBytes);
      const env = { PATH: path.dirname(process.execPath)+':/usr/bin:/bin', HOME: temporary, TMPDIR: temporary, LANG: 'C', LC_ALL: 'C', NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_CACHE: path.join(temporary,'cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/', NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
      const childOptions = { cwd: temporary, env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 180000, maxBuffer: 1024*1024 };
      if (hash(trustedFile(npmPath, 16*1024*1024)) !== npmSha256) throw Error('trusted npm changed');
      getAdmittedArtifact(ticket, 'npm');
      try { run(npmPath, ['publish',tarball,'--ignore-scripts','--access','public','--registry','https://registry.npmjs.org/'], childOptions); }
      catch (error) {
        const { code, staged } = npmFailure(error);
        if (staged) throw Error(STAGED_HINT(info.version));
        throw Error(`npm publication failed${code ? ` (npm error code ${code})` : ''}; child output withheld to protect authentication material`);
      }
      if (hash(trustedFile(tarball, admitted.size, true)) !== admitted.sha256) throw Error('published tarball copy changed');
      didPublish=true;
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  } else {
    await existing.body?.cancel();
    throw Error(`registry availability unknown (${existing.status}); publication refused`);
  }
  const after = await request(metadataURL);
  if (after.status !== 200) {
    await after.body?.cancel();
    // A publish npm accepted but does not serve is, under staged publishing, a staged one.
    throw Error(didPublish && after.status === 404 ? STAGED_HINT(info.version) : 'registry readback unavailable');
  }
  await metadata(after);
  const response = await request(`https://registry.npmjs.org/great-cto/-/great-cto-${info.version}.tgz`);
  if (response.status !== 200) { await response.body?.cancel(); throw Error('registry tarball readback unavailable'); }
  const bytes = await boundedResponse(response, admitted.size);
  if (!bytes.equals(originalBytes)) throw Error('registry tarball differs from admitted bytes');
  getAdmittedArtifact(ticket, 'npm');
  const production = run === execFileSync && fetchFn === fetch;
  return { state: production ? (didPublish ? 'PUBLISHED_AND_READ_BACK' : 'ALREADY_PUBLISHED_BYTE_IDENTICAL') : 'SIMULATED_PUBLICATION_READBACK', version: info.version, commit: info.commit, indexDigest: info.indexDigest, authority: production ? 'REGISTRY_BYTES_VERIFIED' : 'NONE', evidence: production ? 'LOCAL_OWNER_SIGNATURE_AND_REGISTRY_READBACK' : 'SYNTHETIC_ONLY', releaseEligibility: 'NOT_CHECKED', published: production && didPublish, installed: false, githubRelease: 'NOT_PUBLISHED' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const allowed = new Set(['--directory','--version','--source','--approve-commit','--approve-index-digest','--public-key','--key-fingerprint','--npm','--npm-sha256','--npm-auth-file','--approval']), flags = new Map();
    for (let i=2;i<process.argv.length;i+=2) { const name=process.argv[i], value=process.argv[i+1]; if (!allowed.has(name) || flags.has(name) || !value || value.startsWith('--')) throw Error('invalid verified publisher option'); flags.set(name,value); }
    const result = await publishLocalRelease({ directory: flags.get('--directory'), version: flags.get('--version'), source: flags.get('--source'), approveCommit: flags.get('--approve-commit'), approveIndexDigest: flags.get('--approve-index-digest'), approval: flags.get('--approval'), localPublicKeyPath: flags.get('--public-key'), localKeyFingerprint: flags.get('--key-fingerprint'), npmPath: flags.get('--npm'), npmSha256: flags.get('--npm-sha256'), npmAuthFile: flags.get('--npm-auth-file') });
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch (error) { console.error(`verified local publication refused: ${redact(error?.message ?? 'unknown')}; no success is implied; child output is withheld to protect credentials`); process.exitCode=1; }
}
