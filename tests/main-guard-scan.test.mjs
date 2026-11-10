// great_cto-hu2l: no main-module guard may compare paths as strings.
//
// ~165 scripts decided whether they were run directly by comparing
// process.argv[1] with import.meta.url. Through a symlink the two disagree, the
// CLI runs nothing and exits 0. They now call isMainModule (scripts/lib/
// is-main.mjs), which compares real paths. This scan refuses a new guard that
// does not, and is itself checked against known-bad samples first, so a scan
// that silently matches nothing cannot pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));

const ARGV1 = /process\.argv\[1\]/;
const MODULE_PATH = /import\.meta\.(?:url|filename|dirname)|fileURLToPath\s*\(|__filename/;
// argv[1] compared with anything but a string literal (`=== '-'` is a mode flag, not a guard).
const COMPARED = /process\.argv\[1\]\s*[!=]==?(?!=)\s*(?![\s'"`])|(?<!['"`]\s*)[!=]==?\s*process\.argv\[1\]/;
const ENDS_WITH = /process\.argv\[1\][\s?.]*\.?endsWith\s*\(|process\.argv\[1\]\.split\(/;
// The two copies that cannot import the helper (shipped alone in the npm package) inline it.
const REALPATH_BOTH = (s) => /realpathSync\(process\.argv\[1\]\)/.test(s) && /realpathSync\(fileURLToPath\(import\.meta\.url\)\)/.test(s);

/** Lines of `src` that decide "am I main" without real paths. */
export function stringGuards(src) {
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    // a guard split after an operator continues on the next line
    if (/(?:===|!==|&&|\|\||\()\s*$/.test(s) && i + 1 < lines.length) s += ' ' + lines[i + 1].trim();
    if (!ARGV1.test(s) || /^\s*(?:\/\/|\*)/.test(s)) continue;
    if (REALPATH_BOTH(s)) continue;
    if (MODULE_PATH.test(s) || ENDS_WITH.test(s) || COMPARED.test(s)) hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

const KNOWN_BAD = [
  "if (import.meta.url === `file://${process.argv[1]}`) main();",
  'const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];',
  'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {',
  'if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){',
  'const isMain = process.argv[1] === fileURLToPath(import.meta.url);',
  'if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {',
  'if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {',
  'const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);',
  "if (process.argv[1]?.endsWith('/domain-pilot.mjs')) {",
  "if (process.argv[1] && process.argv[1].endsWith('postinstall.mjs')) {",
  'if (process.argv[1] === entry) {',
  "  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url).endsWith(process.argv[1].split('/').pop()); }",
  '  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]); }',
  'if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) main();',
  'const isMain = fileURLToPath(import.meta.url) ===\n  process.argv[1];',
];

const KNOWN_GOOD = [
  'if (isMainModule(import.meta.url)) main();',
  'const isMain = isMainModule(import.meta.url);',
  '  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }',
  "if(process.argv[1]==='-')await score();",
  'const paths = JSON.parse(process.argv[1]); let total = 0;',
  "export function resolveRunningBinaryPath(argv1: string = process.argv[1] ?? ''): string {",
  'const kid = spawn(process.execPath, [process.argv[1], "--port", String(port)]);',
  '// so argv[1] arrives as /tmp/… while import.meta.url reports /private/tmp/…',
];

test('the scan flags every known string guard', () => {
  for (const bad of KNOWN_BAD) assert.equal(stringGuards(bad).length, 1, `not flagged: ${bad}`);
});

test('the scan leaves real-path guards and other argv[1] uses alone', () => {
  for (const good of KNOWN_GOOD) assert.deepEqual(stringGuards(good), [], `flagged: ${good}`);
});

test('no tracked script decides "am I main" by comparing path strings', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--', '*.mjs', '*.js', '*.cjs', '*.ts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean)
    // tests carry guards as data (fixtures, child programs); built output is not source
    .filter((f) => f !== SELF && !/\.test\.(?:m?js|ts)$/.test(f) && !/(?:^|\/)(?:node_modules|dist|fixtures?)\//.test(f));
  assert.ok(files.length > 300, `scanned only ${files.length} files — the file list is wrong`);
  const found = [];
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; } // deleted in the work tree
    for (const h of stringGuards(src)) found.push(`${f}:${h.line}  ${h.text}`);
  }
  assert.deepEqual(found, [], 'use isMainModule(import.meta.url) from scripts/lib/is-main.mjs:\n' + found.join('\n'));
});
