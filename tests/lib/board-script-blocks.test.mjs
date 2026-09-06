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
import { readFileSync } from 'node:fs';
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
  for (const m of blocks) {
    assert.doesNotThrow(() => new Function(m[1]), `block at ${line(m.index)} does not parse`);
  }
});
