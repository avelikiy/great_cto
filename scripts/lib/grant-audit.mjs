// scripts/lib/grant-audit.mjs — audit grants & credentials (DEEPEN / AgentSpace #2).
//
// Inspired by AgentSpace's permission control plane ("missing grants, revoked
// credentials, orphaned grants, unavailable providers"). great_cto form: one place
// that answers "do I actually have the credentials this project needs, and are any
// configured-but-broken (orphaned)?" — surfaced in /doctor.
//
// Pure core (classifyGrants) is unit-tested with injected inputs; the CLI gathers
// the live inputs (env, secrets files, npm whoami, gh auth) and prints the table.
//
// Usage:
//   node scripts/lib/grant-audit.mjs            # human table
//   node scripts/lib/grant-audit.mjs --json     # machine-readable
// Exit 0 always (advisory); /doctor surfaces the findings.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Pure classification. `i` = gathered inputs (all optional).
 * @param {{openrouterKey?:boolean, anthropicKey?:boolean, npmUser?:string|null,
 *          ghUser?:string|null, providerConfigured?:string|null}} i
 * @returns {Array<{grant,status,severity,detail}>}  status: ok|missing|orphan
 */
export function classifyGrants(i = {}) {
  const out = [];

  // LLM provider credential — at least one must exist or the pipeline can't run.
  if (i.openrouterKey) out.push({ grant: 'llm: OpenRouter', status: 'ok', severity: 'info', detail: 'OPENROUTER_API_KEY present' });
  else if (i.anthropicKey) out.push({ grant: 'llm: Anthropic', status: 'ok', severity: 'info', detail: 'ANTHROPIC_API_KEY present (fallback)' });
  else out.push({ grant: 'llm provider key', status: 'missing', severity: 'critical', detail: 'no OPENROUTER_API_KEY or ANTHROPIC_API_KEY — evals/agents that call the LLM cannot run' });

  // Orphan: PROJECT.md names a provider but its key is absent.
  if (i.providerConfigured === 'openrouter' && !i.openrouterKey)
    out.push({ grant: 'orphan: openrouter configured', status: 'orphan', severity: 'high', detail: 'PROJECT.md routes to OpenRouter but OPENROUTER_API_KEY is missing' });
  if (i.providerConfigured === 'anthropic' && !i.anthropicKey)
    out.push({ grant: 'orphan: anthropic configured', status: 'orphan', severity: 'high', detail: 'PROJECT.md routes to Anthropic but ANTHROPIC_API_KEY is missing' });

  // npm — needed for local publish (cd-local --publish).
  if (i.npmUser) out.push({ grant: 'npm auth', status: 'ok', severity: 'info', detail: `logged in as ${i.npmUser}` });
  else out.push({ grant: 'npm auth', status: 'missing', severity: 'med', detail: 'not logged in (npm login) — local publish via cd-local --publish will refuse' });

  // GitHub — needed for PRs / pushing releases.
  if (i.ghUser) out.push({ grant: 'github auth', status: 'ok', severity: 'info', detail: `gh active account: ${i.ghUser}` });
  else out.push({ grant: 'github auth', status: 'missing', severity: 'med', detail: 'gh not authenticated — PRs / release pushes need it' });

  return out;
}

export function summarize(rows) {
  return {
    ok: rows.filter(r => r.status === 'ok').length,
    missing: rows.filter(r => r.status === 'missing').length,
    orphan: rows.filter(r => r.status === 'orphan').length,
    critical: rows.filter(r => r.severity === 'critical').length,
  };
}

// ── CLI: gather live inputs, classify, print ──────────────────────────────────

function envOrFile(name) {
  if (process.env[name]) return true;
  for (const p of [join(homedir(), '.great_cto', 'secrets.env'), '.env.local']) {
    try { if (new RegExp(`^${name}=`, 'm').test(readFileSync(p, 'utf8'))) return true; } catch { /* ignore */ }
  }
  return false;
}

function tryCmd(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString().trim() || null; } catch { return null; }
}

function readProvider() {
  try {
    const t = readFileSync('.great_cto/PROJECT.md', 'utf8');
    if (/openrouter/i.test(t)) return 'openrouter';
    if (/anthropic/i.test(t)) return 'anthropic';
  } catch { /* ignore */ }
  return null;
}

function main(argv) {
  const inputs = {
    openrouterKey: envOrFile('OPENROUTER_API_KEY'),
    anthropicKey: envOrFile('ANTHROPIC_API_KEY'),
    npmUser: tryCmd('npm whoami'),
    ghUser: (tryCmd('gh auth status --active 2>&1 | grep -oE "account [A-Za-z0-9-]+" | head -1') || '').replace('account ', '') || null,
    providerConfigured: readProvider(),
  };
  const rows = classifyGrants(inputs);
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ rows, summary: summarize(rows) }, null, 2)); return; }

  console.log('Grant & credential audit');
  for (const r of rows) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'orphan' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.grant.padEnd(28)} ${r.status.padEnd(8)} ${r.detail}`);
  }
  const s = summarize(rows);
  console.log(`\n  ${s.ok} ok · ${s.missing} missing · ${s.orphan} orphan${s.critical ? `  (⛔ ${s.critical} critical)` : ''}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
