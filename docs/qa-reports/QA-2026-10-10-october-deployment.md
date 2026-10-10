# QA: October feature deployment follow-up

Date: 2026-10-10. Tracking: great_cto-932g.
Scope: PR #173, #175, #176, #163, #167 and the monthly article.
This is a delivery follow-up, not a new mixed-host quality benchmark.

## Released and installed

PR #173, #175 and #176 are merged and published in 3.60.0. Fresh npm metadata
confirmed latest=3.60.0; GitHub v3.60.0 is published at 2026-10-10T10:05:52Z.
Release source: 5cca27d21f0ab922be56b6ebdfe7a6a5282aef69.
Inspected main: 2f395516faea94d060adda0cd6ebd949bc7b8fcf.
[Release QA](QA-2026-10-10-skills-release.md) records the full source gate,
independent reviews, package integrity and fresh registry-consumer verification.

Local installation updated both Claude Code registrations and the Codex cache
to 3.60.0. Independent manifests/registry readback confirmed these artifacts.
The initial installer-started board disappeared after its command completed;
a detached restart was then independently verified, rather than trusting the
installer banner. Repeated localhost:3141 /api/version readback returned
version=3.60.0, installed=3.60.0, stale=no.

Live UI checks covered selected-project Usage, English navigation, Skills and
the selected-project-only scope filter. Usage displayed attributable sessions
of the selected project, not a global table. Skills explicitly reported a
partial scan when the document limit was reached. No skill instructions were
executed. Operator data and screenshots are not committed.

A fresh focused source run passed 31 Usage/English/Skills checks, with zero
failures or skips. Log SHA-256:
57069d416f566aa2b52eba37daded741fc93c3fbeaf5d3f2b28e611f877d16f4.

Old caches and private installation backups are preserved. Artifact installation
does not prove hot-loading into an existing model session; new or changed Codex
hooks still require the host's review.

## PR #163: updater remains a candidate

Current main was integrated and each scheduled refresh now revalidates the Git
marketplace origin before the host-managed upgrade. A fresh read-only Claude
review initially returned REQUEST_CHANGES: launchd could not locate Node for
an npm/nvm launcher. PATH is now resolved into the plist, with XML escaping,
and a real env-node launcher fixture tests that path. Enable relies on RunAtLoad
alone and refuses to restart an active refresh, rather than using kickstart -k.

Fresh static re-review APPROVED the application at 9f457935, session
cafcb6f0-569a-4e2a-9d85-968746c34a69. No tool denials, writes, Bash, hooks or
delegated agents were used. Static approval did not execute tests. The subsequent
1240c0bb delta only constructs fixture PATH using arrays; application files
remain unchanged. Ten updater tests passed without failures or skips; log hash:
7fb6fe7b9738f9f870bdf6aa6975d7e082e8cefc32d830a025d24f820da029b7.

The real Codex CLI confirms marketplace list format and upgrade --json support.
Stable local HOL policy returned score 82, zero Critical, 35 existing baseline
High, nine Medium and eight Info. No baseline entry was added. A prior scan
reported a native abort despite producing a usable report; the subsequent
stable retry completed without that diagnostic. Do not call the aborted process
a clean execution.

Earlier full gates failed on fixture shell-pattern findings, stale screenshot
versions and nine README translation-history checks; missing browser dependencies
left scenarios not checked. Fixture shell data now travels as environment/argv,
the nine guides are synchronized and five screenshots are recaptured against a
synthetic 3.60.0 project. Browser dependencies are installed. The fresh complete
gate at dc02e8072dfbe578b5af91f149ff99ed12e05d45 completed with exit 0:

| Suite | Pass | Fail | Not executed |
| --- | ---: | ---: | ---: |
| Root, hooks and board | 1,346 | 0 | 0 |
| Libraries | 2,579 | 0 | 4 |
| Eval | 238 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Browser board scenarios | 14 | 0 | 0 |
| Installed pipeline L1-L5 | 55 | 0 | 1 |
| CLI | 362 | 0 | 0 |
| Archetype scenarios | 34 | 0 | 0 |

