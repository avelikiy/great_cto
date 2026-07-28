# Shared Writing Rules

How agents write the prose a human reads: ADRs, briefs, threat models, PR text,
commit messages, and the report at the end of a run.

Reference this file — do not paste copies into agent prompts. A rule duplicated
across 68 files is a rule that has already diverged.

**Scope: prose only.** Never rewrite code, identifiers, API names, error strings,
CLI flags, or someone else's quoted words to satisfy anything here.

---

## The rule

Orwell's six, 1946, still the shortest correct version:

1. Never use a metaphor, simile, or figure of speech you are used to seeing in print.
2. Never use a long word where a short one will do.
3. If it is possible to cut a word out, cut it out.
4. Never use the passive where you can use the active.
5. Never use a foreign phrase, a scientific word, or a jargon word if you can
   think of an everyday English equivalent.
6. Break any of these rules sooner than say anything outright barbarous.

Rule 5 has a carve-out here: the jargon *is* the everyday equivalent when the
reader is an engineer. `idempotent`, `p99`, `row-level security` stay. What goes
is the jargon standing in for a claim nobody made.

---

## What that means for our artifacts

**Reports.** State what changed, what failed, and what comes next, in sentences.
No `✅ Successfully implemented`, no `Perfect!`, no wall of bullets standing in
for a conclusion. If tests failed, say so with the output — a report that only
lists wins is not a report.

**Commit messages and PR bodies.** Say what changed and why. The subject line is
the change, not the achievement. Prefer the failure the change prevents over the
adjective it earns: *"the dispatcher waited for a gate the architect no longer
creates"* over *"improved pipeline robustness"*.

**ADRs and briefs.** One concrete claim per line. If a competitor could write the
same sentence about their system, it says nothing — cut it or make it specific.
Numbers instead of adjectives: "296/296 green" over "comprehensive coverage". <!-- slop-ok: the banned word IS the example here -->

**Evidence over adjective.** `robust`, `comprehensive`, `seamless` are each a
measurement that went missing. Name the property: fast? tested? survives bad
input? Then say how you know.

---

## The part that runs

`scripts/lib/prose-slop.mjs` checks the mechanical half of the above: dead words,
throat-clearing openers, achievement language, claims with no source, decorative
emoji in headings, the passive that hides who acted.

```bash
node scripts/lib/prose-slop.mjs docs/adr/ADR-010-*.md
node scripts/lib/prose-slop.mjs docs/**/*.md --json
```

It runs advisory on `git push` over the Markdown that push adds, and never blocks.
Silence one line with a trailing `<!-- slop-ok -->` — sometimes the banned word
is the subject of the sentence.

**It does not judge rhythm, insight, or voice.** Those need a reader, and a linter
that pretends otherwise produces noise until someone deletes it. Everything in
"What that means for our artifacts" above is on you, not on the tool.
