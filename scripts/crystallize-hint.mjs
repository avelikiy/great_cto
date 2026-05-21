/**
 * crystallize-hint.mjs
 *
 * Pure utility exported by session-end.mjs and tested by crystallize.test.mjs.
 * No side effects — safe to import without triggering stdin reads.
 */

import { readFileSync } from 'node:fs';

/**
 * Return a hint string when the session count warrants running /crystallize.
 * Checks .great_cto/.last-crystallize for the last-run session count.
 * Returns a non-empty string when the hint should be appended to the session log.
 *
 * @param {number} sessionCount - current number of session-*-end.md files
 * @returns {string}
 */
export function checkCrystallizeHint(sessionCount) {
  try {
    const marker = JSON.parse(readFileSync('.great_cto/.last-crystallize', 'utf8'));
    if (sessionCount >= (marker.sessions || 0) + 10) {
      return '\n## Crystallize hint\n\nYou\'ve run ' + sessionCount + ' sessions since last /crystallize. Run `/crystallize` to distil patterns into skills.\n';
    }
  } catch { /* no marker yet — hint after 10 sessions from zero */ }
  if (sessionCount > 0 && sessionCount % 10 === 0) {
    return '\n## Crystallize hint\n\nYou\'ve completed ' + sessionCount + ' sessions. Run `/crystallize` to distil patterns into reusable skills.\n';
  }
  return '';
}
