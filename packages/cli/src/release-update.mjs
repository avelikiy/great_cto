/** Trusted consumer orchestration. Downloaded bytes cannot choose policy or tools. */
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { admitRelease, parseStrictReleaseIndex, readTrustedLocalPublicKey } from './release-trust.mjs';
import { activateNpmRelease, resolveNpmInstallation } from './release-activation.mjs';

const REPOSITORY = 'avelikiy/great_cto';
const API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const HASH = /^[a-f0-9]{64}$/;
const REDIRECT_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
const CAPS = { index: 256 * 1024, bundle: 2 * 1024 * 1024, archive: 128 * 1024 * 1024 };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stateHome = () => path.join(homedir(), '.great_cto', 'distribution-trust');

function stableVersion(value) {
  if (typeof value !== 'string' || !VERSION.test(value)) throw Error('invalid exact stable release version');
  return value;
}
function compare(a, b) {
  const x = stableVersion(a).split('.').map(Number), y = stableVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
function canonicalDirectory(dir, create = false) {
  if (!path.isAbsolute(dir)) throw Error('state directory must be absolute');
  if (create) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(dir) !== path.resolve(dir)) throw Error('state directory must be canonical');
  const s = fs.lstatSync(dir);
  if (!s.isDirectory() || (s.mode & 0o077) || (process.getuid && s.uid !== process.getuid())) throw Error('state directory must be private and owned');
  return dir;
}
function regular(file, max, { privateFile = false } = {}) {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== path.resolve(file)) throw Error('toolchain file must be canonical');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const s = fs.fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.size > max || (s.mode & (privateFile ? 0o077 : 0o022)) || (process.getuid && s.uid !== process.getuid() && s.uid !== 0)) throw Error('unsafe toolchain file');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function executable(file, expected) {
  if (!HASH.test(expected) || digest(regular(file, 256 * 1024 * 1024)) !== expected) throw Error('trusted tool digest mismatch');
  fs.accessSync(file, fs.constants.X_OK);
}
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw Error('invalid operator toolchain schema');
}
function checkedToolchain(config) {
  if (config?.schema === 2) {
    exactKeys(config, ['schema', 'profile', 'publicKey', 'npm']);
    if (config.profile !== 'local-ed25519') throw Error('unsupported operator trust profile');
    exactKeys(config.publicKey, ['path', 'fingerprint']);
    exactKeys(config.npm, ['path', 'sha256']);
    readTrustedLocalPublicKey(config.publicKey.path, config.publicKey.fingerprint);
    executable(config.npm.path, config.npm.sha256);
    return config;
  }
  exactKeys(config, ['schema', 'cosign', 'trustedRoot', 'npm']);
  if (config.schema !== 1) throw Error('unsupported operator toolchain schema');
  for (const tool of [config.cosign, config.trustedRoot, config.npm]) {
    exactKeys(tool, ['path', 'sha256']);
    if (typeof tool.path !== 'string' || !HASH.test(tool.sha256)) throw Error('invalid operator toolchain pin');
  }
  executable(config.cosign.path, config.cosign.sha256);
  executable(config.npm.path, config.npm.sha256);
  if (digest(regular(config.trustedRoot.path, CAPS.bundle)) !== config.trustedRoot.sha256) throw Error('trusted root digest mismatch');
  return config;
}

