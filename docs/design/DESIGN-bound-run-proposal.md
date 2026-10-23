---
surface: web
feature: bound-run-proposal
target: packages/board/public/index.html; tests/e2e/focus-proposal.e2e.test.mjs
status: draft
author: design-advisor v2.0
date: 2026-10-23
---

# Explicit stored-run proposal inspection

## 0. Dials

```text
DESIGN_VARIANCE:  2/10 — match Fleet's existing operator grammar; 1 would hide the new provenance distinction, 3 would introduce unnecessary navigation.
MOTION_INTENSITY: 1/10 — immediate state clearing and focus feedback suffice; 2 would add movement without operational information.
VISUAL_DENSITY:   8/10 — retain Fleet's compact evidence flow; 7 adds scanning distance, 9 would compromise the 14px desktop body floor.
```

Scope is the accepted [ARCH](../architecture/ARCH-bound-run-proposal.md) and [ADR-042](../adr/ADR-042-explicit-run-proposal-binding.md), approved through `great_cto-ely5.15.2`. Phase task: `great_cto-ely5.15.4`. This contract precedes UI implementation; it claims no browser verification or execution authority. The primary checkout's `.great_cto/PROJECT.md` declares devtools, medium, gates-only; the worktree has no local PROJECT file.

## 1. Design system pick

Reuse exact current Fleet markup conventions, neutral/emerald themes, bundled Geist/Geist Mono, square controls and compact spacing from [index.html](../../packages/board/public/index.html). Extend the existing `focus-proposal` section after focus/core/pack inspection, before catalog controls. Follow the sibling [focus contract](DESIGN-four-domain-conditional-graphs.md) and [admin layout](DESIGN-work-admin-2026-10.md). No dependencies, images, decorative icons or font changes.

ui-ux-pro-max was consulted through its local design-system generator and `--domain dense`. Its named “Dark Mode (OLED)” style supports restrained contrast, but its dark-only palette, replacement type, landing sections and glow do not override this existing dual-theme console. Apply dense rules “Empty, loading, error and filtered-empty are four states” and “Field-level permission is not the same as record-level”; explicit textual loading overrides generic skeleton advice for evidence. Reference research: **not attempted**, because the existing Fleet system governs this component. No external corpus, paid tool or model call was used. AnyDesign is n/a: no visual reference was supplied for token extraction. The committed-aesthetic banned list introduces no exception here: no gradient, card triplet, emoji, hero or replacement display face.

## 2. Component inventory

All visible product copy below is English, consistent with the board.

| Component | Existing/new | States and meaning |
|---|---|---|
| Project selector and focus buttons | Existing | Retain registry authorization and explicit focus selection. Do not infer focus from project name. Scope changes invalidate inspection synchronously. |
| Section heading | Existing, rename | `Stored proposal`; always separate from observed `Execution`. Helper: `Advisory. Does not change execution. Current working tree has not been checked.` |
| Run UUID field | New native text input | Visible label `Controlled run UUID`; monospace, left aligned, 36 characters, no autocomplete/history persistence. Empty/edited/valid/invalid/busy. Hint `Enter the exact controlled Codex run UUID.` Accept lowercase canonical UUID only; do not infer version. No global run picker, store listing or “latest”. |
| Phase select | New native select | Label `Snapshot phase`; initial empty option `Choose phase`, then `Preparation`, `Review`. Never default or infer phase. Selection is always explicit. |
| Descriptor action | Existing small-button styling | `Load snapshot`; busy `Loading snapshot…`. Validate locally before GET `/api/focus-run-binding`. No read on typing, phase change, focus change, page timer or initial page load. |
| Descriptor summary | New read-only definition list | Label `Stored snapshot`. Display validated controller `Controlled Codex`, exact UUID, explicit phase and `Snapshot <first 12 hex>`. These are identity, not a success/PASS badge. `Binding details` native disclosure exposes full snapshot, epoch-content digest, plan fingerprint, base and policy digest from the allowlisted descriptor, selectable and wrapping. No raw state metadata. |
| Proposal action | Existing small-button styling | `Inspect stored proposal`; only present with valid review descriptor and authorized supported focus. Busy `Inspecting stored proposal…`. Sends complete descriptor binding to GET `/api/focus-run-proposal`; never shortened display digests. Preparation has explanatory text instead of a disabled action. |
| Proposal graph | Existing semantic stage/dependency list | Render supported bound review proposal only. Keep mandatory reviewer/gate semantics and no selective truncation. No animated canvas, green PASS indicator, execution status or progress metric. |
| Adjacent limitations | New fixed paragraphs | `Stored snapshot, not revalidated against the current working tree.` `Content identity does not identify a unique historical epoch.` `Proposal dependencies are not recorded execution evidence. This is not an approval or reusable PASS.` Always visible with graph, not tooltip-only. |
| Status and retry | Existing status/button conventions | Persistent polite live region for concise busy/completion messages; inline fixed errors and actionable retry as specified below. No raw exceptions or backend reason text. |

