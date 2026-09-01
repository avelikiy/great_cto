/**
 * The secret patterns, in one place.
 *
 * They lived inside scripts/hooks/secret-scan.mjs, which is a PreToolUse hook on
 * Edit | Write | MultiEdit. That guards what an agent writes with those tools and
 * nothing else — not a Bash redirect, not a hand edit, not another editor. A
 * token reached ~/.great_cto/preferences.md by one of those paths and was read
 * into the context of every session in every project, because a SessionStart hook
 * `cat`s that file unconditionally and the file's whole purpose is to be global.
 *
 * Neither half was broken. What was missing was a check BETWEEN them: nothing
 * asked whether a secret was already sitting in the file about to be poured into
 * context. Sharing the patterns is the first step to asking.
 *
 * @see scripts/lib/memory-secret-scan.mjs — the at-rest check
 * @see scripts/hooks/secret-scan.mjs      — the at-write check
 */

export const PATTERNS = [
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

/** Which patterns match this content. Never returns the matched value. */
export function scan(content) {
  const findings = [];
  for (const { name, regex, severity } of PATTERNS) {
    if (regex.test(content)) findings.push({ name, severity });
  }
  return findings;
}
