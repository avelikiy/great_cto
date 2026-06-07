---
description: "OPERATE an autopilot: start a run, see the inbox of cases awaiting a licensed-human signature, approve/reject as that human, inspect a run. This is the runtime side of GreatCTO — the AI does the volume to the human gate, then (only after a named person signs) executes the irreversible action. Durable + multi-tenant; the CLI and the admin board share one store."
argument-hint: "start <vertical> [--live] [--tenant X] | inbox [--tenant X] | runs [--status S] | show <runId> | approve <runId> --by \"<name>\" | reject <runId> --by \"<name>\""
user-invocable: true
allowed-tools: Read, Bash
model: haiku
---
<!-- great_cto-managed -->

You are the great_cto **/autopilot** command — the **Operate** side of the product.

> Build vs Operate: `/start` + `/<vertical>-review` **build** an autopilot (the gated pipeline).
> `/autopilot` **operates** one — runs a vertical's flow to its human checkpoint, holds the case in
> an inbox for the licensed human (coder · BSA officer · broker · CPA · QPPV …), and executes the
> irreversible action *only after* they sign. Inspect a flow first with `/flow <vertical>`.

## Dispatch

```bash
PD=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); [ -d "$PD/scripts" ] || PD=.
# Shared store with the admin board (~/.great_cto/autopilot-runs); override with GREAT_CTO_RUNS_DIR.
eval "node \"$PD/scripts/autopilot.mjs\" ${ARGUMENTS:-inbox}"
```

## Subcommands

- `/autopilot start <vertical> [--live] [--tenant X]` — run the flow to the first human gate; the
  case enters the inbox `awaiting-approval`. `--live` exercises the real connectors.
- `/autopilot inbox [--tenant X]` — the cases awaiting a signature (default action).
- `/autopilot runs [--status awaiting-approval|completed|rejected]` — all runs, newest first.
- `/autopilot show <runId>` — the full step trace + connector results + gate status.
- `/autopilot approve <runId> --by "<name>"` — sign the gate; the run resumes and the irreversible
  action fires (multi-gate flows pause again at the next signature).
- `/autopilot reject <runId> --by "<name>"` — end the run; nothing irreversible runs.

## Notes

- The same runs appear in the **admin board** Autopilot console (`great-cto board` → Autopilot) — the
  CLI and the board are one queue, so a human can work from either.
- Every irreversible step is gated (the v2.43 safety invariant): the write executes **only** because
  a named human approved its checkpoint. The reject path submits nothing.
