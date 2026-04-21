---
description: "SLO burn rate — multi-window alerting that catches budget exhaustion before it happens. Uses .great_cto/slo-burn-history.log written by /digest."
argument-hint: "[service] — optional, filters to one service. Examples: /burn | /burn api"
user-invocable: true
allowed-tools: Read, Bash, Grep
model: haiku
---

You are the Burn-Rate aggregator. Compute SLO budget burn rate across multiple windows from `.great_cto/slo-burn-history.log` (snapshot per `/digest` run). Alert on bad trends *before* the budget is exhausted.

Multi-window pattern from Google SRE: a single point-in-time read can't tell you if you're burning fast or slow. By comparing snapshots over different windows, fast burns surface immediately, slow burns surface within a day, and projected exhaustion gives you actionable runway.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
HISTORY=.great_cto/slo-burn-history.log
CACHE=.great_cto/slo-budget-current.md
FILTER="${1:-}"

if [ ! -f "$HISTORY" ]; then
  echo "No burn history yet — run /digest at least once to seed the snapshot log."
  echo "(Burn rate needs at least 2 snapshots to compute a derivative.)"
  exit 0
fi

LINES=$(grep -cv "^[[:space:]]*#" "$HISTORY" 2>/dev/null || echo 0)
if [ "$LINES" -lt 2 ]; then
  echo "Only 1 snapshot in burn history — need at least 2. Run /digest again tomorrow."
  exit 0
fi
```

## Compute burn rates per service+SLI

```bash
python3 - "$HISTORY" "$FILTER" <<'PY'
import sys, datetime, collections, re

path, flt = sys.argv[1], sys.argv[2]

# Read snapshots → per (service, sli) list of (ts_epoch, used_min, budget_min, pct)
series = collections.defaultdict(list)
with open(path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'): continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 6: continue
        ts_iso, svc, sli, used_s, budget_s, pct_s = parts[:6]
        if flt and svc != flt: continue
        try:
            ts = datetime.datetime.fromisoformat(ts_iso.replace('Z', '+00:00')).timestamp()
            used = float(used_s); budget = float(budget_s); pct = int(pct_s)
        except Exception:
            continue
        series[(svc, sli)].append((ts, used, budget, pct))

if not series:
    msg = f"No snapshots match '{flt}'." if flt else "No parseable snapshots."
    print(msg); sys.exit(0)

now = datetime.datetime.utcnow().timestamp()

# Normal monthly burn = budget / 30 days = budget per second / (30*86400)
# Burn rate multiplier = (delta_used / delta_seconds) / (budget / (30*86400))
def find_snapshot_at_or_before(snaps, target_ts):
    """Return the latest snapshot <= target_ts (or earliest if none qualify)."""
    candidates = [s for s in snaps if s[0] <= target_ts]
    return candidates[-1] if candidates else snaps[0]

WINDOWS = [
    ("24h",  86400,    14.4, "🔴 page"),
    ("7d",   604800,   6.0,  "⚠ ticket"),
    ("30d",  2592000,  1.0,  "ℹ review"),
]

print("═══ SLO Burn Rate ═══")
print()
SERVICES = sorted(series.keys())
for (svc, sli) in SERVICES:
    snaps = sorted(series[(svc, sli)])
    latest = snaps[-1]
    ts_now, used_now, budget, pct = latest
    if budget <= 0:
        continue
    age_hours = (now - ts_now) / 3600.0
    print(f"{svc} / {sli}")
    print(f"  Budget: {used_now:.1f}min used / {budget:.1f}min total  ({pct}% consumed)")
    if age_hours > 36:
        print(f"  ⚠ latest snapshot is {age_hours:.0f}h old — run /digest to refresh")

    # Normal burn rate (per second) = budget consumed if you burn evenly across 30d
    normal_per_s = budget / (30 * 86400)

    fired = []
    for label, secs, threshold, action in WINDOWS:
        target = ts_now - secs
        prev = find_snapshot_at_or_before(snaps, target)
        delta_used = used_now - prev[1]
        delta_secs = ts_now - prev[0]
        if delta_secs <= 0:
            print(f"  {label}: insufficient history")
            continue
        actual_per_s = delta_used / delta_secs
        multiplier = actual_per_s / normal_per_s if normal_per_s > 0 else 0
        burned_pct = (delta_used / budget) * 100 if budget > 0 else 0
        marker = "🔴" if multiplier >= threshold else ("⚠ " if multiplier >= threshold/2 else "✓ ")
        print(f"  {label:>4}: {burned_pct:5.1f}% of budget  ({multiplier:5.2f}× normal)  {marker}")
        if multiplier >= threshold:
            fired.append((label, multiplier, action))

    # Projected exhaustion at current 7d rate (if positive burn)
    target_7d = ts_now - 604800
    prev_7d = find_snapshot_at_or_before(snaps, target_7d)
    delta_7d_used = used_now - prev_7d[1]
    delta_7d_secs = ts_now - prev_7d[0]
    remaining_min = budget - used_now
    if delta_7d_secs > 0 and delta_7d_used > 0 and remaining_min > 0:
        burn_per_day = delta_7d_used / (delta_7d_secs / 86400)
        days_left = remaining_min / burn_per_day
        print(f"  Projected exhaustion: {days_left:.1f} days at current 7d pace")
    elif remaining_min <= 0:
        print(f"  ⚠⚠ EXHAUSTED — freeze feature deploys, see references/reliability.md")
    else:
        print(f"  Projected exhaustion: ∞ (no burn in window)")

    if fired:
        worst = max(fired, key=lambda x: x[1])
        print(f"  → ALERT: {worst[2]} — {worst[0]} burn = {worst[1]:.1f}× normal")
    print()

print("─────────────────────────")
print("Thresholds (Google SRE multi-window): 24h ≥ 14.4× → page | 7d ≥ 6× → ticket | 30d ≥ 1× → review")
print("Snapshots are written by /digest. Increase digest frequency for finer-grained alerts.")
PY
```

## Reporting Contract

End with a single DONE/ALERT line:
- `DONE: burn check on N service/SLI pairs — no alerts fired.`
- `ALERT: <service>/<sli> burning <X>× normal (<window>) — projected exhaustion in <D> days.`
