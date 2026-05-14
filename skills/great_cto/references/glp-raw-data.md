# GLP Raw-Data Definition + ALCOA+ Operational Checklist

> Reference for `glp-glab-reviewer` (W9). What counts as "raw data" under 21 CFR 58 + OECD GLP, with concrete implementations per system type.

## Why this matters

The single most common 483-observation / GLP-deficiency citation is **"raw data not retained" or "raw data overwritten."** Wrong raw-data classification at system-design time produces unreproducible studies + Study Director liability.

## Regulatory definition (FDA 21 CFR 58.3(k))

> "Raw data means any laboratory worksheets, records, memoranda, notes, or **exact copies thereof, that are the result of original observations and activities** of a nonclinical laboratory study and **are necessary for the reconstruction and evaluation of the report** of that study."

OECD GLP and EU GMP Annex 11 use equivalent definitions.

**Three operational tests** — a record IS raw data if **all three** apply:

1. It captures an **original** observation (not a summary, not a transformed output).
2. It is **necessary** to reconstruct the study/batch.
3. It is captured **contemporaneously** with the observation.

## Raw-data classification table (by system type)

### Electronic Lab Notebook (ELN)

| Entity | Raw data? | Why |
|---|---|---|
| Free-text experiment narrative | ✓ | Original observation, contemporaneous |
| Signed experiment summary | ✓ | Reconstructs the experiment |
| Imported instrument PDF report | ✓ (if first system of record) | Original system of record |
| Word-doc summary uploaded after the fact | ✗ | Summary, not contemporaneous |
| Auto-generated dashboard tile | ✗ | Derivation of underlying record |

### LIMS

| Entity | Raw data? | Why |
|---|---|---|
| Sample receipt record (barcode, weight, condition) | ✓ | Original chain-of-custody |
| Test result entered manually | ✓ | Original observation |
| Test result imported from instrument | ✓ | Original system of record (assuming LIMS is SoR; otherwise instrument file is) |
| Result audit-trail entries | ✓ | Reconstruct who-changed-what |
| Aggregated batch report PDF | ✗ | Derivation |

### Manufacturing batch record (eBR)

| Entity | Raw data? | Why |
|---|---|---|
| In-process check value | ✓ | Original observation |
| Operator e-signature on step completion | ✓ | Original action |
| Equipment cleaning log | ✓ | Original chain-of-evidence |
| Deviation investigation form | ✓ | Original record of OOS handling |
| Annual product review summary | ✗ | Derivation |

### Instrument output (HPLC, LCMS, plate reader, etc.)

| Entity | Raw data? | Why |
|---|---|---|
| **Vendor binary chromatogram file** (.d, .lcd, .raw) | ✓ — typically THE raw data | Original detector signal |
| Reprocessed / integrated chromatogram | ✓ if it's the first integration; ✗ if a re-do | Depends on workflow |
| Printed report PDF | ✓ as exact-copy if signed at print time; ✗ otherwise | Loses precision vs binary |
| Csv export of integrated peaks | ✗ usually | Derivation; binary is raw |

**Rule of thumb:** the first electronic record that captures the observation **with sufficient fidelity to recompute downstream results** is the raw data.

## ALCOA+ operational checklist

Map each principle to a concrete system control. Audit by checking that **every** raw-data record passes **every** principle.

| Principle | What it means | Operational implementation |
|---|---|---|
| **A** — Attributable | Who recorded / changed it | Per-user auth (no shared accounts); username in every audit-trail row |
| **L** — Legible | Readable, permanent | UTF-8; PDF/A export; no proprietary closed binary as sole archive |
| **C** — Contemporaneous | Recorded at time of observation | Server-side UTC timestamp; client time only for display |
| **O** — Original | First-record or true copy | Raw stored immutably; edits create new records, never overwrites |
| **A** — Accurate | Error-free; visible edits | Edit audit trail includes before/after + reason for change |
| **+ Complete** | No orphan / missing fields | Schema constraints + reviewer SOP catches gaps |
| **+ Consistent** | Same data presented same way | Single source of truth; views derive from raw |
| **+ Enduring** | Archived for retention period | Off-line backup + retrieval drill annually |
| **+ Available** | Retrievable when needed | Document retrieval procedure; SLA for inspector requests |

## Raw-data retention schedule

| Study type | Minimum retention (US FDA) | Notes |
|---|---|---|
| GLP non-clinical (21 CFR 58) | 2 years after marketing application OR study completion if not submitted | Per OECD: minimum 10 years usually applies |
| GMP batch record (21 CFR 211) | 1 year past expiration date; 3 years from distribution for OTC | Quality records: at least 1 year past expiry |
| Clinical (21 CFR 312/314 + ICH E6) | 2 years after marketing approval OR study completion | EU CTR: 25 years |
| Electronic records (21 CFR 11) | Retain throughout record retention period of the predicate rule | Must remain readable + reproducible |

## System-design questions (use at PROJECT.md / ARCH phase)

1. **What is the system of record for this observation?** If multiple systems claim it, only one can be raw — designate explicitly.
2. **Is the raw record immutable?** If the storage allows in-place UPDATE / DELETE, you cannot claim raw-data integrity. Use append-only tables + chained hashes OR write-once storage (WORM / object-lock).
3. **Is the audit trail at least as immutable as the raw data?** Same constraint — audit cannot be edited.
4. **Can an inspector retrieve specific records in a readable format?** Test with a quarterly retrieval drill.
5. **Are vendor binary files retained alongside human-readable exports?** Both, not either.
6. **If the system is decommissioned, where do records go?** Migration plan signed BEFORE the old system is shut down.

## Common pitfalls (from FDA 483 + EMA inspection patterns)

| Pitfall | Fix |
|---|---|
| Audit trail can be disabled by admin | Make audit-trail config itself audit-tracked; require dual sign-off to disable |
| Audit trail review only happens before batch release (too late) | Periodic (monthly) trail review SOP, reviewer ≠ system admin |
| Date-time stored only in local time | Use UTC + display TZ separately |
| Excel sheet used for raw data | Excel is unsuitable for raw — no native audit trail. Use validated system |
| Reanalysis "for clarity" without retaining original | Always retain prior reduction; new analysis is a new record |
| Shared user accounts for instrument PCs | Per-user accounts; map operator to record via auth |
| PDF export treated as raw when binary still exists | Binary remains the raw; PDF is an exact-copy snapshot |

## Cross-refs

- `agents/glp-glab-reviewer.md`
- `skills/great_cto/packs/drug-discovery-pack.md`
- `skills/great_cto/templates/TM-glp.md`
- `skills/great_cto/templates/21CFR11-checklist.md`
- `tests/eval/EVAL-glp-alcoa-tamper.md`

## Sources

- 21 CFR Part 58: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-58
- 21 CFR Part 11: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11
- OECD GLP: https://www.oecd.org/chemicalsafety/testing/oecdseriesonprinciplesofgoodlaboratorypracticeglpandcompliancemonitoring.htm
- MHRA GxP Data Integrity guidance (2018): https://www.gov.uk/government/publications/guidance-on-gxp-data-integrity
- FDA CSA guidance (2024): https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-system-software
- ISPE GAMP 5 (2nd ed. 2022)
