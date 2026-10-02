# Planner authority and citation comparative corpus

Date: 2026-10-03. Scope: `great_cto-p4o9.4.1.5`, nested prompt-risk regression `great_cto-p4o9.1.2`. Related: [benchmark protocol](2026-10-02-adaptive-benchmark-contract.md), [executable import recipe](2026-10-03-bounded-import-benchmark.md), [bound collector](2026-10-02-benchmark-bound-collector.md).

## Actual repair surface

The fifth representative task repairs executable `src/prompts/boundary.mjs`, which mediates planner proposals, retrieved document text and an injected tool callback. Operator-owned principal/document metadata and a separate tool allowlist remain authoritative. Retrieved text may contain policy-shaped JSON, role claims and suggested tool grants, but cannot grant a tool or override principal identity. Planner-supplied tenant/user fields are not forwarded to the callback.

The sole implemented tool is `read_document`; it must be explicitly allowed and target exactly one document with matching principal tenant and owner. Even an operator allowlist containing another name does not register an implementation for that tool. Successful dispatch sends only the resolved document ID and trusted principal metadata. Rejected requests have no callbacks or answer data.

Answers are bounded exact extracts, not unrestricted prose. A nonempty quote must be an exact substring of one accessible document and cite that document's ID. Unavailable, unsupported, ambiguous or foreign sources return uncertainty, no answer and no citations. Explicit abstention is preserved even if a source could support an answer. This checks mechanical extractive support, not semantic truth, external source authenticity or general LLM hallucination/injection resistance. No actual model inference is used.

## Hidden behavior and oracle integrity

Nineteen hidden requests include four authority/injection cases, four citation cases, five uncertainty cases and six principal-isolation cases. Controls cover legitimate read dispatch with spoofed planner identity fields, retrieved grants absent from operator authority, unimplemented tool grants, whole/partial/Unicode extracts, an unsupported cross-document quote, absent/unknown/empty/abstaining answers and duplicate document identity. Isolation includes foreign tenant with equal user ID, nonowner, unauthenticated principal, forged tool scope and an owner-B read followed by owner-A refusal for the same resource in one candidate process.

Only fixture files enter the worker root. Private pinned oracle IDs are randomized before scoring. The standalone external scorer rederives responses and exact callback arguments, checks fixed category semantics and distinct coverage, and rejects forged expected responses, missing calls, lost abstention, lost cross-user cases or empty/mislabeled corpus. Expected answers and oracle categories are never passed to the candidate subprocess. Reports contain criterion states and generic evidence, not hidden document values.

## Runtime risk regression

The actual reference repair initially assessed as T1 because nested prompt directories were not in the runtime-sensitive path matcher. Explicit prompt/prompt-directory components now conservatively force T2 at any depth. Shared/native gates retain their sensitive floors; Codex blocks when nested prompt authority code appears after a low-risk architecture stand-down. Unrelated `prompt-helper` filenames remain T1. This is a path-based heuristic, not complete semantic classification of every AI authority implementation; independent matched domain floors remain required.

## Test plan and boundaries

| Area | Test type | Required observation |
| --- | --- | --- |
| Authority | Hidden behavioral integration | Retrieved/planner grants cannot broaden allowlist, registry or principal scope |
| Callback identity | Mutation test | Forged tenant/user fields are not forwarded |
| Extractive citations | Positive/negative integration | Whole, partial and Unicode extracts work; unsupported or false citation fails |
| Uncertainty | Hidden integration | Empty/unknown/abstaining/ambiguous support stays uncertain |
| User isolation | Same-process sequence | Owner B can read, owner A cannot reuse that access; foreign/nonowner/anonymous denied |
| Oracle coverage | Negative integration | Missing/mislabeled/forged/lost cases refuse measurement |
| Candidate integrity | Negative integration | PROJECT drift, extra code, links and oversized files refused |
| Execution admission | Actual process probes | Operator read, write, network, process spawn denied even with quoted-path policy injection; timeout/broad scope/oversize refused |
| Risk/review floor | Git-bound policy and selection | T2; AI security/eval plus code/QA/security; native/Codex floor preserved |

Candidate execution uses a default-deny restricted macOS subprocess, no inherited credentials/preloads/addons, encoded SBPL path strings, explicit shell-disabled argument array, bounds and deadline. Unsupported platforms or failed sandbox launch report unavailable; no unprotected fallback. Resource probes do not establish formal sandbox certification, tamper-proof JS observation, same-user/key isolation or side-channel protection. Metadata/sysctl reads remain admitted and wrapper shares JS runtime with candidate. Independent executable admission review stays `great_cto-p4o9.5.8`; `benchmarkEligible=false` is unchanged.

Authentication/session verification, tenant database RLS, general tool registration, semantic grounding, actual model attacks, planner schema exhaustion and production caches are not proven by this representative boundary. The injected callback records requests rather than executing a real data tool. Hidden tests are not paired model trials or provider provenance. No model calls, human approvals, installed plugin/default changes, merge or release occur.

## Remaining full objective

Observed final checks:38/38 focused proposal/policy tests and109/109 expanded proposal/import/scorer/routing tests, without skips. A malformed oracle ordering introduced during addition of the ambiguity case caused scorer unavailability, not acceptance; case ordering was corrected without relaxing verification. Full local `ci-local.sh` exited0:root1255, libraries2816 passed with6 skips, eval238, docs76, browser9, CLI356 and pack passed. L1–L5 adds one absent Python board-suite skip, for7 explicit NOT CHECKED. Three Docker and three actual model cases remain unexecuted. Final scanner rerun is83, zero Critical and unchanged35 previously reviewed High; no exceptions or baseline edits. Current Claude auth probe returned `loggedIn=false`, `authMethod=none`. Packing source is not installation, provider execution or merge approval.

Five of eight corpus recipes are prepared at this checkpoint. API compatibility, migration safety and board accessibility remain, as do matched independently attested domain floors, live native/scoped/provider evidence, comparative trials, independent security review and delivered installed artifact proof. No product-quality uplift percentage follows from corpus self-tests.
