# Plan — great_cto's own state stays out of project history

Status: done · Started 2026-09-23

## What a project saw

A session in one project, about to push, listed what it would not touch: a dozen
modified or untracked files under `.great_cto/`, `shared/pipeline.toml`,
`shared/orchestrator.toml`, and `.great_cto/` directories inside `backend/` and
`backend/src/`. All written by this plugin. Across the 22 projects on the measuring
machine `.great_cto/` held some forty kinds of file; the project records among them
(PROJECT.md in 22, verdicts in 17, brain.md, FLOW.md, CODEBASE.md, lessons, decisions,
294 committed session logs) sat beside turn markers, event and cost logs, a per-session
copy of the plugin's SKILL.md, and session stubs — so the directory could not simply be
ignored, and nothing ignored the parts that should be.

## What changed

| # | Item |
|---|---|
| 1 | `scripts/lib/state-gitignore.mjs` — SessionStart writes `.great_cto/.gitignore` with a managed block of machine-local patterns; the project's own lines and root `.gitignore` are untouched. Pinned with `git check-ignore`: state is ignored; PROJECT.md, verdicts, brain.md, lessons.md, decisions.md, FLOW.md and a `/save` log are not. |
| 2 | SessionStart no longer copies `shared/*.toml` into projects. `scripts/lib/contract-path.mjs`: hooks read the plugin's contract; a project file counts only when marked `great_cto: project override` — an unmarked file is a leftover copy, and honouring it would freeze that project on whatever version last copied it. |
| 3 | Every hook command starts in the project root — the nearest directory with `.great_cto/PROJECT.md` — so state stops appearing in subdirectories. The walk is inline POSIX sh, no subprocess. |

Found on the way: `pipeline-dispatcher` still referenced the removed constant for the
old local copy — every dispatch would have thrown. The hook tests caught it.

## Not done here

Files already committed stay tracked until untracked (`git rm --cached`). That touches
each project's history, so it is offered per project, with the list, not done silently.
