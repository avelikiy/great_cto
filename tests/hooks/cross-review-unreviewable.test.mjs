// A diff the second opinion refuses to read is not "an answer without a verdict".
//
// Since the review contract (ADR-030) cross-model-review refuses a diff over
// 24 000 characters, or a spec over 4 000, instead of reviewing a truncated
// prefix. It logs that refusal as `state: unreadable` with `error_kind:
// input-too-large` — and the reader used to report it as "<tool> answered for
// this tree and the answer carries no verdict", so the Stop gate told the agent
// to re-run a review that will refuse the same diff every time.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { secondOpinionForTree } from '../../scripts/lib/second-opinion-for-tree.mjs';
import { decideCrossReviewGate } from '../../scripts/hooks/cross-review-gate.mjs';

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function repoWith(lines) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xreview-'))); made.push(d);
  fs.mkdirSync(path.join(d, '.great_cto'));
  fs.writeFileSync(path.join(d, '.great_cto', 'PROJECT.md'), 'capabilities:\n  second_opinion: codex\n');
  fs.writeFileSync(path.join(d, 'a.txt'), 'a\n');
  const git = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('add', 'a.txt');
  git('-c', 'user.name=avelikiy', '-c', 'user.email=avelikiy@users.noreply.github.com', 'commit', '-qm', 'x');
  const sha = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(d, '.great_cto', 'cross-review.log'),
    lines.map((l) => JSON.stringify({ ts: '2026-10-12T00:00:00Z', provider: 'codex', sha, ...l })).join('\n') + '\n');
  return { d, sha };
}

test('a refusal for size reads as unreviewable, not as an answer without a verdict', () => {
  const { d } = repoWith([{ state: 'unreadable', verdict: null, error_kind: 'input-too-large' }]);
  const o = secondOpinionForTree(d);
  assert.equal(o.state, 'unreviewable');
  assert.equal(o.error_kind, 'input-too-large');
  assert.doesNotMatch(o.why, /answered/);
  assert.match(o.why, /24\s?000|too large/i);
});

test('an empty diff is unreviewable too, and says so', () => {
  const { d } = repoWith([{ state: 'unreadable', verdict: null, error_kind: 'empty-diff' }]);
  const o = secondOpinionForTree(d);
  assert.equal(o.state, 'unreviewable');
  assert.match(o.why, /empty/i);
});

test('a real answer without a verdict is still reported as one', () => {
  const { d } = repoWith([{ state: 'unreadable', verdict: null }]);
  const o = secondOpinionForTree(d);
  assert.equal(o.state, 'unreadable');
  assert.match(o.why, /no verdict/);
});

test('the gate does not tell the agent to re-run a review that will refuse again', () => {
  const g = decideCrossReviewGate({ enabled: true, stopHookActive: false, blockedBefore: false,
    opinion: { state: 'unreviewable', error_kind: 'input-too-large', sha: 'abc12345', why: 'too large' } });
  assert.equal(g.block, true, 'an unreviewed diff is not a pass');
  assert.equal(g.kind, 'unreviewable');
  assert.doesNotMatch(g.reason, /re-run/i);
  assert.match(g.reason, /split|another way|say so/i);
});

test('an empty diff does not hold the turn', () => {
  const g = decideCrossReviewGate({ enabled: true, stopHookActive: false, blockedBefore: false,
    opinion: { state: 'unreviewable', error_kind: 'empty-diff', sha: 'abc12345', why: 'empty' } });
  assert.equal(g.block, false);
  assert.equal(g.kind, 'empty');
});

// The board's inbox drew "Codex ✓" for any state it did not name — an
// unreviewable diff would have shown as a passed review. Run the real renderer.
test('the board shows a tick only for a review that passed', () => {
  const html = fs.readFileSync(new URL('../../packages/board/public/index.html', import.meta.url), 'utf8');
  const src = html.match(/function reviewerCells\(t\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(src, 'located reviewerCells');
  // A module of its own, run by node — no eval in the test (the plugin scanner
  // reads `new Function` as dynamic execution, and so should we).
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-cells-'))); made.push(dir);
  const mod = path.join(dir, 'render.mjs');
  fs.writeFileSync(mod, `const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let inboxSecondOpinion = JSON.parse(process.argv[2]);
${src}
process.stdout.write(reviewerCells({ agent: 'qa' }));
`);
  const render = (so) => execFileSync(process.execPath, [mod, JSON.stringify(so)], { encoding: 'utf8' });
  assert.match(render({ state: 'ok', verdict: 'PASS', sha: 'abc' }), /Codex ✓/);
  assert.match(render({ state: 'ok', verdict: 'BLOCK', sha: 'abc', p0: 1 }), /Codex ✗/);
  for (const so of [{ state: 'unreviewable', why: 'too large' }, { state: 'ok', verdict: null }, { state: 'something-new' }]) {
    assert.doesNotMatch(render(so), /✓/, `no tick for ${JSON.stringify(so)}`);
  }
});
