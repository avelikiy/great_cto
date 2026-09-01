/**
 * Check a global memory file before its contents reach a session's context.
 *
 * `~/.great_cto/preferences.md` and its siblings are L4 layers: a SessionStart
 * hook reads them into every session, in every project. That is what they are
 * for. It also means a secret placed in one travels everywhere and lands in
 * transcripts, which are an archive nobody can edit afterwards — measured here at
 * 29 transcripts and 102 occurrences from a single line.
 *
 * `secret-scan` already guards Edit | Write | MultiEdit and does it well. It
 * cannot see a Bash redirect, a hand edit, or another editor, and it only ever
 * asks about the write in front of it. Nothing asked whether a secret was
 * ALREADY there. This does, using the same patterns rather than a second copy of
 * them.
 *
 * Four states, and the two failure states both withhold:
 *   clean      — checked, nothing found, content returned
 *   withheld   — a pattern matched; content is NOT returned
 *   unreadable — the check could not run; content is NOT returned
 *   absent     — no such file, which is not news
 *
 * `unreadable` withholding is deliberate. Emitting an unscanned file would
 * deliver "I could not check" as "checked and clean", in the one place where
 * being wrong is permanent.
 *
 * The message never contains the matched value. Printing it would put the secret
 * into the context this exists to keep it out of.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PATTERNS } from './secret-patterns.mjs';

/**
 * @param {string} path
 * @param {(p: string) => string} [read]
 * @returns {{state:'clean'|'withheld'|'unreadable'|'absent', content:string, message:string, findings:string[]}}
 */
export function scanMemoryFile(path, read = (p) => readFileSync(p, 'utf8')) {
  let text;
  try {
    text = read(path);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { state: 'absent', content: '', message: '', findings: [] };
    }
    return {
      state: 'unreadable', content: '', findings: [],
      message: `${basename(path)} could not be read, so it was NOT loaded into this session. `
        + 'A file that cannot be checked is not a file that passed.',
    };
  }

  const lines = text.split('\n');
  const findings = [];
  for (const { name, regex } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) { findings.push({ name, line: i + 1 }); break; }
    }
  }
  if (!findings.length) {
    return { state: 'clean', content: text, message: '', findings: [] };
  }

  // Names, not values. The whole purpose is to keep the value out of context.
  const where = findings.map((f) => `${f.name} (line ${f.line})`).join(', ');
  return {
    state: 'withheld', content: '', findings: findings.map((f) => f.name),
    message: `SECRET IN GLOBAL MEMORY — ${basename(path)} was NOT loaded into this session.\n`
      + `  Found: ${where}\n`
      + '  This file is read into EVERY session in EVERY project, so anything in it reaches\n'
      + '  every transcript — an archive that cannot be edited afterwards. Move the value to\n'
      + '  an env file and leave a pointer here, then revoke the exposed credential: it has\n'
      + '  been in context for as long as it has been in this file.',
  };
}
