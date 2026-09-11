#!/usr/bin/env node
/**
 * count-skips — how many tests a gate step skipped, from its output.
 *
 * `node --test` exits 0 when tests skip, so a step judged by exit code alone
 * prints ✓ for a board e2e that could not launch a browser and pressed nothing.
 * ci-local's step() tees each step's output and asks this how many were skipped,
 * so the gate can keep "green" and "green with things not checked" apart.
 *
 * Only runner SUMMARY lines count — TAP `# skip N`, spec `ℹ skipped N` — summed
 * across every runner in the output. A test's own `# SKIP` directive is already
 * inside its runner's summary, and a test merely NAMED "skip" is not a skip.
 *
 * CLI: node count-skips.mjs <log>  → prints the number; exit 2, printing nothing,
 * when the log cannot be read (an unreadable log is not "0 skipped").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function countSkips(text) {
  let n = 0;
  for (const m of String(text ?? '').matchAll(/^(?:# skip|ℹ skipped) (\d+)\s*$/gm)) n += Number(m[1]);
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let text;
  try { text = readFileSync(process.argv[2], 'utf8'); } catch { process.exit(2); }
  process.stdout.write(`${countSkips(text)}\n`);
}
