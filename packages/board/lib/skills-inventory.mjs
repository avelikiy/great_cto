import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parseFrontmatter, strictYamlIssues, SIZE_BUDGET, DESC_MIN, DESC_MAX } from '../../../scripts/skill-lint.mjs';

// Discovery is not host activation, trust verification or a quality evaluation.
// Never execute a discovered script or fetch its upstream. No caller-supplied
// roots: only HOME, the server-resolved project, and fixed local registry tiers.
export const INVENTORY_LIMITS = Object.freeze({
  entries: 12000, skills: 2000, depth: 10, fileBytes: 128 * 1024,
  totalBytes: 8 * 1024 * 1024, registryBytes: 2 * 1024 * 1024, milliseconds: 1500,
  cacheEntries: 2500, cacheSkills: 300, cacheMilliseconds: 450,
});
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safeDeclaration = value => typeof value === 'string' && !/\/(?:Users|home)\//.test(value)
  ? value.slice(0, 160) : null;

async function readBounded(file, max, root) {
  let handle;
  try {
    if (!inside(root, await fs.realpath(file))) return { state: 'outside-root' };
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile()) return { state: 'unreadable' };
    if (before.size > max) return { state: 'too-large' };
    const bytes = Buffer.alloc(max + 1);
    let size = 0;
    while (size <= max) {
      const read = await handle.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    const after = await handle.stat();
    if (size > max) return { state: 'too-large' };
    if (before.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs) return { state: 'changed-during-read' };
    return { state: 'observed', bytes: bytes.subarray(0, size) };
  } catch (e) {
    return { state: e.code === 'ENOENT' ? 'missing' : 'unreadable' };
  } finally { await handle?.close(); }
}

