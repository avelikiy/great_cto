/** Offline source projection from locked Git objects; never installs or signs. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NATIVE_COMPANIONS, NATIVE_COMPANION_PROFILE, isNativeCompanionRuntimePath, assertNativeCompanionRuntimeReferences, validateNativeCompanionFiles } from '../../packages/cli/src/native-companion-policy.mjs';
import { assertNativeCompanionProjection, projectNativeCompanionPath, projectNativeCompanionBytes } from '../../packages/cli/src/native-companion-projection.mjs';
import { releaseArchivePath } from '../../packages/cli/src/release-archive.mjs';
import { parseStrictReleaseIndex, inspectRuntimeImportReferences } from '../../packages/cli/src/release-trust.mjs';

const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const gitHash = (kind, bytes) => sha(Buffer.concat([Buffer.from(`${kind} ${bytes.length}\0`), bytes]), 'sha1');
const fail = code => { throw new Error(code); };
function treeEntries(bytes) {
  const rows = [], names = new Set(); let at = 0;
  while (at < bytes.length) {
    const space = bytes.indexOf(0x20, at), zero = bytes.indexOf(0, space + 1);
    if (space <= at || zero <= space + 1 || zero + 21 > bytes.length || zero - space - 1 > 255) fail('companion-source-tree-shape');
    const rawMode = bytes.subarray(at, space);
    if (rawMode.some(byte => byte < 0x30 || byte > 0x37)) fail('companion-source-tree-shape');
    const mode = rawMode.toString('ascii');
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(space + 1, zero)); }
    catch { fail('companion-source-tree-name'); }
    if (!['40000', '100644', '100755', '120000', '160000'].includes(mode) || /[\/\\\0-\x1f\x7f]/.test(name) || name === '.' || name === '..' || names.has(name)) fail('companion-source-tree-shape');
    names.add(name); rows.push({ mode, name, oid: bytes.subarray(zero + 1, zero + 21).toString('hex') }); at = zero + 21;
  }
  return rows;
}
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('companion-lock-shape');
};
function directory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || fs.realpathSync(value) !== path.resolve(value)) fail('companion-source-directory');
  for (let current = value; current !== path.dirname(current); current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('companion-source-symlink');
  }
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.mode & 0o022 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) fail('companion-source-directory');
  return value;
}

/** Explicit operator map to pre-fetched Git object stores; no working-tree copy or fetch fallback. */
export function prepareNativeCompanionBundle({ lock, repositories, gitPath = '/usr/bin/git' }) {
  exact(lock, ['schema', 'profile', 'components']);
  if (lock.schema !== 1 || lock.profile !== NATIVE_COMPANION_PROFILE || !Array.isArray(lock.components) || lock.components.length !== NATIVE_COMPANIONS.length) fail('companion-lock-profile');
  exact(repositories, NATIVE_COMPANIONS.map(component => component.id));
  if (typeof gitPath !== 'string' || !path.isAbsolute(gitPath) || fs.realpathSync(gitPath) !== gitPath) fail('companion-git-path');
  const files = [], components = [];
  for (let i = 0; i < NATIVE_COMPANIONS.length; i++) {
    const expected = NATIVE_COMPANIONS[i], entry = lock.components[i];
    exact(entry, ['id', 'name', 'version', 'projection', 'source']); exact(entry.source, ['repository', 'commit', 'tree', 'subdirectory']);
    if (entry.id !== expected.id || entry.name !== expected.name || entry.source.repository !== expected.repository || entry.source.subdirectory !== expected.subdirectory || !/^[a-f0-9]{40}$/.test(entry.source.commit) || !/^[a-f0-9]{40}$/.test(entry.source.tree) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(entry.version)) fail('companion-lock-identity');
    assertNativeCompanionProjection(entry);
    const repo = directory(repositories?.[entry.id]);
    const deadline = performance.now() + 120000;
    const git = args => {
      try {
        if (performance.now() >= deadline) fail('companion-source-deadline');
        return execFileSync(gitPath, ['--no-replace-objects', '-c', 'protocol.allow=never', '-c', 'core.hooksPath=/dev/null', '--git-dir', repo, ...args], {
          encoding: null, timeout: Math.max(1, Math.floor(Math.min(10000, deadline - performance.now()))), maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
        });
      } catch { fail('companion-source-query-failed'); }
    };
    // cat-file itself can lazy-fetch missing promisor objects. Reject such stores
    // before querying objects, with protocol denial as independent defense.
    const config = git(['config', '--null', '--list', '--includes']).toString('utf8');
    if (config.split('\0').some(row => /^(?:extensions\.partialclone|remote\..+\.(?:promisor|partialclonefilter))$/i.test(row.split('\n')[0])) ||
      (fs.existsSync(path.join(repo, 'objects/pack')) && fs.readdirSync(path.join(repo, 'objects/pack')).some(name => name.endsWith('.promisor')))) fail('companion-promisor-source-refused');
    const commit = git(['cat-file', 'commit', entry.source.commit]);
    if (gitHash('commit', commit) !== entry.source.commit || !commit.toString('utf8').startsWith('tree ' + entry.source.tree + '\n') ||
      commit.toString('utf8').split('\n\n')[0].split('\n').filter(line => line.startsWith('tree ')).length !== 1) fail('companion-source-object-identity');
    const members = [], names = new Set(); let total = 0, treeCount = 0, treeBytes = 0;
    const relativePath = sourcePath => {
      if (sourcePath === 'LICENSE' || expected.subdirectory === '.') return sourcePath;
      return sourcePath.startsWith(expected.subdirectory + '/') ? sourcePath.slice(expected.subdirectory.length + 1) : null;
    };
    const descend = sourcePath => {
      if (expected.subdirectory !== '.' && (expected.subdirectory === sourcePath || expected.subdirectory.startsWith(sourcePath + '/'))) return true;
      const relative = relativePath(sourcePath);
      return relative !== null && (relative === '.claude-plugin' || isNativeCompanionRuntimePath(relative + '/entry'));
    };
    const walk = (oid, prefix = '', depth = 0) => {
      if (depth > 64 || ++treeCount > 5000) fail('companion-source-limit');
      const bytes = git(['cat-file', 'tree', oid]); treeBytes += bytes.length;
      if (treeBytes > 64 * 1024 * 1024 || gitHash('tree', bytes) !== oid) fail('companion-source-tree-identity');
      for (const node of treeEntries(bytes)) {
        const { mode, oid: blob } = node, sourcePath = prefix ? prefix + '/' + node.name : node.name;
        if (sourcePath.length > 4096) fail('companion-source-limit');
        if (mode === '40000') { if (descend(sourcePath)) walk(blob, sourcePath, depth + 1); continue; }
        if (descend(sourcePath) && !['100644', '100755'].includes(mode)) fail('companion-source-link-or-submodule');
        const sourceRelative = relativePath(sourcePath);
        if (sourceRelative === null) continue;
        if (sourceRelative === 'settings.json' || sourceRelative === '.lsp.json') fail('companion-implicit-runtime-unsupported');
        const relative = projectNativeCompanionPath(entry, sourceRelative);
        if (relative === null) continue;
        if (!isNativeCompanionRuntimePath(relative)) continue;
        releaseArchivePath('vendor/native/' + entry.name + '/' + relative);
        if (!['100644', '100755'].includes(mode)) fail('companion-source-link-or-submodule');
        const collision = relative.normalize('NFC').toLowerCase();
        if (names.has(collision)) fail('companion-source-name-collision'); names.add(collision);
        const originalBytes = git(['cat-file', 'blob', blob]);
        if (gitHash('blob', originalBytes) !== blob) fail('companion-source-blob-identity');
        const bytes = projectNativeCompanionBytes(entry, sourceRelative, originalBytes);
        total += bytes.length;
        if (members.length >= 5000 || bytes.length > 8 * 1024 * 1024 || total > 64 * 1024 * 1024) fail('companion-source-limit');
        members.push({ path: relative, bytes, mode: mode === '100755' ? 0o755 : 0o644, sourcePath, sourceBlob: blob });
      }
    };
    walk(entry.source.tree);
    members.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const mf = members.find(file => file.path === '.claude-plugin/plugin.json');
    const license = members.find(file => file.path === 'LICENSE');
    if (!mf || !license || !license.bytes.length) fail('companion-source-license-or-manifest');
    const manifest = parseStrictReleaseIndex(mf.bytes.toString('utf8'));
    if (manifest.name !== expected.name || manifest.version !== entry.version || manifest.license !== 'MIT') fail('companion-source-manifest-identity');
    assertNativeCompanionRuntimeReferences(manifest, members); inspectRuntimeImportReferences(members);
    if (performance.now() >= deadline) fail('companion-source-deadline');
    const root = 'vendor/native/' + entry.name;
    for (const { sourcePath, sourceBlob, ...file } of members) files.push({ ...file, path: root + '/' + file.path });
    components.push({ id: entry.id, name: entry.name, version: entry.version, projection: entry.projection, root, source: { ...entry.source },
      license: { id: 'MIT', path: 'LICENSE', sha256: sha(license.bytes) },
      files: members.map(({ bytes, ...file }) => ({ ...file, size: bytes.length, sha256: sha(bytes) })),
    });
  }
  const descriptor = { schema: 1, profile: NATIVE_COMPANION_PROFILE, components };
  files.push({ path: 'native-companions.json', mode: 0o644, bytes: Buffer.from(JSON.stringify(descriptor, null, 2) + '\n') });
  validateNativeCompanionFiles(files);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { state: 'UNSIGNED_COMPONENT_PREPARATION', authority: 'NONE', runtimeClosure: 'NOT_CHECKED', signed: false, published: false, installed: false, descriptor, files };
}
