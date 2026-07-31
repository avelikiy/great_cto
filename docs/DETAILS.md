# The details the README used to carry

Everything here is current; it moved out of the README because a first-time
reader does not need it to decide whether to try the tool. Linked from the
README's Documentation section.

## Critics before the plan

The most expensive bugs are not in the code — they are in decisions made before
coding starts. Three critic agents run before the Plan stage, at the three
positions where a mistake costs the most:

| Critic | Catches |
|---|---|
| **Architecture critic** | coupling that rules out multi-tenancy later · "obvious" O(n²) on real-scale data · circular dependencies between bounded contexts |
| **Spec critic** | "we solved the wrong problem" — the worst class of bug, because no unit test catches it · misaligned acceptance criteria · scope that was never agreed |
| **Schema critic** | `NOT NULL` without a default on a 50M-row table · missing `CONCURRENTLY` on index creation · irreversible migrations with no rollback path |

## Jurisdiction detection

`npx great-cto init` scans three signal sources — README keywords, infra region
strings (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`), and
`package.json` homepage TLD — and auto-detects which of **12 jurisdictions**
apply:

| Jurisdiction | Signals (README + infra) | Frameworks | Reviewer |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · `ap-northeast-2` | PIPA · ISMS-P · FSC | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

Word-boundary matching prevents false positives (`india` does not match
`indiana`). The result is written to `PROJECT.md` as `jurisdiction: [eu, us-ca]`
and gates the matching reviewer on every feature. Override it there manually.

Beyond GDPR/PCI/HIPAA, reviews cover SEC cyber-disclosure (8-K Item 1.05),
CMMC 2.0 / NIST 800-171 for defense contractors, US AI governance (NIST AI RMF ·
Colorado SB 205 · Utah/Texas AI), web-tracking litigation (VPPA · CIPA ·
Washington MHMDA), and HMDA / SR 11-7 model risk for lending.

## Cost, itemised

Indicative for a solo-CTO project at ~20 pipeline runs a month:

| Pipeline | Cost/run | Runs/mo | Total |
|---|---|---|---|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (new endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

You pay your own LLM provider. No per-seat fee, no SaaS. Routine triage
auto-routes to a cheaper model (~5× lower cost) for a 60–80% reduction on
log clustering.

## CI integration

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` detects `$GITHUB_ACTIONS` and emits `::error file=...,line=N::`
annotations inline on PR diffs. Exit codes: 0 clean / 1 findings / 2 setup error.

## Email alerts

Five events that need you within two hours get emailed — no Resend account, no
API keys; delivery routes through `greatcto.systems/notify` (free, 100
emails/24h per verified address). Setup: board → Notifications → verify your
email → pick triggers.

| Trigger | When |
|---|---|
| P0 incident | a P0 task opens in any project |
| Gate stale > 2h | a `gate:ship` has been waiting on you for hours |
| Security BLOCKED | `security-officer` rejected a merge |
| Budget alert | monthly LLM spend crosses 80% / 100% of budget |
| Weekly digest | Friday 09:00 — shipped, spent, savings, QA |

## Test pyramid

Structural + state-machine tier runs in under 2 minutes for $0
(`node --test tests/*.test.mjs`); the real-LLM tier (archetypes × 4–8 stages,
plus pack overlays and domain reviewers) runs on demand via OpenRouter for
~$5–10. Breakdown: [docs/testing/](testing/).

## Example: three products, one pipeline

Same command, different product — the build archetype shapes the stack:

| | Dispatch app | Class-booking app | Profitability dashboard |
|---|---|---|---|
| Archetype | CRUD vertical-SaaS | Booking / scheduling | Dashboard / analytics |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Integrations | Auth · RBAC | Stripe · Twilio | source connectors |

The 6 pipelines: [greatcto.systems/pipelines](https://greatcto.systems/pipelines) ·
all 26 archetypes: [ARCHETYPES.md](ARCHETYPES.md).
