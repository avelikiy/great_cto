// A score is an assessment pointing at a run, kept apart from the run itself.
//
// The properties below are the reason for the separation, not decoration: many
// scores per run, arriving later than the run, revisable without rewriting
// history, and always attributable. Plus the one that matters most — an
// unassessed run must never be averaged in as a failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeScore, writeScore, readScores, latestScore, summarizeScores, SCORE_VALUES,
} from '../../scripts/lib/scores.mjs';

const proj = () => mkdtempSync(join(tmpdir(), 'gcto-scores-'));
const base = { agent: 'senior-dev', name: 'independent-verify', scorer: 'mechanical' };

test('unverifiable has a NULL value, not zero', () => {
  assert.equal(SCORE_VALUES.unverifiable, null,
    'zero means scored badly; the third state means nothing was assessed');
  assert.equal(makeScore({ ...base, state: 'unverifiable' }).value, null);
  assert.equal(makeScore({ ...base, state: 'rework' }).value, 0);
  assert.equal(makeScore({ ...base, state: 'verified' }).value, 1);
});

test('a rate is computed over ASSESSED runs, never over all of them', () => {
  const root = proj();
  writeScore(root, { ...base, state: 'verified', ts: '2026-08-26T10:00:00Z' });
  for (let i = 0; i < 9; i += 1) {
    writeScore(root, { ...base, state: 'unverifiable', ts: `2026-08-26T10:0${i}:30Z` });
  }
  const s = summarizeScores(root, { name: 'independent-verify' });
  assert.equal(s.total, 10);
  assert.equal(s.assessed, 1);
  assert.equal(s.unassessed, 9);
  assert.equal(s.rate, 100, 'one of one assessed run passed — 10% would be a number about work nobody looked at');
});

test('many scores attach to one run without overwriting each other', () => {
  const root = proj();
  const runTs = '2026-08-26T10:00:00Z';
  writeScore(root, { ...base, runTs, state: 'verified', scorer: 'mechanical', ts: '2026-08-26T10:00:05Z' });
  writeScore(root, { ...base, runTs, state: 'rework', scorer: 'kimi-k3', ts: '2026-08-26T10:00:40Z' });
  const { scores } = readScores(root);
  assert.equal(scores.length, 2, 'a script and a model are different evidence');
  assert.deepEqual(scores.map((s) => s.scorer), ['mechanical', 'kimi-k3']);
});

test('a re-score appends; the newest wins and the older survives', () => {
  const root = proj();
  const runTs = '2026-08-26T10:00:00Z';
  writeScore(root, { ...base, runTs, state: 'rework', ts: '2026-08-26T10:01:00Z' });
  writeScore(root, { ...base, runTs, state: 'verified', ts: '2026-08-26T10:09:00Z' });
  assert.equal(latestScore(root, { agent: 'senior-dev', runTs, name: 'independent-verify' }).state, 'verified');
  assert.equal(readScores(root).scores.length, 2,
    'a judge changing its mind is information — an updating store would erase it');
});

test('newest is by timestamp, not by file order', () => {
  const root = proj();
  const runTs = '2026-08-26T10:00:00Z';
  writeScore(root, { ...base, runTs, state: 'verified', ts: '2026-08-26T10:09:00Z' });
  writeScore(root, { ...base, runTs, state: 'rework', ts: '2026-08-26T10:01:00Z' });  // finished later, ran earlier
  assert.equal(latestScore(root, { agent: 'senior-dev', runTs, name: 'independent-verify' }).state, 'verified');
});

test('a score must name its scorer and its run', () => {
  assert.throws(() => makeScore({ agent: 'x', name: 'y', state: 'verified' }), /scorer is required/);
  assert.throws(() => makeScore({ name: 'y', scorer: 'z', state: 'verified' }), /agent is required/);
  assert.throws(() => makeScore({ ...base, state: 'excellent' }), /state must be one of/);
});

test('unparseable lines are counted, not silently dropped', () => {
  const root = proj();
  mkdirSync(join(root, '.great_cto'), { recursive: true });
  writeScore(root, { ...base, state: 'verified' });
  writeFileSync(join(root, '.great_cto/scores.jsonl'),
    readFileSync(join(root, '.great_cto/scores.jsonl'), 'utf8') + 'not json\n{"agent":"x"}\n');
  const r = readScores(root);
  assert.equal(r.scores.length, 1);
  assert.equal(r.rejected, 2, 'a store that quietly discards half its contents reads like an empty one');
});

test('a project with no scores yet reads as empty, not as an error', () => {
  const r = readScores(proj());
  assert.deepEqual(r, { scores: [], rejected: 0 });
  assert.equal(latestScore(proj(), { agent: 'a', name: 'b' }), null);
});
