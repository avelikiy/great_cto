// scripts/lib/guards.mjs — Phase 4: resource guards ported from SIA.
//
// SIA hardens its harness against runaway/poisoned inputs with size caps and
// truncation (context_manager._safe_read_file, MAX_CONTEXT_FILE_SIZE,
// *_PREVIEW_LIMIT, EVAL_TIMEOUT). These helpers bring the same discipline to
// great_cto's mjs tooling so a giant or hostile lessons.md / log can't flood an
// LLM context or stall a run.

import { statSync, readFileSync } from 'node:fs';

// Defaults mirror SIA's Config (scaled for great_cto's markdown memory files).
export const MAX_CONTEXT_FILE_BYTES = 10_000_000; // 10 MB — refuse to load larger
export const DEFAULT_PREVIEW_LIMIT = 3_000;       // chars — truncate previews

/**
 * Read a file only if it is within `maxBytes`. Returns null (never throws) when
 * the file is missing, unreadable, or too large — the caller decides the fallback.
 * Port of SIA context_manager._safe_read_file.
 *
 * @returns {string|null}
 */
export function safeReadFile(path, { maxBytes = MAX_CONTEXT_FILE_BYTES, encoding = 'utf8' } = {}) {
  try {
    const { size } = statSync(path);
    if (size > maxBytes) {
      process.env.GREAT_CTO_DEBUG && console.warn(`[guard] file too large (${size} > ${maxBytes}): ${path}`);
      return null;
    }
    return readFileSync(path, encoding);
  } catch {
    return null;
  }
}

/**
 * Truncate a string to `limit` chars, appending a byte-count marker like SIA's
 * "... (truncated, N total chars)". Non-strings and within-limit strings pass through.
 */
export function truncate(str, limit = DEFAULT_PREVIEW_LIMIT) {
  if (typeof str !== 'string') return str;
  if (str.length <= limit) return str;
  return str.slice(0, limit) + `\n... (truncated, ${str.length} total chars)`;
}

/**
 * Wrap a promise with a wall-clock timeout (SIA EVAL_TIMEOUT discipline).
 * Rejects with an Error after `ms`. Use to bound any single external call.
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
