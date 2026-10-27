/** Offline source projection from locked Git objects; never installs or signs. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NATIVE_COMPANIONS, NATIVE_COMPANION_PROFILE, isNativeCompanionRuntimePath, assertNativeCompanionRuntimeReferences } from '../../packages/cli/src/native-companion-policy.mjs';
import { parseStrictReleaseIndex, inspectRuntimeImportReferences } from '../../packages/cli/src/release-trust.mjs';

const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const gitHash = (kind, bytes) => sha(Buffer.concat([Buffer.from(`${kind} ${bytes.length}\0`), bytes]), 'sha1');
const fail = code => { throw new Error(code); };
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

/** repositories is an explicit operator map to pre-fetched bare repositories. No fetch fallback. */
export function prepareNativeCompanionBundle({ lock, repositories, gitPath = '/usr/bin/git' }) {
  exact(lock, ['schema', 'profile', 'components']);
  if (lock.schema !== 1 || lock.profile !== NATIVE_COMPANION_PROFILE || !Array.isArray(lock.components) || lock.components.length !== NATIVE_COMPANIONS.length) fail('companion-lock-profile');
  exact(repositories, NATIVE_COMPANIONS.map(component => component.id));
  if (typeof gitPath !== 'string' || !path.isAbsolute(gitPath) || fs.realpathSync(gitPath) !== gitPath) fail('companion-git-path');
  const files = [], components = [];
  for (let i = 0; i < NATIVE_COMPANIONS.length; i++) {
    const expected = NATIVE_COMPANIONS[i], entry = lock.components[i];
    exact(entry, ['id', 'name', 'version', 'source']); exact(entry.source, ['repository', 'commit', 'tree', 'subdirectory']);
    if (entry.id !== expected.id || entry.name !== expected.name || entry.source.repository !== expected.repository || entry.source.subdirectory !== expected.subdirectory || !/^[a-f0-9]{40}$/.test(entry.source.commit) || !/^[a-f0-9]{40}$/.test(entry.source.tree) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(entry.version)) fail('companion-lock-identity');
    const repo = directory(repositories?.[entry.id]);
    const git = args => {
      try {
        return execFileSync(gitPath, ['--no-replace-objects', '--git-dir', repo, ...args], {
          encoding: null, timeout: 10000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' },
        });
      } catch { fail('companion-source-query-failed'); }
    };
    const commit = git(['cat-file', 'commit', entry.source.commit]);
    const tree = git(['cat-file', 'tree', entry.source.tree]);
    if (gitHash('commit', commit) !== entry.source.commit || gitHash('tree', tree) !== entry.source.tree || !commit.toString('utf8').startsWith('tree ' + entry.source.tree + '\n')) fail('companion-source-object-identity');
    const members = [], names = new Set(); let total = 0;
    const rows = new TextDecoder('utf-8', { fatal: true }).decode(git(['ls-tree', '-rz', entry.source.commit])).split('\0').filter(Boolean);
    for (const row of rows) {
      const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40})\t(.+)$/.exec(row);
      if (!match) fail('companion-source-tree-shape');
      const [ , mode, kind, blob, sourcePath ] = match;
      let relative;
      if (sourcePath === 'LICENSE') relative = 'LICENSE';
      else if (expected.subdirectory === '.') relative = sourcePath;
      else if (sourcePath.startsWith(expected.subdirectory + '/')) relative = sourcePath.slice(expected.subdirectory.length + 1);
      else continue;
      if (!isNativeCompanionRuntimePath(relative)) continue;
      if (kind !== 'blob' || !['100644', '100755'].includes(mode)) fail('companion-source-link-or-submodule');
      const collision = relative.normalize('NFC').toLowerCase();
      if (names.has(collision)) fail('companion-source-name-collision'); names.add(collision);
      const bytes = git(['cat-file', 'blob', blob]);
      if (gitHash('blob', bytes) !== blob) fail('companion-source-blob-identity');
      total += bytes.length;
      if (members.length >= 5000 || bytes.length > 8 * 1024 * 1024 || total > 64 * 1024 * 1024) fail('companion-source-limit');
      members.push({ path: relative, bytes, mode: mode === '100755' ? 0o755 : 0o644, sourcePath, sourceBlob: blob });
    }
    members.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const mf = members.find(file => file.path === '.claude-plugin/plugin.json');
    const license = members.find(file => file.path === 'LICENSE');
    if (!mf || !license || !license.bytes.length) fail('companion-source-license-or-manifest');
    const manifest = parseStrictReleaseIndex(mf.bytes.toString('utf8'));
    if (manifest.name !== expected.name || manifest.version !== entry.version || manifest.license !== 'MIT') fail('companion-source-manifest-identity');
    assertNativeCompanionRuntimeReferences(manifest, members); inspectRuntimeImportReferences(members);
    const root = 'vendor/native/' + entry.name;
    for (const { sourcePath, sourceBlob, ...file } of members) files.push({ ...file, path: root + '/' + file.path });
    components.push({ id: entry.id, name: entry.name, version: entry.version, root, source: { ...entry.source },
      license: { id: 'MIT', path: 'LICENSE', sha256: sha(license.bytes) },
      files: members.map(({ bytes, ...file }) => ({ ...file, size: bytes.length, sha256: sha(bytes) })),
    });
  }
  const descriptor = { schema: 1, profile: NATIVE_COMPANION_PROFILE, components };
  files.push({ path: 'native-companions.json', mode: 0o644, bytes: Buffer.from(JSON.stringify(descriptor, null, 2) + '\n') });
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { state: 'UNSIGNED_COMPONENT_PREPARATION', authority: 'NONE', runtimeClosure: 'NOT_CHECKED', signed: false, published: false, installed: false, descriptor, files };
}
