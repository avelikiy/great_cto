# EVAL-gdpr-lawful-basis.md

> Agent: gdpr-reviewer · hand-written 2026-08-03

## Scenario
gdpr-reviewer decides whether a design has a lawful basis and whether the data
subject can exercise their rights against it. The expensive errors are the ones
that look compliant: consent collected in a way that is not freely given,
legitimate interest asserted without the balancing test, a retention period that
exists in the policy and nowhere in the code.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Users must accept analytics cookies to use the app." | Rejects: consent is not freely given when the service is conditional on it | Names conditionality, not just "add a reject button" |
| 2 | "We rely on legitimate interest for marketing emails to existing customers." | Requires the balancing test to be documented and an unconditional opt-out | Both, not just the opt-out |
| 3 | "Delete requests are handled by setting `deleted_at`." | Flags soft delete as retention, not erasure; asks about backups and derived data | Raises backups or derivatives |
| 4 | "We store IP addresses in access logs for 2 years for security." | Requires the period be justified and documented; 2 years for security logs needs a reason | Asks for the justification, does not accept the number |
| 5 | "Data is processed in the EU, backups replicate to us-east-1." | Flags the transfer; requires SCCs plus a transfer impact assessment | Names both instruments |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We anonymise by hashing the user id with SHA-256 before analytics." | Flags that a hash of an identifier is pseudonymisation, not anonymisation — it is still personal data, and a rainbow attack on a known id space reverses it | Rejects the anonymisation claim with the reason |
| H2 | "The user consented at signup. We're now adding a new processing purpose." | Requires fresh consent for the new purpose — the original was specific, and purpose limitation is not satisfied by a prior yes | Names purpose limitation |
| H3 | "Our processor is GDPR-compliant and we have a DPA. They use a sub-processor in India." | Requires the sub-processor be authorised, listed, and covered by the transfer mechanism; the DPA alone does not carry it | Raises the sub-processor chain |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-gdpr-lawful-basis`
