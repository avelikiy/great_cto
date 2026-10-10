#!/usr/bin/env node
// Publish a checked snapshot into an immutable version directory, never rsync
// over a running installation. This is not host admission or release approval.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInstallTarget } from './local-install-target.mjs';

const RECEIPT = '.great-cto-local-install.json';
const REQUIRED = ['.claude-plugin/plugin.json', 'skills/great_cto/ARCHETYPES.md',
  'skills/great_cto/SKILL.md', 'agents/architect.md',
  'scripts/hooks/auto-attach-reviewers.mjs', 'commands/start.md'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function isInstallFile(name) {
  const parts = name.split('/');
  if (!name || name.startsWith('/') || parts.some(p => !p || p === '.' || p === '..')) return false;
  if (parts.some(p => ['.git', 'node_modules', '.beads', '.great_cto', '.claude', '.codex'].includes(p))) return false;
  if (parts.some(p => /^\.env(?:$|\.)/.test(p) && !/^\.env\.(?:example|sample|template)$/.test(p))) return false;
  return !/\.(?:tgz|pem|key|p12|pfx)$/i.test(name) && name !== RECEIPT;
}

function sourceFile(source, name) {
  const file = join(source, name);
  // Reject symlinks in every source component, including tracked directory links.
  for (let p = file; p !== source; p = dirname(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`source symlink refused: ${name}`);
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`source is not a regular file: ${name}`);
  return { bytes: fs.readFileSync(file), mode: stat.mode & 0o777 };
}

function inventory(root) {
  const out = [];
  function visit(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = join(dir, name);
      const rel = relative(root, file).split(sep).join('/');
      if (rel === RECEIPT) continue;
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`cached symlink refused: ${rel}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) out.push({ path: rel, sha256: hash(fs.readFileSync(file)), mode: stat.mode & 0o777 });
      else throw new Error(`cached special file refused: ${rel}`);
    }
  }
  visit(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function installLocalCache({ source, cacheRoot }) {
  source = fs.realpathSync(source);
  const target = validateInstallTarget(join(source, '.claude-plugin/plugin.json'), cacheRoot);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (fs.realpathSync(git('rev-parse', '--show-toplevel').trim()) !== source) {
    throw new Error('install source must be a Git checkout root');
  }
  const commit = git('rev-parse', 'HEAD').trim();
  const names = git('ls-files', '-z', '--cached').split('\0').filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('duplicate/unmerged tracked paths');
  const files = names.filter(isInstallFile).sort();
  for (const name of REQUIRED) if (!files.includes(name)) throw new Error(`required tracked file missing: ${name}`);
  // Read before cache mutations; ignored/untracked local secrets are not copied.
  const snapshot = files.map(name => ({ name, ...sourceFile(source, name) }));
  const entries = snapshot.map(f => ({ path: f.name, sha256: hash(f.bytes), mode: f.mode }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const contentSha256 = hash(JSON.stringify(entries));
  fs.mkdirSync(target.root, { recursive: true, mode: 0o700 });
  validateInstallTarget(join(source, '.claude-plugin/plugin.json'), target.root);
  const canonicalRoot = fs.realpathSync(target.root);
  const dest = join(canonicalRoot, target.version);
  const lock = join(canonicalRoot, '.local-install-lock');
  fs.mkdirSync(lock, { mode: 0o700 }); // Exclusive; never remove somebody else's lock.
  let stage;
  try {
    validateInstallTarget(join(source, '.claude-plugin/plugin.json'), canonicalRoot);
    if (fs.existsSync(dest)) {
      if (hash(JSON.stringify(inventory(dest))) !== contentSha256) {
        throw new Error('same version has different files; bump plugin version instead of overwriting active cache');
      }
      const receiptPath = join(dest, RECEIPT);
      if (!fs.lstatSync(receiptPath).isFile() || fs.lstatSync(receiptPath).isSymbolicLink()) throw new Error('invalid cached snapshot identity');
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (receipt.contentSha256 !== contentSha256) throw new Error('cached snapshot identity mismatch');
      return { state: 'unchanged', version: target.version, dest, commit, contentSha256 };
    }
    stage = fs.mkdtempSync(join(canonicalRoot, '.local-install-stage-'));
    for (const f of snapshot) {
      const file = join(stage, f.name);
      fs.mkdirSync(dirname(file), { recursive: true, mode: 0o755 });
      fs.writeFileSync(file, f.bytes, { flag: 'wx', mode: f.mode });
      fs.chmodSync(file, f.mode);
    }
    for (const name of REQUIRED) if (!fs.statSync(join(stage, name)).isFile()) throw new Error(`staged file missing: ${name}`);
    if (JSON.parse(fs.readFileSync(join(stage, '.claude-plugin/plugin.json'), 'utf8')).version !== target.version) {
      throw new Error('manifest changed during preflight');
    }
    if (hash(JSON.stringify(inventory(stage))) !== contentSha256) throw new Error('staged inventory mismatch');
    fs.writeFileSync(join(stage, RECEIPT), JSON.stringify({ schema: 1, commit, contentSha256, entries }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    validateInstallTarget(join(source, '.claude-plugin/plugin.json'), canonicalRoot);
    if (fs.existsSync(dest)) throw new Error('destination appeared during staging');
    fs.renameSync(stage, dest);
    stage = null;
    return { state: 'published', version: target.version, dest, commit, contentSha256 };
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    fs.rmdirSync(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source, cacheRoot] = process.argv.slice(2);
    process.stdout.write(JSON.stringify(installLocalCache({ source, cacheRoot })) + '\n');
  } catch (error) {
    process.stderr.write(`local cache refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
