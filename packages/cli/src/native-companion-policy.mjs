/** Shared component policy, independent of admission tickets and filesystem access. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseStrictObject as parseStrictReleaseIndex } from './release-json.mjs';
import { inspectRuntimeImportReferences } from './release-runtime-references.mjs';
import { releaseArchivePath } from './release-archive.mjs';
import { assertNativeCompanionProjection, originalNativeCompanionMember, BEADS_GUIDANCE_PROJECTION } from './native-companion-projection.mjs';

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
  try { releaseArchivePath(name); } catch { return false; }
  if (name === 'LICENSE' || name === '.claude-plugin/plugin.json' || name === '.mcp.json') return true;
  const parts = name.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /^(?:node_modules|tests?|fixtures?|private(?:-overlay)?s?|overlays?|__pycache__)$/i.test(part))) return false;
  if (/\.(?:test\.[cm]?[jt]s|tgz|log|pem|key|p12|pfx|bak|pyc)$/i.test(name)) return false;
  return /^(?:skills|agents|commands|hooks|lib|scripts|assets|types)\//.test(name);
}

/** Structural reference validation only; grants no artifact or execution authority. */
export function assertNativeCompanionRuntimeReferences(manifest, files) {
  const actual = new Map(files.map(file => [file.path, file])), names = new Set(actual.keys());
  const allowedKeys = new Set(['name', 'version', 'description', 'author', 'repository', 'homepage', 'license', 'keywords', 'skills', 'agents', 'commands', 'outputStyles', 'types', 'hooks', 'mcpServers', 'dependencies']);
  if (!object(manifest) || Object.keys(manifest).some(key => !allowedKeys.has(key))) refusal('native-companion-manifest-extension');
  const reference = (name, directory = false) => {
    if (typeof name !== 'string' || !name.startsWith('./') || /[\\?#\0]/.test(name)) refusal('native-companion-manifest-reference');
    const member = name.slice(2).replace(/\/$/, '');
    if (!member || path.posix.normalize(member) !== member || member === '..' || member.startsWith('../') ||
      (!names.has(member) && !(directory && files.some(file => file.path.startsWith(member + '/'))))) refusal('native-companion-manifest-reference');
    return member;
  };
  for (const key of ['skills', 'agents', 'commands', 'outputStyles']) {
    if (!Object.hasOwn(manifest, key)) continue;
    for (const value of Array.isArray(manifest[key]) ? manifest[key] : [manifest[key]]) reference(value, true);
  }
  if (Object.hasOwn(manifest, 'types')) reference(manifest.types);
  const read = name => json(actual.get(reference(name)));
  const mcp = config => {
    if (!object(config)) refusal('native-companion-mcp-shape');
    const servers = Object.hasOwn(config, 'mcpServers') ? config.mcpServers : config;
    if (Object.hasOwn(config, 'mcpServers')) exact(config, ['mcpServers'], 'native-companion-mcp-extension');
    if (!object(servers) || !Object.keys(servers).length) refusal('native-companion-mcp-shape');
    for (const server of Object.values(servers)) {
      if (!object(server) || Object.keys(server).some(key => !['command', 'args', 'env', 'type'].includes(key)) || server.command !== 'node' ||
        (Object.hasOwn(server, 'type') && server.type !== 'stdio') ||
        (Object.hasOwn(server, 'env') && (!object(server.env) || Object.keys(server.env).length)) || !Array.isArray(server.args) || server.args.length !== 1) refusal('native-companion-mcp-unsupported');
      const match = typeof server.args[0] === 'string' && /^\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+\.[cm]?js)$/.exec(server.args[0]);
      if (!match) refusal('native-companion-manifest-reference'); reference('./' + match[1]);
    }
  };
  if (Object.hasOwn(manifest, 'mcpServers')) mcp(typeof manifest.mcpServers === 'string' ? read(manifest.mcpServers) : manifest.mcpServers);
  if (actual.has('.mcp.json')) {
    if (Object.hasOwn(manifest, 'mcpServers') && manifest.mcpServers !== './.mcp.json') refusal('native-companion-mcp-ambiguous');
    mcp(json(actual.get('.mcp.json')));
  }
  const hooks = config => {
    if (!object(config)) refusal('native-companion-hooks-shape');
    if (Object.hasOwn(config, 'hooks')) { exact(config, ['hooks'], 'native-companion-hooks-extension'); config = config.hooks; }
    const events = new Set(['SessionStart', 'PreCompact', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit']);
    if (!object(config)) refusal('native-companion-hooks-shape');
    for (const [event, groups] of Object.entries(config)) {
      if (!events.has(event) || !Array.isArray(groups)) refusal('native-companion-hooks-unsupported');
      for (const group of groups) {
        if (!object(group) || Object.keys(group).some(key => !['matcher', 'hooks'].includes(key)) ||
          (Object.hasOwn(group, 'matcher') && typeof group.matcher !== 'string') || !Array.isArray(group.hooks)) refusal('native-companion-hooks-shape');
        for (const hook of group.hooks) {
          if (!object(hook) || Object.keys(hook).some(key => !['type', 'command', 'shell', 'async', 'timeout', 'statusMessage'].includes(key)) ||
            hook.type !== 'command' || typeof hook.command !== 'string' ||
            (Object.hasOwn(hook, 'shell') && hook.shell !== 'bash') || (Object.hasOwn(hook, 'async') && hook.async !== false) ||
            (Object.hasOwn(hook, 'timeout') && (!Number.isSafeInteger(hook.timeout) || hook.timeout <= 0 || hook.timeout > 300)) ||
            (Object.hasOwn(hook, 'statusMessage') && (typeof hook.statusMessage !== 'string' || hook.statusMessage.length > 256))) refusal('native-companion-hooks-unsupported');
          // Only known bounded forms, not a shell parser or dynamic closure proof.
          if (hook.command === 'bd prime') continue;
          const command = /^(node )?"\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+)"(?: ([a-z0-9-]+))?$/.exec(hook.command);
          if (!command) refusal('native-companion-hook-command-unsupported');
          reference('./' + command[2]);
          if (command[3]) {
            if (command[1] || command[2] !== 'hooks/run-hook.cmd' || command[3] !== 'session-start') refusal('native-companion-hook-command-unsupported');
            reference('./hooks/session-start');
          }
        }
      }
    }
  };
  if (Object.hasOwn(manifest, 'hooks')) hooks(typeof manifest.hooks === 'string' ? read(manifest.hooks) : manifest.hooks);
  if (actual.has('hooks/hooks.json')) {
    if (Object.hasOwn(manifest, 'hooks') && manifest.hooks !== './hooks/hooks.json') refusal('native-companion-hooks-ambiguous');
    hooks(json(actual.get('hooks/hooks.json')));
  }
  if (Object.hasOwn(manifest, 'dependencies') && (!Array.isArray(manifest.dependencies) || manifest.dependencies.length)) refusal('native-companion-transitive-dependencies-unsupported');
}

/** Pure structural component check. Returns no admission or execution capability. */
export function assertNativeCompanionDeclarations(dependencies) {
  if (!Array.isArray(dependencies) || JSON.stringify([...dependencies].sort()) !== JSON.stringify(NATIVE_COMPANIONS.map(c => c.id))) refusal('native-companion-required-dependencies');
}
export function validateNativeCompanionFiles(files) {
  const actual = new Map(files.map(file => [file.path, file]));
  const descriptorFile = actual.get('native-companions.json');
  if (!descriptorFile) refusal('native-companion-descriptor-required');
  const descriptor = json(descriptorFile);
  exact(descriptor, ['schema', 'profile', 'components'], 'native-companion-descriptor-shape');
  if (descriptor.schema !== 1 || descriptor.profile !== NATIVE_COMPANION_PROFILE || !Array.isArray(descriptor.components) || descriptor.components.length !== NATIVE_COMPANIONS.length) refusal('native-companion-profile');
  const covered = new Set(), components = [];
  for (let i = 0; i < NATIVE_COMPANIONS.length; i++) {
    const expected = NATIVE_COMPANIONS[i], component = descriptor.components[i];
    exact(component, ['id', 'name', 'version', 'projection', 'root', 'source', 'license', 'files'], 'native-companion-component-shape');
    if (component.id !== expected.id || component.name !== expected.name || component.root !== 'vendor/native/' + expected.name || typeof component.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(component.version)) refusal('native-companion-component-identity');
    exact(component.source, ['repository', 'commit', 'tree', 'subdirectory'], 'native-companion-source-shape');
    if (component.source.repository !== expected.repository || component.source.subdirectory !== expected.subdirectory || !hex(component.source.commit, 40) || !hex(component.source.tree, 40)) refusal('native-companion-source-identity');
    assertNativeCompanionProjection(component);
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
      const name = component.root + '/' + entry.path, file = actual.get(name);
      if (!file || covered.has(name) || file.bytes.length !== entry.size || file.mode !== entry.mode || sha(file.bytes) !== entry.sha256) refusal('native-companion-member-mismatch');
      const original = originalNativeCompanionMember(component, entry.path, file.bytes);
      const sourcePath = expected.subdirectory === '.' || original.path === 'LICENSE' ? original.path : expected.subdirectory + '/' + original.path;
      if (entry.sourcePath !== sourcePath) refusal('native-companion-source-path');
      if (sha(Buffer.concat([Buffer.from(`blob ${original.bytes.length}\0`), original.bytes]), 'sha1') !== entry.sourceBlob) refusal('native-companion-source-blob-mismatch');
      covered.add(name); members.push({ ...file, path: entry.path });
    }
    const manifestFile = members.find(file => file.path === '.claude-plugin/plugin.json');
    const licenseFile = members.find(file => file.path === 'LICENSE');
    if (!manifestFile || !licenseFile || !licenseFile.bytes.length || sha(licenseFile.bytes) !== component.license.sha256) refusal('native-companion-license-or-manifest-missing');
    const manifest = json(manifestFile);
    if (component.projection === BEADS_GUIDANCE_PROJECTION && (!members.some(file => file.path === 'skills/beads/SKILL.md') || !members.some(file => file.path === 'skills/beads/resources/AGENT_TRACKING.md'))) refusal('native-companion-derived-members-required');
    if (manifest.name !== component.name || manifest.version !== component.version || manifest.license !== 'MIT') refusal('native-companion-manifest-identity');
    assertNativeCompanionRuntimeReferences(manifest, members); inspectRuntimeImportReferences(members);
    components.push({ id: component.id, name: component.name, version: component.version, projection: component.projection, root: component.root,
      source: { ...component.source }, inventoryDigest: sha(JSON.stringify(component.files)), files: members.length });
  }
  if (files.some(file => file.path.startsWith('vendor/native/') && !covered.has(file.path))) refusal('native-companion-unlisted-member');
  return components;
}
