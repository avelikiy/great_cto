/**
 * The names of the operator's private projects, derived the way
 * scripts/hooks/pre-push.sh derives them, so the two doors agree on what a
 * private name is: the push door (nothing private reaches the public repo) and
 * the global-memory door (nothing about one project reaches every other one).
 *
 *   - every line of ~/.great_cto/private-terms (comments and blanks skipped);
 *   - every directory name one or two levels under the workspace
 *     (~/development, or GREAT_CTO_WORKSPACE): everything there is private, and
 *     a hand-kept list kept losing names;
 *   - minus great_cto*, the one public project, and ~/.great_cto/public-terms;
 *   - minus names under 3 characters and common words (`tools`, `src`), which
 *     cannot tell a project from an English sentence.
 *
 * The names are read from disk at run time and never written anywhere.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Same words as _STOPWORDS in pre-push.sh — a test keeps the two lists equal. */
export const STOPWORDS = new Set(`the and or for with from this that a an of to in on at is are be by
it as not but if then else when where project projects work personal src lib bin
docs doc test tests script scripts tools tool plugin plugins main app api web core data build dist node`.split(/\s+/).filter(Boolean));

function lines(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } catch { return []; }
}

function subdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch { return []; }
}

/**
 * @returns {{terms: string[], rejected: string[]}} rejected = too short or too common
 */
export function privateTerms({ home = homedir(), workspace = process.env.GREAT_CTO_WORKSPACE || join(home, 'development') } = {}) {
  const dir = join(home, '.great_cto');
  const pub = new Set(lines(join(dir, 'public-terms')).map((t) => t.toLowerCase()));
  const raw = [...lines(join(dir, 'private-terms'))];
  if (existsSync(workspace)) {
    for (const a of subdirs(workspace)) {
      raw.push(a);
      for (const b of subdirs(join(workspace, a))) raw.push(b);
    }
  }
  const terms = []; const rejected = []; const seen = new Set();
  for (const t of raw) {
    const lc = t.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    if (lc.startsWith('great_cto') || pub.has(lc)) continue;
    if (t.length < 3 || STOPWORDS.has(lc)) { rejected.push(t); continue; }
    terms.push(t);
  }
  return { terms, rejected };
}

/**
 * A predicate: does the text name any of these terms as a word? Bounded the
 * way pre-push bounds it — not preceded or followed by a letter or digit — so a
 * name inside a longer word is not a hit.
 */
export function termMatcher(terms) {
  if (!terms.length) return () => false;
  const alt = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(^|[^A-Za-z0-9])(${alt})([^A-Za-z0-9]|$)`, 'i');
  return (text) => re.test(String(text ?? ''));
}
