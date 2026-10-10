/** Standalone trusted oracle: builtin-only imports, never load candidate code. */
import { lstatSync, readdirSync, openSync, fstatSync, readSync, closeSync, constants, realpathSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2], oracle = JSON.parse(process.argv[3]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = name => typeof name === 'string' && name && !name.includes('\\') && !name.startsWith('/')
  && !name.split('/').some(part => !part || part === '.' || part === '..');
if (!root || realpathSync(root) !== root || oracle.version !== 1 || oracle.scenario !== 'docs-low-risk'
  || !oracle.baseline || !Array.isArray(oracle.protected) || !Array.isArray(oracle.requiredLinks)
  || !Array.isArray(oracle.runtimeExclusions) || Object.keys(oracle.baseline).some(name => !safe(name))
  || oracle.protected.some(name => !safe(name) || !oracle.baseline[name])
  || oracle.requiredLinks.some(link => !safe(link.from) || !safe(link.to) || typeof link.label !== 'string')) throw Error('unsupported oracle');

const files = new Map(); let entries = 0, bytes = 0, unsafe = false;
function visit(name = '') {
  const path = name ? join(root, name) : root, stat = lstatSync(path);
  if (++entries > 200 || stat.isSymbolicLink()) { unsafe = true; return; }
  if (stat.isDirectory()) {
    const children = readdirSync(path);
    if (children.length > 200) { unsafe = true; return; }
    for (const child of children) {
      if (!name && child === '.git') continue; // Metadata is not candidate source.
      visit(name ? `${name}/${child}` : child);
    }
    return;
  }
  if (!stat.isFile() || stat.size > 65536 || bytes + stat.size > 1024 * 1024) { unsafe = true; return; }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const observed = fstatSync(fd), buffer = Buffer.alloc(stat.size + 1);
    if (!observed.isFile() || observed.size !== stat.size) { unsafe = true; return; }
    let used = 0, count;
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    if (used !== stat.size) { unsafe = true; return; }
    bytes += used; files.set(name, buffer.subarray(0, used));
  } finally { closeSync(fd); }
}
visit();
let linksPass = !unsafe, driftPass = !unsafe;
const found = new Map();
for (const [name, buffer] of files) {
  if (name.startsWith('docs/') && name.endsWith('.md')) {
    const text = buffer.toString('utf8'), links = [...text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)];
    // This fixed fixture deliberately supports a narrow grammar, not arbitrary Markdown.
    const stripped = text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '');
    if (/<|\[[^\]\n]*\]/.test(stripped)) linksPass = false;
    for (const [, label, target] of links) {
      const resolved = posix.normalize(posix.join(dirname(name), target));
      if (/[:#?%\s\\]/.test(target) || target.startsWith('/') || !safe(resolved) || !files.has(resolved)) linksPass = false;
      found.set(`${name}:${label}`, [...(found.get(`${name}:${label}`) || []), resolved]);
    }
  } else if (!oracle.runtimeExclusions.includes(name) && !Object.hasOwn(oracle.baseline, name)) driftPass = false;
}
for (const link of oracle.requiredLinks) {
  if (!(found.get(`${link.from}:${link.label}`) || []).includes(link.to)) linksPass = false;
}
// Preserve baseline documents too: deleting content is not repairing its navigation.
for (const name of Object.keys(oracle.baseline)) if (!files.has(name)) {
  if (name.startsWith('docs/')) linksPass = false; else driftPass = false;
}
for (const name of oracle.protected) if (!files.has(name) || sha(files.get(name)) !== oracle.baseline[name]) driftPass = false;
process.stdout.write(JSON.stringify({ version: 1, pid: process.pid, scenario: oracle.scenario,
  criteria: [
    { text: 'all target links resolve', state: linksPass ? 'passed' : 'failed', evidence: linksPass ? 'Required navigation targets and all supported inline targets exist' : 'Missing/unsafe target, removed navigation or unsupported document grammar' },
    { text: 'no source/config drift', state: driftPass ? 'passed' : 'failed', evidence: driftPass ? 'Protected baseline bytes unchanged; no extra non-document source/config' : 'Protected bytes, inventory or bounded artifact safety check differs' },
  ] }));
