# PLAN — Three copies of a rule are three rules

**Status:** in progress · **Date:** 2026-09-12 · **Owner:** senior-dev
**Applies to:** the eight pipeline agents, `agents/_shared/`, `agents/pm.md`

**Measured before deciding anything.** Eleven section headings repeat across four
to eight of the eight pipeline agents, 858 lines in total — 14% of their combined
length. But a repeated heading is not repeated content, and the difference
decides what may be extracted:

| Section | Agents | Text similarity | Verdict |
|---|---|---|---|
| Environment Setup | 6 | four identical, then 79% and 56% | extract |
| Step 0: Pattern Lookup | 6 | 7–64% | extract the mechanism only; the examples are each agent's own |
| Interaction Checkpoints | 6 | 3–41% | **do not extract** — only the heading repeats; the checkpoints differ per stage |
| Writing Style | 7 | not measured | out of scope here; `prose-style` skill already exists |

The second finding corrected the first proposal, which had called Interaction
Checkpoints 142 duplicated lines. It is 142 lines of six different things.

Two more facts from the same sweep:

- `agents/_shared/argument-quality.md` (43 lines) is pointed at by **none** of
  the eight, while `devops` restates its rule inline ("name the mechanism, not
  just the concern"). `contract-agent-altitude.md` is pointed at by none either.
- `pm` carries a model price table (`Opus 4.8 $5/$25`, `Sonnet 4.6 $3/$15`). The
  prices the product actually bills against live in `scripts/lib/cost-meter.mjs`,
  which is what `usage-from-transcript` prices runs with. Two tables, one of them
  naming models this repository no longer routes to.

**Goal:** every rule that is the same for several agents has one source, and no
agent carries a copy of a number that is measured somewhere else.

## Global constraints

- Extraction must not change what an agent is told. Where versions differ, the
  fragment carries what they agree on and the agent keeps its own remainder.
- `prompt-size.mjs` counts a pointed-at fragment per agent, so extraction saves
  lines, not tokens — the token win only comes where a long section collapses to
  a one-line pointer plus a short local remainder.
- `agent-prompt-lint.mjs` stays green; PHASE rules require their own sections.
- No private project names. The pre-push guard derives terms from workspace
  directory names, one of which is an ordinary English word — avoid it in prose.

---

## Task 1 — `agents/_shared/environment-setup.md`

**Files:** create the fragment; modify the six agents that carry the section;
create `tests/lib/agent-dedup.test.mjs`.

Four agents (`architect`, `qa-engineer`, `security-officer`, `devops`) carry an
identical eight-line block; `senior-dev` differs by one line, `l3-support` by
three. The fragment carries the identical part; the two agents with extra lines
keep their extra lines beside the pointer.

- [ ] Test: the fragment exists; each of the six points at it; none of the six
      still carries the block's distinctive line inline.
- [ ] Extract, point, remove the copies.
- [ ] `agent-prompt-lint`, the fragment tests, `prompt-size` — then commit.

## Task 2 — `agents/_shared/pattern-lookup.md`, mechanism only

**Files:** create the fragment; modify the six agents; extend the dedup test.

What all six say: read `~/.great_cto/global-patterns`, match by archetype, a
`confidence: high` pattern applies by default and a deviation is justified in the
artefact, the first entry of `detection_order` runs before anything else.

What is each agent's own and stays: which artefact records the deviation, and the
worked example (`l3-support`'s Grafana case, `devops`'s deploy case).

- [ ] Test: the fragment exists and names the mechanism; each agent points at it;
      no agent repeats the mechanism sentence inline; each agent that had a worked
      example still has one.
- [ ] Extract, point, trim.
- [ ] Lint + tests + commit.

## Task 3 — `argument-quality.md`: adopt or delete

**Files:** modify `qa-engineer`, `security-officer`, `devops`; extend the test.

The fragment states the rule a finding must satisfy: mechanism, evidence,
consequence. Three agents emit gate-bearing findings. Point all three at it and
delete `devops`'s inline restatement. If a reader of this plan disagrees that the
rule belongs to all three, the alternative is deletion — a fragment nobody points
at is a file that drifts out of date unread.

- [ ] Test: the three gate-bearing agents point at it; `devops` no longer
      restates it inline; no fragment in `_shared/` is pointed at by zero agents,
      with `contract-agent-altitude.md` named as the known exception until it is
      adopted or removed.
- [ ] Point the three; remove the inline copy.
- [ ] Lint + tests + commit.

## Task 4 — one price table

**Files:** modify `agents/pm.md`; extend the test.

`pm` estimates cost from a table it carries. Replace the table with the source:
`scripts/lib/cost-meter.mjs` holds the rates the product bills against, and
`cost-model` is the skill both `architect` and `pm` already declare. `pm` keeps
its estimation method and its human-hours comparison; it stops carrying a second
copy of the model prices.

- [ ] Test: no agent prompt carries a per-model price table; the rates live in
      `cost-meter.mjs` and the agents name it.
- [ ] Replace the table with the pointer.
- [ ] Lint + tests + commit.

## Not in this plan

- `Interaction Checkpoints`, `Writing Style`, `Tool usage`, `Reporting contract`:
  measured as different content under a shared heading, or already covered by an
  existing skill. Extracting them would flatten real differences.
- `contract-agent-altitude.md`: unused, but its adoption is a decision about what
  every agent must be told, not a deduplication. Filed separately.

## Verification before calling it done

- Full `bash scripts/ci-local.sh` green on Node 22, read from the inner exit code.
- `promptProfile` for each touched agent expands the new fragments.
- The eight agents lose at least 250 lines in total, and no agent loses a rule it
  had: the dedup test names, per agent, the sentence that must survive.
