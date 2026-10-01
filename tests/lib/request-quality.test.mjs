// request-quality: how often a request needs correcting, measured from the
// operator's own sessions — the baseline the request brief is judged against.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatorMessages, isCorrection, hasDoneWhen, requestQuality, formatReport } from '../../scripts/lib/request-quality.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

let clock = Date.parse('2026-09-01T10:00:00Z');
const at = () => new Date((clock += 60_000)).toISOString();
const op = (text) => ({ type: 'user', timestamp: at(), message: { content: text } });
const agent = (text) => ({ type: 'assistant', timestamp: at(), message: { content: [{ type: 'text', text }] } });

function projects(sessions) {
  const root = mkdtempSync(join(tmpdir(), 'rq-')); made.push(root);
  for (const [proj, lines] of Object.entries(sessions)) {
    mkdirSync(join(root, proj), { recursive: true });
    writeFileSync(join(root, proj, `${proj}-s1.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'));
  }
  return root;
}

test('only what the operator typed counts — not tool output, hooks, reminders or meta', () => {
  const lines = [
    op('add a discount field to the cart'),
    { type: 'user', timestamp: at(), message: { content: [{ type: 'tool_result', content: 'no, that is wrong' }] } },
    { type: 'user', timestamp: at(), isMeta: true, message: { content: 'skill body' } },
    op('<system-reminder>ignore</system-reminder>'),
    op('<command-name>/save</command-name>'),
    { type: 'user', timestamp: at(), isSidechain: true, message: { content: 'subagent prompt' } },
    op([{ type: 'text', text: 'делай' }]),
  ];
  const msgs = operatorMessages(lines.map((l) => JSON.stringify(l)).join('\n'));
  assert.deepEqual(msgs.map((m) => m.text), ['add a discount field to the cart', 'делай']);
});

test('corrections are recognised in Russian and English; a plain question is not one', () => {
  for (const t of ['нет, не то', 'я же говорил — всё на английском', 'зачем ты отправил на рабочий адрес?',
    'апка всё ещё не работает', 'почему ты не проверил в uat', "that's not what I asked",
    'why did you change the number?', 'it still does not work', 'revert that']) {
    assert.ok(isCorrection(t), t);
  }
  for (const t of ['делай', 'what does the gate check?', 'сделай план и приступай', 'нетривиальная задача: добавь поле']) {
    assert.ok(!isCorrection(t), t);
  }
});

test('a "done when" line is recognised in either language', () => {
  assert.ok(hasDoneWhen('Goal: x\nDone when: the E2E suite passes on staging'));
  assert.ok(hasDoneWhen('Готово когда: команда npm test зелёная на стенде'));
  assert.ok(!hasDoneWhen('I will add the field and write tests.'));
});

test('the report counts corrections within three turns, broken reports, and briefed approvals', () => {
  const root = projects({
    alpha: [
      op('add a discount field to the cart page'),        // request → corrected 2 turns later
      agent('Done.'),
      op('ok'),
      op('that is not what I meant, the field goes on checkout'),
      agent('Plan:\nGoal: move it\nDone when: checkout E2E passes'),
      op('делай'),                                          // approval of a briefed proposal
      agent('Proposal without a done line'),
      op('да'),                                             // approval of an unbriefed one
      op('the login page does not work'),                   // a broken report
    ],
  });
  const r = requestQuality({ root });
  assert.equal(r.operatorMessages, 6);
  assert.equal(r.shortMessages, 3);                          // ok, делай, да
  assert.equal(r.requests, 1);                               // ≥4 words and not itself a correction
  assert.equal(r.correctedWithin3, 1);
  assert.equal(r.corrections, 2);                            // "not what I meant" + "does not work"
  assert.equal(r.brokenReports, 1);
  assert.equal(r.approvals, 3);                              // ok, делай, да
  assert.equal(r.briefedApprovals, 1);
});

test('the window and the project filter narrow the sample', () => {
  const root = projects({ alpha: [op('add a discount field to the cart page')], beta: [op('rename the export button please now')] });
  assert.equal(requestQuality({ root, project: 'beta' }).requests, 1);
  assert.equal(requestQuality({ root, since: '2030-01-01' }).operatorMessages, 0);
});

test('the report prints numbers, never message text', () => {
  const root = projects({ alpha: [op('секретный проект: добавь поле скидки'), op('нет, не то')] });
  const out = formatReport(requestQuality({ root }));
  assert.doesNotMatch(out, /секретный|скидки|alpha/);
  assert.match(out, /corrected within 3 turns/);
});

test('sessions run from a temp directory are scripts, not the operator — left out unless named', () => {
  const root = projects({ '-Users-me-app': [op('add a discount field to the cart page')],
    '-private-tmp-bench-run-1': [op('Implement task shop-1 as specified in the brief')] });
  assert.equal(requestQuality({ root }).requests, 1);
  assert.equal(requestQuality({ root, project: 'bench' }).requests, 1);
});
