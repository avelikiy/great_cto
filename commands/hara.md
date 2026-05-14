---
description: "Robotics safety / HARA review. Invokes robotics-safety-reviewer to produce TM-robot with ISO 10218 / ISO TS 15066 / ISO 13482 / IEC 61508 / ISO 26262 applicability, SIL/PL declaration, e-stop architecture, SROS2 + sim-to-real validation."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/hara** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

R_HITS=$(grep -ciE "robot|cobot|manipulator|end.effector|amr |agv |autonomous|surgical robot|ros2|ros 2|moveit|drone|uav" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$R_HITS" -eq 0 ] && echo "No robotics signals — skipping." && exit 0
```

## Step 2 — Invoke robotics-safety-reviewer

`subagent_type: robotics-safety-reviewer` — write `docs/sec-threats/TM-robot-${SLUG}.md` using `skills/great_cto/templates/TM-robot.md`.

## Step 3 — Surface

Print: category, declared SIL/PL, e-stop latency budget, SROS2 status, sim-to-real summary, gates (`gate:hara-signoff`, `gate:functional-safety-test`).