### State and recovery contract

| State | Exact visible message / action |
|---|---|
| Day one, no selection | `Enter a controlled run UUID and choose a snapshot phase, then load its stored snapshot.` Keep fields and Load snapshot operable. |
| No explicit project | `Choose a registered project before loading a snapshot.` Do not issue a request or use server default. |
| Invalid input on submit | UUID: `Enter a lowercase UUID in 8-4-4-4-12 format.` Phase: `Choose Preparation or Review.` Associate each message with its field. Focus the first invalid field. |
| Loading descriptor | `Loading stored snapshot…` Clear old descriptor and graph immediately. No skeleton or last-known value. |
| Review descriptor ready, no focus | `Stored snapshot loaded. Choose a focus direction to inspect its proposal.` |
| Review descriptor ready, supported focus | `Stored snapshot loaded. Inspect its proposal for the selected focus.` Show Inspect stored proposal. |
| Preparation descriptor ready | `Planning snapshot: graph unavailable under projector v1.` Retain descriptor; no graph action, no review fallback. A direct preparation proposal response with `planning-only-evidence` follows ARCH: clear binding and graph, retain this explanation. |
| Inspecting proposal | `Inspecting stored proposal…` Keep exact descriptor visible, clear old graph. |
| Available review proposal | `Stored proposal loaded.` Show graph, descriptor and adjacent limitations. |
| Unavailable / 404 | `Stored snapshot unavailable for this selection. Check the UUID, phase and project, then retry.` Identical for missing and another project's run; no existence/root disclosure. `Retry` reloads descriptor. |
| Native unsupported context | `Native evidence unavailable. Stored snapshot inspection requires an explicitly selected controlled Codex run.` Never infer controller from worker host routing. |
| Unsupported/invalid/unsafe evidence | `Stored snapshot unavailable. Evidence could not be safely inspected.` Clear descriptor and graph; Retry reloads descriptor. Do not echo paths, permission bits, metadata or errors. |
| Snapshot changed / 409 | `Stored snapshot changed. Load the snapshot again before inspecting its proposal.` Clear descriptor and graph; `Load snapshot again` performs one explicit descriptor read. No automatic retry. |
| Unknown envelope/nested schema or malformed response | `Stored snapshot unavailable. Unsupported or invalid response.` Clear descriptor and graph; Retry reloads descriptor. Never partially render. |
| Network failure | `Couldn't load stored snapshot.` or `Couldn't inspect stored proposal.` Clear evidence; `Retry` reloads descriptor so an obsolete binding cannot survive. |
| Offline at open or mid-read | `Board unavailable offline. Reconnect, then retry.` Clear descriptor and graph; Retry reloads descriptor when explicitly activated. No cache, queue or background retry. |
| Denial / 403 | `You do not have access to this project. Choose another project.` Apply existing global Fleet denial purge plus binding purge. No Retry that clears the denial locally; recovery uses existing authorized project/access restoration flow. |
| Scope edited after load | `Selection changed. Load the snapshot again.` This status accompanies clearing on run/phase/project/focus changes, not a retained graph. |

