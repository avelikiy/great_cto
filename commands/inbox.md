---
description: "What needs your attention? Shows open gates, recent activity, blocked items, and pending decisions."
argument-hint: "[optional: hours — default 24]"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the great_cto **Inbox** command. Show the CTO everything that needs
attention right now. Keep the response **under 30 lines**.

## Step 1 — Run helper, write to file (no inline expansion)

```bash
HOURS="${1:-24}"
PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}
HELPER="${PLUGIN_DIR}/scripts/cmd-data/inbox-data.sh"
[ -f "$HELPER" ] || HELPER="$(pwd)/scripts/cmd-data/inbox-data.sh"

OUT_DIR=".great_cto/cache"; mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/inbox-out.txt"
HOURS="$HOURS" bash "$HELPER" > "$OUT" 2>&1
SIZE=$(wc -c < "$OUT" 2>/dev/null || echo 0)
LINES=$(wc -l < "$OUT" 2>/dev/null || echo 0)
echo "INBOX_READY hours=$HOURS out=$OUT size=${SIZE}B lines=${LINES}"
```

**Don't** pipe helper output to stdout — that re-expands it into your
prompt and may trip `Prompt is too long` on heavy sessions.

## Step 2 — Read the file

Use the `Read` tool on the `out=` path, default first 200 lines.
Every line of output sits under a `## NAME` heading, and a section is printed only
when it has something in it (blank line between sections). In the order they appear:

| Section | What is in it |
|---|---|
| `## ARCHETYPE_CONFIDENCE` | detection confidence below high, with alternatives |
| `## POC` | `POC_ACTIVE:` / `POC_URGENT:` / `POC_EXPIRED:` |
| `## OPEN_GATES` | open gate beads |
| `## P0_OPEN` | open P0 tasks |
| `## BLOCKED` | blocked tasks |
| `## STALE_GATES` | `STALE:<id> age:<h>h` — gates open more than 24h |
| `## GATE_WAIT` | always present: oldest open gate, how long closed gates waited (listed, not summarised, under five), or `not measured` when beads could not be read — which is not the same as no gates |
| `## RECENT_ACTIVITY` | commits in the last 24h |
| `## BACKLOG` | `bd stats`, ready tasks |
| `## RECENT_DOCS` | docs changed in the last day |
| `## OPEN_PRS` | open pull requests |
| `## PRODUCTION_OPEN` | open `production`-labelled tasks |
| `## RFC_OVERDUE` | RFCs past their review deadline |
| `## ON_CALL` | current on-call, or `oncall: not configured` |
| `## RECENT_DECISIONS` | last three decision-log entries |
| `## HEALTH` | P2 count, perf baseline tail, retro slow-downs, latest audit |
| `## RISKS` | active high-impact risks |
| `## DEPRECATIONS` | deprecation calendar, active |
| `## SLO_BUDGET` | SLO rows at WARN or EXHAUSTED |
| `## WAIVERS` | `waivers_active=` / `expired_unresolved=` |
| `## SLO_BURN` | `BURN_ALERT:` |
| `## DORA_CFR` | `DORA_TRIGGER:` / `REWORK_TRIGGER:` |
| `## GATE_DRIFT` | `GATE_DRIFT:` — a gate passing more than before |
| `## COST_ALERT` | `COST_ALERT:` / `COST_MOVER:` |
| `## SECURITY` | `SEC_CVE_ALERT:` / `SEC_ROTATION:` / `SEC_TM_GAP:` |
| `## AI_HEALTH` | ai-system / agent-product signals |
| `## HYGIENE` | `HYGIENE_…` backlog hygiene |

The line prefixes inside a section are unchanged. Until 2026-09-14 the helper
printed none of these headings — every block ran into the next — so an older
cached copy of the plugin may still produce unlabelled output.

## Step 2b — Strict-mode governance (signed exceptions)

Surface the audited gate-bypass trail so nothing expires silently. Active exceptions are
sanctioned overrides; expired/revoked ones are debt to remediate.

```bash
PD=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}; [ -z "$PD" ] && PD=.
node "$PD/scripts/lib/exceptions.mjs" list 2>/dev/null || node scripts/lib/exceptions.mjs list 2>/dev/null || true
```

Render any `✗` (expired/revoked/tampered) exceptions as **⚠️ High** ("signed exception
EXC-… expired — remediate the work it covered or re-sign"). Active ones expiring within 7
days → **🔔 Medium**. If a release is imminent, also run `gate-check.mjs gate:ship` and show
any blocking tasks. See `/exception`.

## Step 3 — Render

Priority-sorted list, one emoji prefix per row:

| Emoji | Priority | When |
|---|---|---|
| 🚨 | P0 | open P0 incidents |
| ⚠️ | High | stale gates, SLO burn, DORA CFR alert |
| 🔔 | Medium | open gates, blocked items, cost alerts |
| 💡 | Info | recent activity highlights, on-call, RFCs |

Each row: `<emoji> <one-line summary> · <bd id or link>`

End with: `Run /digest for the full weekly view.`

## Step 4 — Empty state

If no sections fired, output exactly:

```
✓ Inbox clear. No open gates, no P0, no SLO burn, no cost alerts.
  Last activity: <timestamp from helper, or "—" if none>
```

## Notes

- Silent sections are normal — don't render headings for empty sections.
- Don't dump raw bash output — the helper already pre-filters.
- If helper file is `size=0` or contains `MISSING_HELPER` / `no bd`:
  output `Inbox unavailable: run /start to bootstrap great_cto in this repo.`
