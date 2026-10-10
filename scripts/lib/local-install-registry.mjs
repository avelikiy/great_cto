#!/usr/bin/env node
// Registry activation is a separate atomic write; other plugin scopes survive.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readInstallRegistry(registry) {
  const stat = fs.lstatSync(registry);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('registry must be a regular file, not a symlink');
  const data = JSON.parse(fs.readFileSync(registry, 'utf8'));
  if (data.version !== 2 || !data.plugins || typeof data.plugins !== 'object' || Array.isArray(data.plugins)) {
    throw new Error('unsupported registry schema; use Claude plugin install first');
  }
  if (data.plugins['great_cto@local'] != null && !Array.isArray(data.plugins['great_cto@local'])) {
    throw new Error('invalid great_cto registry entries');
  }
  return data;
}

export function registerLocalPlugin({ registry, dest, version }) {
  // Receipt identifies the snapshot, but is not a security approving receipt.
  const receipt = JSON.parse(fs.readFileSync(`${dest}/.great-cto-local-install.json`, 'utf8'));
  if (!/^[a-f0-9]{40,64}$/.test(receipt.commit) || !/^[a-f0-9]{64}$/.test(receipt.contentSha256)) {
    throw new Error('missing local snapshot identity');
  }
  const lock = `${registry}.great-cto-lock`;
  fs.mkdirSync(lock, { mode: 0o700 });
  let temp;
  try {
    const data = readInstallRegistry(registry);
    const original = fs.readFileSync(registry, 'utf8');
    if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(data)) throw new Error('registry changed during read');
    const key = 'great_cto@local';
    const entries = data.plugins[key] || [];
    const users = entries.filter(e => e?.scope === 'user');
    if (users.length > 1) throw new Error('multiple user registrations need manual reconciliation');
    const current = users[0];
    if (current?.installPath === dest && current.version === version && current.gitCommitSha === receipt.commit
      && current.localContentSha256 === receipt.contentSha256) return { state: 'unchanged' };
    const now = new Date().toISOString();
    const next = { ...current, scope: 'user', installPath: dest, version,
      installedAt: current?.installedAt || now, lastUpdated: now,
      gitCommitSha: receipt.commit, localContentSha256: receipt.contentSha256 };
    data.plugins[key] = [...entries.filter(e => e?.scope !== 'user'), next];
    const text = JSON.stringify(data, null, 2) + '\n';
    temp = `${registry}.great-cto-${randomUUID()}.tmp`;
    fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    if (JSON.parse(fs.readFileSync(temp, 'utf8')).plugins[key].find(e => e.scope === 'user')?.installPath !== dest) {
      throw new Error('staged registry readback mismatch');
    }
    // A unique backup preserves the previous selection; no rolling overwrite.
    const backup = `${registry}.great-cto-${randomUUID()}.bak`;
    fs.copyFileSync(registry, backup, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backup, 0o600);
    // Refuse a concurrent host update instead of replacing its new registry.
    if (fs.readFileSync(registry, 'utf8') !== original || fs.readFileSync(backup, 'utf8') !== original) {
      throw new Error('registry changed concurrently; retry after the host update');
    }
    fs.renameSync(temp, registry);
    temp = null;
    if (readInstallRegistry(registry).plugins[key].find(e => e.scope === 'user')?.installPath !== dest) {
      throw new Error(`registry readback failed; recovery backup: ${backup}`);
    }
    return { state: 'registered', backup };
  } finally {
    if (temp) fs.rmSync(temp, { force: true });
    fs.rmdirSync(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [registry, dest, version] = process.argv.slice(2);
    const result = process.argv.includes('--check') ? readInstallRegistry(registry) : registerLocalPlugin({ registry, dest, version });
    process.stdout.write(JSON.stringify(process.argv.includes('--check') ? { state: 'readable' } : result) + '\n');
  } catch (error) {
    process.stderr.write(`local registration refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
