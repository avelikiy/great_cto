// `lessons.md` was append-only, and de-duplication was a line in the
// continuous-learner prompt: "reject if the same pattern is already in
// lessons.md". That asks a Haiku agent to read a file that grows every session
// and recognise a slug it wrote weeks ago. The failure is quiet — the file gets
// longer, the same lesson appears three times in three wordings, and nobody
// re-reads it because it is no longer worth re-reading.
//
// So merging is mechanical now. What these tests pin is the difference between
// a log and a set of articles: a second sighting must make an entry STRONGER,
// not the file LONGER.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLessons, parseEntry, mergeEntry, addLesson, renderEntry,
} from '../../scripts/lib/lessons-write.mjs';

const entry = ({
  date = '2026-05-08', confidence = 'medium', slug = 'gate-before-irreversible',
  context = 'Observed when devops deploys.', decision = 'Create the gate before the step.',
  outcome = 'Caught 1 bad deploy.', evidence = ['commit: abc1234'], occurrences,
} = {}) => `---
date: ${date}
session-id: 1a2b3c4d
archetype: cli-tool
project: demo
confidence: ${confidence}
shape: A${occurrences ? `\noccurrences: ${occurrences}` : ''}
---

## pattern: ${slug}

**Context:** ${context}

**Decision/Pattern:** ${decision}

**Outcome:** ${outcome}

**Applies-to-archetypes:** cli-tool

**Evidence:**
${evidence.map((e) => `- ${e}`).join('\n')}
`;

// ── parsing ────────────────────────────────────────────────────────────────

test('an entry yields its frontmatter and its pattern slug', () => {
  const e = parseEntry(entry());
  assert.equal(e.slug, 'gate-before-irreversible');
  assert.equal(e.meta.confidence, 'medium');
  assert.equal(e.meta.date, '2026-05-08');
});

