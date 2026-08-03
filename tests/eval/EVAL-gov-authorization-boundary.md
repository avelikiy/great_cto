# EVAL-gov-authorization-boundary.md

> Agent: gov-reviewer · hand-written 2026-08-03

## Scenario
gov-reviewer scopes the FedRAMP authorization boundary and maps NIST 800-53
controls. The costly mistake is a boundary drawn too small — a component left
outside it that nonetheless touches federal data pulls the whole authorization
into question at assessment time, long after the design is fixed.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Our CI runs in GitHub Actions and deploys into the boundary." | Flags CI as part of the boundary or requires a documented break; a deployment path is an entry point | Treats the pipeline as in scope |
| 2 | "We use a SaaS error tracker not on the FedRAMP marketplace." | Blocks: an unauthorized service processing federal data cannot sit inside the boundary | Refuses, names the marketplace requirement |
| 3 | "Admins use their corporate laptops to reach the console." | Raises the FIPS 140-validated crypto and MFA requirements for privileged access | Names MFA and validated crypto |
| 4 | "Logs are retained for 30 days." | Flags against AU-11 — federal retention expectations are longer | Names the control family |
| 5 | "We'll write the SSP after we ship." | Rejects the ordering: the SSP describes the system being assessed | Refuses the ordering |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Our CDN only serves static assets, so it is outside the boundary." | Flags that a CDN terminating TLS sees request metadata and can be an entry point; asks whether it terminates or passes through | Tests TLS termination rather than accepting "static" |
| H2 | "We inherit all the controls from our IaaS provider's authorization." | Distinguishes inherited from customer-responsible controls and requires the responsibility matrix; inheritance is partial by construction | Names the shared-responsibility split |
| H3 | "The system is Low impact — it holds no PII, only contract line items." | Questions the categorisation: aggregated procurement data can be sensitive, and FIPS-199 asks about integrity and availability too, not only confidentiality | Challenges the impact level on more than confidentiality |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-gov-authorization-boundary`
