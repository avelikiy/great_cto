# PLAN — A document goes stale on a date its author chose, not when git last touched it

Source: `scaccogatto/okf-skills` (312★, MIT, active), the Claude Code toolchain
for the Open Knowledge Format that Google Cloud announced in June 2026. OKF is a
directory of markdown with YAML frontmatter, and one of its fields is worth
taking on its own:

```yaml
stale_after: 2026-09-23   # absolute date; content is stale on/after this day
```

Their reasoning, which is the part that matters: the staleness decision is a
plain date comparison **with no reference to when the file was last touched**.

## The measurement first, because I have been wrong twice this week

`artifact-lint` derives freshness from mtime. So a typo fix rejuvenates a
document that stopped being true months earlier. I recommended this change
before checking how often that happens; here is the check.

Of **159 documents**, **13** currently read fresher than their last substantive
edit — measured as the gap between the last commit touching the file and the
last commit changing more than five lines:

```
 +76d  docs/superpowers/plans/2026-05-22-plan-critic.md   touched 08-06, substantive 05-22
 +23d  docs/ARCHETYPES.md                                 touched 06-06, substantive 05-14
 +22d  docs/reference/agents.md                           touched 07-28, substantive 07-06
 +20d  docs/agent-model-override.md                       touched 06-10, substantive 05-21
```

**8% of the corpus, and the worst case is eleven weeks.** Real, and smaller than
I implied when I called mtime-based freshness broken. It is worth fixing and it
is not an emergency — which is the honest size, and the size the work should
match.

## The change

1. **`stale_after` in frontmatter.** An author writes the date after which they
   will not vouch for the content. `artifact-lint` prefers it over mtime
   wherever it is present.
2. **Absent is not fresh.** A document with no `stale_after` keeps today's
   mtime behaviour and says which rule it was judged by. Silently treating an
   undeclared document as fresh forever is the defect this repository keeps
   removing; so is failing every document written before the field existed.
3. **The templates ask for it.** ARCH, ADR and PLAN templates gain the field,
   with a default horizon rather than a blank — a field nobody fills is a field
   that does not exist.

## What this does not do

- No adoption of OKF itself. The format exists for knowledge exchange between
  teams and vendors; we have one public project and one reader, and taking a
  schema for interoperability we do not use is cost without benefit.
- No trust tiers or `sources:` propagation from OKF. We already derive trust
  from evals (`gate-tier`) and citation coverage from `requirement-coverage`,
  both grounded in this repository's own evidence rather than a declared
  credibility signal.
- No graph renderer. The board already draws the system map and the pipeline
  from live sources.

## Status

Measured and planned. **Not implemented** — this session's context is spent, and
starting an edit that runs out halfway is worse than handing over a plan with
its evidence attached. The next session picks this up with `/resume`.
