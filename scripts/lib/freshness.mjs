/**
 * freshness — judges whether an artifact is fresh, stale, or unknown.
 *
 * Two axes feed the verdict:
 *
 *   1. DECLARED — an author-chosen `stale_after: YYYY-MM-DD`, in YAML
 *      frontmatter or an inline `**Stale after:** YYYY-MM-DD` marker. When
 *      present it is authoritative: past that date the doc is stale, future
 *      of it the doc is fresh — with NO reference to when the file was last
 *      touched. This is the fix for a re-dated typo rejuvenating content that
 *      stopped being true months earlier (measured: 13/159 docs, worst case
 *      76 days — see docs/plans/PLAN-2026-08-15-stale-after.md).
 *
 *   2. mtime (label only) — the fallback when `stale_after` is absent. The
 *      house-rule word for this axis is "mtime", but it does NOT read the
 *      filesystem's modified time: it reads the doc's own declared
 *      `**Date:**` / frontmatter `date:` and compares that age to a
 *      threshold. We keep the label because that's the vocabulary the third
 *      state (`unknown`) is named in throughout the ARCH/ADR; this comment is
 *      the correction — what's actually measured is edit-age-as-declared, not
 *      inode mtime.
 *
 * Three states, never two: 'fresh' | 'stale' | 'unknown'. Absence of
 * `stale_after` is never silently "fresh forever" — it falls through to the
 * mtime rule, which still fires past the threshold, and a doc with neither
 * field reads as 'unknown', not fresh.
 *
 * `now` is always an injected parameter (`nowMs`) — nothing in this module
 * calls Date.now(). The caller (artifact-lint.mjs) resolves one NOW_MS at
 * startup from --now / GREAT_CTO_NOW / the real clock, so every state is
 * reachable in tests without a timer hack.
 *
 * `dateType` ('any' | 'optional') is accepted for signature completeness with
 * the ARCH's freshness contract but is NOT used to change the verdict here:
 * the verdict is a fact about the document, not a policy about whether to
 * warn. Whether an 'unknown' verdict becomes a printed WARN for a
 * date:'optional' type (PLAN, TM) — vs staying silent, as it does today — is
 * a report-time decision the caller makes in its lint loop, matching the
 * ARCH's own "Warn mapping in the lint loop" section. Keeping that policy out
 * of this pure function means `freshness[]` (the JSON audit trail) can record
 * every checked artifact's true verdict, warned or not.
 *
 * ARCH:  docs/architecture/ARCH-stale-after.md
 * ADR:   docs/adr/ADR-011-stale-after-precedence.md
 */

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

/**
 * Strip a UTF-8 BOM. A file that starts with one has no `^---` at position 0,
 * so its frontmatter is invisible to every anchored match below and the
 * author's declared date is silently lost.
 */
function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * True if `iso` (YYYY-MM-DD) is a real calendar date, not just digit-shaped.
 *
 * `Date.parse` alone is not enough: it rejects an impossible MONTH
 * (`2026-13-40` → NaN) but silently rolls an impossible DAY forward, so
 * `2026-02-30` becomes March 2 rather than failing. Round-tripping the parsed
 * value back to its components and requiring they match what the author typed
 * discards such a date instead of quietly judging the document against a
 * nearby one it never wrote.
 */
function isValidIsoDate(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() + 1 === m && back.getUTCDate() === d;
}

/**
 * Parse a declared `stale_after` date from frontmatter or the inline
 * `**Stale after:**` marker. Defensive by construction: the regex is
 * anchored to `\d{4}-\d{2}-\d{2}` so a non-date value (`stale_after: soon`)
 * never matches at all, and a shape-valid but impossible calendar date — an
 * impossible month (`2026-13-40`) or an impossible day (`2026-02-30`) — is
 * caught by `isValidIsoDate` and discarded, never coerced, never read as
 * fresh. Frontmatter takes precedence when both forms appear; the field
 * describes a single intended value, not two independent ones.
 *
 * CRLF and a leading BOM are tolerated: a file normalised by a Windows
 * checkout or an editor still declares the date its author wrote, and losing
 * it to an invisible byte would silently demote the document to the mtime
 * rule while looking exactly like a document that never declared one.
 *
 * @param {string} text
 * @returns {string|null} 'YYYY-MM-DD' or null
 */
export function parseStaleAfter(text) {
  const fm = stripBom(String(text ?? '')).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const m = fm[1].match(/^stale_after:\s*(\d{4}-\d{2}-\d{2})\b/im);
    if (m && isValidIsoDate(m[1])) return m[1];
  }
  const inline = text.match(/\*\*stale[ _-]?after:?\*\*\s*(\d{4}-\d{2}-\d{2})\b/i);
  if (inline && isValidIsoDate(inline[1])) return inline[1];
  return null;
}

/**
 * Extract the most recent date (YYYY-MM-DD) from YAML frontmatter or inline
 * `**Date:**` / `**Last reviewed:**` / `**Updated:**` markers. Moved here
 * from artifact-lint.mjs per ARCH Risk R3: keeping both date parsers in one
 * module means they cannot drift apart silently — which is why the CRLF/BOM
 * tolerance added to `parseStaleAfter` is applied here too rather than only
 * where it was reported.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractDate(text) {
  const found = [];
  const fm = stripBom(String(text ?? '')).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const m of fm[1].matchAll(/^(?:date|last[_-]?reviewed|updated):\s*(\d{4}-\d{2}-\d{2})/gim)) {
      found.push(m[1]);
    }
  }
  for (const m of text.matchAll(/\*\*(?:date|last[_-]?reviewed|updated)[:\s]*\*\*\s*(\d{4}-\d{2}-\d{2})/gi)) {
    found.push(m[1]);
  }
  if (!found.length) return null;
  return found.sort().at(-1); // most recent
}

/**
 * Age in whole days of an ISO date against an injected `nowMs` — never
 * `Date.now()`. Returns null for an unparseable date.
 *
 * @param {string} iso
 * @param {number} nowMs
 * @returns {number|null}
 */
export function ageDays(iso, nowMs) {
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((nowMs - then) / 86_400_000);
}

/**
 * Judge one artifact's freshness.
 *
 * @param {{text: string, dateType: 'any'|'optional', nowMs: number, staleDays: number}} args
 * @returns {{
 *   verdict: 'fresh'|'stale'|'unknown',
 *   basis: 'declared'|'mtime',
 *   staleAfter: string|null,
 *   date: string|null,
 *   ageDays: number|null,
 * }}
 */
export function judgeFreshness({ text, dateType: _dateType, nowMs, staleDays }) {
  const staleAfter = parseStaleAfter(text);
  const date = extractDate(text);
  const age = date ? ageDays(date, nowMs) : null;

  if (staleAfter) {
    const staleAfterMs = Date.parse(`${staleAfter}T00:00:00Z`);
    // "Stale on/after that date" (ADR-011 decision #1) — equality counts as stale.
    const verdict = nowMs >= staleAfterMs ? 'stale' : 'fresh';
    return { verdict, basis: 'declared', staleAfter, date, ageDays: age };
  }

  if (!date) {
    return { verdict: 'unknown', basis: 'mtime', staleAfter: null, date: null, ageDays: null };
  }

  const verdict = age !== null && age > staleDays ? 'stale' : 'fresh';
  return { verdict, basis: 'mtime', staleAfter: null, date, ageDays: age };
}
