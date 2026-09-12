import { createHash } from 'node:crypto';
import { scan } from './secret-patterns.mjs';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function artifactPath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.split('/').some(p =>
    !p || p === '.' || p === '..' || /^(?:\.git|\.codex|\.claude|\.agents|\.beads|\.great_cto|node_modules|AGENTS\.md|CLAUDE\.md|SKILL\.md|\.env(?:\..*)?)$/i.test(p))) throw Error('invalid artifact path');
  return path;
}
export function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length > 50) throw Error('expected 1..50 release artifacts');
  let bytes = 0; const paths = new Set();
  return artifacts.map(file => {
    artifactPath(file.path);
    if (paths.has(file.path)) throw Error('duplicate artifact path'); paths.add(file.path);
    if (typeof file.base64 !== 'string' || file.base64.length > 12 * 1024 * 1024) throw Error('invalid artifact data');
    const content = Buffer.from(file.base64, 'base64');
    if (content.toString('base64') !== file.base64) throw Error('invalid base64 artifact');
    bytes += content.length; if (bytes > 8 * 1024 * 1024) throw Error('artifacts exceed 8 MiB');
    if (scan(content.toString('utf8')).some(f => f.severity === 'block')) throw Error(`secret blocked in artifact: ${file.path}`);
    const sha256 = digest(content);
    if (file.sha256 && sha256 !== file.sha256) throw Error('artifact digest mismatch');
    return { path: file.path, base64: file.base64, sha256 };
  }).sort((a, b) => a.path.localeCompare(b.path));
}
export const bundleDigest = artifacts => digest(JSON.stringify(validateArtifacts(artifacts).map(({ path, sha256 }) => ({ path, sha256 }))));

// Runs INSIDE the sandbox after build commands. No writable host export mount.
// Node is required in images that opt into artifact export. Only explicit files,
// never directories/symlinks, can leave the container through bounded stdout.
export const exporter = `
const fs = require('node:fs');
const paths = JSON.parse(process.argv[1]); let total = 0;
const files = paths.map(path => {
  let current = '/work';
  for (const part of path.split('/')) { current += '/' + part; if (fs.lstatSync(current).isSymbolicLink()) throw Error('symlink artifact'); }
  const stat = fs.lstatSync(current);
  if (!stat.isFile() || (total += stat.size) > 8 * 1024 * 1024) throw Error('invalid or oversized artifact');
  return {path, base64: fs.readFileSync(current).toString('base64')};
});
process.stdout.write(JSON.stringify(files));
`;
