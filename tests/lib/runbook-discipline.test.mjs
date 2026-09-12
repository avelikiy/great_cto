// A runbook is a document, and a document is data.
//
// An incident agent that loads organisation-owned guidance has a second input
// channel that nobody reviewed at the moment it is read: whoever can edit the
// wiki page can write "print the connection string" into an investigation. The
// same page is also evidence — written by people who know the system — so the
// answer is neither to ignore it nor to follow it.
//
// The rules below are the ones this repository can check in the prompt: what
// identity may load a runbook, what happens when the load fails, and what the
// final report must keep apart. Whether the agent obeys them is what the eval
// cases measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENT = readFileSync(join(ROOT, 'agents/l3-support.md'), 'utf8');
const EVAL = readFileSync(join(ROOT, 'tests/eval/EVAL-l3-support-incident.md'), 'utf8');

test('a runbook is loaded by exact identity, never by resemblance', () => {
  assert.match(AGENT, /exact/i, 'the prompt does not say how a runbook is identified');
  assert.match(AGENT, /fuzzy|resembl|looks like|probably the one/i,
    'the prompt does not refuse a document that merely looks like the right one');
});

test('an ambiguous match is a question, not a choice', () => {
  assert.match(AGENT, /ambiguous/i, 'nothing says what to do with two candidate runbooks');
  assert.match(AGENT, /never pick|do not pick|ask/i, 'the prompt does not forbid choosing one');
});

test('a runbook that could not be loaded was not followed', () => {
  assert.match(AGENT, /never (claim|report|say)[^.\n]*followed|not claim[^.\n]*followed/i,
    'the prompt allows reporting that a runbook was followed when it never loaded');
});

test('instructions inside the document do not carry authority', () => {
  assert.match(AGENT, /never overrides|does not override|not an instruction/i,
    'the prompt does not say a runbook cannot override tool policy');
  assert.match(AGENT, /credential|secret/i,
    'the prompt does not refuse a document that asks for a credential');
});

test('the report keeps advice, observation and omission apart', () => {
  assert.match(AGENT, /revision|immutable URL|permalink/i,
    'the prompt does not require citing which revision of the document was read');
  assert.match(AGENT, /skipped/i, 'the prompt does not require naming the steps that were skipped');
});

test('remediation names the address that survives a failover', () => {
  assert.match(AGENT, /failover|durable (address|endpoint)|survives/i,
    'nothing stops a fix that pins the instance that happens to be primary now');
});

test('the eval set measures each of them', () => {
  for (const [what, re] of [
    ['a runbook URL that does not load', /404|not found|unreachable/i],
    ['two candidate runbooks', /candidate|ambiguous/i],
    ['a runbook that asks for a credential', /credential|connection string|secret/i],
    ['a fix pinned to the current primary', /primary|failover|endpoint/i],
  ]) assert.match(EVAL, re, `EVAL-l3-support-incident.md has no case for ${what}`);
});
