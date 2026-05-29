#!/usr/bin/env node
/**
 * PreToolUse hook for Edit | Write | MultiEdit.
 *
 * Scans content being written for hardcoded secrets and blocks the tool call
 * if a high-confidence pattern is found.
 *
 * Hook protocol (Claude Code):
 *   stdin:  { tool_name, file_path, content?, new_string?, edits? }
 *   stdout: silent on success; on block, a PreToolUse hookSpecificOutput
 *           JSON with permissionDecision="deny" + permissionDecisionReason
 *   exit:   0 = allow, 2 = block. Exit 2 is kept as a fail-safe alongside the
 *           structured deny so the write is blocked even on a Claude Code build
 *           that does not parse permissionDecision.
 *
 * Patterns are intentionally conservative — false positives are far worse than
 * the rare miss, since false positives block legitimate work.
 *
 * Opt-out:  set GREAT_CTO_DISABLE_SECRET_SCAN=1 in your env, or add the line
 *           "# great_cto:allow-secrets" to the file you're editing.
 *
 * @see docs/HOOKS.md
 * @see docs/architecture/ADR-014-secret-detection-patterns.md
 */

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATS_LOG = join(homedir(), '.great_cto', 'secret-scan-stats.jsonl');

/**
 * Append one event line so the board's Security tab can show counters.
 * Best-effort — never throws, never blocks the hook decision.
 */
function logEvent(kind, filePath, findings) {
  try {
    mkdirSync(join(homedir(), '.great_cto'), { recursive: true });
    appendFileSync(STATS_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      kind,                                  // 'block' | 'warn'
      file: redactPath(filePath),
      rule: findings[0]?.name || 'unknown',
      detected: [...new Set(findings.map((f) => f.name))],
    }) + '\n');
  } catch { /* ignore */ }
}

function redactPath(p) {
  if (!p) return null;
  // Strip $HOME so we don't leak the username into the stats log
  const home = homedir();
  return p.startsWith(home) ? p.replace(home, '~') : p;
}

// --- Pattern catalogue --------------------------------------------------------

/**
 * Each pattern is { name, regex, severity }.
 * Severity: 'block' = exit 2, 'warn' = exit 0 with stderr message.
 *
 * Patterns vetted against:
 *   - https://github.com/Yelp/detect-secrets/blob/master/detect_secrets/plugins
 *   - https://github.com/trufflesecurity/trufflehog/tree/main/pkg/detectors
 */
