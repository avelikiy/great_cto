# PLAN — Receipts stop reporting and start gating

The receipt machinery landed on 2026-08-11 and works: it fingerprints exactly
what a reviewing agent saw, and before a push it re-derives the tree and names
the reviewed files that changed since. Today's own releases were flagged by it,
correctly.

And then the push went through anyway.

That is a report, not a rung. The competitor survey turned up `hashgate`
(Apache-2.0, three stars, one push, abandoned the day it was written) whose
README states the distinction better than we had: **an approve button approves
an intention; a hash approves a state.** The idea is worth taking; there is no
code worth taking.

## What is actually missing

Three things, in ascending order of how much they matter.

### 1. The decision is made by string-matching, and the exit code is dead

```sh
RECEIPT_OUT="$(node scripts/lib/receipt.mjs --verify 2>/dev/null || true)"
RECEIPT_RC=$?                                  # always 0 — `|| true` already ate it
if [[ "$RECEIPT_OUT" == *"reviewed file(s) changed"* ]]; then
```

`--verify` already exits 1 on drift. The hook ignores that and greps the prose
instead, so rewording a message silently changes what the guard enforces. This
is the same shape as the `ci-local | grep … && git commit` that let a red gate
reach main earlier this month — a decision taken from the wrong channel.

### 2. Enforcement is off, and the flag to turn it on is undiscoverable

`GREAT_CTO_ENFORCE_RECEIPT=1` is an environment variable mentioned in one
warning line. A guard whose enforcement lives in an env var nobody exports is a
guard that is off. It moves to a PROJECT.md line, the same shape as
`gate-tiering: evidence`, so a project states its posture where its other
postures live and the env var stays as the per-invocation override.

### 3. Blocking without a way forward is just a longer bypass

If the only response to "these files changed" is `--no-verify`, enforcement
teaches the bypass. So the operator gets a first-class action:

```
node scripts/lib/receipt.mjs --accept
```

It shows what drifted, and records that a human accepted **this exact state** —
bound to the current tree's hash, and consumed by the push it authorises. The
next edit invalidates it, because the hash no longer matches.

Two properties carried over from hashgate, both of which we can enforce and it
is worth being explicit about:

- **Single-use.** An acceptance authorises one push. Otherwise it is an
  expiring bypass rather than an approval of a state.
- **The agent cannot accept.** `--accept` requires a controlling terminal, the
  same mechanism `loop-local.sh` uses before it spends money. Our hooks run in
  the agent's own shell; without this, "the operator accepted" would mean
  "something in the agent's session ran a command". Enforcement must not depend
  on the agent's good behaviour.

## What this does NOT do

- No daemon, no server, no database. hashgate ships a Python service with a TTL
  and a token; we have a verdict log and a push hook, and the gap this closes
  needs neither.
- No gating of anything but the push. The receipt answers one question — are
  these the reviewed bytes — and that question only matters at the boundary
  where the code leaves the machine.
- Existing projects do not start blocking on upgrade. Enforcement is stated per
  project, absent by default, and every failure path leaves the push allowed
  rather than blocked — a receipt checker that cannot run must not become an
  outage.
