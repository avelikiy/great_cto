#!/usr/bin/env node
/** The owner's release-key ceremony, as three commands (B1; ADR-045, ADR-050).
 *
 *   --generate ABS_PRIVATE_PEM   create the Ed25519 key: PKCS8 PEM at that path (0600, never
 *                                overwritten), the public half beside it as `<path>.pub`, and the
 *                                SPKI sha256 printed. The path must be outside this git tree.
 *   --public-key PUB [--write]   print the fingerprint of a public key; with --write, pin it in
 *                                packages/cli/src/release-trust.mjs (one line, for a reviewed commit).
 *   --public-key PUB --check     exit 0 only if that key is the one pinned in source.
 *
 * What it refuses, and why:
 *   - a private key handed to --public-key: the private file never needs to come near the tree;
 *   - a private key path inside the git tree: one `git add .` away from a public repository;
 *   - --write over an enrolled pin: rotation is a reviewed decision with its own ADR, not a flag;
 *   - a key other than Ed25519, or a PEM that is not the canonical single block the signer accepts
 *     (`loadSigningKey` in scripts/sign-embedded-release-set.mjs compares the re-export byte for byte).
 *
 * The private key is written once and never read back, logged or returned. Nothing is sent anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIN_FILE = path.join(ROOT, 'packages', 'cli', 'src', 'release-trust.mjs');
const SENTINEL_LINE = /^export const EMBEDDED_RELEASE_KEY_FINGERPRINT = EMBEDDED_RELEASE_KEY_NOT_ENROLLED;$/m;
const PINNED_LINE = /^export const EMBEDDED_RELEASE_KEY_FINGERPRINT = '([a-f0-9]{64})';$/m;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

/** The SPKI sha256 of a canonical Ed25519 public PEM; throws on anything else. */
export function fingerprintOfPublicPem(pem) {
  if (/PRIVATE KEY/.test(pem)) throw Error('this is a private key: pass the public half (<key>.pub), the private file stays where it is');
  let key;
  try { key = createPublicKey({ key: pem, format: 'pem' }); } catch { throw Error('not a PEM public key'); }
  if (key.asymmetricKeyType !== 'ed25519') throw Error(`Ed25519 release key required, got ${key.asymmetricKeyType}`);
  if (key.export({ type: 'spki', format: 'pem' }) !== pem) throw Error('canonical single SPKI PEM required (no extra blocks, comments or CRLF)');
  return sha256(key.export({ type: 'spki', format: 'der' }));
}

/** The fingerprint pinned in a release-trust.mjs source, or null while it is the sentinel. */
export function pinnedFingerprint(source) {
  const pinned = source.match(PINNED_LINE);
  if (pinned) return pinned[1];
  if (SENTINEL_LINE.test(source)) return null;
  throw Error('release-trust.mjs no longer has the pin line this tool knows: update the tool with the source');
}

/** The source with the sentinel replaced by `fingerprint`; refuses to replace an enrolled pin. */
export function withPin(source, fingerprint) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw Error('fingerprint must be 64 lowercase hex characters');
  const current = pinnedFingerprint(source);
  if (current === fingerprint) return source;
  if (current) throw Error(`a release key is already enrolled (${current}); rotation is a reviewed decision with its own ADR, not --write`);
  return source.replace(SENTINEL_LINE, `export const EMBEDDED_RELEASE_KEY_FINGERPRINT = '${fingerprint}';`);
}

/** Create the key pair. Returns the fingerprint and the two paths; never returns key material. */
export function generateReleaseKey(privatePath, { forbiddenRoots = [ROOT] } = {}) {
  if (typeof privatePath !== 'string' || !path.isAbsolute(privatePath)) throw Error('--generate needs an absolute path');
  const dir = fs.realpathSync(path.dirname(privatePath));
  const target = path.join(dir, path.basename(privatePath));
  for (const root of forbiddenRoots) if (inside(fs.realpathSync(root), target)) throw Error('the private key must live outside the source tree');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  // 'wx': an existing key is never overwritten — losing a release key to a typo is not recoverable.
  fs.writeFileSync(target, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(target + '.pub', publicPem, { mode: 0o644, flag: 'wx' });
  return { fingerprint: fingerprintOfPublicPem(publicPem), privatePath: target, publicPath: target + '.pub' };
}

function main(argv) {
  const [flag, value, ...rest] = argv;
  if (flag === '--generate' && value && rest.length === 0) {
    const r = generateReleaseKey(value);
    process.stdout.write(`private key  ${r.privatePath} (0600: back it up offline now)\npublic key   ${r.publicPath}\nfingerprint  ${r.fingerprint}\n`);
    return 0;
  }
  if (flag === '--public-key' && value && rest.length <= 1 && (rest.length === 0 || ['--write', '--check'].includes(rest[0]))) {
    const fingerprint = fingerprintOfPublicPem(fs.readFileSync(value, 'utf8'));
    const source = fs.readFileSync(PIN_FILE, 'utf8');
    if (rest[0] === '--check') {
      const pinned = pinnedFingerprint(source);
      process.stdout.write(`key ${fingerprint}\npin ${pinned ?? 'NOT_ENROLLED'}\n`);
      return pinned === fingerprint ? 0 : 1;
    }
    if (rest[0] === '--write') {
      const next = withPin(source, fingerprint);
      if (next !== source) fs.writeFileSync(PIN_FILE, next);
      process.stdout.write(`pinned ${fingerprint} in ${path.relative(ROOT, PIN_FILE)}${next === source ? ' (already)' : ''}\n`);
      return 0;
    }
    process.stdout.write(fingerprint + '\n');
    return 0;
  }
  process.stderr.write('usage: enroll-release-key.mjs --generate ABS_PRIVATE_PEM\n       enroll-release-key.mjs --public-key PUB_PEM [--write | --check]\n');
  return 2;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (process.argv[1] && isMain()) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`enroll-release-key: ${e.message}\n`); process.exitCode = 1; }
}
