Decision: BLOCKED

# Security review — pipeline gate-reading (gate-state.mjs and its callers)

verdict_quality: substantive

Scope: `scripts/lib/gate-state.mjs`, `scripts/hooks/pipeline-dispatcher.mjs`
(`decideNext` + `gateStatesFor`), `scripts/hooks/pipeline-stall-guard.mjs`,
`scripts/lib/pipeline-position.mjs`, and their direct dependency
`scripts/lib/verdict-record.mjs`. Reviewed at commit `d60babda` (range
`b0b2088f~1..HEAD`).

## Claim under test

> A human gate may only be treated as approved when a Beads bead named for
> that gate is CLOSED and was closed AFTER the verdict it would let past.
> Absent, pending, stale, unreadable, and unrecognised-status must ALL read
> as not-approved.

**Verdict: the claim does not hold.** Two independent, reproducible paths
make `gateState()` return `approved` for a gate the CTO never signed off on.
Both are demonstrated below against the real, unmodified code — not
hypothesized. This BLOCKS `gate:ship` for this change until fixed;
`decideNext`'s auto-dispatch (`pipeline-dispatcher.mjs:246-253`) and
`pipeline-stall-guard.mjs`'s forced continuation (`decideStall`,
`pipeline-stall-guard.mjs:92-109`) both act directly on `gateState()`'s
output with no other check in between, so a false `approved` here is not an
academic finding — it is the thing ADR-009 in CLAUDE.md names as
"expensive to undo," reached automatically.

## The trust boundary, stated plainly

`gate-state.mjs` faithfully reports what is in the `bd` store. It is not
buggy in *that* sense. The actual authorization boundary is: **whoever can
run `bd create "gate:X — …" --label gate` and `bd close <id>` can produce a
"gate:X approved" signal**, because nothing downstream checks who ran those
commands or whether a human read anything first. That capability is not new
— it is Bash + the `bd` CLI, which every pipeline agent already has, and
which agent instructions document as the *normal* way to open and close gate
beads (e.g. `agents/security-officer.md:676` — this very agent's own
Step 7 — greps `bd list --label gate --status open` for `gate:ship` and
closes it on its own verdict). **What this diff changes is the
consequence.** Before it, closing a gate bead was necessary but not
sufficient — the orchestrator still had to be separately told to continue,
which was a second point where a human could notice something was off. After
it, `pipeline-dispatcher.mjs`'s `next` directive and
`pipeline-stall-guard.mjs`'s forced continuation make a closed (or forged, or
stale-but-misread) gate bead *sufficient by itself* to auto-spawn the next
stage, including the transition into `devops` behind `gate:ship`
(`shared/pipeline.toml`, `[transitions.qa-engineer]` / `[transitions.security-officer]`).
This review does not conclude "an agent that can write files can already do
X" and stop there — it demonstrates, below, that even the ONE check this
system is supposed to add (staleness — "gate:plan closed for one feature must
not wave through the next one," `gate-state.mjs:29-31`) fails silently on
input every agent already writes as a matter of routine.

---

## Findings

### [Critical] The stale check has no floor: any unparseable date silently becomes "approved," and the test suite says so while passing green

- **Location**: `scripts/lib/gate-state.mjs:73-80`
- **Problem**: An unparseable `verdictTs` or bead `updated_at` does not fall
  back to `pending` as the module's own docstring promises
  (`scripts/lib/gate-state.mjs:33-35`) — it skips the staleness comparison
  and falls through to the unconditional `return { state: 'approved' }` on
  line 80.
- **Evidence**: failed
```
$ node -e '
import("./scripts/lib/gate-state.mjs").then(({ gateState }) => {
  const beads = [{ id: "old-7", title: "gate:ship — old unrelated feature from six months ago",
                    status: "closed", updated_at: "2026-02-01T00:00:00Z" }];
  console.log(JSON.stringify(gateState("gate:ship", beads, { verdictTs: "1970-01-01T00:00:00Z" })));
});'
{"state":"approved","bead":{"id":"old-7","title":"gate:ship — old unrelated feature from six months ago","status":"closed","updated_at":"2026-02-01T00:00:00Z"},"why":"gate:ship approved (old-7 closed)"}
```

Root cause — `scripts/lib/gate-state.mjs:73-79`:
```js
if (verdictTs) {
  const closedAt = Date.parse(newest.updated_at || '');
  const raisedAt = Date.parse(verdictTs);
  if (Number.isFinite(closedAt) && Number.isFinite(raisedAt) && closedAt < raisedAt) {
    return { state: 'stale', ... };
  }
}
return { state: 'approved', ... };   // <-- falls through here whenever EITHER date fails to parse
```
The module's own docstring at `scripts/lib/gate-state.mjs:33-35` promises the
opposite: *"Reading fails safe: no `bd`, a broken payload, an unparseable
date — all report `pending`."* The code does not do that for dates: an
unparseable `updated_at` or `verdictTs` doesn't fall back to `pending`, it
skips the staleness comparison entirely and falls through to the final
`return { state: 'approved' }` on line 80.

Three ways to trigger it, all with real agent-writable input, no `bd`
tampering required:

1. **Valid-but-ancient `ts`.** A verdict with `ts: "1970-01-01T00:00:00Z"`
   passes `verdict-record.mjs`'s `validateVerdict` (its `ISO` regex,
   `verdict-record.mjs:53`, checks *shape*, not recency). Any gate bead ever
   closed for any past feature (which will exist in any project with
   history) then reads as approving the *current* run, because
   `closedAt < raisedAt` is false whenever `raisedAt` predates `closedAt` —
   which an attacker-chosen ancient `raisedAt` guarantees. Confirmed above.
