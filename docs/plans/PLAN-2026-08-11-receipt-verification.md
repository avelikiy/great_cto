# PLAN — Prove that what was reviewed is what shipped

**Date:** 2026-08-11
**Status:** in implementation

## The gap

The evidence ladder has four rungs, and each was built because the rung below it
turned out to be satisfiable without the thing it claimed:

| Rung | Question it answers |
|---|---|
| verdict present / canonical | did the stage report at all |
| artefact exists | did it produce what it said it produced |
| check re-run | does the check still pass |
| independent re-verification | does a second reader agree |

All four are about **the moment of review**. None of them says anything about
what happened afterwards. `code-reviewer` returns APPROVED over a tree; senior-dev
keeps editing; `gate:ship` is approved at 14:20 over one state and the push
happens at 17:05 over another. Every rung still reads green, because every rung
is answering a question about the past.

So the ladder is missing its top step: **the code that was reviewed is the code
that shipped.**

This is not hypothetical in this repository. Today alone, two mechanisms were
found configured and non-functional — `core.hooksPath` pointing at a directory
the repo had moved out of, so no git hook ran at all, and GitHub Actions failing
at the billing layer, so every workflow was inert. Both had been "green" for
weeks in the only sense anyone was checking. A receipt is the same class of
question asked about code instead of about machinery.

## What a receipt is

A fingerprint of exactly what an agent saw, recorded in its verdict, and
comparable later.

```
receipt: {
  head:  <commit sha at review time>,
  dirty: <sha256 of the uncommitted diff, or null when the tree was clean>,
  files: { "<path>": "<blob sha>", ... }   // the change under review
}
```

`head` alone is not enough — an agent usually reviews a dirty tree, and two
different working states share a HEAD. `dirty` closes that. `files` is what
makes the answer useful rather than binary: "something changed" sends a reader
looking, "`packages/board/lib/routes.mjs` changed after the review that approved
it" is the finding.

## Where it plugs in

| Point | Change |
|---|---|
| `scripts/log-verdict.sh` | attach a receipt to every verdict |
| `scripts/hooks/pre-push.sh` | compare the newest approving verdict's receipt against what is being pushed |

The pre-push hook is the right enforcement point for the same reason it is the
right place for the privacy guard: it is the last moment before something
escapes the machine, and — as of today — it actually runs.

## Polarity

Warn by default, `GREAT_CTO_ENFORCE_RECEIPT=1` to block. This matches the two
checks already in that hook (summary freshness, artifact lint) and it is the
honest setting for a repository where not every change is reviewed by an agent:
a guard that fires on every push is one people learn to pass with `--no-verify`,
which is how the privacy guard came to be trusted while silently disabled.

What must NOT be quiet is the third state. A push with no approving verdict is
not the same as a push whose receipt matches, and the hook says which of the
two it is rather than staying silent for both.

## What this will not do

- Block on a file the review never covered. A README edited after an approval is
  not a review being bypassed, and reporting it as one is how the signal dies.
- Claim a receipt proves the review was *good*. It proves only identity: the
  bytes are the bytes. Whether the reviewer was right is the rung below.
- Compute anything expensive. Two `git` calls and a hash; this runs on every
  verdict and every push.

## Steps

1. `scripts/lib/receipt.mjs` — build, compare, describe. Tests first.
2. `log-verdict.sh` records it.
3. `pre-push.sh` checks it, warn-only.
4. Verify against a real approval: approve something, edit a covered file, push,
   and see it named.
