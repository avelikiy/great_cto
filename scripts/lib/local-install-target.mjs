#!/usr/bin/env node
// Read-only preflight. Never mkdir or follow a cache/destination symlink.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

function directoryOrAbsent(target) {
  let stat;
  try { stat = lstatSync(target); }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('cache root and destination must be directories, not symlinks or files');
  }
  return true;
}

try {
  const [manifest, cacheRoot] = process.argv.slice(2);
  const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
  // `$` also matches before a terminal newline in JS, so explicitly refuse it.
  if (typeof version !== 'string' || version.length > 128 || /\s/.test(version) || !semver.test(version)) {
    throw new Error('manifest.version must be a strict semantic version');
  }
  if (!cacheRoot || !isAbsolute(cacheRoot)) throw new Error('cache root must be absolute');
  const root = resolve(cacheRoot);
  const dest = join(root, version);
  if (dirname(dest) !== root || dest === root) throw new Error('destination must be a direct cache child');
  const rootExists = directoryOrAbsent(root);
  const destExists = directoryOrAbsent(dest);
  if (destExists && (!rootExists || dirname(realpathSync(dest)) !== realpathSync(root))) {
    throw new Error('destination escapes the canonical cache root');
  }
  process.stdout.write(version);
} catch (error) {
  process.stderr.write(`install target refused: ${error.message}\n`);
  process.exitCode = 1;
}