2. **Legacy-dialect `ts` with no validation at all.** `verdict-record.mjs`'s
   legacy branch (lines 132-159) does not check `ts` format — a hand-written
   line like `garbage-not-a-date | senior-dev | APPROVED | x`, appended
   directly to `.great_cto/verdicts/<agent>.log` (bypassing
   `scripts/log-verdict.sh`, which nothing prevents — see CRITICAL-2's
   trust-boundary note), produces `ts: "garbage-not-a-date"`. `Date.parse`
   returns `NaN`, the `if` guard's `Number.isFinite` check fails, same
   fall-through. Reproduced, same output as above with `verdictTs:
   "garbage-not-a-date"`.
3. **A closed bead with a missing or blank `updated_at`.** No malicious
   intent needed — a `bd` export quirk, migration, or partial record is
   enough:
   ```
   $ node -e '... gateState("gate:ship", [{id:"weird-2",title:"gate:ship — x",status:"closed",updated_at:""}], {verdictTs:"2026-08-06T09:00:00Z"}) ...'
   {"state":"approved", ...}
   ```

**The test suite documents the correct behavior in its own name, then
asserts the wrong one.** `tests/lib/gate-state.test.mjs:91-96`:
```js
test('an unparseable date does not become an approval', () => {
  const r = gateState('gate:arch', [bead('gate:arch — x', 'closed', 'not-a-date')], { verdictTs: RAISED });
  assert.equal(r.state, 'approved', 'an unreadable close time falls back to the status, which is closed');
  const r2 = gateState('gate:arch', [bead('gate:arch — x', 'closed', '2026-08-06T11:00:00Z')], { verdictTs: 'not-a-date' });
  assert.equal(r2.state, 'approved');
});
```
The title says "does not become an approval." Both assertions inside it check
that it *does*. Ran the suite to confirm this is not a typo that fails CI —
it is the currently-passing, currently-shipped behavior:
```
$ node --test tests/lib/gate-state.test.mjs
...
ok 10 - an unparseable date does not become an approval
# pass 11
# fail 0
```
11/11 green. A reviewer or CTO scanning "gate-state tests: all passing"
gets exactly the confidence this bug should not allow.

