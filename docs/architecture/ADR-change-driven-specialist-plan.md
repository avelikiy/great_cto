# ADR: Change-driven specialist plan and content-bound notifications

Status: Proposed, native advisory increment implemented for review.
Date: 2026-10-02. Deciders: maintainer and independent security reviewer.
Beads: great_cto-p4o9.3.1; controller integration and attested reuse: p4o9.3.2.

## Context

Legacy SessionStart routes by seven days of Git history and suppresses a reviewer
if a verdict appeared within 24 hours. Mid-session nudges additionally debounce
by reviewer name for 30 minutes. Neither time window identifies the reviewed
artifact. A new payment change can therefore inherit silence from an unrelated
recent review, while historical payments can add noise to a UI-only task.

This increment changes advisory selection and notification identity, not the
controller graph, review acceptance, gate authority or installed defaults.

## Decision

Operator opt-in `GREAT_CTO_ADAPTIVE_REVIEWERS=1` uses
`GREAT_CTO_CHANGE_BASE=<pinned commit SHA>` with the existing Git assessment.
Named refs are rejected. Current staged/unstaged, committed-since-base,
untracked, deleted and rename-source artifacts form the selection scope.

Always retain code-reviewer, qa-engineer and security-officer. Add every domain,
pack and compliance role required by the current PROJECT.md registry, plus
matching changed-artifact rules. Deduplicate roles while retaining reasons and
matched paths. Do not blanket-exclude markdown or documents in adaptive mode:
executable prompts and compliance documents can need specialist review too.
Executable prompt/policy paths explicitly add AI security and evaluation roles.
Unknown archetype, missing project/base, unreadable artifacts and unsupported
dependency scope return `state=unknown`, no fingerprint, and a widened role list.
Unknown evidence does not authorize selective omission.

Native SessionStart emits the structured plan. Native PostToolUse emits it when
its notification fingerprint changes. Fingerprinting conservatively covers all
Git-visible tracked/untracked dependency files, including mode and bytes,
deletions and the project declaration even when ignored. It includes base and
selected roles/reasons. Dependency-only changes invalidate the notification even
if they do not change the selected specialist list. Bounds: 2000 files, 8 MiB
per file, 32 MiB total; symlink/unsupported scope refuses optimization.

Execution logs and the exact own notification-cache path are omitted from this
notification identity. The latter is also excluded from runtime gate assessment
so writing a notice cannot itself escalate a paused workflow. Verdict-log writes
may still conservatively escalate the existing gate assessment; no gate is
relaxed by this increment. A fresh verdict never supplies reusable PASS evidence.

The cache contains only the last notice fingerprint, not verdicts, approval,
completion or an authoritative review receipt. Equal identity suppresses a
duplicate notice, never a required review. Unknown plans always notify. Cache
write failure still emits. SessionStart emits regardless of notification cache.
No caller-supplied path lists, tier labels or timestamps downgrade selection.

## Options and trade-offs

Time-window suppression is cheap but cannot detect new changes; keep it only in
legacy mode to preserve opt-in rollout. Artifact-only hashing is smaller but
misses dependency changes; rejected until operator-owned dependency manifests
and independent attestation exist. Whole-visible-tree notification hashing is
conservative and bounded, at the cost of unnecessary notifications for unrelated
changes. It is not a promise that all runtime inputs are captured: ignored
configuration, remote services and external policy remain outside this scope.

## Safety and coverage

Plans are advisory, generated from project data that workers may modify. They
are not a security boundary, proof of correct reviewer execution or approval.
Gate/receipt/independent-verifier enforcement stays unchanged. Catalog roles are
not deleted, no mandatory delivery reviewer is omitted, and notification counts
must not be reported as model-call or quality savings.

Controlled Codex scheduling does not yet consume this plan. Domain roles still
need dedicated controlled profiles/contracts and dependency-aware controller
joins. Historical review reuse remains disabled (`reusablePass=false`); it needs
operator-owned scope and independently attested successful evidence. The native
hook emits instructions but cannot guarantee the orchestrating model obeys them.
Full scheduling/reuse is p4o9.3.2. Representative live measurement is p4o9.4.

## Validation

Test current low-risk selection, financial/compliance floors, sensitive source
and markdown, dependency-only invalidation, deletions and rename sources,
unknown/missing evidence, symlinks, activity-log invariance and disabled defaults.
Native subprocess tests exercise pinned-base SessionStart selection excluding
historical payment changes, repeated same-scope notices, fresh PASS followed by
new edits, and unknown risk refusing notice suppression. Run legacy routing,
runtime gate, budget, controlled/mixed-host pipeline and receipt regression too.
No live model quality, latency or cost improvement is inferred from these tests.
