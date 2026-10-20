// Every writer to the global knowledge layer is on a reviewed list.
//
// ~/.great_cto/{preferences,decisions,lessons}.md and global-patterns/ are read
// by every session of every project. The rule (no cross-project leaks) says a
// new way to write there gets the same check as the learner and /crystallize in
// the same change. It was held by memory, not code: scripts/seed-demo.mjs wrote
// seven demo ADRs over the global decisions.md and four demo global patterns
// for five months, and /agent retire appended a free-text reason to the same
// file. This test finds every file that can write there — code and the bash in
// commands — and fails on one nobody has reviewed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// file → why it may stand here. A reason names the guard, not an intention.
export const REVIEWED = {
  'scripts/lessons-merge.mjs': 'decisions.md only with an eval stamp that is not a regression (ADR-037)',
  'commands/crystallize.md': 'global-patterns activation is gated on eval evidence (ADR-009, gp-approve-gate.mjs)',
  'commands/start.md': 'writes the preferences.md template only when the file does not exist; no project data',
  'packages/board/lib/fleet.mjs': 'decision log refuses to write without a project cwd (ADR-008)',
  'packages/board/lib/routes.mjs': 'reads global-patterns for the memory view; writes only project files',
  'packages/cli/src/main.ts': 'uninstall names the global files and moves the directory only with --purge-data',
  'scripts/hooks/lesson-tripwire.mjs': 'reads project and global lessons.md; writes nothing there',
  'scripts/hooks/session-end.mjs': 'links a project lessons.md under ~/.great_cto/projects/; never the global files',
  'scripts/lib/run-learner.mjs': 'the learner writes the project lessons.md; refuses a home-directory cwd',
  'scripts/prompt-evolve.mjs': 'writes its own prompt-evolution ledger; only prints a /crystallize hint',
};

const KNOWLEDGE = /\b(decisions|lessons|preferences)\.md\b|global-patterns/;
const HOME_REF = /\bhomedir\s*\(|process\.env\.HOME\b|\bGREAT_CTO_DIR\b|\bGREAT_CTO_HOME\b/;
const WRITE_CALL = /\b(writeFileSync|appendFileSync|renameSync|copyFileSync|createWriteStream|writeFile)\s*\(/;
// bash in a command: a redirect, tee, cp or mv into the global knowledge files.
const SHELL_WRITE = /(>>?|\btee(\s+-a)?|\bcp|\bmv)\s+["']?(~|\$HOME|\$\{HOME\}|\$GP_DIR|"\$GP_DIR)\/?(\.great_cto\/)?((decisions|lessons|preferences)\.md|global-patterns|GP-)/;

/** Does this source file look able to write the global knowledge layer? */
export function writesGlobalLayer(rel, src) {
  if (rel.endsWith('.md')) {
    return SHELL_WRITE.test(src) || /^\s*GP_DIR=~\/\.great_cto\/global-patterns/m.test(src);
  }
  return HOME_REF.test(src) && KNOWLEDGE.test(src) && WRITE_CALL.test(src);
}

function candidates() {
  const files = execFileSync('git', ['ls-files', 'scripts', 'packages/board/lib', 'packages/cli/src', 'commands', 'agents', 'skills'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((f) => /\.(mjs|js|ts|sh|md)$/.test(f) && !/\.test\.|\/tests?\//.test(f) && !f.startsWith('agents-full/'));
  return files.filter((f) => writesGlobalLayer(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
}

test('every file that can write the global knowledge layer is reviewed', () => {
  const unreviewed = candidates().filter((f) => !(f in REVIEWED));
  assert.deepEqual(unreviewed, [], 'new writer(s) to ~/.great_cto knowledge files — give each the same guard as the learner and /crystallize, then list it here with the guard as the reason');
});

test('the reviewed list holds no file that no longer writes there', () => {
  const found = new Set(candidates());
  assert.deepEqual(Object.keys(REVIEWED).filter((f) => !found.has(f)), []);
});

test('the scan catches a script and a command that write the global layer', () => {
  assert.equal(writesGlobalLayer('scripts/x.mjs',
    'const G = join(process.env.HOME, ".great_cto"); writeFileSync(join(G, "decisions.md"), body);'), true);
  assert.equal(writesGlobalLayer('commands/x.md', 'cat <<EOF >> ~/.great_cto/decisions.md\nx\nEOF'), true);
  assert.equal(writesGlobalLayer('commands/x.md', 'Read `~/.great_cto/decisions.md` first.'), false);
});
