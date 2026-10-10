# Independent review: stacked board release

Scope: PR #173 (project Usage), #175 (English UI), #176 (read-only Skills).
Tracking: great_cto-f33n.6 and great_cto-f33n.6.1.
Implementation evidence: [Skills verification](QA-2026-10-10-skills-inventory.md).

## Initial independent verdict: BLOCKED

Reviewed source: e4c89469d51478c5aac4a15a939db0d7d19b6607.
Reviewer: a fresh, bounded Claude Code process, read-only Read/Glob/Grep tools,
safe mode, no Bash, no writing, no hooks or delegated agents. The selected
default model was claude-fable-5-1. This was static review, not an executed
test run or a GitHub approval. A successful reviewer process is not approval.

| Finding | Severity | Disposition |
| --- | --- | --- |
| F1: verdict writer uses slug/basename while scoped reader uses raw query name | High, blocking | Reproduced with the actual verdict writer; aliases now come from the registered root and PROJECT.md, not the URL label. Foreign/ambiguous aliases stay excluded. Fresh review still required. |
| F2: unregistered server root gets an invented project query | Medium | UI distinguishes server default from explicit URL selection. An explicit unknown selection still fails closed. Added UI and real-browser regressions. |
| F3: sessions without recoverable identity are excluded | Medium | Project statistics now explicitly disclose attribution exclusions and existing-worktree limits. Coverage counters remain a separate tracked follow-up. |
| F4/F5: raw HOME roots can select new read models, including Beads reads | Low | Skills, Usage and Outcomes accept registered roots or the server root, not arbitrary HOME directories. Added API regressions. |
| F6: cache pressure evicts an active worker result | Low | Active cache entry is pinned; a bounded cache with no available eviction slot returns computing. Added a pressure regression. |
| F7: bundle-import check assumes a build exists | Low, conditional | The mandatory local gate builds first. Fresh TypeScript build and isolated bundle check remain required. No claim of remote CI execution; relevant GitHub workflows are disabled. |
| F8: missing selected root prevents partial host inventory | Low | Explicit unavailable response, not a fabricated empty inventory. Partial-source recovery is a separate tracked follow-up. |
| F9: older statistics routes do not restrict HTTP methods | Informational | Existing read-only behavior; no mutation was found. |
| F10: escaping and English locale scope | Informational | No demonstrated XSS or translation regression; browser validation remains required. |

Four regression checks failed before their corresponding fixes: missing local
verdicts, unregistered roots in Skills and statistics, and eviction of an active
usage scan. The pre-fix focused run had 10 passes, 4 failures, no skips.

## Additional gate failures retained

The first full gate found a stale generated architecture map and an installed
3.59.1 CLI cache without dist/main.js. The map was regenerated. Dependencies
and TypeScript output were prepared in that same installed version; its version
and plugin manifests were not changed.

The next gate passed 1,331 root/hooks/board checks, then found an ADR fixture
under the decision-log directory and two unlinked dependency QA reports. The
fixture now uses docs/adr, and the reports are linked from Skills verification.
That known-failing gate was deliberately interrupted before completing the
remaining suites. It is not a successful full run.

The combined focused rerun passed 27 checks without failures or skips. It does
not replace the mandatory full release gate or a fresh approving review.

## Release status

Not yet approved or published by this report. Evidence-ledger implementation,
unrelated pull requests, live-model benchmarks and full host-compatibility
claims are outside this release scope. No security exception is being used.
