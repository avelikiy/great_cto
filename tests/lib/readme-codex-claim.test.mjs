/**
 * The README may not promise on Codex what only Claude Code delivers.
 *
 * It read:
 *
 *     npx great-cto init   # Claude Code (default) · add --host codex for OpenAI Codex
 *     Restart your AI host, then:
 *     /start "build a dispatch & scheduling app…"
 *
 * Two lines apart: install for Codex, then run a slash command Codex does not
 * have. Everything after it — the gate chain, secret-scan, 69 role agents — is
 * Claude Code only, and upstream says a plugin cannot carry hooks at all
 * (openai/codex#16430).
 *
 * Found by pointing Codex itself at this repository and asking whether support
 * was complete. It said no, and named this file. A README that oversells is the
 * same defect as a guard that cannot fail: the reader cannot tell the claim from
 * the fact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readme = () => readFileSync(join(REPO, 'README.md'), 'utf8');

test('mentioning --host codex requires saying what it does NOT give', () => {
  const s = readme();
  // Silence is allowed: a README that never mentions --host codex is not
  // overselling, it is just quiet. Only a CLAIM has to be qualified. (Deleting
  // the caveat also deletes the only mention, so that mutation is not a hole —
  // checked.)
  if (!/--host codex/.test(s)) return;

  // The limits must appear, not be left to the installer's output.
  assert.match(s, /skills and\s*\n?the MCP server|skills \+ MCP|skills and the MCP/i,
    'say what does carry over');
  assert.match(s, /no plugin surface|do not run there|not the pipeline/i,
    'and say plainly what does not');
});

test('the Codex caveat is not buried below the commands it qualifies', () => {
  // A limit stated after the reader has already run the command is a footnote,
  // not a caveat.
  const s = readme();
  const codexAt = s.indexOf('--host codex');
  if (codexAt < 0) return;
  const caveatAt = s.search(/On OpenAI Codex/);
  assert.ok(caveatAt >= 0, 'there must be a Codex section');
  assert.ok(Math.abs(caveatAt - codexAt) < 4000,
    'the caveat must sit near the claim, not in a distant section');
});

test('the quick start does not hand a Codex user a slash command', () => {
  // `/start` right after an install line that offered --host codex is the
  // specific thing that misled: on Codex there are no slash commands.
  const s = readme();
  const qs = s.slice(s.indexOf('## Quick start'), s.indexOf('## Quick start') + 700);
  if (/--host codex/.test(qs)) {
    assert.fail('the quick-start block offers Codex and then shows /start — qualify it or move it');
  }
});