/** Registration is explicit operator trust, not authentication of a release. */
export function configureTrustedToolchain(config, { stateRoot = stateHome(), acknowledged = false } = {}) {
  if (!acknowledged) throw Error('independent toolchain acknowledgement required');
  checkedToolchain(config);
  canonicalDirectory(stateRoot, true);
  const file = path.join(stateRoot, 'toolchain.json');
  if (fs.existsSync(file)) throw Error('toolchain already configured; explicit reviewed rotation is required');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(config, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const dir = fs.openSync(stateRoot, fs.constants.O_RDONLY); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  return { state: 'TOOLCHAIN_CONFIGURED', authority: 'operator-toolchain-only', releaseEligibility: 'NOT_CHECKED' };
}
export function readTrustedToolchain({ stateRoot = stateHome() } = {}) {
  canonicalDirectory(stateRoot);
  return checkedToolchain(JSON.parse(regular(path.join(stateRoot, 'toolchain.json'), 8192, { privateFile: true }).toString('utf8')));
}

/** Validate every redirect. No release-supplied URL or bearer token is accepted. */
export function allowedDownloadURL(value, initial) {
  const url = new URL(value), origin = new URL(initial);
  const api = origin.href === API;
  const parts = origin.pathname.match(/^\/avelikiy\/great_cto\/releases\/download\/v([^/]+)\/([^/]+)$/);
  const release = origin.hostname === 'github.com' && !origin.search && parts && VERSION.test(parts[1])
    && ['release-index.json', 'plugin-inventory.json', 'sbom.cdx.json', `great-cto-${parts[1]}.tgz`, `great-cto-plugin-${parts[1]}.tgz`]
      .flatMap(name => [name, name + '.sigstore.json', name + '.signature.json']).includes(parts[2]);
  if (!api && !release) throw Error('refused initial release origin or asset');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error('refused release download URL');
  if (url.href === origin.href) return url.href;
  if (!REDIRECT_HOSTS.has(url.hostname)) throw Error('refused release redirect origin');
  return url.href;
}
export async function readBoundedURL(initial, limit, { fetchFn = fetch, signal = AbortSignal.timeout(180000) } = {}) {
  let next = initial;
  for (let redirects = 0; redirects <= 4; redirects++) {
    allowedDownloadURL(next, initial);
    const response = await fetchFn(next, { redirect: 'manual', signal, headers: { 'user-agent': 'great-cto-verified-update', accept: initial === API ? 'application/vnd.github+json' : 'application/octet-stream', 'accept-encoding': 'identity' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw Error('release redirect without location');
      next = allowedDownloadURL(new URL(location, next).href, initial);
      continue;
    }
    if (!response.ok || !response.body) throw Error('release download unavailable');
    // Fetch decodes compressed responses. Enforce the decoded cap below, but
    // compare Content-Length only when it describes those same identity bytes.
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    if (encoding && !['identity', 'gzip', 'br', 'deflate'].includes(encoding)) { await response.body.cancel(); throw Error('unsupported release content encoding'); }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body.cancel(); throw Error('oversized release download'); }
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { await reader.cancel(); throw Error('oversized release download'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    if (length !== null && (!encoding || encoding === 'identity') && size !== Number(length)) throw Error('truncated release download');
    return Buffer.concat(chunks);
  }
  throw Error('release redirect limit exceeded');
}
export async function discoverReleaseVersion(options = {}) {
  const value = JSON.parse((await readBoundedURL(API, CAPS.index, options)).toString('utf8'));
  if (value.draft !== false || value.prerelease !== false || typeof value.tag_name !== 'string' || !value.tag_name.startsWith('v')) throw Error('no exact stable published release');
  return stableVersion(value.tag_name.slice(1));
}
function storeFile(dir, name, bytes) {
  const fd = fs.openSync(path.join(dir, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export async function stageRelease(version, { stateRoot = stateHome(), fetchFn = fetch, profile = 'github-oidc' } = {}) {
  stableVersion(version);
  if (!['github-oidc', 'local-ed25519'].includes(profile)) throw Error('unsupported release trust profile');
  const suffix = profile === 'local-ed25519' ? '.signature.json' : '.sigstore.json';
  canonicalDirectory(stateRoot, true);
  const parent = canonicalDirectory(path.join(stateRoot, 'staging'), true);
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'candidate-')));
  const base = `https://github.com/${REPOSITORY}/releases/download/v${version}/`;
  const signal = AbortSignal.timeout(180000);
  const get = (name, cap) => readBoundedURL(base + name, cap, { fetchFn, signal });
  try {
    const index = await get('release-index.json', CAPS.index);
    const parsed = parseStrictReleaseIndex(index.toString('utf8'));
    if (parsed.version !== version) throw Error('release index version mismatch');
    storeFile(directory, 'release-index.json', index);
    storeFile(directory, 'release-index.json' + suffix, await get('release-index.json' + suffix, CAPS.bundle));
    // Strict validation fixes all artifact basenames before they reach a URL.
    const names = [
      [`great-cto-${version}.tgz`, CAPS.archive], [`great-cto-plugin-${version}.tgz`, CAPS.archive],
      ['plugin-inventory.json', CAPS.bundle], ['sbom.cdx.json', CAPS.bundle],
    ];
    for (const [name, cap] of names) {
      storeFile(directory, name, await get(name, cap));
      storeFile(directory, name + suffix, await get(name + suffix, CAPS.bundle));
    }
    return directory;
  } catch (error) {
    // Retain downloaded failure evidence, without granting admission.
    storeFile(directory, 'DOWNLOAD_REFUSED.json', Buffer.from(JSON.stringify({ state: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED' })));
    throw error;
  }
}

/** @param {{currentVersion:string,binaryPath:string,releaseVersion?:string,stateRoot?:string}} options */
export async function runVerifiedSelfUpgrade({ currentVersion, binaryPath, releaseVersion, stateRoot = stateHome() }) {
  try {
    resolveNpmInstallation(binaryPath); // Unsupported managers never trigger a download/install.
    const version = releaseVersion ? stableVersion(releaseVersion) : await discoverReleaseVersion();
    if (compare(version, currentVersion) < 0) throw Error('release downgrade refused');
    if (version === currentVersion) return { state: 'ALREADY_CURRENT', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', message: 'Selected version already matches; no update or artifact admission was attempted.' };
    const config = readTrustedToolchain({ stateRoot });
    const profile = config.schema === 2 ? config.profile : 'github-oidc';
    const directory = await stageRelease(version, { stateRoot, profile });
    const trust = profile === 'local-ed25519'
      ? { profile, localPublicKeyPath: config.publicKey.path, localKeyFingerprint: config.publicKey.fingerprint }
      : { profile, cosignPath: config.cosign.path, cosignSha256: config.cosign.sha256,
        trustedRootPath: config.trustedRoot.path, trustedRootSha256: config.trustedRoot.sha256 };
    const admission = admitRelease({ directory, version, currentVersion, ...trust });
    return activateNpmRelease(admission, { binaryPath, stateRoot: path.join(stateRoot, 'transactions'), npmPath: config.npm.path, npmSha256: config.npm.sha256 });
  } catch (error) {
    return { state: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', message: error instanceof Error ? error.message : 'verified update refused' };
  }
}

/** Deliberately narrow CLI: configure trust or inspect it; no candidate controls. */
export function runDistributionCommand(argv, { stateRoot = stateHome() } = {}) {
  try {
    if (argv[0] === 'status') {
      readTrustedToolchain({ stateRoot });
      return { state: 'TOOLCHAIN_CONFIGURED', releaseEligibility: 'NOT_CHECKED' };
    }
    if (argv[0] !== 'configure') throw Error('usage: distribution status | configure --profile local-ed25519 --public-key PATH --key-fingerprint HASH --npm PATH --npm-sha256 HASH --acknowledge-independent-key | configure --cosign PATH --cosign-sha256 HASH --trusted-root PATH --root-sha256 HASH --npm PATH --npm-sha256 HASH --acknowledge-independent-toolchain');
    const flags = new Map();
    for (let i = 1; i < argv.length; i++) {
      const name = argv[i];
      if (flags.has(name) || !['--profile', '--public-key', '--key-fingerprint', '--acknowledge-independent-key', '--cosign', '--cosign-sha256', '--trusted-root', '--root-sha256', '--npm', '--npm-sha256', '--acknowledge-independent-toolchain'].includes(name)) throw Error('unknown or duplicate distribution option');
      if (name === '--acknowledge-independent-toolchain' || name === '--acknowledge-independent-key') flags.set(name, true);
      else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('missing distribution option value'); flags.set(name, argv[++i]); }
    }
    if (flags.get('--profile') === 'local-ed25519') {
      if ([...flags.keys()].some(name => ['--cosign', '--cosign-sha256', '--trusted-root', '--root-sha256', '--acknowledge-independent-toolchain'].includes(name))) throw Error('mixed release trust profiles refused');
      return configureTrustedToolchain({ schema: 2, profile: 'local-ed25519',
        publicKey: { path: flags.get('--public-key'), fingerprint: flags.get('--key-fingerprint') },
        npm: { path: flags.get('--npm'), sha256: flags.get('--npm-sha256') },
      }, { stateRoot, acknowledged: flags.get('--acknowledge-independent-key') === true });
    }
    if ([...flags.keys()].some(name => ['--profile', '--public-key', '--key-fingerprint', '--acknowledge-independent-key'].includes(name))) throw Error('unsupported or mixed release trust profile');
    return configureTrustedToolchain({ schema: 1,
      cosign: { path: flags.get('--cosign'), sha256: flags.get('--cosign-sha256') },
      trustedRoot: { path: flags.get('--trusted-root'), sha256: flags.get('--root-sha256') },
      npm: { path: flags.get('--npm'), sha256: flags.get('--npm-sha256') },
    }, { stateRoot, acknowledged: flags.get('--acknowledge-independent-toolchain') === true });
  } catch (error) { return { state: 'REFUSED', authority: 'NONE', releaseEligibility: 'NOT_CHECKED', message: error instanceof Error ? error.message : 'toolchain configuration refused' }; }
}
