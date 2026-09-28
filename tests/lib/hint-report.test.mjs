// hint-report — the numbers that say whether the context hooks help or just talk.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHints, summarize, formatReport } from '../../scripts/lib/hint-report.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

function projectWith(lines) {
  const d = mkdtempSync(join(tmpdir(), 'hint-report-'));
  made.push(d);
  mkdirSync(join(d, '.great_cto'));
  writeFileSync(join(d, '.great_cto', 'events.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n');
  return d;
}

test('counts hints per hook, per session and per file, within the window, ignoring other events', () => {
  const a = projectWith([
    { v: 1, ts: '2026-09-27T10:00:00Z', kind: 'hint', hook: 'edit-impact', session: 'old', paths: ['x.ts'], chars: 100 },
    { v: 1, ts: '2026-09-29T10:00:00Z', kind: 'hint', hook: 'edit-impact', session: 's1', paths: ['a.ts'], chars: 300 },
    { v: 1, ts: '2026-09-29T11:00:00Z', kind: 'hint', hook: 'edit-impact', session: 's1', paths: ['a.ts'], chars: 500, host: 'codex' },
    { v: 1, ts: '2026-09-29T12:00:00Z', kind: 'hint', hook: 'lesson-tripwire', session: 's2', paths: [], chars: 200 },
    { v: 1, ts: '2026-09-29T12:00:00Z', kind: 'tool', tool: 'Edit' },
  ]);
  const s = summarize(collectHints([a, a], { since: '2026-09-28' }));
  assert.equal(s.total, 3, 'the old one is outside the window, the tool event is not a hint, the project is read once');
  assert.deepEqual(s.hooks['edit-impact'], { fires: 2, sessions: 1, perSession: 2, meanChars: 400, topFiles: [['a.ts', 2]], hosts: { claude: 1, codex: 1 } });
  assert.equal(s.hooks['lesson-tripwire'].fires, 1);
  assert.match(formatReport(s, '2026-09-28'), /edit-impact: 2 in 1 session\(s\) · 2 per session · 400 chars/);
});

test('no hints yet is said, not shown as a table of zeros', () => {
  assert.match(formatReport(summarize([]), null), /no hints recorded yet/);
});