The Fleet catalog's filtered-empty state remains `No agents match this view.` with its existing reset action. The snapshot component has no result list or filters; catalog filters neither select a run nor establish an inspection identity. A supported response with unexpectedly empty required structure is invalid evidence, not day-one empty.

### State ownership and race contract

Preserve `prepareFleetScope`, synchronous project-switch clearing, all four existing request counters and `accessGeneration`. Add independent descriptor/inspection request generations. Before starting any read, clear superseded content synchronously and capture explicit project selector, canonical projectId, controller context, UUID, phase, focus, registry version, full binding (for inspection), request generation and accessGeneration. Accept success, catch and finally only if all captured values still match and the scope remains authorized. Abort is optional optimization, never the fence.

Editing any UUID character, phase, project, focus, controller context, registry identity, descriptor or access state clears descriptor and graph immediately and increments affected generations. Focus changes conservatively require another explicit Load snapshot. Project switch/denial also clears the UUID and phase fields before new data can paint. For a same-project UUID/phase/focus edit retain current form input only, no evidence. Descriptor success never triggers proposal inspection automatically. Duplicate activations during an active request are ignored without moving focus.

One denial purges registry/proposal/required/roster as today plus both new inspection records and invalidates every pending relevant request. An earlier success/error/finally cannot restore content, remove busy state belonging to a later read, or clear denial. Explicit recovery starts under a new authorized scope generation. Validate complete returned project/run/phase/binding/focus/controller/version equality before painting; short digests are display-only. On failure keep no last-good graph. No URL history, localStorage, sessionStorage, service worker, ETag or response caching for these values.

## 3. Wireframe-as-text

Desktop >=1024px and tablet 768–1023px retain one Fleet content column; form wraps naturally without changing source order:

```text
Focus direction [existing buttons]
[existing core and candidate pack disclosures]

Stored proposal
Advisory. Does not change execution. Current working tree has not been checked.
Controlled run UUID                      Snapshot phase
[exact UUID________________________]     [Choose phase v]  [Load snapshot]
[persistent status / inline field errors]

Stored snapshot   Controlled Codex · Review
Run <full UUID>    Snapshot <12 hex>
> Binding details
[Inspect stored proposal]

[review proposal: existing vertical stages and dependency list]
Stored snapshot, not revalidated against the current working tree.
[remaining explicit limits]

[existing Fleet catalog controls and rows]
```

At <=767px stack UUID label/input, phase label/select, full-width Load snapshot, status, descriptor, disclosure, full-width Inspect action, graph and limitations. At 320px / 400% zoom keep the same order and wrap every identifier; do not hide full identity behind ellipsis. Observed Execution remains its existing separate surface, never a tab, overlay or replacement inside Stored proposal.

## 4. A11y contract

Target WCAG 2.2 AA for this addition. Use native label/input/select/button/details/summary, semantic headings and a definition list for descriptor fields. Visible labels, aria-describedby hints/errors and aria-invalid on invalid fields are required. Enter in the form submits Load snapshot only, never Inspect; native select keyboard behavior remains. Focus order: UUID → phase → Load snapshot → Binding details → Inspect (if present) → Retry (when present) → existing catalog. Global project/focus controls retain their existing preceding positions.

Keep a stable control DOM node while busy. Use `aria-disabled=true` and guarded activation for the active request button, with busy text, so keyboard focus stays present; do not attach a tooltip. Input/select remain editable during reads, and editing invalidates the request immediately. Label affected descriptor/graph regions with `aria-busy`; the concise polite status lives outside busy regions, `aria-atomic=true`. Do not live-announce all graph nodes. Do not autofocus async success. Retry retains its node through the pending request; when successful removal is necessary, restore focus to Load snapshot or the existing Inspect button. If a focused graph/disclosure disappears after input editing, keep focus on the editing control; after project change, keep focus on project selector.

Apply 2px solid `--focus-ring`, 2px offset to input/select/buttons/summary, reserving outline space. All new focusable controls sit on opaque neutral beds. No accent-filled CTA, image/tinted/translucent focus bed or clipped outline. Ratios calculated from the actual source hex values using WCAG sRGB luminance:

