// Two records, and the second names the first.
//
// This repository already gates what is expensive to undo. What it did not have
// is the pairing: a record written BEFORE the step saying what was approved, for
// which target and until when, and a record after it citing that approval.
// Without the link, "deployed" and "deployed with approval" are the same
// sentence, and an outcome nobody approved reads like one that was.
//
// The coverage line is the other half. A post-deploy check that cannot say what
// it skipped is not a pass; it is a partial result wearing a pass's badge —
// which is the failure this repository keeps meeting under different names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENT = readFileSync(join(ROOT, 'agents/devops.md'), 'utf8');
const EVAL = readFileSync(join(ROOT, 'tests/eval/EVAL-devops-deploy-safety.md'), 'utf8');

test('an admission is recorded before the step, with its scope and its expiry', () => {
  assert.match(AGENT, /admission/i, 'the prompt never names the record written before the step');
  assert.match(AGENT, /expir|until when|valid until/i,
    'an approval with no expiry is an approval that never lapses');
  assert.match(AGENT, /exact target|which target|target it/i,
    'an approval that does not name its target approves everything');
});

test('the outcome cites the admission it acted under', () => {
  assert.match(AGENT, /outcome/i, 'the prompt never names the record written after the step');
  assert.match(AGENT, /cite|names the admission|links? (back )?to/i,
    'nothing requires the outcome to point at its approval');
});

test('an outcome with no admission is reported as an unapproved change', () => {
  assert.match(AGENT, /unapproved/i,
    'a change nobody approved has no name in this prompt, so it reads like an ordinary one');
});

test('the post-deploy check says what it skipped, or it is partial', () => {
  assert.match(AGENT, /skipped/i, 'the verification never has to say what it did not check');
  assert.match(AGENT, /`partial`/,
    'a verification that cannot say what it skipped needs a result that is not ok');
});

test('an upgrade does not destroy the volume it is upgrading', () => {
  assert.match(AGENT, /down -v|delete the volume|never remove the volume/i,
    'the prompt does not refuse the command that removes the data with the container');
  assert.match(AGENT, /stop the container|before copying/i,
    'copying a live volume is a backup of a half-written database');
});

test('the eval set measures each of them', () => {
  for (const [what, re] of [
    ['an outcome with no admission', /admission|unapproved/i],
    ['a green check that skipped a step', /skipped|partial/i],
    ['an upgrade that recreates the volume', /volume/i],
  ]) assert.match(EVAL, re, `EVAL-devops-deploy-safety.md has no case for ${what}`);
});