export async function skillInventory({ home = os.homedir(), cwd, limits = {} } = {}) {
  const started = Date.now();
  // macOS /tmp is a system alias for /private/tmp, not a skill symlink.
  // Normalize only the trusted base once, rejecting symlinks below that base.
  const originalHome = path.resolve(home), originalCwd = cwd && path.resolve(cwd);
  home = await fs.realpath(home);
  if (cwd) cwd = await fs.realpath(cwd);
  const cap = Object.fromEntries(Object.entries(INVENTORY_LIMITS).map(([key, value]) =>
    [key, Number.isInteger(limits[key]) && limits[key] > 0 ? Math.min(value, limits[key]) : value]));
  const roots = [
    ['.claude/skills', 'Claude Code'], ['.codex/skills', 'Codex'], ['.agents/skills', 'Shared'],
    ['.claude/plugins/cache', 'Claude Code'], ['.codex/plugins/cache', 'Codex'],
  ].map(([rel, host]) => ({ root: path.join(home, rel), label: '~/' + rel, host, scope: 'machine', cache: rel.endsWith('/cache') }));
  if (cwd) for (const [rel, host] of [['.claude/skills', 'Claude Code'], ['.codex/skills', 'Codex'], ['.agents/skills', 'Shared']])
    roots.push({ root: path.join(cwd, rel), label: 'project/' + rel, host, scope: 'project' });
  // A large plugin's node_modules must not starve selected-project roots.
  roots.sort((a, b) => Number(Boolean(a.cache)) - Number(Boolean(b.cache)));
  const registryRoots = ['catalog', 'anthropic-skills', 'personal-skills'].map(rel => ({
    root: path.join(home, '.great_cto', rel), label: '~/.great_cto/' + rel, host: 'Registry', scope: 'machine',
  }));
  const skills = [], sources = [], byFile = new Map();
  let entries = 0, readBytes = 0, truncated = false;
  const exhausted = () => {
    if (entries >= cap.entries || skills.length >= cap.skills || readBytes >= cap.totalBytes || Date.now() - started > cap.milliseconds) {
      truncated = true; return true;
    }
    return false;
  };
  async function add(file, source, declaredSource = null) {
    if (byFile.has(file)) {
      if (declaredSource) byFile.get(file).declared_source = safeDeclaration(declaredSource);
      return;
    }
    const read = await readBounded(file, Math.min(cap.fileBytes, cap.totalBytes - readBytes), source.root);
    readBytes += read.bytes?.length || 0;
    const location = source.label + '/' + path.relative(source.root, file).split(path.sep).join('/');
    const name = path.basename(file) === 'SKILL.md' ? path.basename(path.dirname(file)) : path.basename(file, '.md');
    const warnings = [];
    if (read.state === 'observed' && path.basename(file) === 'SKILL.md') {
      const text = read.bytes.toString('utf8');
      try {
        const fm = parseFrontmatter(text);
        if (!fm) warnings.push('missing-frontmatter');
        else {
          if (fm.data.name !== name) warnings.push('name-mismatch');
          const d = fm.data.description;
          if (typeof d !== 'string' || d.length < DESC_MIN || d.length > DESC_MAX) warnings.push('description-length');
        }
      } catch { warnings.push('invalid-frontmatter'); }
      if (strictYamlIssues(text).length) warnings.push('ambiguous-yaml');
      if (read.bytes.length > SIZE_BUDGET) warnings.push('over-context-budget');
    }
    if (read.state !== 'observed') source.state = 'partial';
    const segments = path.relative(source.root, file).split(path.sep);
    const row = { id: digest(source.scope + ':' + location).slice(0, 24), name, host: source.host, scope: source.scope,
      location, declared_source: safeDeclaration(declaredSource),
      cache_version: source.cache && segments.length > 3 ? safeDeclaration(segments[2]) : null,
      read_state: read.state, bytes: read.bytes?.length ?? null,
      document_sha256: read.bytes ? digest(read.bytes) : null, integrity: 'document-only',
      upstream_revision: null, enabled: 'unknown', loaded: 'unknown', quality: 'not-measured', warnings };
    skills.push(row); byFile.set(file, row);
  }
  async function scanSource(descriptor) {
    const source = { ...descriptor, state: 'observed', warnings: [] };
    sources.push(source);
    if (exhausted()) { source.state = 'not-scanned'; return; }
    const startEntries = entries, startSkills = skills.length, startTime = Date.now();
    const sourceExhausted = () => {
      if (exhausted()) return true;
      if (source.cache && (entries - startEntries >= cap.cacheEntries
        || skills.length - startSkills >= cap.cacheSkills || Date.now() - startTime > cap.cacheMilliseconds)) {
        source.state = 'partial';
        if (!source.warnings.includes('source-limit')) source.warnings.push('source-limit');
        truncated = true; return true;
      }
      return false;
    };
    // Reject symlinked ancestors too; directory traversal is fixed, not an
    // arbitrary-file capability. Not an atomic sandbox against a hostile same-UID process.
    try {
      if (await fs.realpath(source.root) !== path.resolve(source.root)) {
        source.state = 'partial'; source.warnings.push('symlink-skipped'); return;
      }
    } catch (e) { source.state = e.code === 'ENOENT' ? 'absent' : 'unreadable'; return; }
    const queue = [[source.root, 0]];
    while (queue.length && !sourceExhausted()) {
      const [dir, depth] = queue.shift();
      let handle;
      try {
        if (await fs.realpath(dir) !== dir) { source.state = 'partial'; source.warnings.push('symlink-skipped'); continue; }
        handle = await fs.opendir(dir);
        for await (const entry of handle) {
          ++entries;
          if (sourceExhausted()) break;
          const file = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) {
            source.state = 'partial';
            if (!source.warnings.includes('symlink-skipped')) source.warnings.push('symlink-skipped');
          } else if (entry.isDirectory()) {
            // Host caches are vendor/product/version/{skills,.codex-plugin}.
            // Beyond version roots, traverse only skill-bearing directories,
            // not package sources, git trees, assets or dependency installations.
            const segments = path.relative(source.root, dir).split(path.sep);
            const skillArea = segments.some(s => s === 'skills' || s === 'migrated-command-skills');
            if (source.cache && depth >= 3 && !skillArea
              && !['skills', '.codex-plugin', 'migrated-command-skills'].includes(entry.name)) continue;
            if (['.git', 'node_modules'].includes(entry.name)) continue;
            if (depth < cap.depth) queue.push([file, depth + 1]);
            else { source.state = 'partial'; source.warnings.push('depth-limit'); truncated = true; }
          } else if (entry.isFile() && entry.name === 'SKILL.md'
            && (!source.cache || path.relative(source.root, file).split(path.sep).some(s => s === 'skills' || s === 'migrated-command-skills'))) {
            await add(file, source);
          }
        }
      } catch { source.state = 'unreadable'; }
      // for-await owns the directory handle, including early break.
    }
    if (queue.length) source.state = 'partial';
  }
  // Local project/host directories and the existing registry have priority over
  // large historical plugin caches. Each cache also gets its own bounded share.
  for (const root of roots.filter(r => !r.cache)) await scanSource(root);
  const registryFile = path.join(home, '.great_cto', 'skills-registry.json');
  const registryRead = await readBounded(registryFile, cap.registryBytes, path.join(home, '.great_cto'));
  const registry = { state: registryRead.state === 'missing' ? 'absent' : 'unreadable', declared_at: null, plugin_version: null };
  if (registryRead.state === 'observed') {
    try {
      const data = JSON.parse(registryRead.bytes.toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid registry');
      const tiers = ['tier1_great_cto', 'tier2_external', 'tier3_personal'];
      if (!tiers.some(key => Array.isArray(data[key]))) throw new Error('invalid registry');
      registry.state = 'observed';
      registry.declared_at = /^\d{4}-\d{2}-\d{2}T/.test(data.discovered_at || '') ? String(data.discovered_at).slice(0, 32) : null;
      registry.plugin_version = safeDeclaration(data.plugin_version);
      const source = { label: '~/.great_cto/skills-registry.json', state: 'observed', warnings: [], host: 'Registry', scope: 'machine' };
      sources.push(source);
      for (const key of tiers) {
        if (data[key] !== undefined && !Array.isArray(data[key])) { source.state = 'partial'; continue; }
        for (const entry of data[key] || []) {
          ++entries;
          if (exhausted()) { source.state = 'partial'; break; }
          let file = typeof entry?.path === 'string' && path.isAbsolute(entry.path) ? path.resolve(entry.path) : null;
          if (file && inside(originalHome, file)) file = path.join(home, path.relative(originalHome, file));
          else if (file && originalCwd && inside(originalCwd, file)) file = path.join(cwd, path.relative(originalCwd, file));
          const allowed = file && [...roots, ...registryRoots].find(r => inside(r.root, file));
          if (!allowed || !file.endsWith('.md')) { source.state = 'partial'; source.warnings.push('unmanaged-path'); continue; }
          // Registry entries must not bypass the directory symlink guard.
          try {
            if (await fs.realpath(file) !== file) throw new Error('symlink');
          } catch {
            source.state = 'partial';
            source.warnings.push('unavailable-declaration');
            continue;
          }
          await add(file, { ...allowed, state: 'observed' }, entry.source);
          if (byFile.get(file)?.read_state !== 'observed') source.state = 'partial';
        }
      }
      source.warnings = [...new Set(source.warnings)];
    } catch { registry.state = 'unreadable'; }
  }
  for (const root of roots.filter(r => r.cache)) await scanSource(root);
  const partial = truncated || registry.state === 'unreadable' || sources.some(s => !['observed', 'absent'].includes(s.state));
  return { schema: 1, state: partial ? 'partial' : 'observed', observed_at: new Date().toISOString(),
    duration_ms: Date.now() - started, truncated, registry,
    sources: sources.map(({ label, host, scope, state, warnings }) => ({ label, host, scope, state, warnings })),
    skills: skills.sort((a, b) => a.location < b.location ? -1 : a.location > b.location ? 1 : 0) };
}

// Bound memory and coalesce concurrent Claude/Codex board requests. This is a
// read cache, not a cross-process lock for installation/update (not implemented).
const cache = new Map();
export function getSkillsInventory(cwd) {
  const key = os.homedir() + '\0' + path.resolve(cwd);
  const previous = cache.get(key);
  if (previous && (!previous.settled || Date.now() - previous.at < 30000)) return previous.promise;
  const item = { at: Date.now(), settled: false, promise: skillInventory({ cwd }) };
  cache.set(key, item);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  item.promise.then(() => { item.settled = true; item.at = Date.now(); },
    () => { if (cache.get(key) === item) cache.delete(key); });
  return item.promise;
}
