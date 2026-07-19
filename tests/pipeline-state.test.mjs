// Stage reconstruction after an interruption (T10 / F3).
//
// An interrupted run keeps its code and loses its place. The resumed agent then
// either redoes finished work or skips unfinished work and ships — the `booking`
// benchmark product skipped QA and security exactly this way and scored 58 (C).
// These tests pin the rule that matters: a stage counts as done only on a
// terminal verdict, and a missing mandatory stage must be impossible to miss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStages, renderSummary, BUILD_ORDER, MANDATORY } from '../scripts/pipeline-state.mjs';

const S = (stage, status, verdict = null) => ({ stage, status, verdict });

test('fresh project — nothing done, next is the first stage', () => {
  const sum = summarizeStages(BUILD_ORDER.map(s => S(s, 'idle')));
  assert.deepEqual(sum.completed, []);
  assert.equal(sum.next, 'product-owner');
  assert.deepEqual(sum.remaining, BUILD_ORDER);
  assert.deepEqual(sum.mandatoryMissing, MANDATORY);
});

test('mid-build — next is the first stage that is not done', () => {
  const sum = summarizeStages([
    S('product-owner', 'done', 'APPROVED'),
    S('architect', 'done', 'APPROVED'),
    S('pm', 'done', 'PLAN_READY'),
    S('senior-dev', 'idle'),
    S('qa-engineer', 'idle'),
    S('security-officer', 'idle'),
    S('devops', 'idle'),
  ]);
  assert.deepEqual(sum.completed, ['product-owner', 'architect', 'pm']);
  assert.equal(sum.next, 'senior-dev');
  assert.ok(sum.remaining.includes('qa-engineer'));
});

test('the booking failure mode: code done, QA and security never ran', () => {
  const sum = summarizeStages([
    S('product-owner', 'done', 'APPROVED'),
    S('architect', 'done', 'APPROVED'),
    S('pm', 'done', 'PLAN_READY'),
    S('senior-dev', 'done', 'DONE'),
    S('qa-engineer', 'idle'),
    S('security-officer', 'idle'),
    S('devops', 'idle'),
  ]);
  assert.deepEqual(sum.mandatoryMissing, ['qa-engineer', 'security-officer'],
    'both mandatory stages must be reported missing');
  assert.equal(sum.next, 'qa-engineer', 'resume picks up at QA, not at deploy');
  const text = renderSummary(sum);
  assert.match(text, /MANDATORY/, 'the warning is impossible to miss in the prompt');
});

test('an active stage is not "next" — do not double-run in-flight work', () => {
  const sum = summarizeStages([
    S('product-owner', 'done', 'APPROVED'),
    S('architect', 'active'),
    S('pm', 'idle'),
  ]);
  assert.deepEqual(sum.active, ['architect']);
  assert.equal(sum.next, 'pm', 'skips the stage already running');
});

test('a failed stage is surfaced and still counts as remaining', () => {
  const sum = summarizeStages([
    S('senior-dev', 'done', 'DONE'),
    S('qa-engineer', 'failed', 'BLOCKED'),
    S('security-officer', 'idle'),
  ]);
  assert.deepEqual(sum.failed, ['qa-engineer']);
  assert.ok(sum.remaining.includes('qa-engineer'), 'failed is not done');
  assert.ok(sum.mandatoryMissing.includes('qa-engineer'));
  assert.match(renderSummary(sum), /FAILED/);
});

test('all stages done — nothing mandatory outstanding', () => {
  const sum = summarizeStages(BUILD_ORDER.map(s => S(s, 'done', 'APPROVED')));
  assert.equal(sum.next, null);
  assert.deepEqual(sum.remaining, []);
  assert.deepEqual(sum.mandatoryMissing, []);
  assert.match(renderSummary(sum), /mandatory stages .* have terminal verdicts/);
});

test('unknown stages in the input are ignored, not treated as build steps', () => {
  const sum = summarizeStages([
    S('human-gate', 'active'),
    S('l3-support', 'done', 'DONE'),
    S('product-owner', 'done', 'APPROVED'),
  ]);
  assert.deepEqual(sum.completed, ['product-owner'], 'l3-support is not a build stage');
  assert.equal(sum.next, 'architect');
});

test('empty input is safe', () => {
  const sum = summarizeStages([]);
  assert.equal(sum.next, 'product-owner');
  assert.deepEqual(sum.mandatoryMissing, MANDATORY);
});

test('rendered summary states its provenance — reconstructed, not assumed', () => {
  const text = renderSummary(summarizeStages([]));
  assert.match(text, /reconstructed from \.great_cto\/verdicts/);
});
