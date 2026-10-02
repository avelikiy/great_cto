# Host quality pilot, 2026-10-02

## Artifact and scope

PR #158 merged as `a1ebef9e131e664994639f6ce9a40e972f35c776` on October 1.
GitHub release v3.47.0 was published at 14:37:35 UTC. This pilot imported adapters,
role profiles and proposal validation directly from the installed Codex plugin
cache at version 3.47.0, not the benchmark implementation branch.

The new harness compares three-call implementation/review/repair slices. It is
not a full product lifecycle or a measurement of parallel review throughput.
The frozen initial corpus has three tasks, twelve deterministic cases each.
See `tests/eval/EVAL-host-quality-benchmark.md` for methodology and limitations.

## Actual execution

CLI preflight reported Codex 0.159.2 and Claude Code 2.1.282 as available.
Nevertheless every attempted Claude call returned exit code 1, with:

`Failed to authenticate: OAuth session expired and could not be refreshed`

| Task / arm | Outcome | Hidden checks | End-to-end time |
| --- | --- | --- | --- |
| money / Codex-only | Implementation, review and repair completed | Initial 12/12; final 12/12 | 109.340 seconds |
| money / Claude-only | Authentication blocked at implementation | Not scored | 1.874 seconds to failure |
| money / mixed | Codex implementation completed; Claude reviewer authentication blocked | Not scored as completed task | 52.969 seconds to failure |
| retry / Claude-only | Authentication blocked at implementation | Not scored | 0.858 seconds to failure |
| retry / mixed | Operator interrupted implementation after confirming global auth blocker | Not scored | Not available |

The original driver continued beyond a failed host while the operator inspected
the diagnostic. It was stopped, along with the specifically observed active
Codex process group. The retained running row was explicitly marked interrupted;
no result was synthesized. The revised driver recognizes authentication failure
as a terminal study blocker and dispatches no subsequent arms. A mocked process
integration test exercises this stop behavior without paid model calls.

## Conclusion

There are **zero complete matched task blocks** across all three arms.
Consequently quality deltas, relative improvement and confidence estimates are
unavailable. Authentication failure is not a product-quality score of zero.
One successful Codex-only task does not establish superiority or reliability.
Its initial score already reached the corpus ceiling, so this case cannot show
additional improvement from review even if the other arms subsequently pass.

All successful Codex stage model fields were null; configured model metadata
does not prove effective model identity when the adapter ignores user config.
Raw token usage is retained, but dollar costs are unavailable and not comparable.

Private evidence directory:
`/Users/Shared/great-cto-acceptance-501/mixed-release-AdBG8k/`.
It retains report.json, exact prompts and responses, generated implementations,
input/output hashes and per-stage usage. These are partial-run evidence, not a
completed benchmark result. No credentials are needed in public reports.

Resume requires human Claude reauthentication (`claude auth login` in a terminal),
then a fresh matched run of all arms. Do not stitch a refreshed Claude run onto
this interrupted study and present it as one controlled experiment.