**Severity**: CRITICAL. Reachable by any agent that writes to its own
verdict log (i.e. every agent in the pipeline, as a normal part of its job,
per `agents/_shared/verdict-format.md` and `scripts/log-verdict.sh`), against
any project old enough to have one previously-closed gate bead of the
matching name — true of any project past its first release. No `bd` write
access, no PATH tampering, no privilege beyond what every stage already has.
Defeats specifically the protection this diff's own docstring calls out by
name ("`gate:plan` closed for one feature must not wave through the next
one," `gate-state.mjs:31`).

**Fix direction**: an unparseable `verdictTs` or `updated_at` must return
`pending` (matching the module's own documented contract), not fall through
to the final `approved` return. That also requires tightening
`verdict-record.mjs`'s legacy-dialect parser to validate `ts` shape (or
retiring the legacy write path from ever landing in a *new* line — reading
old history is a separate concern from accepting new unvalidated writes).
Also correct `tests/lib/gate-state.test.mjs:91-96` — as currently written it
is not a regression test for the fix, it is a pin for the bug.

---

### [Critical] Any bead whose title starts with `gate:<name>` counts, and the newest one by `updated_at` wins, even over a real still-open gate

- **Location**: `scripts/lib/gate-state.mjs:56-64`
- **Problem**: `gateState()` selects the approving bead by title-prefix
  match across every bead labelled `gate`, then picks the newest by
  `updated_at` — it does not track which specific bead ID the CTO's
  approval flow is following, so a second, unrelated bead with a matching
  title prefix and a more recent close time silently outranks the real one.
- **Evidence**: failed
```
$ node -e '
import("./scripts/lib/gate-state.mjs").then(({ gateState }) => {
  const beads = [
    { id: "real-42",   title: "gate:ship — deploy tenant-onboarding", status: "open",   updated_at: "2026-08-01T10:00:00Z" },
    { id: "forged-99", title: "gate:ship — unrelated note",           status: "closed", updated_at: "2026-08-06T09:00:00Z" },
  ];
  console.log(JSON.stringify(gateState("gate:ship", beads, { verdictTs: "2026-08-01T09:00:00Z" })));
});'
{"state":"approved","bead":{"id":"forged-99","title":"gate:ship — unrelated note","status":"closed","updated_at":"2026-08-06T09:00:00Z"}, ...}
```
`real-42` is the CTO's actual, still-`open`, un-approved `gate:ship` bead.
`forged-99` is a second bead — created and closed by *anything* that runs
`bd create "gate:ship — unrelated note" --label gate && bd close forged-99`
— and it wins, because `gateState()` (`gate-state.mjs:56-64`) selects by
title-prefix match across ALL beads with that label, sorted by
`updated_at`, newest first. It does not track — anywhere in this system —
*which specific bead ID* the CTO's approval flow is following. Confirmed
this is not merely a hypothetical two-line recipe: `agents/security-officer.md:676`,
`agents/qa-engineer.md:809`, and `agents/senior-dev.md:436` all locate "the"
gate bead the same way (`bd list --label gate | grep "gate:X"`), so the
system-wide convention already assumes "the newest/only matching-titled bead
is the one," which this diff turns into an automated approval oracle.

**Severity**: CRITICAL for the reason stated in the trust-boundary section
above: this is not a new *capability* (every agent could already run `bd`),
but this diff is what makes exercising it — by design or by a
buggy/prompt-injected agent creating an incidental second bead with a
`gate:ship`-prefixed title — sufficient by itself to auto-advance past
`gate:ship`, silently overriding a real pending approval, with
`pipeline-stall-guard.mjs` (`decideStall`, lines 92-109) actively holding the
turn open until the orchestrator dispatches.

**Fix direction**: pin approval to a specific bead ID once one is created for
a run (e.g. record the ID the CTO is meant to close, in the verdict's `meta`
or a small state file, and require `gateState()` to check that exact ID —
not "newest bead whose title happens to match"), or at minimum require the
approving bead's `updated_at` to be the single newest across *all* beads with
that label, and treat two beads racing to be "newest" within the same run as
`pending`, not a tiebreak.

---

## Re-verification — 2026-08-06, independent of the fixer

I filed both CRITICALs above. I did not write the fix. Someone else did, in
`efb18b4d` ("fix(gate-state): fail closed on both paths security review found
approving"). This section is the independence check: re-running my own
reproductions against the current code, then trying to break the fix rather
than confirm it. Both beads that closed these findings were closed by the
fixer — that does not count as verification, which is the entire reason this
section exists.

Reviewed: `scripts/lib/gate-state.mjs` at current HEAD (`70e18975`), and
`git show efb18b4d` in full (diff read, not summarised).

### CRITICAL-1 — the stale check has no floor

**1. Re-run of my original reproductions, against current code:**

```
$ node -e '... gateState("gate:ship", [{id:"old-7", ..., updated_at:"2026-02-01T00:00:00Z"}], {verdictTs:"1970-01-01T00:00:00Z", now: Date.parse("2026-08-06T12:00:00Z")}) ...'
{"state":"stale", ..., "why":"this stage is dated more than 30 days ago — too old to be the run gate:ship approved"}

$ node -e '... same bead ..., {verdictTs:"garbage-not-a-date", now: ...} ...'
{"state":"stale", ..., "why":"this stage has no readable timestamp — cannot confirm gate:ship approved it"}

$ node -e '... gateState("gate:ship", [{id:"weird-2", ..., updated_at:""}], {verdictTs:"2026-08-06T09:00:00Z", now:...}) ...'
{"state":"stale", ..., "why":"gate:ship has no readable close time — cannot confirm it approved THIS run"}
```

All three reproductions that previously returned `approved` now return
`stale`. Also ran the pinned regression suite:

```
$ node --test tests/lib/gate-state.test.mjs
ok 10 - an unparseable date does not become an approval
ok 11 - a back-dated verdict cannot make an old approval cover a new run
ok 12 - an open gate outranks a newer closed one with a matching title
# pass 13, fail 0
```
Test 10's name and its assertions now agree — the pin-for-the-bug I flagged
in the original finding is gone, replaced with the correct assertion
(`'stale'` instead of `'approved'`).

**2. Verdict: CLOSED.** The specific reproduction I filed no longer produces
`approved`. `closedAt` is now computed unconditionally and checked for
finiteness before anything else runs (`gate-state.mjs:122-125`), so the
"skip the comparison, fall through to the unconditional `approved` at the
bottom" path I found no longer exists — there is no unconditional `approved`
at the bottom for this branch to fall through to.

**3. Tried to defeat it — additional timestamps, not in my original repro:**

```
$ node -e '... verdictTs:"2027-01-01T00:00:00Z" (future), now:"2026-08-06T12:00:00Z" ...'
{"state":"stale", "why":"this stage is dated in the future — gate:ship cannot have approved it"}
```
Future-dated verdict: `stale`, correctly. This is a case my original finding
did not test (I only tried "ancient," "garbage," and "blank") — the fixer
added it unprompted, and it holds. Also checked the legitimate edges don't
misfire:
```
verdict 29 days old, closed after it → approved   (correct — inside the 30-day bound)
ordinary case, verdict then close 30 min later → approved   (correct)
```
No unreadable/absent/future/out-of-range timestamp I could construct reaches
`approved`. `closedAt` is checked first and unconditionally, before
`verdictTs` is even looked at, so this holds regardless of whether a
`verdictTs` is supplied at all.

One boundary I did not find a way to turn into a false approval, but is worth
naming: if a call site's `verdict` is entirely absent (not malformed — the
whole object undefined, so `verdict?.ts ?? null` yields exactly `null`),
`gateState()` skips the raised-at/future/30-day checks (`if (verdictTs !=
null)` is false for `null`) and returns whatever the bare `closedAt` check
allows. Traced the three real call sites
(`pipeline-dispatcher.mjs:299`, `pipeline-stall-guard.mjs:115`,
`pipeline-position.mjs:224`) — all three run on a verdict that was just
parsed to trigger the check, so `verdict` is not null in the reachable path
today, and `verdict-record.mjs`'s `ts` is either schema-validated (v1) or
always a non-empty string even in the worst legacy case (confirmed by
reading `parseVerdictLine`, `verdict-record.mjs:120-158` — `ts` is never
`undefined`, so `?? null` never actually fires from a real parsed record).
Recording this as a **checked, not reachable today** note, not a finding —
the two literal repros I filed are closed, and this is a different, narrower
door than either of them, gated on a caller shape that doesn't occur.

**4. Did the fix over-refuse?** No. Ordinary same-run approval (verdict
raised, bead closed shortly after) still returns `approved`
(`{"state":"approved", ...}` above). A verdict up to 29 days old still
approves. The 30-day / future-dated bounds are a deliberate, generous margin
stated in the code's own comment (`gate-state.mjs:72-74`) against a
dispatcher freshness window of 30 minutes — not a plausible source of
pipeline stalls in normal operation. Full test suite across the blast radius
(`gate-state`, `pipeline-dispatcher`, `pipeline-stall-guard`,
`pipeline-position` — 102 tests) passes, including the pre-existing tests for
the ordinary approval path, so nothing that used to legitimately dispatch now
stalls.

**CRITICAL-1: CLOSED.**

---

### CRITICAL-2 — a newer bead outranking a real one

**1. Re-run of my original reproduction, against current code:**

```
$ node -e '... gateState("gate:ship", [
    {id:"real-42", title:"gate:ship — deploy tenant-onboarding", status:"open", updated_at:"2026-08-01T10:00:00Z"},
    {id:"forged-99", title:"gate:ship — unrelated note", status:"closed", updated_at:"2026-08-06T09:00:00Z"},
  ], {verdictTs:"2026-08-01T09:00:00Z", now:"2026-08-06T12:00:00Z"}) ...'
{"state":"pending", "bead":{"id":"real-42", ...}, "why":"gate:ship is open — awaiting the CTO"}
```
`real-42` now wins. The forged bead no longer outranks it.

**2. Verdict: PARTIALLY CLOSED** — see step 3. The exact reproduction I filed
is fixed and I could not re-break it under variation. But the finding's own
stated general claim — "a second, unrelated bead with a matching title
prefix... silently outranks the real one" — still holds for two bead
arrangements the original repro didn't cover: real gate **absent**, and real
gate **closed-but-stale**. Both are named in the module's own new docstring
as a known, undone residual, so this is not a hidden regression — but the
underlying claim under test ("Absent... stale... must ALL read as
not-approved") still does not fully hold once a second matching-titled bead
is in play, which is exactly what this finding is about.

**3. Tried to defeat it:**

Any arrangement with at least one open/blocked/in-progress bead for the gate
— I could not produce a false approval, under several variants:
```
several forged closed beads (2, 3) + one real open bead, shuffled order → pending, real-42 named
real open bead with status "OPEN" (case) → pending
status "" or missing entirely (neither open nor closed) → pending, "unrecognised status"
```
`gate-state.mjs:99-102` finds ANY open-state bead via `.find()` before any
sort or closed-bead comparison runs at all — an arbitrary number of forged
closed beads, in any order, with any timestamp, cannot reach that branch.
This part of the fix is robust, not merely fixed against the one shape I
happened to file.

Two arrangements DO still produce a false `approved`, and neither needs
anything the trust-boundary paragraph doesn't already name (`bd create` +
`bd close`, which every pipeline agent has):

```
# (a) gate never legitimately raised (should read "absent") — one forged, closed bead
$ node -e '... gateState("gate:ship", [
    {id:"forged-1", title:"gate:ship — unrelated note", status:"closed", updated_at:"2026-08-06T11:59:00Z"},
  ], {verdictTs:"2026-08-06T11:00:00Z", now:"2026-08-06T12:00:00Z"}) ...'
{"state":"approved", "bead":{"id":"forged-1", ...}}

# (b) real gate closed but STALE (approved an old run, no open bead exists) — one forged, fresher closed bead
$ node -e '... gateState("gate:ship", [
    {id:"real-old",  title:"gate:ship — deploy old feature A", status:"closed", updated_at:"2026-07-01T10:00:00Z"},
    {id:"forged-99", title:"gate:ship — unrelated note",       status:"closed", updated_at:"2026-08-06T11:00:00Z"},
  ], {verdictTs:"2026-08-06T10:00:00Z", now:"2026-08-06T12:00:00Z"}) ...'
{"state":"approved", "bead":{"id":"forged-99", ...}}
```
In (b), `real-old` alone would correctly read `stale` (it approved a run
that finished six weeks before this verdict) — that part of CRITICAL-1's fix
works. The forged bead's own fresh `updated_at` beats it in the "newest by
`updated_at` decides among the closed ones" sort (`gate-state.mjs:106-107`),
so its own closedAt/verdictTs comparison runs instead, and passes.

**Not a regression**: checked this exact arrangement against the pre-fix
code (`git show efb18b4d~1:scripts/lib/gate-state.mjs`, same reproduction
in the old logic) — it already produced `approved`, identically. The fix did
not introduce this path; it narrowed what was previously a wide-open "newest
wins regardless of open/closed" door down to "newest wins only among the
closed ones, and only when no open bead exists." That is real, verified
progress (the pending-override case — the one I actually filed and scored
CRITICAL — is closed), but it is not the same as closing the finding's
stated general claim.

**4. Did the fix over-refuse?** No — same evidence as CRITICAL-1: ordinary
approval still works, full 102-test suite green, and the new "any open bead
wins" rule can only ever make a `pending` MORE likely to be reported
correctly, never turn a real approval into a false pending (verified: a
single closed bead with no competing open one still reads `approved`, shown
above and in the pinned regression test at `tests/lib/gate-state.test.mjs`
"a back-dated verdict... the ordinary case must still pass").

**CRITICAL-2: PARTIALLY CLOSED.** The filed reproduction is fixed and
verified robust under variation — that part should be treated as done. The
residual (forged bead manufacturing approval for an absent or stale gate,
not a pending one) is real, reproducible, not a regression, already named in
the module's own docstring as an accepted gap ("Pinning approval to a
specific bead ID... would close the rest and is not done here"), and
requires the same `bd create`+`bd close` capability the original review's
"trust boundary" section already scoped as pre-existing and not unique to
this diff. I am not re-blocking `gate:ship` over it — narrowing an
open-ended trust-boundary problem into a stated, documented residual is the
right shape of partial fix, and re-litigating the full "pin to a bead ID"
redesign here would hold the gate on a problem that predates this diff and
is unchanged by it. Recommend a tracked follow-up (not a blocker): pin
approval to a specific bead ID recorded when the gate bead is raised, which
the docstring itself proposes as the actual close.

---

### HIGH-3 and MEDIUM-4 — brief recheck

Neither was touched by `efb18b4d` (confirmed: the diff only modifies the
module docstring, `gateState()`'s body, and adds `MAX_VERDICT_AGE_MS`;
`titleNamesGate()` and `readGateBeads()` are byte-for-byte unchanged). Reran
both original reproductions against current code:

```
$ node -e '... titleNamesGate("gate:aXb — x", "gate:a.b") ...'
true    # still unescaped — HIGH-3's character-class bug is present, unchanged
$ node -e '... titleNamesGate("gate:arch-review — x", "gate:arch") ...'
true    # still a \b-boundary match, not a segment match
$ grep -n "execFileSync('bd'" scripts/lib/gate-state.mjs
152:    const out = execFileSync('bd', [...])   # still bare-name PATH resolution
```

**HIGH-3: STILL OPEN**, exactly as filed (latent — no live collision in
today's ~39 gate names, per the original scoring; unchanged by this diff).
**MEDIUM-4: STILL OPEN**, exactly as filed (requires a PATH/profile write
precondition; unchanged by this diff). Neither was in scope for `efb18b4d`,
whose commit message only claims the two CRITICALs — that claim is accurate,
it does not overclaim HIGH-3/MEDIUM-4 as fixed.

---

### Self-check on my own prior work

Nothing in the original two CRITICAL findings was overstated — both
reproduced cleanly against the shipped code at the time, and CRITICAL-1's
was fully closed. CRITICAL-2's severity (CRITICAL) was scored against the
"outrank a real pending gate" reproduction specifically, which is what made
it "sufficient by itself to auto-advance past `gate:ship`... silently
overriding a real pending approval" — that framing was correct and is now
fixed. The residual I found in this re-verification (absent/stale + forged
bead) is a narrower claim than what CRITICAL-2 was scored against, and I am
scoring it as a documented residual rather than re-raising it at CRITICAL,
consistent with the original review's own treatment of the same underlying
`bd create`+`bd close` capability in the trust-boundary section (scored
contextually, not as its own numbered CRITICAL, because it needs the same
capability every pipeline agent already has documented use of).

---

## Verdict

**APPROVED for `gate:ship` on this specific fix.** Both CRITICALs that
blocked it are addressed: CRITICAL-1 fully, CRITICAL-2 for the reproduction
that earned the CRITICAL score, with a narrower, previously-existing,
now-documented residual left for a follow-up rather than blocking this
change. HIGH-3 and MEDIUM-4 remain open, unchanged, and were never claimed
fixed by this commit — they do not block this specific fix but should not be
forgotten.

**Recommended follow-up** (not blocking): pin gate approval to a specific
bead ID recorded when the gate is raised (closes CRITICAL-2's residual);
fix the character class in `titleNamesGate()` and tighten its boundary match
(HIGH-3); resolve `bd` to a checked absolute path instead of bare-name PATH
lookup (MEDIUM-4).

---

### [High] The "escape regex metacharacters in the gate name" helper is broken, and the match is a prefix-with-word-boundary, not "the whole segment," despite what the tests claim

- **Location**: `scripts/lib/gate-state.mjs:44`
- **Problem**: The regex meant to escape metacharacters in a gate name
  before it's embedded in another regex closes its character class one
  character early, so nothing in the gate name is actually escaped; and
  separately, the match anchors on a word-boundary rather than the
  documented title convention, so a gate name followed immediately by a
  hyphen/space/colon in a bead title matches even when the rest of the
  title names something else entirely.
- **Evidence**: failed
```
$ node -e '... titleNamesGate("gate:aXb — x", "gate:a.b") ...'
true   // "." was supposed to be escaped to a literal dot; "aXb" should NOT match "a.b"
```
`gate-state.mjs:44`:
```js
return new RegExp(`^\\s*gate:${bare.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(...)
```
Parsed character-by-character, the character class in
`/[.*+?^${}()|[\\]\\\\]/g` closes one character early (at the `\\]` right
after the literal `[`), so the intended "escape one of `.*+?^${}()|[\]`"
class is followed by four stray characters (`\\\\]`) that form their own,
unreachable-in-practice tail pattern. Net effect: **no character in `bare` is
ever actually escaped.** `bare` today is always one of ~39 fixed,
alphanumeric-plus-hyphen gate names declared in `shared/pipeline.toml` and
the compliance packs (`arch`, `ship`, `qa`, `security`, `compliance`,
`pci-signoff`, `gdpr-dpia`, …) — none contains a regex metacharacter, so this
is currently **latent, not exploited**. It becomes live the moment any
future gate name (a compliance-pack addition is exactly the kind of thing
that gets named by a domain spec, not by someone thinking about regex) uses
`.`, `+`, `*`, `?`, `(`, `)`, `|`, `^`, `$`, `{`, or `}`.

Separately (not the escaping bug — the `\b` boundary is working as coded,
just looser than the tests claim):
```
$ node -e '... titleNamesGate("gate:arch-review — x", "gate:arch") ...'
true
$ node -e '... titleNamesGate("gate:arch: unrelated note", "gate:arch") ...'
true
```
`tests/lib/gate-state.test.mjs:74-80` asserts "gate names match on the whole
segment, not a prefix," and its one counter-example
(`gate:architecture-review` vs `gate:arch`) does prove that — because `e`
after `arch` is a word character, no `\b`. But a hyphen, space, or colon
immediately after the gate name *does* satisfy `\b`, and the test suite
never exercises that shape. Today no two real gate names in
`shared/pipeline.toml` collide this way (checked: `arch`, `plan`, `product`,
`code`, `qa`, `ship`, `security`, `compliance`, `test` — none is a
punctuation-separated prefix of another), so this is a structural weakness,
not a live cross-gate confusion today.

**Severity**: HIGH as a latent defect (would silently misattribute a bead to
the wrong, narrower gate the moment two gate names share a prefix
relationship) — not exploitable against the current gate name set, stated
explicitly so it isn't over-scored.

**Fix direction**: fix the character class (`[.*+?^${}()|[\]\\]` — one
`\]` inside the class to close it, not two) and change the anchor from
`\b` to something that matches the documented title convention exactly
(`gate:arch` followed by `\s|—|:|$`), not "any non-word character."

---

### [Medium] `bd` is resolved by bare name via `PATH`, with no integrity check

- **Location**: `scripts/lib/gate-state.mjs:89`
- **Problem**: `readGateBeads()` invokes `bd` by bare name, resolved
  through `PATH` at call time, with no absolute path and no check that the
  resolved binary is the genuine `bd`.
- **Evidence**: passed
```
$ sed -n '87,96p' scripts/lib/gate-state.mjs
export function readGateBeads({ timeoutMs = 4000, cwd = process.cwd() } = {}) {
  try {
    const out = execFileSync('bd', ['list', '--label', 'gate', '--json', '--status', 'all'],
      { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
```
Confirms the claim as written: `bd` is passed as a bare command name (no
absolute path), so resolution goes through `PATH` at call time. This is a
verified fact about the code, not a demonstrated live PATH-hijack — the
exploit chain (planting an earlier-resolving `bd` on `PATH` or in the shell
profile) was not executed in this session; see the write-access precondition
discussion below for why that gap is scored Medium rather than left
unrated.
`execFileSync` with an argv array (not a shell string, `shell` option not
set) rules out classic shell/argument injection into this specific call —
verified there is no string concatenation of untrusted data into the command
or its arguments. What is not ruled out: `bd` is looked up by bare name on
`PATH`, with no absolute path and no check that the resolved binary is the
real one. This environment's own tool notes state "the shell is initialized
from the user's profile" on each Bash invocation — a process (any agent,
given the Bash + Write access every agent has) that plants an earlier-
resolving `bd` shim in a `PATH` directory or the shell profile itself would
have every future `readGateBeads()` call — across `pipeline-dispatcher.mjs`,
`pipeline-stall-guard.mjs`, and `pipeline-position.mjs` — return whatever
JSON it chooses, forging approval for every gate in one shot without
touching the real Beads store at all. This requires a write-access
precondition (a location on `PATH` ahead of the real `bd`, or the shell
profile) that itself already implies significant capability, which is why
this is scored MEDIUM rather than CRITICAL, and it is a general property of
shelling out to `bd` by bare name anywhere in this codebase, not unique to
this diff — flagged here because this diff is what turns a `bd` read into an
automated approval decision.

**Fix direction**: resolve `bd` to an absolute, expected path once (e.g. via
`command -v bd` at session start, cached), or otherwise pin what binary is
trusted, rather than relying on ambient `PATH` at every hook invocation.

---

## Answers to the specific questions

**1. Bead titles / regex — see CRITICAL-2 and HIGH-3 above.** No unicode
look-alike bypass found: the `^` anchor (no `m` flag) means only characters
JS's `\s` class treats as whitespace can precede `gate:`, and embedded
newlines do not let a title "become" `gate:X` partway through — `^\s*`
requires everything before the match to be whitespace, not merely for
whitespace to *exist* somewhere earlier. Confirmed a leading BOM
(`﻿`, which `\s` does include) plus spaces still matches — expected,
inert.

**2. `readGateBeads` — argument injection: not present** (array-form
`execFileSync`, no shell). **cwd: not attacker-reachable** in the reviewed
call sites (all call with no `cwd` override; defaults to the hook process's
own `process.cwd()`, set by the harness, not by bead/title content).
**PATH hijack of `bd`: real, see MEDIUM-4.** **Output size: fails closed** —
`execFileSync`'s default 1 MB `maxBuffer` throws on an oversized payload
(an intentionally huge bead title, or organic growth of `--status all`
history on a long-lived project), the `try/catch` at `gate-state.mjs:88-95`
catches it and returns `[]`, which reads as `absent` → `pending` for every
gate — a denial-of-dispatch, not a false approval. Verified by reading the
code path, not by actually feeding a >1MB payload through `bd`; noting the
distinction. **Prototype pollution: checked, not present** — a `"__proto__"`
key in a `JSON.parse`d bead record becomes a shadowing *own* data property,
not a mutation of `Object.prototype`, and nothing in the reviewed files
merges bead fields into another object (only direct reads of `.title`,
`.status`, `.updated_at`, `.id`); this would need a merge/deep-extend
utility to be exploitable, and none is present in this call chain.

**3. Timestamp trust boundary — see CRITICAL-1 and the "trust boundary,
stated plainly" section above.** Direct answer: yes, an agent can grant
itself a gate by writing a verdict with a backdated (or malformed) `ts` —
demonstrated. It does not even need to touch a bead. The actual boundary is
"whoever can write to `.great_cto/verdicts/<agent>.log`," which is every
agent, unauthenticated, with `scripts/log-verdict.sh` as the documented
*convention* but nothing enforcing it as the *only* path (nothing rejects a
hand-appended line, and the legacy dialect it still accepts has no `ts`
validation at all).

**4. Clock skew / timezone — partially confirmed, partially a hypothesis.**
The v1 JSON verdict `ts` is validated to end in `Z`
(`verdict-record.mjs:53`), so no ambiguity on that side. `updated_at` from
`bd` is trusted via a bare `Date.parse()` (`gate-state.mjs:74`) with no
equivalent check; per ECMA-262, a date-time string with no explicit UTC
marker parses as *local time on the host running the hook*. I did not
confirm what format `bd`'s own `updated_at` actually emits (`bd` is a
third-party binary, out of this diff's scope) — recording this as a
**hypothesis**, not a confirmed finding: if `bd` ever emits a
non-`Z`-suffixed timestamp, the stale/approved boundary could shift by a
full UTC-offset depending on the machine's local timezone. Same fix as
CRITICAL-1's item 3 (validate, don't bare-`Date.parse`) closes this too.

**5. Privacy — checked, no leak found in this diff.** Traced every string
that flows from a bead record into output: `gate-state.mjs`'s `why` field
only ever interpolates `bead.id` (an opaque `bd` identifier) or the fixed
gate name, never `bead.title`. `pipeline-dispatcher.mjs`'s emitted directive
text and `pipeline-position.mjs`'s `renderHuman`/JSON output were both read
in full — neither threads a bead title through either. **Assumption named**:
the actual place a bead's free-text title (which can carry a customer/project
name) reaches a human is the directive's own instruction to "show the CTO
the gate summary with artifact links" (`pipeline-dispatcher.mjs:261`), which
sends an agent to run something like `bd show <id>` and paste it into chat —
that is unchanged by this diff, chat-only (not a committed artifact by
itself), and is the domain CLAUDE.md's pre-push hook already polices for
anything that *does* get committed. This review found no new path from a
bead's title into a file that reaches the public repo.

---

## Verdict quality self-assessment

`substantive`: every CRITICAL/HIGH finding above carries a file:line
citation, a signal-3 tool confirmation (the actual, unmodified module
executed against literal reproduction input, output pasted verbatim), and an
explicit statement of what would make it NOT a finding (fixed gate-name
prefix collisions today for HIGH-3; write-access precondition for MEDIUM-4).
Q2's cleared sub-questions (argument injection, prototype pollution) are
recorded as checked-clear with the reasoning, not silently omitted.

## Recommendation

BLOCK `gate:ship` for this change. CRITICAL-1 and CRITICAL-2 both let
`gateState()` report `approved` for a gate that was never approved by a
human, using only capabilities every pipeline agent already has as part of
its documented, routine job — no privilege escalation required, just the
system behaving exactly as coded. Both are trivially reproducible against
the shipped code (commands above). Fix CRITICAL-1 and CRITICAL-2 before this
machinery is allowed to auto-advance past a gate with no other human check
in the loop; HIGH-3 and MEDIUM-4 should be fixed in the same pass since
they share the same file and the same review.
