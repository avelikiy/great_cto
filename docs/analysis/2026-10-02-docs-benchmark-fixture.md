# First representative benchmark fixture and pinned scorer process

This implements the `docs-low-risk` task cluster, one of the eight groups in
the [registered experiment contract](2026-10-02-adaptive-benchmark-contract.md).
It is not a full corpus, live mixed-host measurement or benchmark eligibility
certificate.

## Candidate and operator boundary

`docsBenchmarkFixture()` in `scripts/lib/docs-benchmark-fixture.mjs` returns
two separate objects. Only `files` belong in a fresh candidate Git repository:
a service source module, package configuration, project declaration and three
documentation files. The documentation index has two real broken navigation
links; both intended targets already exist. The defective tree is committed
before implementation so repairing its index yields a T0 diff containing only
`docs/README.md`. Current specialist selection independently derives the three
mandatory delivery reviewers from this fixture context.

The `oracle` object belongs outside the worker project in a private operator
file. It pins baseline file hashes, protected source/config inventory, required
navigation labels and targets, and the exact two registered acceptance criteria.
The scorer code also belongs outside the worker project. Both files must have
no group/other permissions and must be canonical regular files. Their exact
SHA-256 values must be frozen before a trial's first worker call.

No real model trial was run by the development tests. Materializing a fixture
does not itself freeze a complete trial registration. The seven other task
groups, matched artifact execution and corpus-wide review-floor audit remain
required.

## Separate execution

`runPinnedBenchmarkScorer()` in `scripts/lib/pinned-benchmark-scorer.mjs` reads
bounded, pinned external code and oracle bytes. It starts a separate Node
process with the **verified source bytes on stdin**, not an executable source
filename that could change after verification. The process receives no inherited
`NODE_OPTIONS`, preload, credentials or ambient application environment. Its
working directory is outside the candidate project.

The supplied standalone docs scorer imports only Node builtins and never loads
candidate JavaScript, package hooks or dependencies. It inspects bounded regular
files, refuses symlinks and unsafe/unsupported navigation, checks baseline
source/config hashes and rejects additional non-document source/config files.
Deleting required links or target files cannot turn a failing task into a pass.
The fixture supports inline relative Markdown links, without anchors, reference
links, HTML or remote targets. This is an explicitly bounded fixture grammar,
not a general Markdown renderer or website crawler. Runtime exclusions are only
the two declared event log paths, not arbitrary ignored configuration.

The parent checks the supplied Git receipt before scoring and again afterwards.
The shared [receipt-reader hardening](2026-10-02-receipt-executable-boundary.md)
disables executable Git diff/textconv/filter/monitor helpers during that inspection.
It separately fingerprints baseline inputs, including ignored PROJECT.md, so
Git's ignore policy cannot conceal a baseline-input mutation during execution.
Output must match the actual child PID, scenario and ordered criterion schema.
The report includes code/oracle hashes, candidate receipt and input digest,
process timestamps, Node version and exit status.

## Test plan and evidence semantics

| Area | Test type | Required outcomes |
| --- | --- | --- |
| Defect and repair | Real local subprocess | Broken links fail; valid repair passes |
| Context | Git/risk integration | Repair is T0; mandatory code/QA/security selection |
| Oracle integrity | Mutation tests | Link deletion, escape, source/project drift and extra executable refuse |
| Filesystem safety | Boundary tests | Symlink and oversized artifact refuse; scorer evidence must be private/external |
| Invocation identity | Process tests | Wrong pins, stale receipt, wrong PID and reordered/wrong criteria refuse |
| Failure semantics | Process tests | Timeout, exception, malformed/oversized output remain unavailable, never fabricated acceptance |
| Ambient state | Process test | No inherited preload or credential sentinel |
| Concurrent mutation | Process tests | Source and ignored baseline-input changes refuse |

A completed scorer may report an actual acceptance failure. A launch failure,
timeout or malformed output throws a generic error and produces no assessment.
Private stdout/stderr are never included in error messages.

The launcher executes **trusted operator-pinned code**. It is not an OS sandbox,
does not prevent all side effects or network access, and cannot prove that an
untrusted serialized report was produced by this launcher. The supplied scorer
has builtin-only imports; arbitrary substituted code may have extra dependencies
and is not covered by that claim. Oracle data is passed as a process argument and
must contain fixture expectations only, never secrets. Concurrent write-restore
attacks and mutations outside the Git receipt/baseline inventory are not covered.

The collector still accepts only its existing operator-attestation schema; this
new process report is not silently promoted or converted into benchmark-ready
evidence. `benchmarkEligible` remains false. Running artifact provenance,
independent paired graph-floor evidence, pre-dispatch binding for both arms and
live mixed-host trials are separate outstanding requirements. No installed
plugin, gate approval, default policy, merge or release changes here.
