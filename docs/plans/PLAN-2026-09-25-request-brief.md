# Plan — a short request becomes a task brief before any work starts

Status: B1–B3 shipped (f7f0d0ac); B4, B5 open · 2026-09-25

## Why (measured)

Sixty days of one operator's sessions across private projects: 6,180 operator messages,
146 task openers.

| | |
|---|---|
| Median opener, the operator's own first paragraph | 7 words |
| Messages of 1–3 words ("делай", "да", "продолжай") | 33% |
| Openers stating how the work counts as done, and who checks it | **3%** (5 of 146) |
| "It doesn't work" reports the operator found themself | 87 |
| Cost of one correction | median 2 turns / ~78 min; p90 ~18 h |

Correction rate within three turns, by the shape of the request:

| Request shape | n | Corrected |
|---|---|---|
| Repro brief (observed / expected / command to verify) | 7 | **0%** |
| "Make a plan → go" | 67 | 1.5% |
| "Do it" + the agent's own proposal | 585 | 9% |
| Feature / change | 377 | 10% |
| Bug report, "X is broken" | 80 | **12.5%** |

Two conclusions carry the plan:

1. **The operator approves; the agent writes the spec.** A third of messages are one to
   three words, and "do it" follows the agent's own proposal. The place to raise quality is
   the proposal the agent writes, not the operator's message.
2. **The missing line is almost always "done when".** Every gap that cost the most — work
   declared done that the operator then found broken, builds shipped over red or skipped
   checks, edits in the wrong project, a changed number a user sees — is a statement a
   brief would have carried. Four of the operator's standing rules were each written after
   one of these.

## What the public repos do (read at source, 25.09)

| Mechanism | Source |
|---|---|
| At most 3–5 questions, ranked by impact, each with a **recommended** answer | github/spec-kit `clarify.md`, `specify.md` |
| **Assumption ledger** — what the user said kept apart from what the agent assumed | spec-kit Assumptions, BMAD `[ASSUMPTION]`, obra/superpowers brainstorming |
| Testable acceptance criteria (Given/When/Then, EARS) | spec-kit, gotalab/cc-sdd |
| **Research the repo before asking** — never ask what the code answers | severity1/claude-code-prompt-improver, OpenHands, Cline `/deep-planning` |
| Size the process to the request — a clear prompt gets nothing added | superpowers (spike/bounded/architectural), prompt-improver |
| Out-of-scope list, independent slices | spec-kit P1 = viable slice |

Rejected: the one-click rewrite (Roo Code "Enhance", bolt.diy enhancer) — it replaces the
user's words with invented constraints and marks none of them as guesses. A brief that reads
better and hides its assumptions is worse than the short request it replaced.

## The design

### 1. The brief — one shape, sized to the request

Written by the main session (or the first agent) **before** the first edit, for every
SIMPLE CODE, COMPLEX CODE and INCIDENT request. It is the proposal the operator approves.

```
Target      repo · branch · the part of it (and what is not mine to touch)
Goal        one sentence, in the operator's words where possible
Done when   the check the AGENT runs itself, on the artefact the user gets
            (E2E on the build that ships, the row in the DB, the served revision)
Gates       what must be green first (CI on this commit and main; no skip flags)
Invariants  project rules this touches (UI language, numbers users see, recipients)
Assumed     [A1] … — every guess, so a wrong one is one word to fix
Ask         ≤3 questions, each with a recommended answer; only what changes scope,
            touches something expensive to undo (ADR-009), or the repo cannot answer
Not doing   what is out of scope
```

Size: Tiny → `Done when` alone, one line. Small → Target, Done when, Assumed. Medium and up →
the whole block; Large → the block, then `/spec`.

### 2. Bug reports become repro briefs first

The worst-scoring shape (12.5%) turned into the best one (0%) whenever it carried a repro.
"X is broken" → reproduce it first and write `observed / expected / command that shows it`;
the fix is done when that command passes on the environment the operator used, not locally.

### 3. Invariants come from the project, not from memory

A `invariants:` block in `.great_cto/PROJECT.md` (next to `capabilities:`), injected into the
brief when the request touches it. Candidates are learned: a correction of the form "I told
you…" / "why did you change…" is what continuous-learner proposes as a new invariant, for the
operator to accept. Global defaults (report language and shape, CI-green-before-build,
no private names in public artefacts) come from the operator's rules as they are today.

### 4. Where it runs

- **UserPromptSubmit hook** (`request-brief.mjs`): deterministic, no model call. Classifies
  the request (the regex proxy `classify-telemetry` already has), and for an actionable class
  adds a short instruction: write the brief, sized, before the first edit; plus the project's
  invariants. For a 1–3-word continuation it adds nothing — the brief already exists in the
  proposal being approved. `*` prefix bypasses, as in prompt-improver.
- **Agents** (shipped): senior-dev, devops and l3-support follow `agents/_shared/task-brief.md`.
  Dispatched without a `Done when`, they write one and open the report with it; if they cannot
  name a check they can run themselves, that is the report's first line, not "done". Softer
  than refusing to start — a refusal would cost a round trip on every under-specified dispatch,
  and the measurement will say whether the softer form is enough.
- **Questions** go through AskUserQuestion with the recommended option first — answerable
  with one click.

### 5. How we know it helped

The session study becomes a tool (`scripts/lib/request-quality.mjs`, read-only, local, like
`agent-speed`): correction rate within three turns, "it doesn't work" reports per week, share
of openers with `Done when`. Baseline above. Taken only if corrections fall and turns to "done"
do not rise — a brief that slows every small task is not a win.

## Baseline — `node scripts/lib/request-quality.mjs` (25.09, scripted sessions excluded)

| Window | Requests | Corrected within 3 turns | "It doesn't work" | Approvals of a proposal with "Done when" |
|---|---|---|---|---|
| 27.07–25.09 | 4,219 | 7.0% | 83 | 0 of 965 |
| 11.09–25.09 | 653 | 8.7% | 23 | 0 of 168 |

The last column is what B1 moves directly; the first two are what it is for. Re-measure the
same windows' length after B1 has run for two weeks.

## Order

B1 brief shape + sizing in the operating rules and the three agents · B2 repro-first for
bug reports · B3 `request-quality` measurement (before B1 ships, to have the baseline in the
tool) · B4 `invariants:` block + learner proposals · B5 the hook.

## Not in this plan

Rewriting the operator's message. Asking more than three questions. A model call inside the
hook (latency on every prompt).
