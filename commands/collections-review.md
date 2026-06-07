---
description: "Debt-collection / AR-management compliance audit. Invokes collections-reviewer to assess autonomous delinquent-account outreach, negotiation, payment plans, and recovery for FDCPA prohibited practices + validation notices + cease-communication, CFPB Reg F call-frequency (7-in-7) + time/place + e-comms opt-out, FCRA furnisher + dispute investigation, TCPA prior consent, UDAAP, state collection-agency licensing — and force a collections-manager / licensed-attorney sign-off on legal escalation, settlement, and disputed-debt validation."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/collections-review** command — the debt-collection / AR-management entrypoint.

## Step 1 — Locate ARCH + detect collections surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

COL_HITS=$(grep -ciE "debt collection|\bcollections\b|accounts receivable|\bar management\b|delinquent|recovery|dunning|fdcpa|reg ?f|regulation f|validation notice|cease communication|7-?in-?7|tcpa|autodial|fcra|furnisher|credit report|dispute|settlement|payment plan|collection agency license|udaap" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "collections-surface signal hits: ${COL_HITS}"
[ "${COL_HITS:-0}" -eq 0 ] && echo "No collections signals found — is this a debt-collection product? Proceeding to invoke collections-reviewer anyway (explicit /collections-review)."
```

## Step 2 — Invoke collections-reviewer

Invoke the **collections-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require a per-number/per-channel TCPA consent check before every automated contact.
2. Enforce Reg F 7-in-7 call-frequency + 7-day post-conversation rule + 8am–9pm local-time window.
3. Verify FDCPA validation notice (5-day), dispute-pause-until-verified, and cease-communication hard-stop.
4. Check per-channel e-comms opt-out, no third-party disclosure, FCRA furnisher dispute handling, UDAAP framing, and state licensing.
5. Set the legal-escalation / settlement / disputed-debt moves that escalate to a collections manager / attorney (`gate:collections-signoff`).
6. Write `docs/sec-threats/TM-collections-${SLUG}.md` (from `skills/great_cto/templates/TM-collections.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # legal-escalation paths needing a
manager/attorney, Critical/High findings, and whether `gate:collections-signoff` was created. Point
the CTO at the TM doc. Do not restate the whole threat model.
