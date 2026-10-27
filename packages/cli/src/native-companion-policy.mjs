/** Shared component policy, independent of admission tickets and filesystem access. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseStrictObject as parseStrictReleaseIndex } from './release-json.mjs';
import { inspectRuntimeImportReferences } from './release-runtime-references.mjs';

export const NATIVE_COMPANION_PROFILE = 'great-cto-reviewed-companions-v1';
export const NATIVE_COMPANIONS = Object.freeze([
  Object.freeze({ id: 'beads@local', name: 'beads', repository: 'https://github.com/gastownhall/beads', subdirectory: 'plugins/beads' }),
  Object.freeze({ id: 'superpowers@superpowers-marketplace', name: 'superpowers', repository: 'https://github.com/obra/superpowers', subdirectory: '.' }),
]);
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const refusal = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = (value, size) => typeof value === 'string' && new RegExp('^[a-f0-9]{' + size + '}$').test(value);
const exact = (value, keys, code) => {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) refusal(code);
};
const json = file => parseStrictReleaseIndex(file.bytes.toString('utf8'), { maxBytes: 8 * 1024 * 1024 });

/** Explicit public Claude runtime projection, never a recursive cache/repository copy. */
export function isNativeCompanionRuntimePath(name) {
  if (typeof name !== 'string' || !name || name.normalize('NFC') !== name || path.posix.isAbsolute(name) || /[\\\0-\x1f\x7f]/.test(name) || path.posix.normalize(name) !== name) return false;
  if (name === 'LICENSE' || name === '.claude-plugin/plugin.json') return true;
  const parts = name.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /^(?:node_modules|tests?|fixtures?|private(?:-overlay)?s?|overlays?|__pycache__)$/i.test(part))) return false;
  if (/\.(?:test\.[cm]?[jt]s|tgz|log|pem|key|p12|pfx|bak|pyc)$/i.test(name)) return false;
  return /^(?:skills|agents|commands|hooks|lib|scripts|assets)\//.test(name);
}

