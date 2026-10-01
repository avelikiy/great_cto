#!/usr/bin/env node
/**
 * Read the global memory layers into a session's context — after checking them.
 *
 * The SessionStart hook used to do this with a bare
 * `cat ~/.great_cto/preferences.md`. That file is a global L4 layer, read into
 * every session in every project, which is its purpose. A token placed in it by
 * any means therefore reached every session and settled into transcripts, which
 * are an archive nobody edits afterwards. Measured on the machine where it
 * happened: one line, 29 transcripts, 102 occurrences.
 *
 * `secret-scan` guards Edit | Write | MultiEdit and did its job; it cannot see a
 * Bash redirect or a hand edit, and it only ever asks about the write in front of
 * it. This asks the other question — is a secret ALREADY here — at the one moment
 * that matters, immediately before the content is handed to a model.
 *
 * A file that cannot be read is withheld rather than emitted: "I could not check"
 * must not arrive as "checked and clean" when being wrong is permanent.
 *
 * Secrets leak outward; injections steer inward. A file that passes the secret
 * scan is then screened ENTRY by entry (`injection-scan.mjs`): an entry carrying
 * invisible Unicode, instructions hidden in an HTML comment, or a prompt-injection
 * phrase in prose is dropped, the rest of the file still loads, and invisible
 * characters are stripped from what does. The notice names the file, the entry's
 * line and the kind — never the text, which is the payload.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { scanMemoryFile } from '../lib/memory-secret-scan.mjs';
import { screenMemoryText } from '../lib/injection-scan.mjs';

/** The L4 layers, shared by every project — see data-readers.mjs `scope: 'global'`. */
const LAYERS = ['preferences.md', 'decisions.md', 'lessons.md'];

function main() {
  const dir = join(homedir(), '.great_cto');
  const out = [];
  const warnings = [];

  for (const name of LAYERS) {
    const r = scanMemoryFile(join(dir, name));
    if (r.state !== 'clean') { if (r.message) warnings.push(r.message); continue; }
    const { content, dropped } = screenMemoryText(r.content);
    for (const d of dropped) {
      warnings.push(`INJECTION GUARD — ${name}: entry at line ${d.line} dropped (${d.kinds.join(', ')}); `
        + 'it was NOT loaded into this session. Review that entry in the file.');
    }
    if (content.trim()) out.push(content);
  }

  // Warnings go to stderr so they reach the operator without becoming part of the
  // context the model reads — the same distinction this whole check is about.
  if (warnings.length) process.stderr.write('\n' + warnings.join('\n\n') + '\n');
  if (out.length) process.stdout.write(out.join('\n'));
}

try { main(); } catch { /* never block a session start on a diagnostic */ }
