---
description: "Security umbrella: posture metrics, threat model, SBOM, incident workflow. Subcommands: status (default) | threat | sbom | incident | rotate."
argument-hint: "[subcommand] [args...] — default: status. Examples: /sec | /sec status 7 | /sec threat stripe-subscriptions | /sec sbom | /sec incident \"creds leaked\""
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
model: sonnet
---

You are the great_cto security umbrella. This is the single entry point for all security workflows — metrics, threat modeling, SBOM generation, incident response.

## Dispatcher

```bash
SUBCMD="${1:-status}"
shift 2>/dev/null || true  # remaining args are for subcommand
case "$SUBCMD" in
  status|threat|sbom|incident|rotate) ;;
  *)
    echo "Usage: /sec [subcommand] [args]"
    echo ""
    echo "  status [days]           — security posture metrics (default: 30d)"
    echo "  threat [arch-slug]      — STRIDE threat model for a feature"
    echo "  sbom [version]          — generate CycloneDX SBOM for release"
    echo "  incident \"<desc>\"       — security-incident workflow (DORA/GDPR)"
    echo "  rotate                  — show overdue secret rotations"
    echo ""
    echo "Unknown subcommand: $SUBCMD"
    exit 2 ;;
esac
```

**Routing:**
- `status` (or no args) → continue below (Steps 1-8 of metrics).
- `threat` → read `skills/great_cto/playbooks/threat-model.md` and follow its instructions end-to-end. Pass the remaining args ($1 = arch-slug).
- `sbom` → read `skills/great_cto/playbooks/sbom.md` and follow it. $1 = version (optional).
- `incident` → read `skills/great_cto/playbooks/security-incident.md` and follow it. $1 = description.
- `rotate` → jump directly to Step 5 below (secret rotation only), skip other metrics.

**For `threat`, `sbom`, `incident`**: the playbook files are the old `/threat-model`, `/sbom`, `/security-incident` commands — same content, now accessed via `/sec <sub>`. Read the file, then execute exactly as if it were the top-level command.

---

## status subcommand — Security metrics aggregator

Compute the five security-posture metrics from artefacts produced by `security-officer`, `architect`, `devops`, and `/audit`. No external scanners, no new telemetry — only what already lives in the repo.

See `skills/great_cto/references/sec-metrics.md` for formula definitions and data-source documentation.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
# After `shift` above, $1 is now the first arg after the subcommand
PERIOD=${1:-30}
case "$PERIOD" in
  ''|*[!0-9]*) echo "Usage: /sec status [period_days]  (got: $PERIOD)"; exit 2 ;;
esac
NOW_EPOCH=$(date +%s)
WINDOW_START=$(( NOW_EPOCH - PERIOD * 86400 ))
SEC_BASELINE=.great_cto/sec-baseline.log
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' || echo "web-service")
```

## Step 0 — Current security tier

Reference: `skills/great_cto/references/security-tiers.md`. Compute effective tier from archetype + signals emitted by `senior-dev`.

```bash
case "$ARCHETYPE" in
  web3|iot-embedded|regulated)                   TIER_DEFAULT=deep ;;
  ai-system|commerce|infra)                      TIER_DEFAULT=standard ;;
  web-service|mobile-app|data-platform|library)  TIER_DEFAULT=baseline ;;
  *)                                             TIER_DEFAULT=baseline ;;
esac
TIER_OVERRIDE=$(grep "^default-tier:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
TIER_EFFECTIVE="${TIER_OVERRIDE:-$TIER_DEFAULT}"

SIGNAL_LOG=.great_cto/security-signals.log
SIGNALS_FIRED=""
if [ -f "$SIGNAL_LOG" ]; then
  for S in pci-dep-introduced crypto-dep-introduced auth-path-changed pii-field-added iac-perimeter-changed high-cve-in-dep external-ingest-added; do
    if grep -q "SECURITY_SIGNAL: $S " "$SIGNAL_LOG"; then
      SIGNALS_FIRED="$SIGNALS_FIRED $S"
      case "$TIER_EFFECTIVE" in baseline) TIER_EFFECTIVE=standard ;; esac
    fi
  done
