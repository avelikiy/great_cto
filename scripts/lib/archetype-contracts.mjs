// scripts/lib/archetype-contracts.mjs — per-archetype quality contracts (QUALITY-DEEPEN #3).
//
// The generic rubric (product-score/product-eval) can't see domain-critical invariants:
// a marketplace that doesn't make escrow-release idempotent, a content platform that
// delivers without an entitlement check, a booking app that allows double-booking — all
// score fine generically but are broken products. This encodes the archetype reviewers'
// domain knowledge as a CONTRACT: a set of invariants each archetype's TEST SUITE must
// cover. We check coverage by pattern-matching the product's test files — a test that
// asserts the invariant is evidence the build honors it.
//
// A floor on DOMAIN correctness (does the suite even test the dangerous path), complementing
// the executed score (do the tests pass).
//
// Usage:
//   node scripts/lib/archetype-contracts.mjs <product-dir> --archetype marketplace [--json]

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Domain invariants per archetype. `pattern` is matched (case-insensitive) against the
 *  concatenated test-file text — presence = the dangerous path is tested. */
export const CONTRACTS = Object.freeze({
  crud: [
    { id: 'validation', desc: 'rejects invalid input', pattern: /invalid|validation|ValidationError|\b400\b|reject/i },
    { id: 'auth-on-write', desc: 'auth enforced on writes', pattern: /\b401\b|without token|unauthor|fails? closed/i },
  ],
  booking: [
    { id: 'no-double-book', desc: 'double-booking rejected', pattern: /double.?book|already.?book|\b409\b|conflict/i },
    { id: 'cancel-releases', desc: 'cancel frees the slot', pattern: /cancel[\s\S]{0,40}(releas|availab|free)|releas[\s\S]{0,20}slot/i },
    { id: 'availability', desc: 'availability filter', pattern: /availab/i },
  ],
  crm: [
    { id: 'stage-transitions', desc: 'valid pipeline stage transitions', pattern: /stage|advance|pipeline/i },
    { id: 'referential', desc: 'deal→contact referential integrity', pattern: /(non.?existent|invalid|missing)[\s\S]{0,30}(contact|deal)|referential|\b400\b[\s\S]{0,20}contact/i },
  ],
  dashboard: [
    { id: 'aggregation', desc: 'aggregation correctness', pattern: /aggregat|\bsum\b|\bcount\b|metric/i },
    { id: 'window', desc: 'time-window boundaries', pattern: /window|since|until|range|boundary/i },
  ],
  marketplace: [
    { id: 'escrow-held', desc: 'order holds escrow', pattern: /escrow|hold/i },
    { id: 'release-idempotent', desc: 'double-release rejected', pattern: /(double|twice|already|second)[\s\S]{0,30}releas|releas[\s\S]{0,20}(twice|idempot|already)/i },
    { id: 'buyer-not-seller', desc: 'seller cannot order own listing', pattern: /seller[\s\S]{0,40}(buyer|order|\b403\b)|cannot[\s\S]{0,20}order|buyer[\s\S]{0,10}!==?[\s\S]{0,10}seller/i },
  ],
  content: [
    { id: 'entitlement-gate', desc: 'deliver blocked without entitlement', pattern: /\b403\b|without[\s\S]{0,30}(entitle|access)|deny|unauthor/i },
    { id: 'purchase-grants', desc: 'purchase creates entitlement', pattern: /purchas|subscrib|entitlement[\s\S]{0,20}(creat|grant|add)/i },
  ],
});

/** Map TYPE_MAP/real names to a contract family. */
export function contractFamily(a) {
  if (!a) return null;
  const s = String(a).toLowerCase();
  if (/crud|vertical-saas|web-?service|web-?app/.test(s)) return 'crud';
  if (/booking|schedul|reservation|calendar/.test(s)) return 'booking';
  if (/crm|nurture|pipeline|contact/.test(s)) return 'crm';
  if (/dashboard|analytic|metric/.test(s)) return 'dashboard';
  if (/marketplace|two-?sided|listing/.test(s)) return 'marketplace';
  if (/content|media|catalog|cms/.test(s)) return 'content';
  return s;
}

/** Pure: which contract items are covered by the test text. */
export function checkContracts(archetype, testText) {
  const fam = contractFamily(archetype);
  const items = CONTRACTS[fam] || [];
  const results = items.map(c => ({ id: c.id, desc: c.desc, covered: c.pattern.test(String(testText || '')) }));
  const covered = results.filter(r => r.covered).length;
  return {
    family: fam,
    total: items.length,
    covered,
    coverage: items.length ? Math.round((covered / items.length) * 100) : null,
    results,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

/** Concatenate a product's test-file text. */
export function readTestText(dir) {
  const skip = new Set(['node_modules', '.git', 'dist']);
  const stack = [dir]; let text = '';
  while (stack.length) {
    let entries; try { entries = readdirSync(stack.pop(), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(e.path ?? dir, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) stack.push(p); continue; }
      if (/\.(test|spec)\.(mjs|js|ts|tsx|py)$/.test(e.name)) { try { text += readFileSync(p, 'utf8') + '\n'; } catch { /* */ } }
    }
  }
  return text;
}

function main(argv) {
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) { console.error('Usage: archetype-contracts.mjs <dir> --archetype <a> [--json]'); process.exit(2); }
  const ai = argv.indexOf('--archetype');
  const archetype = ai > -1 ? argv[ai + 1] : null;
  if (!archetype) { console.error('ERROR: --archetype required (crud|booking|crm|dashboard|marketplace|content)'); process.exit(2); }

  const r = checkContracts(archetype, readTestText(dir));
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, archetype, ...r }, null, 2)); return; }
  if (r.total === 0) { console.log(`No contracts for archetype family "${r.family}".`); return; }
  console.log(`Domain contracts — ${dir}  [${r.family}]`);
  for (const c of r.results) console.log(`  ${c.covered ? '✓' : '✗'} ${c.id.padEnd(20)} ${c.desc}`);
  console.log(`\n  Contract coverage: ${r.covered}/${r.total} (${r.coverage}%)`);
  process.exit(r.covered < r.total ? 1 : 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
