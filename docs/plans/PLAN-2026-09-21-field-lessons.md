# Plan — what 28 projects taught the pipeline

Status: in progress · Epic: `great_cto-aocg` · Started 2026-09-21

## Where this comes from

A read of every project registered on the measuring machine (28): verdict logs in 16,
~90 human-written session logs, 5,126 operator messages and 1,013 agent dispatches in
Claude Code's session logs, 29.06–21.09. Five projects carry 95% of the messages; the
findings are about them. Project names stay out of this file.

| Finding | Evidence |
|---|---|
| The learning loop never ran | `lessons.md` empty in all 28 projects; `~/.great_cto/decisions.md` holds only seed data. SessionEnd spawns `claude --agent continuous-learner` with no prompt and no `-p`; reproduced: the CLI exits 1 (`Input must be provided…`) and the hook has already written `ran` to `.last-auto-learn`. It is also enabled only by an env var the desktop app's sessions do not see. |
| The operator is the approval loop | 1,181 of 5,126 messages are "делай / исправляй / да" — after the agent found a bug and asked whether to fix it, or proposed a step inside an agreed plan. 27 more are "do it yourself, you have access". |
| "Done" is declared on the agent's word | 178 "still broken", 11 "you did not deploy", 17 "shipped without tests" (`E2E_SKIP=1`); four projects had green checks over a broken product (`/health` green while trading stopped 6 h; `cargo check` green, tests not compiling). |
| gate:ship passes over open findings | security-officer APPROVED with an open P1/High in 8 projects; a healthcare-reviewer BLOCKED was never cleared and the task it blocked was closed an hour later; QA verdict absent in 11 of 16 projects with verdicts; great_cto's own last QA verdict predates its last ship by three weeks. |
| Agents run out of turns | 69 dispatches ended at the turn cap: senior-dev 17% of its runs (cap 50), code-reviewer 21% (40), db-migration-reviewer 4 of 10 (20), devops 2 of 3 (25). |

## Items

| # | Item |
|---|---|
| F1 | **The learner runs.** SessionEnd starts a detached runner that calls `claude -p <prompt> --agent continuous-learner` with a budget cap, and records what happened: `done` with the lessons added, `failed` with the exit code and first error line, `skipped` with why. Enabled by `GREAT_CTO_AUTO_LEARN=1` **or** `"auto_learn": true` in `~/.great_cto/config.json` (a file the desktop app's sessions read; an env var in a shell rc they do not). Still off by default — each run is a paid call. |
| F2 | **gate:ship refuses over an open finding.** The latest verdict of any agent that is BLOCKED / FAIL / REJECTED / REWORK blocks, unless a signed exception names `reviewer:<agent>`. qa-engineer and security-officer must each have a positive latest verdict, and QA's must be newer than the last commit that changed code. Agent names are normalised (`great-cto:x`, `great_cto:x`, `qa`, `security`). |
| F3 | **Reversible steps inside the task are taken, not offered.** One rule, in the session banner every great_cto project gets and in senior-dev: fixing a defect you found inside the task, continuing an approved plan, re-running a check — do it and report. Stop for what is expensive to undo (ADR-009): deploy to users, money, deleting data, sending outside the machine, changing scope. |
| F4 | **"Done" carries the evidence of the artifact the user gets.** verify-by-running gains the delivery clause: for anything that ships, the report names the revision/sha the user receives and a check run against it; a skip flag (`E2E_SKIP`, `SKIP_*`) or a health endpoint alone is not that evidence. |
| F5 | **Turn caps fit the work measured.** senior-dev 50→80, code-reviewer 40→60, db-migration-reviewer 20→40, devops 25→40. |

## Not in this plan (next)

Skill descriptions that never trigger (35 of 41 skills never invoked by the model);
deploy-landed / secrets-rotation / signing-preflight skills; verdict-format
normalisation at write time; project-registry hygiene; l3-support bound to declared
capabilities.