fi

echo ""
echo "─ Current tier: $TIER_EFFECTIVE  (archetype=$ARCHETYPE default=$TIER_DEFAULT${TIER_OVERRIDE:+ override=$TIER_OVERRIDE})"
if [ -n "$SIGNALS_FIRED" ]; then
  echo "  Signals upgrading tier:"
  for S in $SIGNALS_FIRED; do echo "    · $S"; done
fi
echo ""
```

## Helper: ISO8601 → epoch

```bash
iso_to_epoch() {
  python3 -c "import sys,datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$1" 2>/dev/null || echo 0
}
```

## Step 1 — CVE MTTR

Source: `docs/cve-log.md` — lines in format `YYYY-MM-DD | CVE-YYYY-NNNNN | severity | status | resolved:YYYY-MM-DD | note`.

```bash
CVE_LOG=docs/cve-log.md
CVE_MTTR_DAYS="-"
CVE_OPEN_CRITICAL=0
CVE_OPEN_OVERDUE_14D=0
if [ -f "$CVE_LOG" ]; then
  python3 - "$CVE_LOG" "$NOW_EPOCH" "$WINDOW_START" <<'PY'
import sys, datetime, statistics
path, now, window_start = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
durations = []
open_critical = 0
open_overdue = 0
with open(path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"): continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 4: continue
        try:
            advisory = int(datetime.datetime.fromisoformat(parts[0]).timestamp())
        except Exception:
            continue
        severity = parts[2].lower() if len(parts) > 2 else ""
        status = parts[3].lower() if len(parts) > 3 else ""
        resolved_ts = None
        for p in parts[4:]:
            if p.startswith("resolved:"):
                try:
                    resolved_ts = int(datetime.datetime.fromisoformat(p.split(":",1)[1]).timestamp())
                except Exception: pass
        if status == "open":
            if severity == "critical":
                open_critical += 1
            if (now - advisory) / 86400 > 14:
                open_overdue += 1
        elif resolved_ts and advisory >= window_start - 90*86400:
            # include resolved CVEs in a 90-day median window even if PERIOD is smaller
            durations.append((resolved_ts - advisory) / 86400.0)
print("MTTR:", round(statistics.median(durations), 1) if durations else "-")
print("OPEN_CRIT:", open_critical)
print("OPEN_OVERDUE:", open_overdue)
PY
fi
# Parse outputs — agent: capture MTTR / OPEN_CRIT / OPEN_OVERDUE into shell vars when running.
```

If `docs/cve-log.md` does not exist, report `-` and emit a hint: run `/audit` to populate (or wait for the next `security-officer` review where CVEs are logged).

## Step 2 — Dependency freshness

Source: latest `docs/releases/SBOM-*.json`. Freshness = % of components whose `version` release was ≤ 180 days ago on the upstream registry. Because we don't want to call npm/PyPI on every `/sec` run, we cache per-package release timestamps in `.great_cto/dep-freshness-cache.jsonl` (one line per `purl | release_date | checked_at`); re-fetch if `checked_at` > 7 days old.

```bash
LATEST_SBOM=$(ls -t docs/releases/SBOM-*.json 2>/dev/null | head -1)
FRESHNESS_PCT="-"
if [ -n "$LATEST_SBOM" ]; then
  # For each component with a purl, look up release timestamp (cached).
  # Mark fresh if age ≤ 180d. Compute pct fresh / total.
  # For v1.0.96 we ship the SHELL of this; the network-fetch implementation is
  # intentionally skipped here — it runs in the SBOM enrichment step in CI,
  # not per-command.
  if [ -f .great_cto/dep-freshness-cache.jsonl ]; then
    FRESHNESS_PCT=$(python3 - "$LATEST_SBOM" .great_cto/dep-freshness-cache.jsonl "$NOW_EPOCH" <<'PY'
import json, sys, datetime
sbom_path, cache_path, now = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    sbom = json.load(open(sbom_path))
except Exception:
    print("-"); sys.exit(0)
cache = {}
for line in open(cache_path):
    try:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 2:
            cache[parts[0]] = int(datetime.datetime.fromisoformat(parts[1]).timestamp())
    except Exception: continue
total = fresh = 0
for c in sbom.get("components", []):
    purl = c.get("purl")
    if not purl or purl not in cache: continue
    total += 1
    if (now - cache[purl]) / 86400 <= 180: fresh += 1
print(round(fresh/total*100, 1) if total else "-")
PY
)
  fi
fi
```

If no SBOM or no cache, report `-` with hint: run `/sbom` + populate `.great_cto/dep-freshness-cache.jsonl`. The cache population script is deliberately not included here — it needs network access and should live in CI, not in a local command.

## Step 3 — Threat-model coverage

Source: `docs/architecture/ARCH-*.md` mtime in window vs `docs/threat-models/TM-*.md` existence.

```bash
TM_TOTAL=0
TM_WITH_MODEL=0
for ARCH in docs/architecture/ARCH-*.md; do
  [ -f "$ARCH" ] || continue
  MT=$(stat -f %m "$ARCH" 2>/dev/null || stat -c %Y "$ARCH" 2>/dev/null || echo 0)
  [ "$MT" -lt "$WINDOW_START" ] && continue
  TM_TOTAL=$((TM_TOTAL+1))
  SLUG=$(basename "$ARCH" .md | sed 's/^ARCH-//')
  TM_FILE="docs/threat-models/TM-${SLUG}.md"
  HAS_SECURITY=$(grep -c "^## Security" "$ARCH" 2>/dev/null || echo 0)
  if [ -f "$TM_FILE" ] && [ "$HAS_SECURITY" -gt 0 ]; then
    TM_WITH_MODEL=$((TM_WITH_MODEL+1))
  fi
done
if [ "$TM_TOTAL" -gt 0 ]; then
  TM_COVERAGE=$(python3 -c "print(round(${TM_WITH_MODEL}/${TM_TOTAL}*100,1))")
else
  TM_COVERAGE="-"
fi
```

## Step 4 — Pentest burn-down

Source: `docs/security/PENTEST-*.md` — finding tables. Each finding has `severity`, `status` (open/closed/accepted), `opened`, `closed` columns. Compute weighted burn-down: `closed_this_window_weighted / (open + closed_this_window_weighted)` with weights `critical=8, high=4, medium=2, low=1`.

```bash
PENTEST_DIR=docs/security
PENTEST_BURN="-"
PENTEST_OPEN_CRIT=0
if ls "$PENTEST_DIR"/PENTEST-*.md >/dev/null 2>&1; then
  python3 - "$PENTEST_DIR" "$WINDOW_START" <<'PY'
import os, sys, re, glob
pdir, window_start = sys.argv[1], int(sys.argv[2])
weights = {"critical": 8, "high": 4, "medium": 2, "low": 1}
open_w = closed_w = open_critical = 0
for f in glob.glob(os.path.join(pdir, "PENTEST-*.md")):
    for line in open(f):
        m = re.match(r"\|\s*F-\d+\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|", line)
        if not m: continue
        sev, status = m.group(1).lower(), m.group(2).lower()
        w = weights.get(sev, 0)
        if status == "open":
            open_w += w
            if sev == "critical": open_critical += 1
        elif status in ("closed", "fixed"):
            closed_w += w
total = open_w + closed_w
print("BURN:", round(closed_w/total*100, 1) if total else "-")
print("OPEN_CRIT:", open_critical)
PY
fi
```

## Step 5 — Secret rotation overdue

Source: `.great_cto/secrets.md` — append-only register with format `name | owner | rotation_due:YYYY-MM-DD | last_rotated:YYYY-MM-DD`.

```bash
SECRETS=.great_cto/secrets.md
ROTATION_OVERDUE=0
if [ -f "$SECRETS" ]; then
  ROTATION_OVERDUE=$(python3 - "$SECRETS" "$NOW_EPOCH" <<'PY'
import sys, datetime
path, now = sys.argv[1], int(sys.argv[2])
overdue = 0
for line in open(path):
    line = line.strip()
    if not line or line.startswith("#"): continue
    for p in line.split("|"):
        p = p.strip()
        if p.startswith("rotation_due:"):
            try:
                due = int(datetime.datetime.fromisoformat(p.split(":",1)[1]).timestamp())
                if due < now: overdue += 1
            except Exception: pass
print(overdue)
PY
)
fi
```

If no `secrets.md`, emit advisory: "No secret register — create `.great_cto/secrets.md` with one line per secret (name | owner | rotation_due:YYYY-MM-DD | last_rotated:YYYY-MM-DD) to track rotation."

## Step 6 — Output

```bash
echo "═══ Security metrics — last ${PERIOD} days ═══"
echo ""
printf "  %-28s %s days     %s\n"  "CVE MTTR (90d median):"    "${CVE_MTTR_DAYS:-\-}"     "$([ "$CVE_OPEN_CRITICAL" -gt 0 ] && echo "⚠ ${CVE_OPEN_CRITICAL} critical open")"
[ "$CVE_OPEN_OVERDUE_14D" -gt 0 ] && printf "  %-28s %s CVEs open > 14d\n" "" "$CVE_OPEN_OVERDUE_14D"
printf "  %-28s %s%%\n"             "Dependency freshness:"     "${FRESHNESS_PCT:-\-}"
printf "  %-28s %s%%  (%s/%s features)\n" "Threat-model coverage:" "${TM_COVERAGE}" "${TM_WITH_MODEL}" "${TM_TOTAL}"
printf "  %-28s %s%%     %s\n"      "Pentest burn-down:"        "${PENTEST_BURN}"          "$([ "${PENTEST_OPEN_CRIT:-0}" -gt 0 ] && echo "⚠ ${PENTEST_OPEN_CRIT} critical open")"
printf "  %-28s %s\n"               "Secret rotation overdue:"  "${ROTATION_OVERDUE}"
echo ""

# Per-archetype expectation nudge
case "$ARCHETYPE" in
  ai-system|commerce|web3|iot-embedded|regulated|fintech)
    if [ "$TM_COVERAGE" != "-" ] && python3 -c "exit(0 if $TM_COVERAGE < 90 else 1)" 2>/dev/null; then
      echo "  ⚠ Archetype=$ARCHETYPE requires ≥90% threat-model coverage — currently $TM_COVERAGE%"
    fi
    ;;
