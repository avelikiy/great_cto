// Every <script> in the board is closed before the next one opens, and the
// last one is closed before </body>.
//
// The dead-code sweep of 2026-09-06 (great_cto-ki1x.16) deleted a markup block
// whose first line was the </script> of the page's main script. Nothing
// errored: the browser treated the rest of the document as JavaScript, the
// parse failed, and the board rendered its shell with no project, no data and
// "connecting…" forever. The syntax check that ran before that commit matched
// <script>…</script> PAIRS by regex, so an unclosed block was simply not a
// block to it — a check that could not see the one thing that had broken.
//
// Real tags sit at column 0 in this file; a '<script>' quoted inside a comment
// or a string does not, and is not a tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(ROOT, 'packages/board/public/index.html'), 'utf8');
const line = (i) => 'line ' + (html.slice(0, i).split('\n').length);

test('every inline <script> block is closed, and none nests', () => {
  const tags = [...html.matchAll(/^<script\b[^>]*>|^<\/script>/gm)];
  let open = null;
  const problems = [];
  for (const m of tags) {
    const isOpen = !m[0].startsWith('</');
    // <script src="…"></script> on one line opens and closes itself.
    if (isOpen && /\bsrc=/.test(m[0]) && html.slice(m.index, m.index + m[0].length + 9).endsWith('</script>')) continue;
    if (isOpen) {
      if (open != null) problems.push(`<script> at ${line(m.index)} opens inside the block from ${line(open)}`);
      open = m.index;
    } else {
      if (open == null) problems.push(`</script> at ${line(m.index)} closes nothing`);
      open = null;
    }
  }
  if (open != null) problems.push(`<script> at ${line(open)} is never closed`);
  assert.deepEqual(problems, []);
});

test('each inline block parses on its own', () => {
  const blocks = [...html.matchAll(/^<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)^<\/script>/gm)];
  assert.ok(blocks.length >= 2, `expected the head script and the main script, found ${blocks.length}`);
  // `node --check` rather than `new Function`. The old form COMPILED the board's
  // own source inside this process to find out whether it parses — a real
  // dynamic execution, in a file whose only job is to read text. --check parses
  // and exits; it never runs a line. It also reports the offending line, which
  // `new Function` did not.
  const dir = mkdtempSync(path.join(tmpdir(), 'board-blocks-'));
  try {
    for (const m of blocks) {
      const file = path.join(dir, `block-${m.index}.js`);
      writeFileSync(file, m[1]);
      const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(r.status, 0,
        `block at ${line(m.index)} does not parse:\n${(r.stderr || '').split('\n').slice(0, 4).join('\n')}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
