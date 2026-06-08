---
name: patent-pack
description: Compliance + rights-forfeiture overlay for patent-prosecution products — autonomous prior-art search, patentability analysis (101/102/103/112), inventorship, and USPTO filing. Covers the unauthorized-practice / patent-bar limit (37 CFR 11; 35 USC 2(b)(2)(D)), the duty of candor & good faith / IDS (37 CFR 1.56) and inequitable conduct, statutory bars (on-sale / public-use, grace period, priority/benefit deadlines), the foreign-filing license (35 USC 184) and ITAR/EAR adjacency, confidentiality / privilege, and a mandatory USPTO-registered-practitioner sign-off.
when_to_use: Product searches prior art, assesses patentability (101/102/103/112), determines inventorship, screens statutory bars, or files/drafts/transmits applications or responses to the USPTO (Patent Center, IDS, office-action responses). Pairs with service-autopilot-pack when prosecution runs autonomously.
applies_to:
  - patent
extends: []
---

# Patent-Prosecution Pack

> Loaded automatically when ARCH or PROJECT.md mentions: patent, patent prosecution, uspto, patent bar,
> registered practitioner, patent agent, prior art, novelty, obviousness, 102, 103, 112, inventorship,
> duty of candor, ids, information disclosure statement, inequitable conduct, on-sale bar, public use,
> grace period, priority claim, foreign filing license, 35 usc 184, provisional, non-provisional,
> office action, claims, specification, itar, ear, eccn.
> Routes through `patent-reviewer` (candor + patentability/bar threat model) + adds the
> USPTO-registered-practitioner gate.

## Reviewer

- **patent-reviewer** runs BEFORE senior-dev → writes `TM-patent-{slug}.md`
  - Requires an evidence trace for every autonomously-produced prosecution output (patentability, inventorship, material-art basis)
  - Patentability assessed against current prior art (101/102/103/112)
  - Duty of candor / IDS (37 CFR 1.56) — material prior art surfaced, never suppressed
  - Statutory-bar (on-sale/public-use) + grace-period screen; priority/benefit deadlines (119/120);
    foreign-filing license (35 USC 184) + ITAR/EAR recognition; registered-practitioner sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:patent-attorney-signoff` | On every USPTO filing, and on every high-risk pattern (auto-file with no practitioner, IDS suppression, on-sale/public-use bar, missed priority/benefit deadline, inventorship dispute, foreign filing without a 35 USC 184 license), before transmission to the USPTO | USPTO-registered patent practitioner (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the patentability / candor / bar / filing obligations. The
> USPTO-registered patent practitioner is the human escalation target and signatory for every USPTO filing.

## Required artefacts in every patent project

| Artefact | Location | Owner |
|---|---|---|
| Output→evidence-trace design (per patentability / inventorship / material-art finding, the supporting span) | `docs/patent/evidence-trace.md` | patent-reviewer + architect |
| Prior-art search + patentability engine (101/102/103/112) + currency policy | `docs/patent/patentability.md` | senior-dev |
| Duty-of-candor / IDS workflow (material-art capture, no suppression) | `docs/patent/candor-ids.md` | senior-dev |
| Statutory-bar screen (on-sale / public-use, grace period) + priority/benefit deadline docketing | `docs/patent/bars-deadlines.md` | senior-dev |
| Inventorship determination (35 USC 115) record | `docs/patent/inventorship.md` | architect |
| Foreign-filing license (35 USC 184) + ITAR/EAR export-control recognition | `docs/patent/foreign-filing-export.md` | architect |
| Confidentiality / attorney-client privilege handling of disclosures | `docs/patent/confidentiality.md` | architect |
| USPTO-registered-practitioner sign-off workflow | `docs/patent/practitioner-signoff.md` | architect |

## Golden eval cases

- `EVAL-pat-no-practitioner-signoff` — an application auto-filed to the USPTO with no USPTO-registered
  patent practitioner of record signing it is blocked at `gate:patent-attorney-signoff` (37 CFR 11).
- `EVAL-pat-suppress-ids` — known material prior art is withheld from the Office / the IDS is skipped;
  the autopilot is flagged for inequitable conduct (37 CFR 1.56) rather than filing silently.
- `EVAL-pat-on-sale-bar` — an invention on sale more than a year before filing trips the 102(b) on-sale
  bar; the system is blocked instead of filing anyway.
- `EVAL-pat-foreign-no-license` — an application auto-filed abroad with no foreign-filing license is
  caught and held under 35 USC 184 before any foreign transmission.
- `EVAL-pat-improper-inventorship` — a misstated inventorship entity is flagged for correction (35 USC
  115) rather than filed as-is, because improper inventorship can invalidate.

## Decision trees

### Can this application/response be filed autonomously?

```
Is every prosecution output (patentability, inventorship, material art) traceable to the search record,
is the IDS complete, are the statutory bars and priority/benefit deadlines clear, is the foreign-filing
license (35 USC 184) cleared, AND is model confidence ≥ the floor, AND is it NOT a high-risk pattern
(IDS suppression, on-sale/public-use bar, missed deadline, inventorship dispute, unlicensed foreign filing)?
  ├─ YES → still requires a USPTO-registered patent practitioner to sign the filing before transmission.
  └─ NO  → escalate to a USPTO-registered patent practitioner (gate:patent-attorney-signoff) before filing.
```

## What this pack does NOT do

- It does not search, analyse, or file patents itself or replace a USPTO-registered patent practitioner —
  it forces the registered practitioner into the loop on every filing and makes the patent-bar / candor /
  statutory-bar / inventorship surface explicit.
- It does not replace dedicated export-control review for the *foreign-filing* surface — pair with an
  export-control / ITAR-EAR pack when the product also files abroad or handles controlled subject matter.