Build, package creation and the pinned HOL policy also passed. The four library
skips are opt-in live Docker/controller/export/mixed-worker scenarios. The
pipeline separately reports its absent historical pytest suite; ci-local's
four-skip summary does not include that additional absence. Neither is a pass.
Separate-suite counts overlap and are not a unique-test total. Complete log hash:
a621cd57cf5502827f712a244d6c0c6851f0f4d814dd9b65b025de569aff32a8.
No updater release, operator timer change or newer-version transition is claimed.

Historical GitHub HOL run 36684344586 attempt 3 failed before execution because
of billing lock, with steps=[]. Current main already removed that workflow and
runs pinned HOL in the mandatory local gate. Branch protection and rulesets
were checked; none are configured. This does not waive the local security gate.

Remaining review notes include no scheduled-command timeout, a pinned script
path requiring a stable checkout, scheduling status not proving a successful
refresh, and frozen Node/Codex paths needing re-enable after removal.

## PR #167: full gate failed; do not deploy

Current main was integrated at 699d9b57. Complete local gate exited 1.

| Suite | Pass | Fail | Not executed |
| --- | ---: | ---: | ---: |
| Root, hooks and board | 1,350 | 0 | 0 |
| Libraries | 3,288 | 7 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Browser board scenarios | 14 | 0 | 0 |
| CLI | 369 | 0 | 0 |
| Archetype scenarios | 34 | 0 | 0 |
| Installed pipeline L1-L5 | 33 | 3 | 9 |

These are separate-suite executions, not unique-test totals. Full log SHA-256:
1c9150b1969d02d68c0ba254daa5959417bd45bef5f09368506b6235984a6267.

The seven library failures concern scorer-kill/helper-kill descendant quiescence,
bounded scorer readiness, a namespace helper missing from the marketplace fixture,
two budget hooks using an obsolete project-root prefix, contrast cleanup deadline
and stale screenshot versions. The pipeline failures explicitly refuse the
installed 3.60.0 artifact's missing candidate-only isolation support before
starting its HMAC/board probes. They are not represented as successful checks.

Installer-test shell interpolation was removed; fresh HOL policy passes with
the existing baseline. cab730db restores HOME root exclusion in budget hooks
and copies shipped source-level namespace modules into the marketplace fixture,
without copying CLI dist or node_modules. The combined regression run passed
10/10 with no skips; hash:
45b0be9d3a408675deb274338ecdfe7e387d46517a2b3f0190b789c1482fa365.
The initial fixture repair still lacked private-state.mjs; that failed rerun is
retained, not counted as success. The final fixture copies only source .mjs.

After the updater gate finished, a bounded isolated rerun at cab730db executed
browser-guardian-helper and pinned-benchmark-scorer with test-concurrency=1.
All 59 tests passed, with zero failures or skips; log hash:
ed5e77c8263b55c5c6f174afec8ef76c6c216e6d816cf730846415411b1ce406.
The scorer-kill/helper-kill quiescence and hostile SIGTERM timeout checks did
not reproduce outside the heavily concurrent library gate. This suggests a
load-sensitive test-lifetime boundary, not a proven production cause or a fixed
full gate. No assertion, timeout or cleanup authority was weakened. The contrast
deadline failure was not included in this isolated rerun. A fresh complete
adaptive gate and installed candidate-isolation proof remain outstanding.

Remaining failures and fresh independent review are tracked in
great_cto-932g.3.1. No adaptive merge or release is approved by this report.

## Article and delivery boundary

[Article draft](../blog/DRAFT-2026-10-10-monthly-product-update-ru.md) now
distinguishes installed 3.60.0 features from #163/#167 still in review.
[Editorial evidence](../analysis/2026-10-10-monthly-blog-fact-check.md) records
source pins and limitations. Initial documentation validation passed 76 tests,
zero failures/skips; hash:
a821fca9f5ff9ac3787f557b5d274cef1a3c745c6793df22668466ca7fa41eb0.

Feature-branch pushes are currently blocked by a workspace-derived common-word
privacy match. A narrowly scoped operator decision was requested; the privacy
configuration and hooks have not been weakened or bypassed. Article PR #177's
remote head therefore does not yet include the local update. Publishing the
article on the blog remains a separate action.