const PATTERNS = [
  // High-confidence vendor tokens (block immediately)
  { name: 'AWS Access Key ID',     regex: /\bAKIA[0-9A-Z]{16}\b/,                   severity: 'block' },
  { name: 'AWS Secret Access Key', regex: /\b(?:secret_access_key|AWS_SECRET)["'\s:=]+[A-Za-z0-9/+=]{40}\b/i, severity: 'block' },
  { name: 'GitHub PAT (classic)',  regex: /\bghp_[A-Za-z0-9]{36}\b/,                severity: 'block' },
  { name: 'GitHub fine-grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,      severity: 'block' },
  { name: 'GitHub OAuth',          regex: /\bgho_[A-Za-z0-9]{36}\b/,                severity: 'block' },
  { name: 'Stripe live key',       regex: /\bsk_live_[A-Za-z0-9]{24,}\b/,           severity: 'block' },
  { name: 'Stripe restricted',     regex: /\brk_live_[A-Za-z0-9]{24,}\b/,           severity: 'block' },
  { name: 'OpenAI API key',        regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,    severity: 'block' },
  { name: 'Anthropic API key',     regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/,          severity: 'block' },
  { name: 'Google API key',        regex: /\bAIza[0-9A-Za-z_-]{35}\b/,              severity: 'block' },
  { name: 'Slack token',           regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,       severity: 'block' },
  { name: 'Mailgun key',           regex: /\bkey-[a-zA-Z0-9]{32}\b/,                severity: 'warn'  },
  { name: 'PEM private key',       regex: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/, severity: 'block' },
  { name: 'JWT bearer',            regex: /\bey[JK][A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, severity: 'warn' },
];

// --- Allow-list ---------------------------------------------------------------

/**
 * Skip scanning for these paths — they legitimately contain test fixtures
 * or example values.
 */
const PATH_DENYLIST = [
  /\/tests?\//,
  /\/__fixtures__\//,
  /\/fixtures\//,
  /\/__mocks__\//,
  /\.test\.(?:[mc]?[jt]sx?|py|go|rs)$/,
  /\.spec\.(?:[mc]?[jt]sx?|py|go|rs)$/,
  /\.example$/,
  /\.sample$/,
  /\.template$/,
  /\bEXAMPLES?\.md$/,
  /CHANGELOG\.md$/,
];

// --- Main --------------------------------------------------------------------

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractPayload(input) {
  // Returns { filePath, contents: [content,...] }
  let parsed;
  try { parsed = JSON.parse(input); } catch { return { filePath: '', contents: [] }; }

  const filePath = parsed.tool_input?.file_path || parsed.file_path || '';
  const contents = [];

  // Write
  if (parsed.tool_input?.content) contents.push(parsed.tool_input.content);
  if (parsed.content) contents.push(parsed.content);

  // Edit (single)
  if (parsed.tool_input?.new_string) contents.push(parsed.tool_input.new_string);
  if (parsed.new_string) contents.push(parsed.new_string);

  // MultiEdit
  const edits = parsed.tool_input?.edits || parsed.edits || [];
  for (const e of edits) {
    if (e.new_string) contents.push(e.new_string);
  }

  return { filePath, contents };
}

function isAllowlisted(filePath) {
  if (!filePath) return false;
  return PATH_DENYLIST.some((re) => re.test(filePath));
}

function isOptedOut(filePath, content) {
  if (process.env.GREAT_CTO_DISABLE_SECRET_SCAN === '1') return true;
  if (content && content.includes('# great_cto:allow-secrets')) return true;
  if (content && content.includes('// great_cto:allow-secrets')) return true;
  return false;
}

function scan(content) {
  const findings = [];
  for (const { name, regex, severity } of PATTERNS) {
    if (regex.test(content)) findings.push({ name, severity });
  }
  return findings;
}

function main() {
  const raw = readStdin();
  if (!raw) return process.exit(0);   // No input — be permissive.

  const { filePath, contents } = extractPayload(raw);
  if (contents.length === 0) return process.exit(0);

  if (isAllowlisted(filePath)) return process.exit(0);

  const allFindings = [];
  for (const c of contents) {
    if (isOptedOut(filePath, c)) return process.exit(0);
    allFindings.push(...scan(c));
  }

  if (allFindings.length === 0) return process.exit(0);

  const blockers = allFindings.filter((f) => f.severity === 'block');
  const warns = allFindings.filter((f) => f.severity === 'warn');

  if (blockers.length > 0) {
    const names = [...new Set(blockers.map((f) => f.name))].join(', ');
    logEvent('block', filePath, blockers);
    const reason =
      `detected ${names} in ${filePath || '(unknown)'}. ` +
      `Move the secret to an env var or a gitignored .env file, or opt out with ` +
      `GREAT_CTO_DISABLE_SECRET_SCAN=1 or a "# great_cto:allow-secrets" comment.`;
    // Structured decision (Claude Code ≥ 2.1 PreToolUse hookSpecificOutput):
    // surfaces `reason` to the model/user in a structured way. We ALSO exit 2
    // below — a deliberate fail-safe so the write is blocked even on a Claude
    // Code build that ignores permissionDecision. Both signals say "deny", so
    // they can never disagree.
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `great_cto secret-scan blocked the write — ${reason}`,
      },
    }) + '\n');
    process.stderr.write(`[great_cto:secret-scan] BLOCKED — ${reason}\n`);
    return process.exit(2);
  }

  if (warns.length > 0) {
    const names = [...new Set(warns.map((f) => f.name))].join(', ');
    logEvent('warn', filePath, warns);
    process.stderr.write(
      `[great_cto:secret-scan] WARN — possible: ${names} in ${filePath}\n`
    );
  }

  return process.exit(0);
}

main();
