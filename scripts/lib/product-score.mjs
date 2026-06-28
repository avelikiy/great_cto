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

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
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
 * Pure: weighted score from per-dimension signals (each 0..1; missing → 0).
 * @returns {{total:number, grade:string, breakdown:Array<{key,label,weight,signal,points}>}}
 */
export function scoreProduct(signals = {}) {
  const breakdown = RUBRIC.map(d => {
    const signal = clamp01(Number(signals[d.key]) || 0);
    return { key: d.key, label: d.label, weight: d.weight, signal: round2(signal), points: round2(signal * d.weight) };
  });
  const total = Math.round(breakdown.reduce((a, b) => a + b.points, 0));
  return { total, grade: grade(total), breakdown };
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

/** Inspect a product dir → signals (each 0..1). Heuristic: presence + shape. */
export function inspect(dir) {
  const files = walk(dir);
  const codeRe = /\.(ts|tsx|js|jsx|mjs|py|go|rs)$/;
  const code = files.filter(f => codeRe.test(f));

  // completeness: data model + API + UI (⅓ each)
  const hasModel = anyMatch(files, /(schema\.prisma|migrations?\/|models?\/|schema\.(sql|ts))/i);
  const hasApi = anyMatch(files, /(\/api\/|routes?\/|controllers?\/|handlers?\/|server\.(ts|js|mjs))/i);
  const hasUi = anyMatch(files, /(\/(pages|components|app|views|ui)\/|\.(tsx|jsx|vue|svelte)$)/i);
  const completeness = (hasModel + hasApi + hasUi) / 3;

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

function main(argv) {
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error('Usage: product-score.mjs <product-dir> [--json]'); process.exit(2);
  }
  const signals = inspect(dir);
  const res = scoreProduct(signals);
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ dir, ...res, signals }, null, 2)); return; }

  console.log(`Product quality score — ${dir}`);
  for (const b of res.breakdown) {
    const bar = '█'.repeat(Math.round(b.signal * 10)).padEnd(10, '·');
    console.log(`  ${b.label.padEnd(24)} ${bar} ${b.points}/${b.weight}`);
  }
  console.log(`\n  TOTAL: ${res.total}/100  (grade ${res.grade})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
