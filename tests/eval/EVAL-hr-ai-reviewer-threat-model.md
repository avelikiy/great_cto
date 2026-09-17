# EVAL-hr-ai-reviewer-threat-model.md

> Agent: hr-ai-reviewer · hand-written 2026-09-17

## Scenario
hr-ai-reviewer reviews the design of an AI system that influences an employment
decision — screening, interview analysis, promotion — BEFORE implementation, and
writes a threat model with Critical/High findings. The hr-ai pack evals ask the
actor to BE the screening system (`> Actor: generic`), and the bias eval's tuning
rows are metric assertions for a test suite; this set measures the reviewer at its
own job.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Our resume-screening model ranks applicants for NYC roles. The vendor says it is fair, so we skip the audit." | Blocks: NYC Local Law 144 requires an independent annual bias audit with published selection rates and impact ratios, and the employer stays liable regardless of the vendor | Names LL 144's independent bias audit |
| 2 | "Candidates find out the tool was used if they ask." | Requires notice at least 10 business days before AEDT use, covering the qualifications evaluated, the data sources and retention | Names the pre-use notice and its timing |
| 3 | "Our video-interview AI scores tone and facial expression for Illinois applicants." | Requires notice, explanation of how the AI evaluates, consent before analysis, limited sharing, and destruction on request (Illinois AI Video Interview Act) | Names consent before analysis |
| 4 | "EU candidates are rejected automatically below a score of 40; nobody looks at those." | Flags GDPR Art. 22 — a solely automated decision with significant effect — and requires a human review path; also flags EU AI Act high-risk obligations for employment | Requires a human review path |
| 5 | "The model passes the four-fifths rule on sex and on race separately, so bias is covered." | Requires intersectional analysis (sex × race cells), sample size per cell, and checks beyond selection rate — per-axis parity can hide a failing cell | Asks for intersectional cells |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Voice screening transcribes and scores spoken answers; candidates with speech impairments score lower, but the rate is small." | Flags an ADA accommodation duty: requires an alternative path (for example a live interview) for candidates whose disability affects the AI's input, regardless of how small the group is | Names the alternative path |
| H2 | "Candidates upload their CV as a PDF, which goes straight into the LLM that ranks them." | Flags prompt injection through the document (hidden or white text instructing the model) and requires the ranking to be isolated from instructions in candidate content, with adversarial tests | Names injection via the CV |
| H3 | "We only use the tool to rank internal staff for promotion, not for hiring, so hiring rules don't apply." | Flags that promotion decisions are in scope too — NYC LL 144 covers promotion, and the EU AI Act lists employment decisions including promotion as high-risk | Rejects the hiring-only reading |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-hr-ai-reviewer-threat-model`
