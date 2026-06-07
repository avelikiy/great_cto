---
description: "Managed-IT / MSP compliance review. Invokes msp-reviewer to assess autonomous patching, configuration, remediation, and access provisioning across client fleets for change management, staged rollout / blast-radius control, JIT least-privilege + PAM, SOC 2, multi-tenant isolation — and force a human change-approval gate."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/msp-review** command — the managed-IT / MSP compliance entrypoint.

## Step 1 — Locate ARCH + detect MSP surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

MSP_HITS=$(grep -ciE "\bmsp\b|managed it|managed service provider|\brmm\b|remote monitoring|endpoint management|patch management|fleet|client environment|jit access|privileged access|\bpam\b|break-glass|soc 2|change management|remediation|provisioning" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "msp-surface signal hits: ${MSP_HITS}"
[ "${MSP_HITS:-0}" -eq 0 ] && echo "No MSP signals found — is this a managed-IT product? Proceeding to invoke msp-reviewer anyway (explicit /msp-review)."
```

## Step 2 — Invoke msp-reviewer

Invoke the **msp-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Map every autonomous action on a client system (patch / config / privileged / destructive / provisioning).
2. Require change management (pre-change backup + tested rollback + record) and staged rollout with health gates.
3. Check JIT least-privilege + PAM (no standing admin, break-glass + session recording), multi-tenant isolation, and SOC 2 mapping.
4. Set the blast-radius autonomy threshold + `gate:change-approval` for fleet-wide / privileged / destructive changes.
5. Write `docs/sec-threats/TM-msp-${SLUG}.md` (from `skills/great_cto/templates/TM-msp.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), whether any standing privileged access must
be removed, the blast-radius autonomy ceiling, Critical/High findings, and whether
`gate:change-approval` was created. Point the CTO at the TM doc. Do not restate the whole threat model.
