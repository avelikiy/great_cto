# PLAN — Autopilot quality uplift (raise all 25 scorecards)

Status: in progress · Created 2026-06-09

All 25 verticals are ship-ready (avg ≈94, median-confirmed). The behavioural scorecard shows the
points that remain are lost in exactly two dimensions, uniformly:

- **Coverage (10 pts)** — the LLM judge flags *missing major sub-regimes* in the reviewer surface.
- **Recall (30 pts)** — occasionally the actor model doesn't BLOCK a planted case when its arch is
  ambiguous (single-sample noise; fixed by sharpening the weakest planted arcs).

`citation / gate / precision / structural / evalSuite` are at or near max — leave them.

## The lever, per vertical
1. **Reviewer + pack** — add the judge-flagged major sub-regimes to `agents/<v>-reviewer.md` (the
   "When to apply" / regimes body) and the pack's Applicability matrix / required-artefacts. Real,
   current statutes only.
2. **Golden set** — sharpen the 2–3 weakest planted arcs in `tests/eval/verticals/<v>.json` so the
   planted flaw is unambiguous (the cro adverse-event fix pattern). Keep the 12-case shape + the
   planted:6 / adversarial:2 / benign:4 · tuning:8 / holdout:4 distribution.
3. Do NOT touch shared/registration files, flows, or connectors — content only.

## Wave 1 — the modest five (≤91, lowest coverage/recall)
| Vertical | Baseline | Coverage gaps to add (judge / domain) |
|---|---|---|
| **aml** | 90 (cov 70–85%) | AMLA 2020, FinCEN 314(b), CTA/BOI beneficial-ownership, FATF 40 recs, EU AMLD, crypto FinCEN 2019 guidance |
| **insurance** | 91.5 (cov 75%) | NAIC #672 IRPC, state guaranty funds, ORSA, Lloyd's/Bermuda surplus-lines, market-conduct |
| **cro** | 90.25 (rec 7/8) | _captured from baseline_ — ICH-GCP E6(R3), 21 CFR Part 11, FDA 1572, IND safety (312.32), EU CTR 536/2014, DSMB |
| **customs** | 90.25 (rec 6/8) | _captured_ — First Sale, USMCA/FTA origin, drawback, C-TPAT/CTPAT, FTZ, 19 CFR 111 broker licensing |
| **soc** | 91 (rec 6/8) | _captured_ — MITRE ATT&CK, NIST 800-61, SEC 8-K Item 1.05, state breach-notification, forensic chain-of-custody |

## Method
1. Capture each vertical's baseline judge note (re-run scorecard where the file was lost).
2. Dispatch a subagent per vertical (parallel): enrich reviewer + pack with the missing regimes +
   sharpen the weakest planted arcs. Content-only, no shared files.
3. **Re-score `--median 3 --ci 90`** per vertical; compare to baseline; keep only if ≥ baseline.
4. Commit + release; record the before→after delta.

## Acceptance
- Each Wave-1 vertical's median ≥ its baseline AND ≥ 90; coverage dimension up.
- No regression: recall/precision/gate hold; all flows still pass e2e + `--validate`.
- Later waves: repeat for the ~94 mid-tier to push toward ≥96 (optional).
