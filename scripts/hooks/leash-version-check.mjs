#!/usr/bin/env node
/**
 * SessionStart hook: check if llm-leash repo has new commits on origin/main.
 *
 *   1. Read installed SHA via `git -C ~/.great_cto/llm-leash rev-parse HEAD`
 *   2. Read cached "last-known latest SHA" from ~/.great_cto/leash-version.json
 *      (TTL 24 h — don't hit GitHub on every session)
 *   3. If TTL expired, fetch GitHub commits API
 *   4. If installed != latest, print a one-line nudge and append a verdict
 *      so /inbox surfaces a `leash.update_available` gate
 *
 * Never blocks the session. Times out fast (3 s).
 *
 * @see packages/cli/src/leash.ts — the install/update implementation
 * @see scripts/hooks/auto-attach-reviewers.mjs — sibling pattern
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const INSTALL_ROOT = path.join(os.homedir(), '.great_cto', 'llm-leash');
const CACHE = path.join(os.homedir(), '.great_cto', 'leash-version.json');
const VERDICTS_DIR = path.join(process.cwd(), '.great_cto', 'verdicts');
const TTL_HOURS = 24;
const GH_API = 'https://api.github.com/repos/avelikiy/llm-leash/commits/main';

async function main() {
  if (!fs.existsSync(INSTALL_ROOT)) return; // leash not installed — quiet exit

  const installed = installedSha();
  if (!installed) return;

  const cached = readCache();
  let latest = cached.latest_sha;
  const ageMs = Date.now() - new Date(cached.last_checked || 0).getTime();
  const stale = !latest || ageMs > TTL_HOURS * 3600 * 1000;

  if (stale) {
    latest = await fetchLatest();
    if (latest) writeCache({ installed_sha: installed, latest_sha: latest, last_checked: new Date().toISOString() });
  }

  if (!latest || latest === installed) return; // up-to-date or unknown

  // Print compact notice — won't drown the user
  process.stdout.write(`🔔 llm-leash update available (${installed} → ${latest}) — run \`great-cto leash update\`\n`);

  // Append verdict so /inbox surfaces a gate
  try {
    fs.mkdirSync(VERDICTS_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      agent: 'leash-version-check',
      verdict: 'INFO',
      message: `llm-leash update available: ${installed} → ${latest}`,
      action: 'great-cto leash update',
      gate: 'leash.update_available',
    }) + '\n';
    fs.appendFileSync(path.join(VERDICTS_DIR, 'leash-version-check.log'), line);
  } catch { /* best-effort */ }
}

function installedSha() {
  try {
    const r = spawnSync('git', ['-C', INSTALL_ROOT, 'rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    });
    if (r.status !== 0) return null;
    return r.stdout.toString().trim();
  } catch { return null; }
}

function readCache() {
  try {
    if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch { /* ignore */ }
  return {};
}

function writeCache(obj) {
  try { fs.writeFileSync(CACHE, JSON.stringify(obj, null, 2)); } catch { /* ignore */ }
}

async function fetchLatest() {
  try {
    const res = await fetch(GH_API, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'great-cto-leash' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.sha?.slice(0, 7) || null;
  } catch { return null; }
}

main().catch(() => { /* never throw */ });
