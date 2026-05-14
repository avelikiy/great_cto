---
description: "Drug-discovery ML model review. Invokes drug-discovery-ml-reviewer for split discipline (scaffold/time/cluster), applicability-domain detection, uncertainty calibration, ChEMBL/BindingDB version pinning, generative output filters (PAINS/SA/IP), wet-lab feedback dashboard."
argument-hint: "[slug]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/drug-ml-review** command.

## Step 1 — ARCH

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
[ -z "$SLUG" ] && SLUG=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')
ARCH="docs/architecture/ARCH-${SLUG}.md"
[ ! -f "$ARCH" ] && echo "BLOCKED" && exit 1

DML_HITS=$(grep -ciE "drug discovery|binding affinity|admet|toxicity|generative chem|generative protein|antibody design|mrna design|virtual screening|docking|fep|alphafold|rfdiffusion|chembl|bindingdb" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
[ "$DML_HITS" -eq 0 ] && echo "No drug-discovery ML signals — skipping." && exit 0
```

## Step 2 — Invoke drug-discovery-ml-reviewer

`subagent_type: drug-discovery-ml-reviewer` — write `docs/sec-threats/TM-drugml-${SLUG}.md` using `skills/great_cto/templates/TM-drugml.md`.

## Step 3 — Surface

Print: models in scope, split discipline status, AD detector + UQ calibration status, gates (`gate:model-card-signoff`). Trigger biosec handoff if dual-use designs.
