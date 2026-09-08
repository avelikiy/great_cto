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

// A reversal written silently into a file nobody re-reads is the same as not
// recording it: the next reader inherits the new decision with no idea one was
// overturned. The eval put it plainly — "flags the conflict for review; does not
// silently overwrite" — and storing it was only half of that.

test('a reversed decision is surfaced, not just stored', () => {
  let text = addLesson('', entry({ decision: 'Always run the full pipeline.' })).text;
  const r = addLesson(text, entry({ date: '2026-07-30', decision: 'Skip pm below three work streams.' }));
  assert.ok(r.conflict, 'the caller must be able to tell a human, not just write a file');
  assert.match(r.conflict.was, /Always run the full pipeline/);
  assert.match(r.conflict.now, /Skip pm below three work streams/);
  assert.equal(r.conflict.when, '2026-07-30');
  assert.equal(r.conflict.slug, 'gate-before-irreversible');
});

test('an ordinary repeat reports no conflict', () => {
  let text = addLesson('', entry()).text;
  assert.equal(addLesson(text, entry({ date: '2026-07-30' })).conflict, null,
    'wording noise is not a reversal, and crying conflict on it would train people to ignore the field');
});

test('a new pattern and a refused entry both report no conflict', () => {
  assert.equal(addLesson('', entry()).conflict, null);
  assert.equal(addLesson('', '---\ndate: 2026-05-08\n---\n\nno slug\n').conflict, null);
});

// ── support vs self-rating ─────────────────────────────────────────────────
//
// `confidence:` is written by continuous-learner about its OWN extraction. It
// was allowed to rank which lessons survive and it rendered in frontmatter
// beside `occurrences:` and `projects:` — which are independent facts — with
// nothing marking which was which. A number an agent assigned to itself read
// exactly like corroboration.
//
// So there are two axes now, and only one of them is earned:
//
//   support:    computed here, from sightings and evidence. Authoritative.
//   confidence: the agent's own rating. Kept, never authoritative, never ranks.
//
// Borrowed from Puppetmaster's ARTIFACT_STATUS split, where a worker writing
// `independently_supported` about itself is coerced down to `worker_asserted`.

import { computeSupport } from '../../scripts/lib/lessons-write.mjs';
import { readFileSync } from 'node:fs';

const supportOf = (text) => parseLessons(text).entries[0].meta.support;

test('a lesson cannot declare its own support — the incoming value is discarded', () => {
  const claimed = entry().replace('confidence: medium', 'confidence: medium\nsupport: cross-project');
  const text = addLesson('', claimed).text;
  assert.equal(supportOf(text), 'self-asserted',
    'an entry that asserted cross-project support on its first sighting kept the claim');
});

test('one sighting is self-asserted, however sure the agent was', () => {
  const text = addLesson('', entry({ confidence: 'high' })).text;
  assert.equal(supportOf(text), 'self-asserted');
});

test('a lesson with no evidence line is unsupported', () => {
  const text = addLesson('', entry({ evidence: [] })).text;
  assert.equal(supportOf(text), 'unsupported');
});

test('a second sighting corroborates — that is what a repeat buys', () => {
  let text = addLesson('', entry()).text;
  text = addLesson(text, entry({ date: '2026-05-19', evidence: ['commit: def5678'] })).text;
  assert.equal(supportOf(text), 'corroborated');
});

test('a sighting in a second project is cross-project', () => {
  let text = addLesson('', entry()).text;
  const elsewhere = entry({ date: '2026-05-19', evidence: ['commit: def5678'] })
    .replace('project: demo', 'project: other');
  text = addLesson(text, elsewhere).text;
  assert.equal(supportOf(text), 'cross-project');
  assert.match(parseLessons(text).entries[0].meta.projects, /demo/);
  assert.match(parseLessons(text).entries[0].meta.projects, /other/);
});

test('support falls back when a repeat brings no new evidence — it is recomputed, not latched', () => {
  assert.equal(computeSupport({ occurrences: '1' }, []), 'unsupported');
  assert.equal(computeSupport({ occurrences: '1' }, ['commit: abc']), 'self-asserted');
  assert.equal(computeSupport({ occurrences: '9' }, []), 'unsupported',
    'nine sightings of nothing is still nothing');
});

test('confidence is still recorded, and still may only rise — it just no longer ranks', () => {
  let text = addLesson('', entry({ confidence: 'high' })).text;
  text = addLesson(text, entry({ confidence: 'low', date: '2026-05-19' })).text;
  const meta = parseLessons(text).entries[0].meta;
  assert.equal(meta.confidence, 'high');
  assert.equal(meta.support, 'corroborated', 'support is the axis that moved');
});

test('nothing tells a reader that a self-rating is evidence', () => {
  // The two places that did. `read-past-lessons.sh` called decisions.md "higher
  // confidence" — conflating cross-project support with the self-rating field —
  // and continuous-learner picked which lessons survive by "highest-confidence".
  const learner = readFileSync(new URL('../../agents/continuous-learner.md', import.meta.url), 'utf8');
  const reader = readFileSync(new URL('../../scripts/read-past-lessons.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(learner, /highest-confidence/i,
    'continuous-learner still ranks surviving lessons by a rating it wrote itself');
  assert.doesNotMatch(reader, /higher confidence/i,
    'read-past-lessons.sh still presents cross-project support as "confidence"');
});
