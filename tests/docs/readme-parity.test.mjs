// Nine translated READMEs drifted 40 days and 160 lines behind the English one.
//
// They were not lying: each carried a stamp naming the version it translated,
// and the English one is canonical. But a reader arriving on `docs/ru/README.md`
// from a search result reads the product's composition, not the stamp — and what
// they read was a roster of 69 agents that has been 70 for weeks, an
// `approval-level` table that was not there at all, and no mention of the
// `ship-only` level that the English README calls the minimum that is still
// honest.
//
// A stamp is an honest label on a stale document. It is not a substitute for the
// document being current, and nothing was watching the gap.
//
// What this checks is deliberately MECHANICAL, because the alternative — asking
// whether a translation is faithful — cannot be automated and would be a rule
// nobody could run. It checks the shape and the tokens that must survive any
// honest translation:
//
//   - the same number of `##` sections
//   - the same number of table rows
//   - every state token present, untranslated (`unverifiable`, `ship-only`, …)
//   - the same agent count as the English file
//   - the translation is not BEHIND the English file in history
//
// A translation can pass all five and still read badly. It cannot pass them and
// be missing the approval-level table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LANGS = ['de', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sections = (s) => (s.match(/^##\s+\S/gm) || []).length;
const tableRows = (s) => (s.match(/^\|/gm) || []).length;

// Tokens that name a state or a level. Translating one of these turns a value
// the tool actually emits into prose, and the reader can no longer match what
// the README says to what their terminal shows.
const TOKENS = [
  'ship-only', 'product-only', 'gates-only', 'strict', 'auto',
  'unverifiable', 'unmeasured', 'unavailable', 'null',
  'approval-level', 'PROJECT.md',
  // Literal console output, not prose. Eight of nine translators left it in
  // English unprompted and one rendered it in Spanish — a screen the tool does
  // not print, in a README whose subject is not showing things that did not
  // happen. The ASCII pipeline diagram beside it is deliberately NOT listed
  // here: that one is illustrative, several languages have always translated
  // it, and this check does not have an opinion about it.
  'ABOUT TO BUILD',
];

const english = read('README.md');

/**
 * The commit that last changed a file, or null when git cannot answer.
 *
 * Currency is asked of HISTORY, not of a version string. The first version of
 * this check required the stamp to name the CURRENT package version — which
 * made every patch bump turn nine files stale even though the English text had
 * not moved. It went red on v3.28.1 for exactly that reason, in a step that
 * could not fail the gate, so nobody found out from the gate. A check that
 * cries on a release nobody would act on is a check that gets deleted.
 *
 * The honest question is narrower: is the translation BEHIND the English?
 */
function lastCommit(path) {
  try {
    const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', path],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    return sha || null;
  } catch { return null; }
}
/**
 * Uncommitted edits count as "ahead of everything". Without this the check
 * reads history only, so `edit README.md → run gate → green → commit` was a
 * legal sequence — and the drift appeared one commit later, after the gate had
 * already said yes. A guard that is green at the moment it matters and red
 * afterwards is decoration.
 */
function isDirty(path) {
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', path], { cwd: ROOT }); return false; }
  catch { return true; }
}
const englishDirty = isDirty('README.md');
const englishCommit = lastCommit('README.md');

/** The agent count the English README states, so the check follows the source. */
const englishAgentCount = (english.match(/\*\*(\d+)\s+agents?/) || english.match(/(\d+)\s+agents\b/) || [])[1];

test('the English README states an agent count this check can follow', () => {
  assert.ok(englishAgentCount, 'no agent count found in README.md — this check has nothing to compare against');
});

for (const lang of LANGS) {
  const path = `docs/${lang}/README.md`;

  test(`${lang}: the translation exists`, () => {
    assert.ok(existsSync(join(ROOT, path)), `${path} is missing — a language advertised and not shipped`);
  });

  test(`${lang}: every section of the English README survives`, () => {
    const t = read(path);
    assert.equal(sections(t), sections(english),
      `${path} has ${sections(t)} sections against the English ${sections(english)} — a dropped section is a claim the reader never sees`);
  });

  test(`${lang}: every table row survives`, () => {
    const t = read(path);
    assert.equal(tableRows(t), tableRows(english),
      `${path} has ${tableRows(t)} table rows against the English ${tableRows(english)} — the approval-level and refusal tables are the two places a reader checks a fact`);
  });

  test(`${lang}: state tokens are not translated away`, () => {
    const t = read(path);
    const gone = TOKENS.filter((tok) => !t.includes(tok));
    assert.deepEqual(gone, [], `${path} lost: ${gone.join(', ')} — these are values the tool prints, not prose`);
  });

  test(`${lang}: the agent count matches the English one`, () => {
    const t = read(path);
    assert.match(t, new RegExp(`\\b${englishAgentCount}\\b`),
      `${path} does not state ${englishAgentCount} agents — it shipped 69 for six weeks while there were 70`);
  });

  test(`${lang}: the reader is told which version this mirrors`, () => {
    const t = read(path);
    assert.match(t, /v\d+\.\d+\.\d+/,
      `${path} carries no version stamp — the reader cannot tell what it mirrors`);
  });

  test(`${lang}: the translation is not behind the English README`, (t) => {
    const mine = lastCommit(path);
    if (englishDirty && !isDirty(path)) {
      assert.fail(`README.md has uncommitted edits and ${path} does not — the English moved and this did not follow.`);
    }
    if (!englishCommit || !mine) return t.skip('git history unavailable — not checked, which is not the same as fine');
    if (mine === englishCommit) return;   // both moved in the same commit
    let behind;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', mine, englishCommit], { cwd: ROOT });
      behind = true;                       // the translation's commit precedes the English one
    } catch { behind = false; }
    assert.equal(behind, false,
      `${path} was last touched before README.md was — the English moved and this did not follow. `
      + `Regenerate it; ${englishCommit.slice(0, 8)} is what it must mirror.`);
  });
}
