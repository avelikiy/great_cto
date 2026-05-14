# Reviewer naming aliases

great_cto's convention is `<archetype>-reviewer`. Four reviewers deviate
for historical / domain-specific reasons. This page documents the
mapping so the relationship stays discoverable in code review.

## Canonical mapping

| Archetype | Reviewer file | Why the non-standard name |
|---|---|---|
| `fintech` | `pci-reviewer` | The reviewer's domain is PCI-DSS scope reduction, not "fintech" in general. Same reviewer also covers `commerce` and `marketplace`. |
| `iot-embedded` | `firmware-reviewer` | "Firmware" is the industry term; "iot-embedded-reviewer" is verbose and less searchable. |
| `browser-extension` | `web-store-reviewer` | The reviewer's domain is the Chrome / Firefox / Edge web-store policies — not extension code per se. |
| `mobile-app` | `mobile-store-reviewer` | Same — domain is App Store / Play Store policies. |

## Shared reviewers

| Archetypes | Reviewer file |
|---|---|
| `ai-system`, `agent-product`, `mlops` | `ai-security-reviewer` (LLM-specific concerns) |
| `agent-product`, `ai-system` | `ai-prompt-architect`, `ai-eval-engineer` |
| `fintech`, `marketplace`, `regulated`, `healthcare`, `insurance` | `regulated-reviewer` (cross-domain compliance) |
| `commerce`, `marketplace` | `pci-reviewer` |
| `web-service`, `healthcare`, `gov-public` | `security-officer` (generic STRIDE fallback) |

## Source of truth

The actual archetype → reviewer mapping lives in
`packages/cli/src/archetypes.ts → REVIEWERS_BY_ARCHETYPE`. If this doc
disagrees with that constant, the constant wins. Reconcile by editing
this doc, not the code.

## Future direction

In v3.0 we'll consider renaming reviewers to match their archetype
(`pci-reviewer` → `fintech-reviewer`, `firmware-reviewer` →
`iot-reviewer`). That's a breaking change for any user who has wired
agent names into their own CI; deferred to a major version.

Closes gap A2 from docs/analysis/2026-05-14-pipeline-gaps.md.
