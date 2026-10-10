# ADR-029: Read-only multi-host skill inventory

**Date:** 2026-10-10
Status: Accepted; released in 3.60.0
Owner: great_cto maintainers
Tracking: Beads epic great_cto-f33n, implementation great_cto-f33n.1

## Context

Claude Code and Codex have separate skill directories and plugin caches, plus
shared/project directories. The existing local skills-registry.json describes
great_cto tiers but is not an authoritative record of either host's enabled or
loaded skills. Its quality_score is a frontmatter/size heuristic, not a measured
task-quality score. Directory presence also cannot establish upstream provenance.

Research input: [trending-claude-skills](https://github.com/linny006/trending-claude-skills)
at 003c52b9a25b35e3a0920429cd14a8007ed84703 and
[dsh-skill-center](https://github.com/tuoLuoSuan/dsh-skill-center)
at 04c7b20f73fba37694de64804136d566f58446c2. The useful pattern is transparent
inventory and explicit provenance depth. No external source code, executable
skill instructions, updater, or package is imported by this change.

## Options

| Option | Benefit | Cost / risk | Decision |
| --- | --- | --- | --- |
| Install another complete skill manager | Installation/update UI already exists | DSH-specific assumptions, overlapping state, cross-process mutation coordination, supply-chain audit | Not adopted |
| Extend the existing board with local read-only observations | One UI, existing registry/lint reuse, no new executor | Limited coverage; no update/currentness certification | Chosen |
| Fetch a trending catalog and automatically install | Fast discovery | Popularity is not quality; remote prompt/code changes without review | Rejected |

## Decision

GET /api/skills reads fixed local directories for machine-scoped Claude Code,
Codex, and shared locations, plus the selected project's corresponding locations.
Only the server-resolved project is scanned. An unknown project returns 404,
never another project's inventory under the requested name. All non-GET methods
return 405; path/root query parameters cannot expand filesystem scope.

The existing registry is read, not rebuilt. Allowed declarations refer only to
fixed host roots or the existing catalog, anthropic-skills and personal-skills
tiers under the great_cto home directory. Cached declarations may be stale.
Rejected or unavailable declarations are coverage warnings, not empty success.
Cache versions and registry sources are explicitly declared metadata, not
verified origin revisions. No remote SHA or license attestation is fabricated.

Each file observation includes a stable location identity, location class,
scope, bounded document size, document SHA-256, and structural warnings using
the existing frontmatter parser, YAML checks and context/description budgets.
This is not full corpus lint: relative reference existence is not checked.
No quality_score is exposed. Enabled, loaded and upstream revision remain
unknown. A document digest does not verify scripts, assets, references, publisher
identity, full-tree integrity or improvement in task outcomes.

## Read model and limits

Inventory state is observed or partial. Source states include observed, absent,
partial, unreadable and not-scanned. An absent source is a successful observation
of absence; unreadability must never be converted into zero installed skills.

Limits per scan: 12,000 directory/registry entries, 2,000 documents, depth 10,
128 KiB per document, 8 MiB document bytes and 2 MiB registry bytes. A 1.5-second
cooperative elapsed budget stops further work between filesystem operations.
Project/host skill directories and existing registry declarations are read
before historical caches. Each host cache is further limited to 2,500 entries,
300 additional documents or 450 ms, so one ecosystem cannot consume the entire
normal-case scan. Only skill-bearing subtrees under vendor/product/version
cache roots are traversed; .git and node_modules directories are excluded.
Individual exhausted caches retain partial coverage warnings.
It is not a hard filesystem I/O deadline. The frontend caps a request at ten
seconds and reports unknown on failure. Async reads yield the event loop; the
read cache coalesces in-flight requests per home/project, lasts 30 seconds after
completion and holds at most eight entries. A restart discards it.

The scan is not an atomic snapshot across files. Each document read uses one
descriptor and compares size/mtime/ctime before and after reading. A detected
change gives changed-during-read and no digest. Cross-document consistency is
not certified. No installation/update lock is needed because this feature never
writes skill sources. A future updater needs a real cross-process lock, not an
in-process promise queue.

## Security boundary

Normalize trusted home/project bases once (including the macOS temporary-dir
alias). Do not follow symlinked descendants or symlinked registry files. Reject
paths outside fixed roots. Open documents with no-follow/non-blocking flags,
verify regular-file type and bound reads. This is path-containment hygiene,
not an atomic sandbox against a hostile same-UID process changing ancestors.
Conservative symlink rejection can omit legitimate linked skills; coverage says
partial rather than pretending those skills were inspected.

Return home-relative and selected-project-relative locations, not absolute
private paths, raw document bodies, exceptions, API keys or command arguments.
Untrusted names/declarations/warnings are escaped as text in the UI. Original
document content is not executed or adopted as instructions. The existing
loopback-only board security remains in force.

## UI behavior

Skills lives in Tools and uses the existing navigation row, typography, surface,
border, accent and focus-ring tokens. Search, host-location and scope controls
remain mounted while rows change, preserving focus. Semantic table column
headers and caption, labeled native inputs/selects, live status and aria-busy
provide keyboard/screen-reader behavior. Existing sidebar keyboard handling and
mobile overflow behavior apply. All UI copy and date formatting are English.

Loading clears prior results. Errors do not retain stale successful counts.
Empty, filtered-empty and partial-empty are distinct messages. Request sequence
and selected-project guards discard late replies. Machine inventory is labeled
machine-wide and never masquerades as selected-project usage statistics.

## Consequences and delivery

This establishes observability, not a measured uplift in product quality or
complete compatibility. The phase plan is tracked in Beads, not a parallel TODO:

| Phase | Beads issue | Deliverable |
| --- | --- | --- |
| P0 | great_cto-f33n.1 | Read-only inventory and English Skills UI |
| P1 | great_cto-f33n.2 | Optional audited/sandboxed architecture visualization |
| P1 | great_cto-f33n.3 | Evidence ledger using existing provenance levels |
| P2 | great_cto-f33n.4 | Focused landing/docs SEO checks |
| P2 | great_cto-f33n.5 | Bounded read-only discovery feed; depends on P0 |

Later mutating skill management is not included in these read-only phases.
It requires separately specified full-tree digests, source revision binding,
license checks, conflict preview, recoverable backup and cross-host locking.
Merge, release, plugin installation and local board deployment are separate
actions. Delivery evidence is recorded in
[release QA](../qa-reports/QA-2026-10-10-skills-release.md), not inferred from
the acceptance of this decision.
