#!/usr/bin/env node
/**
 * deploy-preflight — refuse a deploy whose required secrets are not actually set.
 *
 * Why this exists
 * ---------------
 * devops printed `Required env vars from .great_cto/PROJECT.md stack: …` and
 * then carried on. It ANNOUNCED the requirement and never checked it, which is
 * the same shape as every other defect this repo keeps finding: a step that runs
 * every time and cannot fail.
 *
 * The eval caught it doing exactly that — attempting a staging deploy with
 * DATABASE_URL, API_KEY and REDIS_URL missing. A deploy is user-reachable and
 * expensive to undo (ADR-009), and one that boots against an empty DATABASE_URL
 * either crashes on the first request or, worse, connects to whatever the
 * default is.
 *
 * Placeholders are treated as missing, deliberately. `API_KEY=CHANGEME` is not a
 * value; it is the absence of one wearing a value's clothes, and a check that
 * accepts it is a check that passes exactly when it matters.
 *
 * CLI:
 *   node scripts/lib/deploy-preflight.mjs                    # reads .great_cto/PROJECT.md
 *   node scripts/lib/deploy-preflight.mjs --require A,B,C    # explicit list
 *   node scripts/lib/deploy-preflight.mjs --json
 *   exit 0 = every required variable is set   ·   exit 1 = refuse to deploy
 */

/** Values that are syntactically present and semantically absent. */
const PLACEHOLDER = /^(changeme|change_me|todo|tbd|xxx+|placeholder|your[-_].+|example|dummy|fixme|none|null|undefined|<.*>|\.\.\.)$/i;

/**
 * Required variable names declared in PROJECT.md.
 *
 * Two forms are recognised, because both are in the wild: an `## Env` section
 * listing names, and `env:`/`required-env:` frontmatter-style keys.
 */
export function requiredVars(projectMd) {
  const text = String(projectMd ?? '');
  const names = new Set();

  // NOT multiline. With `m`, `$` matches an end of LINE, so the lazy capture
  // stops at the first newline and only the first variable is ever found — the
  // same mistake this repo already made in lessons-write.mjs this morning.
  const section = text.match(/(?:^|\n)##[ \t]*Env\b[^\n]*\n([\s\S]*?)(?=\n##[ \t]|$)/i);
  if (section) {
    for (const m of section[1].matchAll(/(^|[\s`|-])([A-Z][A-Z0-9_]{2,})\b/gm)) names.add(m[2]);
  }
  for (const m of text.matchAll(/^(?:required[-_])?env:\s*(.+)$/gim)) {
    for (const n of m[1].split(/[,\s]+/)) if (/^[A-Z][A-Z0-9_]{2,}$/.test(n)) names.add(n);
  }

  // Words that appear in an Env section as prose, not as variable names.
  for (const noise of ['ENV', 'NOTE', 'TODO', 'URL', 'API', 'KEY']) names.delete(noise);
  return [...names];
}

/**
 * Check the required variables against an environment.
 *
 * @returns {{ok: boolean, missing: string[], placeholder: Array<{name, value}>, present: string[]}}
 */
export function checkEnv(required, env = process.env) {
  const missing = [];
  const placeholder = [];
  const present = [];
  for (const name of required) {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === '') { missing.push(name); continue; }
    if (PLACEHOLDER.test(String(raw).trim())) {
      // The value is never echoed — a preflight that prints secrets to a deploy
      // log has created the leak it was guarding against. Only the fact.
      placeholder.push({ name, value: '<placeholder>' });
      continue;
    }
    present.push(name);
  }
  return { ok: missing.length === 0 && placeholder.length === 0, missing, placeholder, present };
}

/** The message a human reads when the deploy is refused. */
export function explain(result, { target = 'the target environment' } = {}) {
  if (result.ok) return `preflight: ${result.present.length} required variable(s) set`;
  const lines = [`preflight: REFUSING to deploy to ${target}`];
  if (result.missing.length) lines.push(`  not set:      ${result.missing.join(', ')}`);
  if (result.placeholder.length) {
    lines.push(`  placeholder:  ${result.placeholder.map((p) => p.name).join(', ')}`);
    lines.push('                a placeholder is the absence of a value wearing a value\'s clothes');
  }
  lines.push('');
  lines.push('  Set them in the deploy environment and run again. Deploying without them');
  lines.push('  does not fail loudly — it boots against whatever the default turns out to be.');
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const ri = argv.indexOf('--require');
  const ti = argv.indexOf('--target');
  const target = ti >= 0 ? argv[ti + 1] : (process.env.DEPLOY_TARGET || 'the target environment');

  let required;
  if (ri >= 0 && argv[ri + 1]) {
    required = argv[ri + 1].split(/[,\s]+/).filter(Boolean);
  } else {
    const pm = join(process.env.GREAT_CTO_DIR || '.great_cto', 'PROJECT.md');
    if (!existsSync(pm)) {
      // No declaration is not the same as nothing required. Say so rather than
      // reporting a pass nobody established.
      console.error('preflight: no .great_cto/PROJECT.md and no --require — nothing was checked');
      return 2;
    }
    required = requiredVars(readFileSync(pm, 'utf8'));
  }

  if (!required.length) {
    console.error('preflight: no required variables declared — add an `## Env` section to PROJECT.md');
    return 2;
  }

  const result = checkEnv(required);
  if (argv.includes('--json')) console.log(JSON.stringify({ target, required, ...result }, null, 2));
  else console.log(explain(result, { target }));
  return result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
