// scripts/lib/product-score.mjs — automated 0-100 quality score for a shipped product.
//
// Closes the "verifiability" gap: great_cto positions as an AI Product Builder but
// can't prove its builds are good. This scores a generated product directory on the
// same rubric the builder is graded on — presence + shape of what quality products
// have. A floor, not a ceiling: high = right machinery present; low = a real red flag.
// Real correctness still comes from executing the e2e specs this also checks for.
//
// Usage:
//   node scripts/lib/product-score.mjs <product-dir> [--json]
//
// Pure scoreProduct(signals) is unit-tested; inspect(dir) derives signals via static
// checks. Exit 0 always (reporting tool).

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Rubric: weights match the quality-assessment dimensions (sum = 100). */
export const RUBRIC = Object.freeze([
  { key: 'completeness',  weight: 20, label: 'Functional completeness' },
  { key: 'tests',         weight: 20, label: 'Correctness / tests' },
  { key: 'security',      weight: 15, label: 'Security' },
  { key: 'design_a11y',   weight: 15, label: 'Design / a11y' },
  { key: 'observability', weight: 10, label: 'Observability' },
  { key: 'deploy',        weight: 10, label: 'Deploy-readiness' },
  { key: 'verifiability', weight: 10, label: 'Verifiability' },
]);

/**
 * Dimensions that don't apply to an archetype (P2: don't penalize a CLI for having
 * no UI/deploy). Dropped dims are removed and their weight redistributed over the
 * rest, so each archetype is scored only on what it legitimately should have. The 6
 * web build-archetypes (crud/booking/crm/dashboard/marketplace/content) drop nothing.
 */
export const ARCHETYPE_DROP = Object.freeze({
  cli: ['design_a11y', 'deploy'],
  library: ['design_a11y', 'deploy', 'observability'],
  devtools: ['design_a11y'],
});

/** Map great_cto's real archetype names (TYPE_MAP) to a scoring family. */
export function normalizeArchetype(a) {
  if (!a) return null;
  const s = String(a).toLowerCase();
  if (/(^|-)cli(-|$)|cli-tool|command-line/.test(s)) return 'cli';
  if (/library|^sdk$|-sdk/.test(s)) return 'library';
  if (/devtool|developer-tools/.test(s)) return 'devtools';
  return s; // web build-archetypes (crud/booking/crm/dashboard/marketplace/content) → default rubric
}

/** Rubric for an archetype: default minus dropped dims, weights renormalized to 100. */
export function rubricFor(archetype) {
  const drop = new Set(ARCHETYPE_DROP[normalizeArchetype(archetype)] || []);
  const kept = RUBRIC.filter(d => !drop.has(d.key));
  const sum = kept.reduce((a, d) => a + d.weight, 0) || 1;
  return kept.map(d => ({ ...d, weight: round2((d.weight / sum) * 100) }));
}

/**
 * Pure: weighted score from per-dimension signals (each 0..1; missing → 0), using the
 * archetype's rubric (P2). @returns {{total, grade, archetype, breakdown}}
 */
export function scoreProduct(signals = {}, archetype = null) {
  const rubric = rubricFor(archetype);
  const breakdown = rubric.map(d => {
    const signal = clamp01(Number(signals[d.key]) || 0);
    return { key: d.key, label: d.label, weight: d.weight, signal: round2(signal), points: round2(signal * d.weight) };
  });
  const total = Math.round(breakdown.reduce((a, b) => a + b.points, 0));
  return { total, grade: grade(total), archetype: archetype || 'web (default)', breakdown };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function round2(n) { return Math.round(n * 100) / 100; }
function grade(t) { return t >= 85 ? 'A' : t >= 70 ? 'B' : t >= 55 ? 'C' : t >= 40 ? 'D' : 'F'; }

// ── inspection (derive signals from a product directory) ──────────────────────

/** Recursively list files (capped) skipping node_modules/.git/dist. */
function walk(dir, cap = 4000) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage']);
  const stack = [dir];
  while (stack.length && out.length < cap) {
    let entries;
    try { entries = readdirSync(stack.pop(), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(e.path ?? dir, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) stack.push(p); }
      else out.push(p);
    }
  }
  return out;
}

function anyMatch(files, re) { return files.some(f => re.test(f)); }
function grepAny(files, contentRe, nameRe, max = 60) {
  let n = 0;
  for (const f of files) {
    if (nameRe && !nameRe.test(f)) continue;
    if (++n > max) break;
    try { if (contentRe.test(readFileSync(f, 'utf8'))) return true; } catch { /* ignore */ }
  }
  return false;
}

