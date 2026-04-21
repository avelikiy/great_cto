---
description: "Quality gate health — pass rates, drift, time-to-verdict, and effectiveness per agent. Catches gates that have started rubber-stamping."
argument-hint: "[period_days] — default 30. Examples: /gates 7 | /gates 30 | /gates 90"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the Gate Health aggregator. Compute per-agent pass rate, drift, time-to-verdict, and effectiveness from `.great_cto/verdicts/*.log` and `docs/postmortems/PM-*.md`. Detect gates that have started rubber-stamping.

A gate that always passes is not a gate — it's theater. The only way to know whether a gate is real is to compare its verdicts against subsequent reality (incidents, PM verdict-audits). This command makes that comparison.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
PERIOD=${1:-30}
case "$PERIOD" in ''|*[!0-9]*) echo "Usage: /gates [period_days] (got: $PERIOD)"; exit 2 ;; esac
NOW_EPOCH=$(date +%s)
WINDOW_START=$(( NOW_EPOCH - PERIOD * 86400 ))
VERDICT_DIR=.great_cto/verdicts
PM_DIR=docs/postmortems

if [ ! -d "$VERDICT_DIR" ]; then
  echo "No verdicts logged yet — agents have not run on this project."
  exit 0
fi
```

## Compute per-agent gate health

```bash
python3 - "$VERDICT_DIR" "$PM_DIR" "$WINDOW_START" "$PERIOD" <<'PY'
import sys, os, re, datetime, glob, collections, statistics

verdict_dir, pm_dir, window_start, period = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
window_start_prev = window_start - period * 86400

# Two verdict formats accepted (both written by current agents):
#   1. per-agent file (e.g. qa-engineer.log):
#      "2026-04-21T09:00:00Z qa-engineer PASS coverage=85% ..."
#   2. per-day file (e.g. 2026-04-21.log) with pipe-delimited fields:
#      "2026-04-21T09:00:00Z | qa-engineer | PASS | artefacts=1 | ..."
PASS_TOKENS = {"PASS", "APPROVED", "ARCH_READY", "DEPLOYED", "DONE"}
FAIL_TOKENS = {"FAIL", "BLOCKED", "ROLLED_BACK", "ROLLBACK"}

verdicts = collections.defaultdict(list)  # agent → [(ts_epoch, status)]
for path in sorted(glob.glob(os.path.join(verdict_dir, "*.log"))):
    base = os.path.basename(path)
    is_per_agent = not re.match(r'^\d{4}-\d{2}-\d{2}\.log$', base)
    default_agent = base[:-4] if is_per_agent else None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            # Try pipe format first
            if '|' in line:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 3:
                    ts_s, agent, status = parts[0], parts[1], parts[2]
                else:
                    continue
            else:
                # Space-separated: TS AGENT STATUS rest
                bits = line.split(None, 3)
                if len(bits) < 3: continue
                ts_s, agent, status = bits[0], bits[1], bits[2]
                # In per-agent log the agent column may be missing — fall back.
                if default_agent and agent.upper() not in PASS_TOKENS | FAIL_TOKENS:
                    pass  # agent name present
                else:
                    if default_agent:
                        status, agent = agent, default_agent

            try:
                ts = datetime.datetime.fromisoformat(ts_s.replace('Z', '+00:00')).timestamp()
            except Exception:
                continue
            # Normalise status
            su = status.upper()
            if su in PASS_TOKENS: norm = "PASS"
            elif su in FAIL_TOKENS: norm = "FAIL"
            else: norm = "OTHER"
            verdicts[agent].append((ts, norm))

if not verdicts:
    print("No parseable verdict entries.")
    sys.exit(0)

# Parse PM Agent Verdict Audit tables — count per-agent "Correct? = no" hits.
# Look for rows like: | QA (qa-engineer) | PASS / FAIL | yes / no | ...
agent_misses = collections.defaultdict(int)   # agent → count of PMs where agent missed
agent_judged = collections.defaultdict(int)   # agent → count of PMs where agent was judged
total_pms_in_window = 0

