// release.sh titled the version commit and the GitHub Release from the first
// `###` heading of the CHANGELOG entry — so an entry that opens with a lead
// paragraph and then "### Added" shipped as "feat(v3.47.0): Added" and
// "feat(v3.46.2): Fixed". The lead paragraph is the title; a heading is the
// fallback for an entry that has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../scripts/release.sh', import.meta.url).pathname;

function title(notes) {
  const dir = mkdtempSync(join(tmpdir(), 'release-title-'));
  try {
    const f = join(dir, 'notes.md');
    writeFileSync(f, notes);
    return execFileSync('bash', ['-c',
      `eval "$(sed -n '/^entry_title() {/,/^}/p' "$1")"; entry_title "$2"`, '_', SCRIPT, f],
      { encoding: 'utf8' }).trim();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the lead paragraph names the release, not the first heading', () => {
  assert.equal(title('\nOne pipeline run can now use Claude Code and Codex side by side.\n\n### Added\n\n- x\n'),
    'One pipeline run can now use Claude Code and Codex side by side');
});

test('only the first sentence, cut at a word within 72 characters', () => {
  const t = title('Spending caps now see what was actually spent, and `/board` starts on a marketplace install. More.\n\n### Fixed\n');
  assert.ok(t.length <= 72, `${t.length}: ${t}`);
  assert.equal(t, 'Spending caps now see what was actually spent, and `/board` starts on a');
});

test('an entry with no lead paragraph falls back to its first heading', () => {
  assert.equal(title('\n### approve Codex hooks in the terminal UI\n\n- x\n'), 'approve Codex hooks in the terminal UI');
});

test('an empty entry is titled "release"', () => {
  assert.equal(title('\n\n'), 'release');
});

test('both the commit and the GitHub Release use it', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /SUBJECT_LINE=\$\(entry_title "\$NOTES_FILE"\)/);
  assert.match(src, /TITLE_LINE=\$\(entry_title "\$NOTES_FILE"\)/);
  assert.doesNotMatch(src, /grep -m1 -E '\^### ' "\$NOTES_FILE"/);
});
