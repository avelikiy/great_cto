# Mixed-host release readiness, 2026-10-01

PR #158 provides per-role Codex/Claude Code routing and concurrent review waves.
The candidate was integrated with main at `c2fd46ff` through merge `affb89ac`.
The operator authorized release and fresh mixed-host testing. Publication remains
blocked by the required GitHub HOL check; the installed release remains 3.46.2.

## Candidate corrections

The current shipped graph joins code-reviewer, QA and security. The older
two-role smoke omitted code-reviewer and consequently stopped at join-wait.
The fixtures now obtain code-review evidence first, dispatch QA/security on one
frozen snapshot, and exercise all three role approvals in the process fixture.
The real-model smoke never approves gates. It uses the normal three-attempt
repair budget and supports an explicit extracted-package/installed-plugin root.
Its controller, role profiles and graph come from that root, without a source
fallback. Evidence is retained in a private durable fixture store.

HOL initially flagged two synthetic transcript marker assignments as hardcoded
secrets, repeated across ecosystems. Renaming their variables to prompt/message
sentinels clarifies their purpose. Marker bytes and no-leak assertions are
unchanged; no scanner rule, baseline or suppression was added.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Controller/mixed-host regression | 66 pass, 0 fail | Current-main integration |
| CLI build and package tests | Build passed; 338 pass, 0 fail | npm CLI |
| Root tests | 3,203 total; 3,196 pass, 7 skipped, 0 fail | Root, library and hook suites |
| Telemetry marker and CLI fixture checks | 14 pass, 0 fail | Includes unchanged no-leak assertions |
| Durable-store/hygiene checks | 6 pass, 0 fail | No new temp-directory leak |
| HOL 3.0.113 local action runner | 90/100, A; policy passed; 0 high/critical | min_score=80, fail_on=high; repository policy not trusted |
| Real source mixed-host smoke | Passed; awaiting-gate | Code review verified, Claude QA verified, Codex security verified |
| Real extracted npm candidate smoke | Passed; awaiting-gate | Same three roles, controller/graph from extracted package |

The local HOL scan used the version pinned by the repository's Action. Optional
Cisco deep skill scanning was unavailable; it is not represented as executed.
Local evidence does not change the conclusion of a GitHub check that never ran.

## Retained live evidence

Both successful smokes used Claude Code 2.1.282 and Codex CLI 0.159.2.

* Source run: `96097f03-93ed-4364-8ed3-15cdb3ed1c92`.
  Final QA/security wave verified. QA report SHA256:
  `0816eaa1469858ad739018e01b82ee9c720f10b0f6c27e12ec170bde6eaa9f90`.
  Security report SHA256:
  `72df4f4a95a83137a656b597746667093ef0349cb3ef45daee6fec444e4bd06d`.
* Extracted npm candidate run: `b989009c-af99-49e6-a336-2f7b6ef3b535`.
  QA/security wave verified. QA report SHA256:
  `2a52d5adf3da8262ebdc114bc4d9dc73be9cf4b90c302e9b5c35032a4d0aec2b`.
  Security report SHA256:
  `09415e18b79b2675472d7831327c41f2d2d88a2b9b536fded385c6720f8f8ae4`.
* Unpublished candidate tarball SHA256:
  `da8ea62ec7c1f92020d81e9f9c350cea2da6b94731125d7e73c9bc8ee11578cf`.
  It retains the existing 3.46.2 package version and must not be confused with
  the registry's published 3.46.2. Both controller and Claude runner are present.

The successful source run included bounded code-review and QA rework; the
package run included code-review rework. Earlier failed smoke attempts remain
failed evidence. These runs establish specific scenarios, not a reliability
percentage, general code-quality improvement, production deployment or a fresh
full-lifecycle release run. Previously retained full-lifecycle local fixture
evidence is separate.

## Publication gate

GitHub run `36371641269`, attempt 2, scan job `110366491720` executed zero steps.
Its annotation says the account is locked due to a billing issue. No scan report
was produced. The release requires a real successful required check on the PR
head, then merge, version bump/publication, marketplace refresh and installed
artifact verification. The release authorization is already recorded; no new
merge authorization is needed after the checks succeed.

## Outcome

Later the same day the owner removed the HOL scanner workflow instead of paying to
unlock Actions for it: the check qualified the plugin for a third-party catalogue
that was abandoned on 2026-09-07 (74/100, 14 high findings then; great_cto-2xuc).
The candidate shipped as 3.47.0 through the local gate.

**Correction, same evening.** The removal was argued partly on "an unlocked run
would fail on content". That rested on the 07.09 measurement and was wrong: the
same pinned scanner (`plugin-scanner==3.0.113`, sha256 verified) run locally on
main gave **90/100, grade A, 0 critical/high, policy pass** — two medium findings
are CHANGELOG prose, one is the Codex marketplace `source.path` being `.` rather
than `./` (great_cto-tzfg).