if os.path.isdir(pm_dir):
    for pm in sorted(glob.glob(os.path.join(pm_dir, "PM-*.md"))):
        try:
            mt = os.path.getmtime(pm)
        except OSError: continue
        if mt < window_start: continue
        total_pms_in_window += 1
        with open(pm) as f:
            text = f.read()
        # Find "Agent Verdict Audit" table block
        m = re.search(r'Agent Verdict Audit(.+?)(?:\n## |\Z)', text, re.S)
        if not m: continue
        block = m.group(1)
        for row in block.splitlines():
            if not row.strip().startswith('|'): continue
            cells = [c.strip() for c in row.strip().strip('|').split('|')]
            if len(cells) < 3: continue
            label, _verdict, correct = cells[0], cells[1], cells[2]
            if not label or label.lower().startswith('agent') or label.startswith('-'): continue
            # Extract agent identifier — prefer parenthesised name, fall back to first word
            am = re.search(r'\(([\w-]+)\)', label)
            agent = am.group(1) if am else label.split()[0].lower()
            cl = correct.strip().lower()
            # Only count rows that gave a yes/no (skip placeholders or actual verdict rows)
            if cl.startswith('y') and 'yes' in cl:
                agent_judged[agent] += 1
            elif cl.startswith('n') and ('no' in cl):
                agent_judged[agent] += 1
                agent_misses[agent] += 1

def stats_for(agent, snaps):
    cur = [s for s in snaps if s[0] >= window_start]
    prev = [s for s in snaps if window_start_prev <= s[0] < window_start]
    def rate(items):
        rated = [s for s in items if s[1] in ("PASS", "FAIL")]
        if not rated: return None, 0
        passes = sum(1 for s in rated if s[1] == "PASS")
        return passes / len(rated) * 100, len(rated)
    cur_rate, cur_n = rate(cur)
    prev_rate, _ = rate(prev)
    drift = (cur_rate - prev_rate) if (cur_rate is not None and prev_rate is not None) else None
    judged = agent_judged.get(agent, 0)
    misses = agent_misses.get(agent, 0)
    eff = (1 - misses / judged) * 100 if judged > 0 else None
    return cur_rate, cur_n, drift, eff, judged, misses

print(f"═══ Gate Health — last {period} days ═══")
print()
print(f"  {'Agent':<22}{'PASS%':>9}{'Drift':>10}{'N':>6}  {'Effectiveness':>14}  Marker")
print(f"  {'-'*22}{'-'*9}{'-'*10}{'-'*6}  {'-'*14}  ------")

CRITICAL_DRIFT = 10  # +10pp drift while CFR also up = signal
red_flags = []

for agent in sorted(verdicts.keys()):
    cur_rate, cur_n, drift, eff, judged, misses = stats_for(agent, verdicts[agent])
    if cur_rate is None:
        print(f"  {agent:<22}{'no data':>9}")
        continue
    drift_s = f"{drift:+.0f}pp" if drift is not None else "—"
    eff_s = f"{eff:.0f}%" if eff is not None else "n/a"
    marker = "✓"
    # Healthy gate: 10-30% FAIL = 70-90% pass. Outside this, flag.
    if cur_rate > 95: marker = "⚠ rubber-stamping?"
    elif cur_rate < 50: marker = "⚠ noisy"
    if drift is not None and drift >= CRITICAL_DRIFT and cur_rate > 85:
        marker = "🔴 drift up while pass already high"
        red_flags.append((agent, drift, cur_rate))
    if eff is not None and eff < 70:
        marker = "🔴 missed too many incidents"
        red_flags.append((agent, "eff", eff))
    print(f"  {agent:<22}{cur_rate:>8.0f}%{drift_s:>10}{cur_n:>6}  {eff_s:>14}  {marker}")

print()
if total_pms_in_window > 0:
    print(f"  ({total_pms_in_window} postmortem(s) in window contributed to Effectiveness scoring)")
else:
    print(f"  (No postmortems in window — Effectiveness shown as 'n/a'. Gate health limited to pass-rate + drift.)")

if red_flags:
    print()
    print("─────────────────────────")
    print("Action items:")
    for rf in red_flags:
        if rf[1] == "eff":
            print(f"  → {rf[0]}: effectiveness {rf[2]:.0f}% — review the agent's checklist; recent PMs show it missing real bugs")
        else:
            print(f"  → {rf[0]}: pass-rate drift +{rf[1]:.0f}pp while at {rf[2]:.0f}% pass — likely rubber-stamping. Compare to CFR trend in /dora.")

print()
print("Healthy gate window: PASS rate 70-90%. > 95% suggests rubber-stamping;")
print("< 50% suggests gate is too strict or noisy. Drift > 10pp upward + high")
print("absolute pass rate is the strongest 'gate has stopped working' signal.")
PY
```

## Reporting Contract

End with one DONE line:
- `DONE: gate health for ${PERIOD}d — N agents checked, M flagged.`