/** Structural reference validation only; grants no artifact or execution authority. */
export function assertNativeCompanionRuntimeReferences(manifest, files) {
  const names = new Set(files.map(file => file.path));
  const reference = (name, directory = false) => {
    if (typeof name !== 'string' || !name.startsWith('./') || /[\\?#\0]/.test(name)) refusal('native-companion-manifest-reference');
    const member = name.slice(2).replace(/\/$/, '');
    if (!member || path.posix.normalize(member) !== member || member === '..' || member.startsWith('../') ||
      (!names.has(member) && !(directory && files.some(file => file.path.startsWith(member + '/'))))) refusal('native-companion-manifest-reference');
  };
  for (const key of ['skills', 'agents', 'commands', 'outputStyles']) {
    if (!Object.hasOwn(manifest, key)) continue;
    for (const value of Array.isArray(manifest[key]) ? manifest[key] : [manifest[key]]) reference(value, true);
  }
  for (const key of ['hooks', 'mcpServers']) if (typeof manifest[key] === 'string') reference(manifest[key]);
  if (Object.hasOwn(manifest, 'dependencies') && (!Array.isArray(manifest.dependencies) || manifest.dependencies.length)) refusal('native-companion-transitive-dependencies-unsupported');
}

/** Pure structural component check. Returns no admission or execution capability. */
export function validateNativeCompanionFiles(files) {
  const actual = new Map(files.map(file => [file.path, file]));
  const descriptorFile = actual.get('native-companions.json');
  if (!descriptorFile) refusal('native-companion-descriptor-required');
  const descriptor = json(descriptorFile);
  exact(descriptor, ['schema', 'profile', 'components'], 'native-companion-descriptor-shape');
  if (descriptor.schema !== 1 || descriptor.profile !== NATIVE_COMPANION_PROFILE || !Array.isArray(descriptor.components) || descriptor.components.length !== NATIVE_COMPANIONS.length) refusal('native-companion-profile');
  const primary = json(actual.get('.claude-plugin/plugin.json'));
  if (!Array.isArray(primary.dependencies) || JSON.stringify([...primary.dependencies].sort()) !== JSON.stringify(NATIVE_COMPANIONS.map(c => c.id))) refusal('native-companion-required-dependencies');
  const covered = new Set(), components = [];
  for (let i = 0; i < NATIVE_COMPANIONS.length; i++) {
    const expected = NATIVE_COMPANIONS[i], component = descriptor.components[i];
    exact(component, ['id', 'name', 'version', 'root', 'source', 'license', 'files'], 'native-companion-component-shape');
    if (component.id !== expected.id || component.name !== expected.name || component.root !== 'vendor/native/' + expected.name || typeof component.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(component.version)) refusal('native-companion-component-identity');
    exact(component.source, ['repository', 'commit', 'tree', 'subdirectory'], 'native-companion-source-shape');
    if (component.source.repository !== expected.repository || component.source.subdirectory !== expected.subdirectory || !hex(component.source.commit, 40) || !hex(component.source.tree, 40)) refusal('native-companion-source-identity');
    exact(component.license, ['id', 'path', 'sha256'], 'native-companion-license-shape');
    if (component.license.id !== 'MIT' || component.license.path !== 'LICENSE' || !hex(component.license.sha256, 64)) refusal('native-companion-license-identity');
    if (!Array.isArray(component.files) || !component.files.length || component.files.length > 5000) refusal('native-companion-inventory-limit');
    let previous = '', total = 0;
    const members = [];
    for (const entry of component.files) {
      exact(entry, ['path', 'size', 'sha256', 'mode', 'sourcePath', 'sourceBlob'], 'native-companion-entry-shape');
      if (!isNativeCompanionRuntimePath(entry.path) || entry.path <= previous || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 8 * 1024 * 1024 || !hex(entry.sha256, 64) || ![0o644, 0o755].includes(entry.mode) || !hex(entry.sourceBlob, 40)) refusal('native-companion-entry-identity');
      previous = entry.path; total += entry.size;
      if (total > 64 * 1024 * 1024) refusal('native-companion-inventory-limit');
      const sourcePath = expected.subdirectory === '.' || entry.path === 'LICENSE' ? entry.path : expected.subdirectory + '/' + entry.path;
      if (entry.sourcePath !== sourcePath) refusal('native-companion-source-path');
      const name = component.root + '/' + entry.path, file = actual.get(name);
      if (!file || covered.has(name) || file.bytes.length !== entry.size || file.mode !== entry.mode || sha(file.bytes) !== entry.sha256 || sha(Buffer.concat([Buffer.from(`blob ${file.bytes.length}\0`), file.bytes]), 'sha1') !== entry.sourceBlob) refusal('native-companion-member-mismatch');
      covered.add(name); members.push({ ...file, path: entry.path });
    }
    const manifestFile = members.find(file => file.path === '.claude-plugin/plugin.json');
    const licenseFile = members.find(file => file.path === 'LICENSE');
    if (!manifestFile || !licenseFile || !licenseFile.bytes.length || sha(licenseFile.bytes) !== component.license.sha256) refusal('native-companion-license-or-manifest-missing');
    const manifest = json(manifestFile);
    if (manifest.name !== component.name || manifest.version !== component.version || manifest.license !== 'MIT') refusal('native-companion-manifest-identity');
    assertNativeCompanionRuntimeReferences(manifest, members); inspectRuntimeImportReferences(members);
    components.push({ id: component.id, name: component.name, version: component.version, root: component.root,
      source: { ...component.source }, inventoryDigest: sha(JSON.stringify(component.files)), files: members.length });
  }
  if (files.some(file => file.path.startsWith('vendor/native/') && !covered.has(file.path))) refusal('native-companion-unlisted-member');
  return components;
}