/** Inspect a product dir → signals (each 0..1). Heuristic: presence + shape.
 *  `archetype` tunes the completeness check (a CLI's "complete" ≠ a web app's). */
export function inspect(dir, archetype = null) {
  const files = walk(dir);
  const codeRe = /\.(ts|tsx|js|jsx|mjs|py|go|rs)$/;
  const code = files.filter(f => codeRe.test(f));

  // completeness — archetype-appropriate (P2):
  let completeness;
  let hasModel = false, hasApi = false, hasUi = false; // for _evidence (web dims)
  const fam = normalizeArchetype(archetype);
  if (fam === 'cli') {
    const hasEntry = anyMatch(files, /(bin\/|cli\.(ts|js|mjs|py)|index\.(ts|js|mjs)$)/i) || grepAny(code, /#!\/usr\/bin\/env|process\.argv|argparse|commander|yargs/);
    const hasCommands = grepAny(code, /(addCommand|subcommand|command\(|argparse|yargs|\.option\()/i);
    const hasHelp = grepAny(code, /(--help|usage:|printHelp|\.description\()/i);
    completeness = (hasEntry + hasCommands + hasHelp) / 3;
  } else if (fam === 'library') {
    const hasExports = grepAny(code, /^export |module\.exports/m);
    const hasTypes = anyMatch(files, /\.d\.ts$|types?\//i) || grepAny(code, /export (type|interface)/);
    const hasReadme = anyMatch(files, /readme\.md$/i);
    completeness = (hasExports + hasTypes + hasReadme) / 3;
  } else {
    // web product (the 6 build archetypes): data model + API + UI
    hasModel = anyMatch(files, /(schema\.prisma|migrations?\/|models?\/|schema\.(sql|ts))/i);
    hasApi = anyMatch(files, /(\/api\/|routes?\/|controllers?\/|handlers?\/|server\.(ts|js|mjs))/i);
    hasUi = anyMatch(files, /(\/(pages|components|app|views|ui)\/|\.(tsx|jsx|vue|svelte)$)/i);
    completeness = (hasModel + hasApi + hasUi) / 3;
  }

  // tests: unit present + e2e present
  const hasUnit = anyMatch(files, /\.(test|spec)\.(ts|tsx|js|jsx|mjs|py)$/);
  const hasE2e = anyMatch(files, /(e2e\/|\.e2e\.|playwright|cypress)/i);
  const tests = hasUnit ? (hasE2e ? 1 : 0.6) : (hasE2e ? 0.5 : 0);

  // security: no hardcoded secret, auth present, env.example
  const secretLeak = grepAny(code, /(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|password\s*=\s*['"][^'"]{6,})/);
  const hasAuth = anyMatch(files, /(auth|session|jwt|passport|clerk|next-auth)/i);
  const hasEnvExample = anyMatch(files, /\.env\.(example|sample|template)$/);
  const security = ((secretLeak ? 0 : 0.5) + (hasAuth ? 0.3 : 0) + (hasEnvExample ? 0.2 : 0));

  // design/a11y: design system + aria/role usage
  const hasDesignSys = grepAny(code, /(tailwind|@apply|shadcn|MaterialTheme|chakra|mui)/i, /\.(tsx|jsx|css|ts)$/);
  const hasA11y = grepAny(code, /(aria-|getByRole|role=|getByLabel|alt=)/, /\.(tsx|jsx|ts|js)$/);
  const design_a11y = (hasDesignSys ? 0.5 : 0) + (hasA11y ? 0.5 : 0);

  // observability: error capture + structured logging + health endpoint
  const hasSentry = grepAny(code, /(@sentry|Sentry\.init|instrumentation)/i);
  const hasLogger = grepAny(code, /(pino|winston|structured.?log|request[_-]?id|logger\.(info|error))/i);
  const hasHealth = anyMatch(files, /healthz|readyz/i) || grepAny(code, /\/healthz|\/readyz/);
  const observability = (hasSentry ? 0.4 : 0) + (hasLogger ? 0.3 : 0) + (hasHealth ? 0.3 : 0);

  // deploy: deploy config + CI
  const hasDeploy = anyMatch(files, /(vercel\.json|wrangler\.(toml|jsonc)|Dockerfile|render\.yaml|fly\.toml|netlify\.toml)/i);
  const hasCi = anyMatch(files, /(\.github\/workflows\/|ci-local\.sh|\.gitlab-ci|Jenkinsfile)/i);
  const deploy = (hasDeploy ? 0.6 : 0) + (hasCi ? 0.4 : 0);

  // verifiability: e2e specs AND a recorded quality artifact
  const hasScoreArtifact = anyMatch(files, /(SCORE-.*\.md|quality\/|QA-.*\.md|REVIEW-.*\.md)/i);
  const verifiability = (hasE2e ? 0.5 : 0) + (hasScoreArtifact ? 0.5 : 0);

  return { completeness, tests, security, design_a11y, observability, deploy, verifiability,
    _evidence: { hasModel, hasApi, hasUi, hasUnit, hasE2e, secretLeak, hasAuth, hasEnvExample, hasDesignSys, hasA11y, hasSentry, hasLogger, hasHealth, hasDeploy, hasCi, hasScoreArtifact } };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

/** Best-effort archetype detect: --archetype flag → PROJECT.md → package.json bin (cli). */
export function detectArchetype(dir, flag) {
  if (flag) return flag;
  try {
    const t = readFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'utf8');
    const m = t.match(/^(?:archetype|primary):\s*([a-z-]+)/im);
    if (m) return m[1];
  } catch { /* ignore */ }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pkg.bin) return 'cli';
    if (pkg.main && !pkg.scripts?.start && !pkg.scripts?.dev) return 'library';
  } catch { /* ignore */ }
  return null;
}

/** Score one product dir end-to-end (detect → inspect → score). */
export function scoreDir(dir, archetypeFlag = null) {
  const archetype = detectArchetype(dir, archetypeFlag);
  return scoreProduct(inspect(dir, archetype), archetype);
}

/** Pure: the SCORE-{slug}.md artifact the pipeline emits at S6/S7 (deploy-gate input). */
export function renderScoreMarkdown(name, res) {
  const rows = res.breakdown.map(b => `| ${b.label} | ${b.points}/${b.weight} | ${Math.round(b.signal * 100)}% |`).join('\n');
  return `# SCORE-${name}\n\n> Auto-generated by scripts/lib/product-score.mjs · archetype: ${res.archetype}\n\n**Quality: ${res.total}/100 (grade ${res.grade})**\n\n| Dimension | Points | Signal |\n|-----------|--------|--------|\n${rows}\n`;
}

/** P3 fleet: score each immediate subdir → per-archetype averages + overall. */
function fleet(parent) {
  const dirs = readdirSync(parent, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(parent, e.name));
  const results = dirs.map(d => ({ dir: d, ...scoreDir(d) }));
  if (results.length === 0) { console.log(`fleet: no product subdirs in ${parent}`); return; }
  console.log(`Fleet quality — ${parent}  (${results.length} products)`);
  for (const r of results) console.log(`  ${String(r.total).padStart(3)}/100 ${r.grade}  ${r.archetype.padEnd(18)} ${r.dir}`);
  const byA = {};
  for (const r of results) (byA[r.archetype] ??= []).push(r.total);
  console.log('\n  Per-archetype average:');
  for (const [a, ts] of Object.entries(byA)) console.log(`    ${a.padEnd(18)} ${Math.round(ts.reduce((x, y) => x + y, 0) / ts.length)}/100  (n=${ts.length})`);
  console.log(`\n  OVERALL: ${Math.round(results.reduce((a, r) => a + r.total, 0) / results.length)}/100`);
}

function main(argv) {
  const fIdx = argv.indexOf('--fleet');
  if (fIdx > -1) { const p = argv[fIdx + 1]; if (!p || !existsSync(p)) { console.error('Usage: --fleet <dir-of-products>'); process.exit(2); } return fleet(p); }

  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error('Usage: product-score.mjs <product-dir> [--archetype <id>] [--json] [--save <file>] | --fleet <dir>'); process.exit(2);
  }
  const aIdx = argv.indexOf('--archetype');
  const archetype = detectArchetype(dir, aIdx > -1 ? argv[aIdx + 1] : null);
  const signals = inspect(dir, archetype);
  const res = scoreProduct(signals, archetype);
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, ...res, signals }, null, 2)); return; }

  const sIdx = argv.indexOf('--save');
  if (sIdx > -1 && argv[sIdx + 1]) { writeFileSync(argv[sIdx + 1], renderScoreMarkdown(dir.replace(/[/\\]/g, '-'), res)); console.log(`saved ${argv[sIdx + 1]}`); }

  console.log(`Product quality score — ${dir}  [archetype: ${res.archetype}]`);
  for (const b of res.breakdown) {
    const bar = '█'.repeat(Math.round(b.signal * 10)).padEnd(10, '·');
    console.log(`  ${b.label.padEnd(24)} ${bar} ${b.points}/${b.weight}`);
  }
  console.log(`\n  TOTAL: ${res.total}/100  (grade ${res.grade})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
