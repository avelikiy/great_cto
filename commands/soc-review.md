---
description: "Managed-SOC / MDR security-operations audit. Invokes soc-mdr-reviewer to assess autonomous alert triage → enrich/correlate → investigate → recommend/stage response (detection → response) for both error directions (false-positive isolation = self-inflicted outage, false-negative close = breach) — covering containment sign-off, chain-of-custody (preserve-then-contain), least-privilege response creds, auto-halt/rollback, SEC Item 1.05 8-K materiality clock, and SOC2/FedRAMP/PCI/HIPAA scoping — and force a certified-analyst / incident-responder sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/soc-review** command — the managed-SOC / MDR security-operations entrypoint.

## Step 1 — Locate ARCH + detect SOC/MDR surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

SOC_HITS=$(grep -ciE "managed soc|\bmdr\b|\bsoc\b|alert triage|detection|\bsiem\b|\bedr\b|host isolation|containment|incident response|\bir\b|account disable|ip/domain block|credential revocation|breach notification|sec 8-?k|item 1\.05|chain of custody|threat hunting|security operations" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "soc-surface signal hits: ${SOC_HITS}"
[ "${SOC_HITS:-0}" -eq 0 ] && echo "No SOC/MDR signals found — is this a managed-SOC / MDR product? Proceeding to invoke soc-mdr-reviewer anyway (explicit /soc-review)."
```

## Step 2 — Invoke soc-mdr-reviewer

Invoke the **soc-mdr-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Classify both error directions per autonomous decision — confidence gates BOTH the auto-close (false-negative → breach) and auto-contain (false-positive → self-inflicted outage) paths.
2. Verify every containment/isolation/notification path routes through `gate:ir-containment-signoff` with the analyst of record in the audit trail.
3. Check least-privilege response creds (scoped/short-lived/brokered/per-action logged) + auto-halt/rollback on anomaly, and preserve-then-contain chain-of-custody.
4. Confirm the SEC Item 1.05 4-business-day materiality clock is surfaced to a human (never started/stopped autonomously) and response respects FedRAMP/PCI/HIPAA scoped boundaries (SOC 2 baseline).
5. Write `docs/sec-threats/TM-soc-${SLUG}.md` (from `skills/great_cto/templates/TM-soc.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # high-blast-radius paths needing an analyst,
Critical/High findings, and whether `gate:ir-containment-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
