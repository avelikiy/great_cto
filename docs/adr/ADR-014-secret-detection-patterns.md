# ADR-014 — Secret detection patterns

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** great_cto core
**Related:** ADR-013 (Hook execution model)

## Context

The `secret-scan.mjs` PreToolUse hook (Edit | Write | MultiEdit) must decide whether content being written contains a hardcoded secret. We must choose:

- **Which patterns to detect** (vendor tokens, generic high-entropy strings, both?)
- **What action on detection** (warn vs block)
- **How to handle false positives** (test fixtures, examples, intentional)

A hook that blocks too aggressively destroys trust and gets disabled. A hook that misses real secrets is useless.

## Decision

### What we detect — explicit allowlist of high-confidence patterns

We detect **only vendor-specific token formats** with low false-positive rates. We do **not** detect generic "high-entropy strings" — that approach (Yelp's detect-secrets, TruffleHog's "high-entropy" scanner) has too many false positives in real code (UUIDs, hashes, base64-encoded test fixtures).

Catalogue (severity = `block` unless noted):

| Pattern | Regex | Source |
|---|---|---|
| AWS Access Key ID | `\bAKIA[0-9A-Z]{16}\b` | AWS docs — fixed prefix |
| AWS Secret Access Key | `(secret_access_key\|AWS_SECRET)[..."'\s:=]+[A-Za-z0-9/+=]{40}` | Contextual: assignment + 40-char base64 |
| GitHub PAT (classic) | `\bghp_[A-Za-z0-9]{36}\b` | GitHub docs — fixed prefix |
| GitHub PAT (fine-grained) | `\bgithub_pat_[A-Za-z0-9_]{82}\b` | GitHub docs |
| GitHub OAuth | `\bgho_[A-Za-z0-9]{36}\b` | GitHub docs |
| Stripe live | `\bsk_live_[A-Za-z0-9]{24,}\b` | Stripe docs |
| Stripe restricted | `\brk_live_[A-Za-z0-9]{24,}\b` | Stripe docs |
| OpenAI | `\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b` | OpenAI docs |
| Anthropic | `\bsk-ant-[A-Za-z0-9_-]{40,}\b` | Anthropic docs |
| Google API key | `\bAIza[0-9A-Za-z_-]{35}\b` | Google docs |
| Slack token | `\bxox[abprs]-[A-Za-z0-9-]{10,}\b` | Slack docs |
| Mailgun key | `\bkey-[a-zA-Z0-9]{32}\b` | Mailgun (severity: warn — has false positives with ssh keys) |
| PEM private key | `-----BEGIN (?:RSA\|EC\|OPENSSH\|DSA\|PGP) PRIVATE KEY-----` | Standard ASN.1 |
| JWT bearer | `\bey[JK][A-Za-z0-9_-]+\.ey...\....` | Severity: warn — JWTs are sometimes intentionally in test fixtures |

### Severity levels

- **`block`** (exit 2) — high-confidence vendor tokens. The hook blocks the tool call. The agent sees the error and must remediate.
- **`warn`** (exit 0 + stderr) — patterns with non-zero false-positive rates. We surface to the agent but don't block.

### What we don't detect

- **Generic high-entropy strings.** Too many false positives (UUIDs, content hashes, JWT signatures in tests, Base64 binaries inlined for tests).
- **Database connection strings.** Vendor patterns vary too much; many include placeholder credentials in `.example` files which would be flagged.
- **Custom company tokens.** Out of scope — users define their own patterns via a future `~/.great_cto/secret-patterns.json` (not implemented yet).
- **Secrets at rest in already-tracked files.** This hook fires on **writes**, not on reads or scans. Use `git-secrets` or `gitleaks` for repo-wide scans.

### Allowlist (skip scanning)

Files matching any of these path patterns are skipped:

```
/tests?/
/fixtures/
/__fixtures__/
/__mocks__/
\.test\.[a-z]+$
\.spec\.[a-z]+$
\.example$
\.sample$
\.template$
EXAMPLES?\.md$
CHANGELOG\.md$
```

Rationale: these paths legitimately contain example/test secrets. The blast radius of a real secret accidentally in `tests/` is low — git pre-commit hooks (separate concern) catch those. The cost of false positives blocking legitimate test work is high.

### Per-file opt-out

Adding `# great_cto:allow-secrets` (or `// great_cto:allow-secrets`) to the file content disables the scan for that write. Useful for:
- Cryptographic libraries with embedded test vectors
- Documentation showing real (revoked) tokens for tutorial purposes
- Migration scripts handling existing repo secrets

### Per-session opt-out

`GREAT_CTO_DISABLE_SECRET_SCAN=1` disables for the entire shell session. Use sparingly — defeats the purpose.

## Consequences

### Positive

- **High signal-to-noise.** Vendor-prefixed patterns have well-documented formats with negligible false-positive rates.
- **Self-explanatory remediation.** Error message tells the agent exactly which vendor leaked.
- **Test-fixture-friendly.** Allowlist + opt-out comments handle the common "but I need this in a test" case without breaking the security posture.

### Negative

- **Misses generic secrets.** A custom database password assigned via `DB_PASSWORD = "P@ssw0rd!"` won't be caught. Acceptable — the alternative (entropy-based detection) creates more friction than it prevents.
- **Pattern catalog requires maintenance.** As new vendors emerge, we must update the regex list. Mitigation: contributing guide, schedule quarterly review.
- **No deeper context analysis.** We don't do AST-level checks (e.g. "this string is being passed to an HTTP request, not a test"). Future work: optional advanced mode.

### Risks

- **A new vendor format leaks before we add the pattern.** Mitigation: fast iteration on `secret-scan.mjs`, monthly cadence to add new high-confidence patterns.
- **Allowlist directories are too broad.** Someone might commit a real secret in `tests/` thinking it's a fixture. Mitigation: separate repo-wide scan in CI catches these (out of scope for this hook).

## Migration / rollout

1. **v1.1.0** — patterns above shipped; `block` for vendor tokens, `warn` for JWT/Mailgun.
2. **v1.2.0** — telemetry: count blocks/warns/allowlists in `.great_cto/secret-scan-stats.log` for false-positive analysis.
3. **v1.3.0+** — based on telemetry data: tune pattern regexes, expand allowlist heuristics.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Use `detect-secrets` (Yelp) as a Python subprocess | Adds Python dependency; entropy-based scanner has too many false positives; cold-start time too slow for a hook |
| Use `gitleaks` binary | Adds binary dependency; primarily designed for repo scans, not write-time detection |
| Custom AST-aware analyzer | Massive complexity; fragile across languages; not justified for the value gained |
| Rely on git pre-commit hooks only | Misses secrets between writes and commits; doesn't help during active editing |

## References

- ADR-013 — Hook execution model
- [GitHub: Token formats](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Stripe: API key formats](https://stripe.com/docs/keys)
- [TruffleHog detectors](https://github.com/trufflesecurity/trufflehog/tree/main/pkg/detectors)
- [Yelp detect-secrets](https://github.com/Yelp/detect-secrets)
