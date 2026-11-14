---
name: reference-lock
description: "Turn design references into a written lock and a decision ledger before any UI is built, then check the build against the lock. Names where references come from (free sources first), what to keep from the one dominant reference, what to borrow, what to reject, and which choice traces to which source. Use when a design draws on references — a URL, screenshots, a named product, a reference MCP — so the result neither averages them into the safe centre nor drifts from them during implementation."
when_to_use: |
  Apply when:
  - design-advisor is writing a DESIGN doc for a new or redesigned surface and references are in play
  - the operator says "make it like X", "look at A, B and C", or hands over screenshots
  - a built surface must be checked against the direction it was supposed to follow
  Do NOT apply when:
  - an existing product system governs and the job is to match it (anydesign; the system IS the lock)
  - the change is a typo, a number, or data wiring behind an unchanged view
effort: low
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Reference lock

## The failure this prevents

References get collected and then lost in one of three ways:

1. **Averaged.** One reference is dark, one is loud, one is serif; the design comes out
   cream, muted and polite, which is none of them and is the model's default anyway.
2. **Untraceable.** The DESIGN doc says "inspired by A and B", but no choice in it can be
   pointed back to either. A reviewer cannot tell research from memory.
3. **Drifted.** The direction was sharp on paper; the build softened it — safer accent,
   rounder corners, a generic section order — and nobody compared the two.

The lock fixes the first, the ledger the second, the close-out check the third.

## 1. Get references, free sources first

Take the first source on this list that answers the question, and record which one did:

| # | Source | Cost | Gives |
|---|---|---|---|
| 1 | What the operator handed over: URLs, screenshots, a Figma file | free | the strongest signal; it overrides the rest |
| 2 | 3–5 **named** live products, captured with `skills/anydesign/scripts/capture_site.py` (desktop + mobile viewports) and `extract_css_vars.py` | free, local | real screens and exact token values |
| 3 | A DESIGN.md study file of a real site (e.g. the MIT `awesome-design-md` collection, cloned outside this repo) | free, offline | a described style system: type, colour roles, spacing, components |
| 4 | A reference MCP the operator installed (screen search, style search, flows) | free or paid | breadth: sites you did not already know |
| 5 | Nothing reachable | — | **say so**; take direction from a `committed-aesthetic` skill, never from memory presented as research |

Record the result as one of the three states `design-advisor` already uses —
**consulted** (name each reference), **unreachable** (name the source that refused and
why), **not attempted** (and why). A paid source that answers "no subscription" is
*unreachable*, not consulted.

**References are studied, never shipped.** Captures and screenshots of other products stay
outside the repository (scratch dir or `~/.great_cto/refs/`). The DESIGN doc names the
reference and describes the pattern in our own words; it never embeds the image, the logo
or the copy. Follow the source's own attribution terms when it states them.

## 2. Write the lock

Pick **one** primary reference. It owns the overall mood, density and structure. Others may
contribute narrow details only. When references conflict, the primary wins; do not split
the difference.

```text
Primary reference: <one source>
Preserve (3–5):    <traits that must survive the build — canvas, type, accent, density,
                    layout move, media treatment>
Borrow (≤2):       <one detail each from a secondary source, with the source named>
Role rules:        <token/component meanings kept from the source — e.g. accent = primary
                    action only; mono = machine output only; gradient = decoration only>
Media:             <real asset | generated | product screenshot | code-native | placeholder>,
                    with aspect ratio and a one-line art direction
Reject:            <the defaults that would collapse this direction, named concretely>
Tokens:            <background, text, accent, radius, border/shadow, type scale — numbers>
```

The `Tokens` line resolves to the DESIGN doc's brand-token table; it is the same numbers,
not a second set.

## 3. Keep a decision ledger

Every major visual, layout, content or interaction choice gets a row:

| Decision | Source | Role rule | Why |
|---|---|---|---|
| Accent `#…` on primary actions only | primary ref (capture of …) | accent = action | the reference never uses it as a surface |
| Comparison table below plan cards | ref B, pricing screen | — | buyers compare after choosing a tier |
| 0 px corners on cards | operator constraint | — | matches the existing board |

**Source** is one of: a named reference, an operator constraint, an existing-system value, a
cited rule (`ui-ux-pro-max`, `committed-aesthetic`, this skill). A row whose source is
"felt right" is not a decision: research it, tie it to a constraint, or cut it.

## 4. Drift checks before handing over

The cliché list lives in `skills/committed-aesthetic/SKILL.md` (gradient grounds, the
rounded-card-with-left-accent triplet, Inter/Roboto/Poppins as display, emoji icons,
category-naming heroes). On top of it, check the three failures only a lock can see:

- **Averaging.** Does any Preserve trait appear weaker than in the primary reference
  (accent desaturated, contrast lowered, radius increased, density relaxed)? Restore it.
- **Role drift.** Is any token used outside its role rule — the action colour as a section
  background, the code font in UI chrome, a decorative gradient behind content? Move it back
  or drop it.
- **Media collapse.** Did an image-led direction become text and boxes? Keep the slot at
  its aspect ratio with alt text and the art-direction line, or change the lock on purpose.

Also refuse the two defaults that pass every other check: indigo/violet as the accent with no
source for it, and hero → three features → pricing → FAQ → CTA as the section order with no
reference that uses it.

## 5. Close the loop after the build

1. Screenshot the built surface at the same viewports as the references (desktop and phone).
2. Walk the Preserve list: each trait is **held**, **weakened** or **lost**, with the
   screenshot that shows it.
3. Walk the ledger: each row is **as specified** or **changed** (and why).
4. For a surface whose tokens were lifted from a live site, re-run
   `python skills/anydesign/scripts/verify_design.py design-tokens.json <url>` to catch
   values that drifted at the source.

Weakened or lost traits go back to implementation, not into the report as "close enough".
A deviation found during the build that changes the look is a **new design decision**: it
returns to the approval step the project requires before it is coded.

## Output

In `docs/design/DESIGN-<slug>.md`, add two sections after the reference-research status:
**Reference lock** (the block from step 2) and **Decision ledger** (the table from step 3).
After the build, append **Lock check** (step 5). Screenshots of our own built surface may be
committed; captures of other products may not.
