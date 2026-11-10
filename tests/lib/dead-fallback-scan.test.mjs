// `cmd | head -1 || echo default` never prints the default: a pipeline's status
// is its last command's, and head/tail/sed/awk/tr/cut/sort/uniq/wc exit 0 on empty
// input. The rollback validation before gate:ship lost every warning this way, and
// a sweep found ~35 more in agents, commands and scripts — values agents read as
// "NO_AUDIT", "[]", "main" or "0" arrived empty instead (great_cto-043b, 26.10.2026).
// Write `V=$(…); V=${V:-default}` or test the captured output instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALWAYS_ZERO = '(?:head|tail|awk|sed|tr|cut|sort|uniq|wc)';
// a quoted argument may contain `|` or `||`, so it is consumed whole
// and a `)` or `;` ends the pipeline before any `||` that follows
const ARG = `(?:[^|\\n'"();]|'[^'\\n]*'|"[^"\\n]*")*`;
export const DEAD = new RegExp(`\\|\\s*${ALWAYS_ZERO}\\b${ARG}\\|\\|\\s*(?:echo|printf|[A-Z_]+=)`);

export function deadFallbacks(text) {
  return text.replace(/\\\n\s*/g, ' ').split('\n').filter(l => DEAD.test(l));
}

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') files(p, out); }
    else if (/\.(md|sh)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('the scan catches the shapes it exists for', () => {
  assert.equal(deadFallbacks('X=$(grep a f | head -1 || echo "none")').length, 1);
  assert.equal(deadFallbacks('grep a f | head -1 \\\n  || echo "RISK"').length, 1, 'across a line continuation');
  assert.equal(deadFallbacks(`V=$(grep x f | awk '{print $2}' || echo 0)`).length, 1);
  assert.equal(deadFallbacks('X=$(grep a f | head -1); X=${X:-none}').length, 0);
  assert.equal(deadFallbacks('grep -q a f || echo missing').length, 0, 'grep alone does report no match');
  assert.equal(deadFallbacks('{ J=$(cmd | tail -5); [ -n "$J" ] && echo "$J"; } || echo none').length, 0, 'the pipeline ended at )');
  assert.equal(deadFallbacks(`awk '{ if (a || b) print }' f`).length, 0, '|| inside a quoted program is not a fallback');
});

test('no agent, command, skill or script relies on a fallback that cannot fire', () => {
  const hits = [];
  for (const dir of ['agents', 'commands', 'skills', 'scripts']) {
    for (const f of files(path.join(ROOT, dir))) {
      for (const l of deadFallbacks(fs.readFileSync(f, 'utf8'))) hits.push(`${path.relative(ROOT, f)}: ${l.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(hits, []);
});
