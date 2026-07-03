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
    // F3c: bare `advance` false-positives on "in advance of launch" (unrelated to deal
    // progression) — anchor to a deal/stage/pipeline context within 20 chars.
    { id: 'stage-transitions', desc: 'valid pipeline stage transitions', pattern: /\bstage\w*|\badvance\w*[\s\S]{0,20}(deal|stage|pipeline)|\bpipeline\w*/i },
    { id: 'referential', desc: 'deal→contact referential integrity', pattern: /(non.?existent|invalid|missing)[\s\S]{0,30}(contact|deal)|referential|\b400\b[\s\S]{0,20}contact/i },
  ],
  dashboard: [
    // F3c: bare `aggregat` misses the common `groupBy(...)` idiom (doc example); bare
    // `metric` false-positives on "asymmetric". Add groupBy alias, word-boundary metric.
    { id: 'aggregation', desc: 'aggregation correctness', pattern: /\baggregat\w*|group.?by|\bsum\(|\bcount\(|\bmetric\w*/i },
    // F3c: bare `window` false-positives on "Windows" (the OS); anchor to word boundary
    // so "Windows" (capital-agnostic \b\w* still ends at the trailing s) needs an explicit
    // OS exclusion since \bwindow\w* still matches "Windows". Use a negative lookahead.
    { id: 'window', desc: 'time-window boundaries', pattern: /\bwindow\w*\b(?!\s+(?:os|server|10|11))|\bsince\b|\buntil\b|\brange\b|\bboundary\w*/i },
  ],
  marketplace: [
    // F3c: bare `hold` false-positives on "household"/"threshold"/"shareholder" (doc's
    // headline example). Word-boundary the stem; `held` is a distinct irregular form.
    { id: 'escrow-held', desc: 'order holds escrow', pattern: /escrow|\bhold\w*|\bheld\b/i },
    { id: 'release-idempotent', desc: 'double-release rejected', pattern: /(double|twice|already|second)[\s\S]{0,30}releas|releas[\s\S]{0,20}(twice|idempot|already)/i },
    { id: 'buyer-not-seller', desc: 'seller cannot order own listing', pattern: /seller[\s\S]{0,40}(buyer|order|\b403\b)|cannot[\s\S]{0,20}order|buyer[\s\S]{0,10}!==?[\s\S]{0,10}seller/i },
  ],
  content: [
    { id: 'entitlement-gate', desc: 'deliver blocked without entitlement', pattern: /\b403\b|without[\s\S]{0,30}(entitle|access)|deny|unauthor/i },
    { id: 'purchase-grants', desc: 'purchase creates entitlement', pattern: /purchas|subscrib|entitlement[\s\S]{0,20}(creat|grant|add)/i },
  ],
  // ── F3a: +8 archetypes (docs/arch/ARCH-quality-deepen-followups.md) ──────────
  'ai-system': [
    { id: 'prompt-injection', desc: 'prompt-injection / untrusted-input handling tested', pattern: /prompt.?inject|jailbreak|untrusted[\s\S]{0,20}input|ignore (?:previous|all) instructions/i },
    { id: 'output-validation', desc: 'model output is validated/sanitized before use', pattern: /output[\s\S]{0,20}(valid|sanit|schema)|malformed[\s\S]{0,20}(response|output)|hallucinat/i },
    { id: 'rate-limit', desc: 'cost/rate limiting on model calls', pattern: /rate.?limit|token.?budget|cost.?cap|max.?tokens/i },
  ],
  'agent-product': [
    { id: 'tool-allowlist', desc: 'tool access is allowlisted/scoped', pattern: /tool.?allowlist|allowed.?tools|tool.?scope|denylist/i },
    { id: 'cross-user-isolation', desc: 'cross-user/session isolation enforced', pattern: /cross.?(user|tenant|session)|session[\s\S]{0,20}isolat|leak[\s\S]{0,20}(session|user)/i },
    { id: 'runaway-budget', desc: 'agent loop has a turn/cost budget guard', pattern: /max.?turns|turn.?budget|infinite.?loop|budget.?exceed/i },
  ],
  commerce: [
    { id: 'payment-idempotent', desc: 'duplicate charge/webhook rejected', pattern: /idempot|duplicate[\s\S]{0,20}(charge|payment|webhook)|replay[\s\S]{0,20}webhook/i },
    { id: 'webhook-signature', desc: 'webhook signature verified', pattern: /webhook[\s\S]{0,30}(signature|verify|valid)|stripe.?signature|invalid.?signature/i },
    { id: 'refund-flow', desc: 'refund/dispute flow tested', pattern: /refund|chargeback|dispute/i },
  ],
  web3: [
    { id: 'reentrancy', desc: 'reentrancy protection tested', pattern: /reentran/i },
    { id: 'access-control', desc: 'privileged function access control tested', pattern: /only.?owner|access.?control|unauthorized[\s\S]{0,20}(caller|call)|not.?owner/i },
    { id: 'oracle-staleness', desc: 'oracle price staleness/manipulation checked', pattern: /stale.?price|oracle[\s\S]{0,20}(stale|manipulat)|price.?feed/i },
  ],
  'iot-embedded': [
    { id: 'ota-signature', desc: 'OTA firmware update signature/integrity verified', pattern: /ota[\s\S]{0,20}(signature|verify|sign)|firmware[\s\S]{0,20}(signature|verify|integrity)/i },
    { id: 'watchdog', desc: 'watchdog / fail-safe recovery tested', pattern: /watchdog|fail.?safe|fail.?over|reboot[\s\S]{0,20}recover/i },
  ],
  'data-platform': [
    { id: 'schema-drift', desc: 'schema drift / breaking-change detection', pattern: /schema.?drift|breaking.?change|schema[\s\S]{0,20}(mismatch|incompat)/i },
    { id: 'pipeline-idempotent', desc: 'pipeline re-run / backfill is idempotent', pattern: /idempot|re.?run[\s\S]{0,20}(safe|same|duplicate)|backfill/i },
    { id: 'pii-handling', desc: 'PII column detection/redaction tested', pattern: /\bpii\b|redact|anonymiz|mask[\s\S]{0,20}(field|column|data)/i },
  ],
  'browser-extension': [
    { id: 'csp-enforced', desc: 'content-security-policy / no unsafe-eval tested', pattern: /\bcsp\b|content.?security.?policy|unsafe.?eval/i },
    { id: 'permission-scope', desc: 'host/permission scope is minimal & tested', pattern: /host.?permission|permission[\s\S]{0,20}(scope|minim|denied)|manifest[\s\S]{0,20}permission/i },
  ],
  'mobile-app': [
    { id: 'deep-link-validation', desc: 'deep link / universal link input is validated', pattern: /deep.?link|universal.?link|app.?link[\s\S]{0,20}valid/i },
    { id: 'offline-handling', desc: 'offline / no-connectivity path tested', pattern: /offline|no.?network|no.?connectivity|airplane.?mode/i },
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
  // ── F3a: +8 archetypes ──────────────────────────────────────────────────────
  if (/agent-product|agent-runtime|agentic/.test(s)) return 'agent-product'; // check before ai-system (more specific)
  if (/ai-system|\bai\b|llm/.test(s)) return 'ai-system';
  if (/commerce|e-?commerce|shop|checkout/.test(s)) return 'commerce';
  if (/web3|blockchain|smart-?contract|solidity/.test(s)) return 'web3';
  if (/iot|embedded|firmware/.test(s)) return 'iot-embedded';
  if (/data-?platform|data-?pipeline/.test(s)) return 'data-platform';
  if (/browser-?extension|chrome-?extension/.test(s)) return 'browser-extension';
  if (/mobile-?app|react-native|ios-app|android-app/.test(s)) return 'mobile-app';
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
  if (!archetype) {
    console.error('ERROR: --archetype required (crud|booking|crm|dashboard|marketplace|content|ai-system|agent-product|commerce|web3|iot-embedded|data-platform|browser-extension|mobile-app)');
    process.exit(2);
  }

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