esac
```

## Step 7 — Gaming guards

```bash
# Guard 1: finding reopen rate > 10% in 90d
# (needs PENTEST reopen timestamps — if absent, skip silently)
# Guard 2: top-10 deps stale but median fresh → selective updates
# (requires dep import-count; skip silently unless CODEBASE.md has the data)
echo ""
echo "(Gaming guards are advisory — see skills/great_cto/references/sec-metrics.md.)"
```

## Step 8 — Append baseline

```bash
[ ! -f "$SEC_BASELINE" ] && printf '# date | period | cve_mttr_days | open_crit | open_overdue_14d | freshness_pct | tm_coverage_pct | pentest_burn_pct | rotation_overdue\n' > "$SEC_BASELINE"
printf '%s | %s | %s | %s | %s | %s | %s | %s | %s\n' \
  "$(date +%Y-%m-%d)" "$PERIOD" \
  "${CVE_MTTR_DAYS:-\-}" "${CVE_OPEN_CRITICAL:-0}" "${CVE_OPEN_OVERDUE_14D:-0}" \
  "${FRESHNESS_PCT:-\-}" "${TM_COVERAGE:-\-}" "${PENTEST_BURN:-\-}" "${ROTATION_OVERDUE:-0}" \
  >> "$SEC_BASELINE"
```

## Reporting Contract

End with one DONE line:

- `DONE: /sec snapshot for ${PERIOD}d — CVE-MTTR=${CVE_MTTR_DAYS}d, Fresh=${FRESHNESS_PCT}%, TM=${TM_COVERAGE}%, Pentest=${PENTEST_BURN}%, RotOverdue=${ROTATION_OVERDUE}. baseline appended.`
