/** Canonical regular-file USTAR; never delegate admitted extraction to a second parser. */
import { gzipSync, gunzipSync } from 'node:zlib';

export const RELEASE_ARCHIVE_LIMITS = Object.freeze({ compressed: 128 * 1024 * 1024, expanded: 512 * 1024 * 1024, entries: 10_000, file: 128 * 1024 * 1024 });
const privatePart = /^(?:\.git|\.beads|\.great_cto|\.codex|\.claude|node_modules|\.env(?:\..*)?|\.npmrc|\.yarnrc(?:\..*)?|\.pnpmfile\.cjs|AGENTS\.md|CLAUDE\.md)$/i;
const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function releaseArchivePath(value) {
  if (typeof value !== 'string' || !value || value.length > 255 || !/^[\x21-\x7e]+$/.test(value) || /[\\:]/.test(value)) throw Error('invalid archive path');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p))) throw Error('invalid archive path segment');
  if (parts.some(p => privatePart.test(p))) throw Error('private archive path refused');
  if (parts.some(p => reserved.test(p))) throw Error('reserved archive name refused');
  return value;
}

function memberNames(files, prefix) {
  releaseArchivePath(prefix);
  if (prefix.includes('/')) throw Error('archive prefix must be one segment');
  if (!Array.isArray(files) || files.length === 0 || files.length > RELEASE_ARCHIVE_LIMITS.entries) throw Error('archive entry count exceeded');
  const names = new Set(), paths = new Set();
  for (const f of files) {
    const name = releaseArchivePath(f.path), folded = name.toLowerCase();
    if (names.has(folded)) throw Error('duplicate or case-colliding archive membership');
    names.add(folded); paths.add(name);
    if (![0o644, 0o755].includes(f.mode)) throw Error('unsupported archive mode');
    if (!Buffer.isBuffer(f.bytes) || f.bytes.length > RELEASE_ARCHIVE_LIMITS.file) throw Error('invalid archive file bytes');
  }
  for (const name of paths) {
    const parts = name.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) throw Error('archive file-parent collision');
  }
}
function putString(header, start, length, text) {
  if (Buffer.byteLength(text, 'ascii') > length) throw Error('archive path exceeds USTAR field');
  header.write(text, start, length, 'ascii');
}
function octal(value, length) {
  const encoded = value.toString(8);
  if (encoded.length > length - 1) throw Error('archive numeric field exceeded');
  return encoded.padStart(length - 1, '0') + '\0';
}
function splitName(full) {
  if (full.length <= 100) return [full, ''];
  for (let at = full.lastIndexOf('/'); at > 0; at = full.lastIndexOf('/', at - 1)) {
    if (at <= 155 && full.length - at - 1 <= 100) return [full.slice(at + 1), full.slice(0, at)];
  }
  throw Error('archive path exceeds USTAR fields');
}

export function encodeReleaseArchive(files, { prefix = 'package' } = {}) {
  memberNames(files, prefix);
  const parts = [], sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  let expanded = 1024;
  for (const f of sorted) {
    const [name, pre] = splitName(`${prefix}/${f.path}`), header = Buffer.alloc(512);
    putString(header, 0, 100, name); putString(header, 345, 155, pre);
    putString(header, 100, 8, octal(f.mode, 8));
    putString(header, 108, 8, octal(0, 8)); putString(header, 116, 8, octal(0, 8));
    putString(header, 124, 12, octal(f.bytes.length, 12)); putString(header, 136, 12, octal(0, 12));
    header.fill(32, 148, 156); header[156] = 48;
    putString(header, 257, 6, 'ustar\0'); putString(header, 263, 2, '00');
    const sum = header.reduce((a, b) => a + b, 0);
    putString(header, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
    const padding = (512 - f.bytes.length % 512) % 512;
    expanded += 512 + f.bytes.length + padding;
    if (expanded > RELEASE_ARCHIVE_LIMITS.expanded) throw Error('expanded archive limit exceeded');
    parts.push(header, f.bytes, Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  const compressed = gzipSync(Buffer.concat(parts), { level: 9 });
  if (compressed.length > RELEASE_ARCHIVE_LIMITS.compressed) throw Error('compressed archive limit exceeded');
  return compressed;
}

function stringField(header, start, length) {
  const field = header.subarray(start, start + length), zero = field.indexOf(0);
  const end = zero === -1 ? field.length : zero;
  if (zero !== -1 && field.subarray(zero).some(b => b !== 0)) throw Error('ambiguous archive string field');
  const bytes = field.subarray(0, end);
  if (bytes.some(b => b < 32 || b > 126)) throw Error('invalid archive string bytes');
  return bytes.toString('ascii');
}
function numberField(header, start, length) {
  const text = header.subarray(start, start + length).toString('ascii');
  if (!/^[0-7]+(?:\0| )*$/.test(text)) throw Error('invalid archive numeric field');
  const n = Number.parseInt(text.replace(/[\0 ]+$/, ''), 8);
  if (!Number.isSafeInteger(n)) throw Error('archive numeric field exceeded');
  return n;
}

export function inspectReleaseArchive(bytes, { prefix = 'package' } = {}) {
  releaseArchivePath(prefix);
  if (prefix.includes('/') || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > RELEASE_ARCHIVE_LIMITS.compressed) throw Error('invalid compressed archive');
  let raw;
  try { raw = gunzipSync(bytes, { maxOutputLength: RELEASE_ARCHIVE_LIMITS.expanded }); }
  catch (error) { throw Error(`invalid gzip archive: ${error.code || 'decompression refused'}`); }
  if (raw.length % 512 !== 0) throw Error('truncated archive block');
  const files = []; let offset = 0, ended = false;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) {
      if (raw.length - offset < 1024 || raw.subarray(offset).some(b => b !== 0)) throw Error('invalid archive termination padding');
      ended = true; break;
    }
    const expected = numberField(header, 148, 8);
    const checksum = header.reduce((sum, b, at) => sum + (at >= 148 && at < 156 ? 32 : b), 0);
    if (checksum !== expected) throw Error('archive checksum mismatch');
    if (header.subarray(257, 263).toString('ascii') !== 'ustar\0' || header.subarray(263, 265).toString('ascii') !== '00') throw Error('unsupported archive header');
    if (![0, 48].includes(header[156])) throw Error('archive entry type must be regular');
    if (header.subarray(157, 257).some(b => b !== 0)) throw Error('regular archive entry has a link target');
    const name = stringField(header, 0, 100), pre = stringField(header, 345, 155), full = pre ? `${pre}/${name}` : name;
    if (!full.startsWith(`${prefix}/`)) throw Error('archive path root prefix mismatch');
    const filePath = releaseArchivePath(full.slice(prefix.length + 1));
    const size = numberField(header, 124, 12), mode = numberField(header, 100, 8);
    if (size > RELEASE_ARCHIVE_LIMITS.file || ![0o644, 0o755].includes(mode)) throw Error('archive size or mode refused');
    const dataStart = offset + 512, next = dataStart + Math.ceil(size / 512) * 512;
    if (next > raw.length || raw.subarray(dataStart + size, next).some(b => b !== 0)) throw Error('truncated archive or nonzero file padding');
    files.push({ path: filePath, bytes: Buffer.from(raw.subarray(dataStart, dataStart + size)), mode });
    if (files.length > RELEASE_ARCHIVE_LIMITS.entries) throw Error('archive entry count exceeded');
    offset = next;
  }
  if (!ended) throw Error('archive termination missing');
  memberNames(files, prefix);
  return files;
}
