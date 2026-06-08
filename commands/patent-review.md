---
description: "Patent-prosecution audit. Invokes patent-reviewer to assess autonomous prior-art search, patentability analysis (101/102/103/112), inventorship, and USPTO filing for the patent-bar / unauthorized-practice limit (37 CFR 11), the duty of candor & good faith / IDS (37 CFR 1.56) and inequitable conduct, statutory bars (on-sale/public-use, grace period), priority/benefit deadlines, foreign-filing license (35 USC 184) and ITAR/EAR adjacency — and force a USPTO-registered-practitioner sign-off."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto **/patent-review** command — the patent-prosecution entrypoint.

## Step 1 — Locate ARCH + detect patent surface

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED: no ARCH-${SLUG}.md — run architect first." && exit 1

PAT_HITS=$(grep -ciE "patent|patent prosecution|uspto|patent bar|registered practitioner|patent agent|prior art|novelty|obviousness|\b102\b|\b103\b|\b112\b|inventorship|duty of candor|\bids\b|information disclosure statement|inequitable conduct|on-sale bar|public use|grace period|priority claim|foreign filing license|35 usc 184|provisional|non-provisional|office action|claims|specification|itar|\bear\b|eccn" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
echo "patent-surface signal hits: ${PAT_HITS}"
[ "${PAT_HITS:-0}" -eq 0 ] && echo "No patent signals found — is this a patent-prosecution / USPTO-filing product? Proceeding to invoke patent-reviewer anyway (explicit /patent-review)."
```

## Step 2 — Invoke patent-reviewer

Invoke the **patent-reviewer** subagent against `ARCH-${SLUG}.md`. It will:
1. Require an evidence trace for every autonomously-produced prosecution output — patentability, inventorship, material-art basis (the candor / patentability defence).
2. Check patentability against current prior art (101/102/103/112), the duty of candor / IDS (37 CFR 1.56), and statutory bars (on-sale / public-use + grace period).
3. Verify priority/benefit deadline docketing (119/120), the foreign-filing license (35 USC 184), and ITAR/EAR export-control recognition.
4. Set the high-risk patterns that escalate every USPTO filing to a USPTO-registered patent practitioner (`gate:patent-attorney-signoff`).
5. Write `docs/sec-threats/TM-patent-${SLUG}.md` (from `skills/great_cto/templates/TM-patent.md`) with a
   `<!-- HANDOFF -->` verdict.

## Step 3 — Report

Summarise in ≤5 lines: verdict (signed-off | blocked), # prosecution-high-risk paths needing a practitioner,
Critical/High findings, and whether `gate:patent-attorney-signoff` was created. Point the CTO at the TM
doc. Do not restate the whole threat model.
