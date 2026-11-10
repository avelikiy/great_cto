# Task brief — before the first edit (canonical)

Operators approve with one word ("делай", "да"); the proposal they approve is the task
statement. Measured over 60 days: 3% of requests said how the work counts as done, 0 of 965
approvals were of a proposal that did, and 83 times the operator found the result broken.

Write this before the first edit, sized to the task — Tiny: `Done when` alone; Small: Target,
Done when, Assumed; Medium and up: all of it, and `/spec` for Large.

```
Target      repo · branch · the part of it · what is not mine to touch
Goal        one sentence, in the operator's words where possible
Done when   the check I run myself on the artefact the user gets
            (E2E on the build that ships, the row in the DB, the served revision)
Gates       what must be green first (CI on this commit and main, no skip flags)
Invariants  project rules this touches (UI language, numbers users see, recipients)
Assumed     [A1] … every guess, so a wrong one costs one word to fix
Ask         ≤3, each with my recommended answer; only what the repo cannot answer,
            what changes scope, or what is expensive to undo
Not doing   out of scope
```

**A bug report is reproduced first.** Add `Repro:` — the command or steps that show it
failing, run before the fix. Done is that repro passing on the environment the operator
used, not on a local run.

**Read before asking.** A question the code answers is a question you should not ask.

If you were dispatched with a brief that has no `Done when`, write one and open your report
with it; if you cannot name a check you can run yourself, say so as the first line of the
report instead of calling the work done.