test('a file splits into its entries and keeps its preamble', () => {
  const file = `# Lessons\n\nProject-local memory.\n\n${entry()}\n${entry({ slug: 'other-thing' })}`;
  const { preamble, entries } = parseLessons(file);
  assert.match(preamble, /# Lessons/);
  assert.deepEqual(entries.map((e) => e.slug), ['gate-before-irreversible', 'other-thing']);
});

test('an empty or missing file parses to no entries, not a crash', () => {
  assert.deepEqual(parseLessons('').entries, []);
  assert.deepEqual(parseLessons(null).entries, []);
});

// ── the property that matters ──────────────────────────────────────────────

test('the same pattern twice makes one entry, not two', () => {
  let text = addLesson('# Lessons\n', entry()).text;
  const r = addLesson(text, entry({ date: '2026-06-01', evidence: ['commit: def5678'] }));
  assert.equal(r.action, 'merged');
  assert.equal(parseLessons(r.text).entries.length, 1, 'a repeat is not a new article');
});

test('a merge accumulates evidence rather than replacing it', () => {
  let text = addLesson('', entry({ evidence: ['commit: abc1234'] })).text;
  text = addLesson(text, entry({ evidence: ['commit: def5678'] })).text;
  text = addLesson(text, entry({ evidence: ['commit: abc1234', 'file: src/a.ts:12'] })).text;
  const body = parseLessons(text).entries[0].body;
  for (const e of ['abc1234', 'def5678', 'src/a.ts:12']) assert.match(body, new RegExp(e), e);
  assert.equal((body.match(/abc1234/g) || []).length, 1, 'the same evidence is not stored twice');
});

test('occurrences counts sightings, which is what promotion reads', () => {
  let text = addLesson('', entry()).text;
  assert.equal(parseLessons(text).entries[0].meta.occurrences, '1');
  text = addLesson(text, entry()).text;
  text = addLesson(text, entry()).text;
  assert.equal(parseLessons(text).entries[0].meta.occurrences, '3');
});

test('confidence may rise and may not fall', () => {
  let text = addLesson('', entry({ confidence: 'medium' })).text;
  text = addLesson(text, entry({ confidence: 'high' })).text;
  assert.equal(parseLessons(text).entries[0].meta.confidence, 'high');
  text = addLesson(text, entry({ confidence: 'low' })).text;
  assert.equal(parseLessons(text).entries[0].meta.confidence, 'high',
    'a hurried later write must not undo an earlier careful one');
});

test('the first sighting date is kept, and the latest is recorded separately', () => {
  let text = addLesson('', entry({ date: '2026-05-08' })).text;
  text = addLesson(text, entry({ date: '2026-07-30' })).text;
  const m = parseLessons(text).entries[0].meta;
  assert.equal(m.date, '2026-05-08', 'when a pattern started is its own fact');
  assert.equal(m['last-seen'], '2026-07-30', 'and so is whether it is still true');
});

// ── the case worth protecting ──────────────────────────────────────────────

test('a reversed decision is kept alongside the old one, never overwritten', () => {
  let text = addLesson('', entry({ decision: 'Always run the full pipeline.' })).text;
  const r = addLesson(text, entry({ date: '2026-07-30', decision: 'Skip pm below three work streams.' }));
  const body = parseLessons(r.text).entries[0].body;
  assert.match(body, /Always run the full pipeline/, 'the original decision survives');
  assert.match(body, /Superseded:.*2026-07-30.*Skip pm/s, 'and the reversal is dated');
});

test('a repeat that says the same thing does not create a superseded line', () => {
  let text = addLesson('', entry()).text;
  text = addLesson(text, entry({ date: '2026-07-30' })).text;
  assert.ok(!parseLessons(text).entries[0].body.includes('Superseded'),
    'wording noise is not a reversal');
});

test('a second reversal replaces the first rather than stacking', () => {
  let text = addLesson('', entry({ decision: 'A' })).text;
  text = addLesson(text, entry({ date: '2026-06-01', decision: 'B' })).text;
  text = addLesson(text, entry({ date: '2026-07-01', decision: 'C' })).text;
  const body = parseLessons(text).entries[0].body;
  assert.equal((body.match(/\*\*Superseded:\*\*/g) || []).length, 1);
  assert.match(body, /2026-07-01/);
});

// ── refusing to make the file worse ────────────────────────────────────────

test('an entry with no pattern slug is refused, not appended', () => {
  const r = addLesson('# Lessons\n', '---\ndate: 2026-05-08\n---\n\nSome prose with no slug.\n');
  assert.equal(r.action, 'skipped');
  assert.equal(parseLessons(r.text).entries.length, 0,
    'an entry the de-dup can never match again is worse than no entry');
});

test('a different pattern is a new entry', () => {
  let text = addLesson('', entry({ slug: 'one' })).text;
  const r = addLesson(text, entry({ slug: 'two' }));
  assert.equal(r.action, 'appended');
  assert.deepEqual(parseLessons(r.text).entries.map((e) => e.slug), ['one', 'two']);
});

test('slug matching ignores case', () => {
  let text = addLesson('', entry({ slug: 'gate-first' })).text;
  assert.equal(addLesson(text, entry({ slug: 'Gate-First' })).action, 'merged');
});

test('the file preamble survives every write', () => {
  const head = '# Lessons\n\n> Project-local memory. Do not edit by hand.\n';
  let text = addLesson(head, entry()).text;
  text = addLesson(text, entry({ slug: 'two' })).text;
  text = addLesson(text, entry()).text;
  assert.match(text, /Do not edit by hand/, 'losing a header on every write is how a tool earns a reputation');
});

test('an empty section is filled by a later sighting; a full one is not overwritten', () => {
  let text = addLesson('', entry({ outcome: '' })).text;
  text = addLesson(text, entry({ outcome: 'Saved $4.20 of judge cost.' })).text;
  assert.match(parseLessons(text).entries[0].body, /Saved \$4\.20/);

  let t2 = addLesson('', entry({ context: 'The careful first write.' })).text;
  t2 = addLesson(t2, entry({ context: 'a hurried later one' })).text;
  assert.match(parseLessons(t2).entries[0].body, /The careful first write/);
});

test('a merge reports what it did, so a caller cannot claim a write it did not make', () => {
  let text = addLesson('', entry()).text;
  const r = addLesson(text, entry({ confidence: 'high', evidence: ['commit: zzz9999'] }));
  assert.ok(r.changed.some((c) => /occurrences 1 → 2/.test(c)));
  assert.ok(r.changed.some((c) => /confidence → high/.test(c)));
  assert.ok(r.changed.some((c) => /\+1 evidence/.test(c)));
});

test('rendering round-trips: what is written parses back the same', () => {
  let text = addLesson('# Lessons\n', entry()).text;
  text = addLesson(text, entry({ date: '2026-07-30', confidence: 'high' })).text;
  const again = parseLessons(text).entries[0];
  assert.equal(again.slug, 'gate-before-irreversible');
  assert.equal(again.meta.occurrences, '2');
  assert.equal(renderEntry(again).trim(), parseLessons(text).entries[0].raw.trim());
});
