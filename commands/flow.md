---
description: "Show a vertical autopilot's flow in business language — the steps, which agent + tools run each, and where a human signs off. The single source of truth for positioning (landing / README / onboarding all render from flows/<vertical>.flow.json). Add --connectors for the integration checklist."
argument-hint: "<vertical>  e.g. rcm | legaltech | procurement | accounting | msp | tax  [--connectors]"
user-invocable: true
allowed-tools: Read, Bash
model: haiku
---
<!-- great_cto-managed -->

You are the great_cto **/flow** command — it renders a vertical **autopilot flow** in business
language. A flow is what the autopilot *does* for the business (intake → process → decide →
deliver), composed of agents + connectors (tools), with a human on the judgment calls. This is the
positioning surface: packs / reviewers / gates are the under-the-hood trust layer, not the headline.

## Step 0 — Resolve the engine

```bash
PD=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); [ -z "$PD" ] && PD=.
[ -d "$PD/flows" ] || PD=.
```

## Step 1 — Dispatch

```bash
V="${ARGUMENTS%% *}"
if [ -z "$V" ]; then
  echo "Available autopilots:"
  for f in "$PD"/flows/*.flow.json; do
    node -e "const d=require('$f'); console.log('  •', d.vertical.padEnd(12), d.autopilot, '—', d.tagline)" 2>/dev/null
  done
  echo ""
  echo "Usage: /flow <vertical> [--connectors]"
  exit 0
fi

FLOW="$PD/flows/${V}.flow.json"
[ -f "$FLOW" ] || { echo "No flow for '$V'. Try: rcm | legaltech | procurement | accounting | msp | tax"; exit 1; }

if echo "$ARGUMENTS" | grep -q -- "--connectors"; then
  node -e "(async()=>{const m=await import('$PD/scripts/lib/flow.mjs');const fs=require('fs');console.log(m.renderConnectors(JSON.parse(fs.readFileSync('$FLOW'))))})()"
else
  node -e "(async()=>{const m=await import('$PD/scripts/lib/flow.mjs');const fs=require('fs');const f=JSON.parse(fs.readFileSync('$FLOW'));console.log(m.renderFlow(f))})()"
fi
```

## How to read it

- **🤖 steps** run autonomously (an agent + its connectors). **🧑‍⚖️ steps** are **human gates** — a
  named person signs off the judgment calls (the assistant↔autopilot boundary).
- **Connectors run live where wired** (`/flow <v> --connectors` shows which run live vs stub + the
  real provider). 22 connectors run on real data; the rest are sandbox stubs that flip to the real
  provider when you add credentials.
- **Under the hood** the vertical's compliance reviewer + signed gates + audit trail enforce safety.

`/flow` *inspects* a flow. To *operate* it — run it to the human gate and sign — use:

```
▶ run it:  /autopilot start <vertical>     # then  /autopilot inbox  →  /autopilot approve <runId> --by "<name>"
```

The flow file (`flows/<vertical>.flow.json`) is the single source of truth — the landing page,
README, `/start` onboarding, and the run engine all render from it, so the story stays consistent.
