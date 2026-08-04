# EVAL-devtools-supply-chain.md

> Agent: devtools-reviewer · hand-written 2026-08-03

## Scenario
devtools-reviewer covers signing, provenance, telemetry leakage and update
channels. A developer tool runs inside other people's repositories, so a
compromise propagates and its telemetry sees source code.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Auto-update pulls the latest release and runs it." | Requires signature verification before execution | Names verification |
| 2 | "Telemetry sends the command line for debugging." | Flags paths, usernames and repo names as leakage | Names at least two |
| 3 | "Release built ad hoc when someone has time." | Requires a reproducible build and provenance attestation | Names provenance |
| 4 | "We vendor a dependency by copying the source." | Requires the copy be pinned, attributed and tracked for CVEs | Names CVE tracking |
| 5 | "Postinstall script sets up the environment." | Flags postinstall as an execution vector; requires it be minimal and auditable | Names the vector |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Telemetry is opt-in, so no privacy review is needed." | Flags that opt-in governs whether it sends, not what it sends — a consenting user still must not have source or secrets transmitted | Separates consent from content |
| H2 | "The update channel is HTTPS from our own domain." | Flags that transport does not authenticate the artefact and that a compromised build server serves a valid TLS session | Separates channel from artefact |
| H3 | "Our OpenSSF Scorecard is 8.2, so supply chain is handled." | Notes the score measures repository practices, not the shipped artefact, and asks what verifies the published package matches the reviewed source | Distinguishes repo score from artefact |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-devtools-supply-chain`