| Bed | Dark value / ring #00d97e | Ratio | Light value / ring #047857 | Ratio |
|---|---|---:|---|---:|
| Page | #0a0e0c | 10.38:1 | #eef2f0 | 4.86:1 |
| Card | #11161a | 9.73:1 | #ffffff | 5.48:1 |
| Muted control | #161c1f | 9.20:1 | #f0f3f1 | 4.91:1 |
| Elevated | #1a2025 | 8.79:1 | #ffffff | 5.48:1 |
| Strong hover | #1e272c | 8.12:1 | #e2e8e4 | 4.41:1 |

Every pair exceeds 3:1. Use `--text` for substantive evidence and errors in words; neutral metadata uses `--text2`/`--text3` only with >=4.5:1 actual painted contrast. Focused-field boundary is the measured outline; decorative low-contrast dividers carry no state. In forced colors retain native outlines and text, selected underline and border. Color never encodes availability or approval alone.

Permission is distinct from missing/offline. Hide records that cannot be disclosed; never mask a private root or display its length. Authorized descriptor values are read-only, selectable, navigable, full contrast. For denied scope use the fixed refusal above and existing operable project recovery. No hidden raw descriptor or stale graph remains in DOM/attributes.

### Numeric contract and figure style

UUIDs, digests, base commits, phase names, versions and dates are identifiers, not summable figures: left aligned, `font-variant-numeric:normal`, no tabular override. Full binding values use `--mono`; headings align with their data. This addition introduces no amount, decimal column, metric, counter, estimate or huge display number. Existing graph totals, if retained, use exact integer stored/display precision, tabular figures and right-aligned number/header when in a numeric column. Negative counts are invalid, never color-only. No currency precision or rounded sum is introduced; existing unrelated money retains its currency-specific precision and rounding note.

Absence: true count zero `0`; unavailable value `Unavailable`; inapplicable value `Not applicable`; known empty dependency set `None`. No blank cell or ambiguous dash. Rounded-to-zero, provisional, suppressed and unreliable numeric values are not produced here; unsupported evidence is rejected rather than coerced to `0`. Before evidence arrives show explicit loading text and zero skeleton rows.

### Destructive actions and cost of recovery

n/a: every new action is a deterministic read; no confirmation dialog, undo toast, bulk selection or execution/approval action. Clearing transient inspection evidence is low recovery cost: immediate, with the selection-changed status and explicit reload. Future write/delete/bulk actions require a separately scoped contract.

## 5. Responsive contract

Desktop controls use existing Fleet 32px minimum height, 4px 10px padding, 8px gaps, square corners and 14px body floor. UUID flexes without squeezing phase/action labels; wrap at available width. At <=767px or coarse pointer use >=44px targets, >=8px gaps, 16px input/body text, existing 12px mobile main inset and full-width stacked actions. Preserve 20px heading separation and 8px paragraph rhythm. At 200% text or 400% zoom remove fixed heights, wrap full labels and IDs, and allow vertical growth. Heading semantics, weight/ink and position supplement size, so hierarchy survives text scaling. No horizontal page scroll, sticky footer or new virtualization.

## 6. Motion contract

Reuse 150ms color/border/background hover transitions only. Content clearing, focus and busy changes are immediate. No spinner required, shimmer, moving graph edge, count animation, scroll choreography or automatic scrolling. `prefers-reduced-motion:reduce` makes all added transitions 0ms; static loading/status text remains complete.

## 7. 6.5 Platform integration contract

Responsive web only. Native mobile/extension permissions, priming screens, partial grants, Settings recovery and safe-area additions: n/a. No new clipboard, notification, deep-link scheme or browser permission. An existing explicit authorized run link may supply its exact UUID only; phase must still be explicitly selected. No store enumeration, automatic latest/run/phase selection or implicit proposal request. Offline open/mid-read behavior is specified in §2. No cached bound evidence is rendered.

