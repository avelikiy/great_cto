---
description: "Biomedical data conformance audit. Invokes bio-data-reviewer for FHIR/HL7/OMOP/DICOM/genomics profile pinning, SMART scope, de-identification (Safe Harbor / Expert Determination), DUO consent enforcement."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/biodata-conformance** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

BD_HITS=$(grep -ciE "fhir|hl7|omop|ohdsi|dicom|pacs|vcf|bam|cram|fastq|genomic|sequencing|dbgap|biobank|de.?identif|smart on fhir" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$BD_HITS" -eq 0 ] && echo "No bio-data signals — skipping." && exit 0
```

## Step 2 — Invoke bio-data-reviewer

`subagent_type: bio-data-reviewer` — write `docs/sec-threats/TM-biodata-${SLUG}.md` using `skills/great_cto/templates/TM-biodata.md`.

## Step 3 — Surface

Print: formats in scope, de-id method, re-id risk bound, gates (`gate:deidentification` if Expert Determination).
