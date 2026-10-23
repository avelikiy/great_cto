# Four-domain conditional graphs: frozen acceptance

Frozen 2026-10-23. Owner root verification/PM, builders must not edit. Approved ARCH/ADR-041 and PLAN govern scope. Candidate identity includes HEAD plus dirty feature diff. No passing implementation is claimed by this file.

Architecture gates great_cto-0ane/ely5.2 are closed. `node scripts/lib/approval-level.mjs gates-only --archetype devtools --json` excludes plan: no separate human plan gate created, no approval fabricated. Frozen validated briefs and closed PM .3 precede builders. Current reviewer+QA+security quorum and separate ship/publication authority remain.

## Exact commands

Packet .4 focused feedback:

```sh
node --test tests/lib/focus-registry.test.mjs tests/lib/conditional-graph-proposal.test.mjs
```

Packet .5 focused feedback:

```sh
node --test packages/board/fleet-focus.test.mjs packages/board/fleet-read.test.mjs packages/board/fleet-classify.test.mjs packages/board/focus-proposal.test.mjs packages/board/execution-graph.test.mjs
node --test tests/e2e/focus-proposal.e2e.test.mjs tests/e2e/execution-graph.e2e.test.mjs
node --test tests/install-as-a-stranger.test.mjs
```

Preservation controls:

```sh
node --test tests/lib/review-graph-floor.test.mjs tests/lib/specialist-plan.test.mjs tests/lib/controlled-specialists.test.mjs tests/lib/runtime-gate-policy.test.mjs tests/lib/domain-evidence.test.mjs tests/lib/domain-admission.test.mjs tests/lib/domain-benchmark.test.mjs tests/lib/domain-pilot-plan.test.mjs
node --test tests/lib/execution-trace.test.mjs
node --test tests/docs/*.test.mjs
```

Final frozen implementation candidate, before independent reviews:

```sh
bash scripts/ci-local.sh --e2e
```

Run canonical gate once on final candidate; changes after fixes require relevant checks and final gate for the new identity. Record stdout, rc, elapsed, skips/NOT CHECKED. Exit 0 with skips is not full coverage. No quick substitution, no-verify, dropped stage, skip increase, threshold/timeout weakening. Missing browser/dependency/network is BLOCKED/NOT CHECKED, never false green. Prior 136 domain-routing and 76 docs tests are baseline only.

## Required controls

| Control | Acceptance |
|---|---|
| Registry | Four exact IDs to five unchanged candidate/explicit-only packs, 3 descriptive invariants each, separate finance packs |
| Catalog/core | All baseline entries retained/additive entries allowed; shared eight IDs, required out-of-focus/missing/retired visible; unknown registry/policy preserves catalog |
| Proposal | Advisory true, changesExecution false; composable ordinary/architecture/sensitive/publication, mandatory floor plus specialists/gates |
| Missing evidence | Empty/stale/malformed/unknown host/schema/base/fingerprint/policy → unavailable, null fingerprint, no selective omission, superset retained |
| Bounds | Unique IDs, valid node kinds, proposed-dependency edges only, no dangling edges, <=128 nodes/256 edges/65536 UTF-8 bytes; overflow unavailable, no required-role truncation |
| Privacy | Hostile text inert; path/token/prompt/overlay canaries absent from JSON/DOM/attributes/storage/URLs; no raw assessment files/reasons |
| Project races | Unknown project rejected rather than cwd fallback; slow A success/error/finally cannot overwrite B; focus/change/version mismatch clears stale data; denied access purges content |
| Authority | Before/after queue/map/approvals/trace/admission unchanged by reads/clicks; no proposal-to-observed promotion or publication claim |
| Host | Same schema semantics; native causal/enforcement coverage partial/unavailable remains explicit |
| Browser | Keyboard Enter/Space + aria-pressed/live status, both themes, 375/768/1024/1440px, 320 CSS px reflow, 200% text, coarse-pointer >=44px, reduced motion, forced colors; unautomated checks explicit |
| Packaging | Stranger-install fixture resolves new registry/proposal imports outside checkout; no packaging-policy shortcut |

No private source read merely to make risk known. Existing authorized bound metadata or unavailable. Clinical/compliance/custody/quality/cost gains and actual native execution proof remain unknown. Independent code-reviewer + QA + security each returns explicit verdict with candidate identity after final canonical gate; root aggregates and resolves findings.

## Rollout/backout

Local candidate inspection only, no migration. Backout additive consumers/projection, discard derived proposals, retain run/approval/admission records. Future runtime .7 and benchmark .8 remain separately scoped. No merge/release/deploy/install authority is granted.
