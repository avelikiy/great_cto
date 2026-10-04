import fs from 'node:fs';
import { dirname } from 'node:path';

/** @param {string} file */
function regularOrAbsent(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('private state must be a regular file, not a symlink');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/** Tighten existing secrets as well as new files; never follow file symlinks.
 * @param {string} file
 * @returns {string}
 */
export function readPrivateState(file) {
  regularOrAbsent(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('private state is not a regular file');
    const stat = fs.fstatSync(fd);
    if ((stat.mode & 0o777) !== 0o600) fs.fchmodSync(fd, 0o600);
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}

/** @param {string} file @param {string} text @param {boolean} [append] */
export function writePrivateState(file, text, append = false) {
  regularOrAbsent(file);
  fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW
    | fs.constants.O_NONBLOCK | (append ? fs.constants.O_APPEND : 0);
  const fd = fs.openSync(file, flags, 0o600);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('private state is not a regular file');
    fs.fchmodSync(fd, 0o600);
    // Refuse permission failures before modifying existing bytes.
    if (!append) fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, text);
  } finally { fs.closeSync(fd); }
}