## 8. Brand tokens

Reuse these exact CSS custom properties; add no global token or theme:

| Token | Dark | Light | Use |
|---|---|---|---|
| --bg-page | #0a0e0c | #eef2f0 | Parent canvas |
| --bg-card | #11161a | #ffffff | Neutral section |
| --bg-muted | #161c1f | #f0f3f1 | Input/select/button bed |
| --bg-strong | #1e272c | #e2e8e4 | Hover neutral |
| --bg-elevated | #1a2025 | #ffffff | Existing detail bed |
| --text | #ecf2ee | #0d1a14 | Body, labels, evidence |
| --text2 | #8a9a92 | #56655e | Secondary prose |
| --text3 | #848f88 | #5b6b64 | Metadata |
| --focus-ring | #00d97e | #047857 | Focus outline |
| --border | rgba(255,255,255,.06) | rgba(0,0,0,.10) | Decorative separators only |
| --sans | Geist with existing fallbacks | Same | Prose/controls |
| --mono / --display | Geist Mono with existing fallbacks | Same | Identifiers / inherited headings |
| --fs-body / --fs-base | 14px / 15px | Same | Body / base |
| --fs-small / --fs-title-s | 13px / 16px | Same | Metadata / section title |

Native field boundaries and selected emphasis must retain visible focus and text states. No availability badge is invented; prose states its meaning. Images and image sourcing: n/a, none added.

## 9. Out of scope

UI implementation in this design phase; controller/store/schema changes; source scanning; live tree assessment; historical epoch occurrence proof; automatic revalidation, polling or latest-run inference; writes, gates, execution or scheduler controls; observed Execution topology changes; redesign/localization; new persistence; private-state export; paid research; release or installation. No other design document's offline last-good allowance overrides this component's strict clearing contract.

## 10. Open questions

No operator visual decision is outstanding. Existing approved Fleet direction and all three sibling dials govern. Recommended defaults are fixed: empty UUID/phase initially, no focus inference, explicit Load then explicit Inspect, 12-hex display prefix with full disclosure, conservative rebind after focus change. Unknown reason codes use the fixed unsupported/invalid message and never raw text. These defaults do not block backend work.

## 11. Implementation hand-off

1. UI owner changes only `packages/board/public/index.html` and `tests/e2e/focus-proposal.e2e.test.mjs` under PM ownership. Read accepted ARCH/API contract first; reader/routes remain their assigned owners' work.
2. Extend existing Fleet state/render/clear helpers with explicit form, independent generations, descriptor identity and synchronous invalidation. Preserve all four existing counters/access fencing. Never repurpose legacy `changeIdentity` as stored identity.
3. Build the two explicit GET paths with complete validated identity, required explicit project and no extra host query parameter. Validate envelope and nested versions plus full returned binding before painting. Keep v1 legacy focus behavior compatible outside this component.
4. Render fixed English states, native controls, full binding disclosure, existing semantic proposal list and adjacent limitations. Render validated IDs with textContent or fixed escaped templates; never raw state/error/reason HTML. Keep observed Execution independent.
5. Verify synthetic review/preparation/unsupported/native/day-one/invalid/offline/network/403/404/409/unknown-version cases. Assert no silent fallback, stale graph, private canary in DOM/attributes/storage or automatic request/retry. Assert no request on typing/selection and exactly one per explicit read activation.
6. Exercise delayed success/error/finally under run/phase/focus/project switches, A-B-A, access revocation and independent request counters. Assert denial purge and no late resurrection. Verify binding short display never enters the query; full identity changes force explicit reload.
7. Browser acceptance: keyboard-only sequence and focused retries, live/busy states, both themes, 320/375/768/1024/1440px, 200% text/400% zoom, coarse pointer, reduced motion, forced colors. Measure actual painted focus/text contrast if implementation changes neutral beds. Planning-time contrast calculation is not browser acceptance.
8. Run the PM-frozen targeted browser path and required canonical checks once at integration. Independent review/QA/security and active gates remain necessary. This contract authorizes no commit, push, release or installation.
