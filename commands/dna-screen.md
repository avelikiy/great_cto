---
description: "Biosecurity / DURC review. Invokes biosecurity-reviewer for NIH DURC + P3CO applicability, IGSC Harmonized Screening v2, Australia Group export controls, AI bio-uplift evals, open-weights release decision."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/dna-screen** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

B_HITS=$(grep -ciE "dna synthesis|gene synthesis|oligonucleotide|protein design|esm|alphafold|rfdiffusion|pathogen|select agent|gain.of.function|dual.use|bsl.[34]|biocontainment|bwc|p3co|igsc|cloud lab" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$B_HITS" -eq 0 ] && echo "No biosec signals — skipping." && exit 0
```

## Step 2 — Invoke biosecurity-reviewer

`subagent_type: biosecurity-reviewer` — write `docs/sec-threats/TM-biosec-${SLUG}.md` using `skills/great_cto/templates/TM-biosec.md`.

## Step 3 — Surface

Print: flavour (gen-ai-bio / dna-synth / cloud-lab / wet-lab / knowledge), DURC/PEPP applicability, screening DB status, gates (`gate:durc-signoff`, `gate:open-weights-release`).
