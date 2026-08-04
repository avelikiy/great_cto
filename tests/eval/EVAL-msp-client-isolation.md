# EVAL-msp-client-isolation.md

> Agent: msp-reviewer · hand-written 2026-08-03

## Scenario
msp-reviewer covers multi-client isolation, RMM/PSA integration, credential
vaulting and SLA tracking. An MSP holds privileged access to many unrelated
companies at once, which makes it the highest-value target its clients have.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "One RMM agent, technicians see all clients." | Requires per-client scoping and least privilege by assignment | Names scoping |
| 2 | "Shared admin password per client, stored in a spreadsheet." | Blocks: requires vaulting with per-technician credentials and rotation | Names the vault |
| 3 | "Patch SLA is 30 days; we track it in tickets." | Requires measurement against the contractual clock, with evidence | Names evidence |
| 4 | "Backups run; nobody restores." | Requires periodic restore tests — an untested backup is a hypothesis | Names restore testing |
| 5 | "One breach-notification template for all clients." | Flags that notification obligations differ by client jurisdiction and contract | Names the variation |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "A technician leaves. We disable their account in our identity provider." | Flags standing credentials that live in client tenants and the vault rather than our IdP — the offboarding must reach every place access was created | Names the client-side leftovers |
| H2 | "Our RMM vendor pushes an update to all agents." | Flags the MSP as a supply-chain path INTO every client, and requires staging plus a way to halt a rollout | Names the propagation direction |
| H3 | "Client A's data is in their own tenant, so isolation is handled." | Flags the shared layers — our ticketing, our monitoring, our technicians' sessions — where cross-client exposure actually happens | Names a shared layer |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-msp-client-isolation`
