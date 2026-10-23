---
surface: web
feature: four-domain-conditional-graphs
target: packages/board/public/index.html; packages/board/lib/fleet.mjs; packages/board/server.mjs
status: draft
author: design-advisor v2.0
date: 2026-10-23
---

# Four focus directions and advisory task graph

## 0. Dials

```text
DESIGN_VARIANCE:  2/10 — operators already know Fleet; adding a second navigation grammar would cost fluency, while 1 would conceal the new focus/proposal distinction.
MOTION_INTENSITY: 1/10 — focus and hover feedback suffice; graph motion would imply execution where none occurred.
VISUAL_DENSITY:   8/10 — retain compact Fleet rows and inline evidence, with disclosures for details; 9 would require shrinking the existing 14px body floor.
```

This is a plan, pending gate:arch. It authorizes no implementation or execution-policy change. Scope and authority come from [ARCH](../architecture/ARCH-four-domain-conditional-graphs.md) and [ADR-041](../adr/ADR-041-four-domain-conditional-graphs.md), which retain ADR-032/033/034/040 constraints. Primary checkout PROJECT declares gates-only; the worktree's missing local PROJECT is not approval. Beads design phase: `great_cto-ely5.6`.

## 1. Design system pick

Extend the existing Fleet surface in `packages/board/public/index.html`; use its exact neutral/emerald theme tokens, bundled Geist/Geist Mono, square controls and current spacing. No library, font, diagram engine or external image dependency. Source inspection includes current Fleet controls/rendering, theme declarations and `.design-spec/Components.dc.html`. The older gallery shows rounded pills/cards; current Fleet source explicitly uses radius 0, so current Fleet wins for this extension.

Skills consulted: ui-ux-pro-max design-system generator and `--domain dense`, plus aesthetic-instrument. The generator's “Dark Mode (OLED)” recommendation supports restraint and high contrast, but its dark-only palette, replacement fonts, hero/CTA and glow recommendations do not govern an existing dual-theme console. Reuse the actual board instead, following aesthetic-instrument rules 1, 2, 9, 10, 11 and 12. Live source supersedes stale skill examples: display is currently Geist Mono; numeric treatment below deliberately overrides rule 5's global tabular setting for identifiers. Dense corpus rules “Empty, loading, error and filtered-empty are four states,” “An empty cell must say whether it is empty or unknown,” and “Keyboard is the primary input” govern state design. The explicit-loading requirement below overrides the corpus's generic skeleton suggestion for decision figures.

Reference research: **not attempted** against external Refero or competitor sites, because the existing board governs the direction. No claim of consulted live references or subscription availability. AnyDesign is not applied: no screenshot, URL or Figma reference was supplied for extraction. No private project source was inspected.

## 2. Component inventory

| Component | Reuse/new | Meaning, states and exact interface text |
|---|---|---|
| Project selector | Existing | Project identity remains persistent in the shell. Selection clears prior project's focus/proposal before another response can paint. |
| Fleet title and views | Existing | Retain `Project focus`, `Needs attention`, `Expensive grants`, `Never observed`, `All agents`, `Retired`. Counts are inventory/filter counts, never calls or executions. |
| Focus direction group | New composition of existing small buttons | Label `Focus direction`. Four visible buttons in registry order: `Fintech + crypto`, `Telemedicine`, `Venture Pipeline`, `Mental Care`. Selected, unselected, loading/unavailable registry. Each button uses `aria-pressed`; none selected until an explicit supported focus is provided/selected. |
| Focus explanation | Existing status paragraph extended | `Display focus only. Execution policy is unchanged.` On no selection: `Choose a focus to inspect its candidate packs.` On unsupported ID: `Focus unavailable. Choose a supported direction.` The original unknown-requirements warning remains separate and visible. |
| Catalog section | Existing list/search/sort/row/drawer | Core contracts and declared required reviewers stay visible in Project focus, including required roles outside selected focus and missing/retired requirements. `All agents` remains reachable beside focus controls through the existing view mechanism. Search labels `Filter agents`; reset label `Reset filters`. |
| Core contract disclosure | New read-only disclosure | Summary `8 core contracts available`. Expanded list contains product-owner, architect, pm, senior-dev, code-reviewer, qa-engineer, security-officer, devops. Helper: `Availability does not require a model call for every contract.` No execution checkboxes. |
| Pack disclosure | New read-only rows | Summary is pack label plus `Candidate` and `Explicit-only`. These derive from pack maturity/activation, not quality. Details show allowlisted version/digest and exactly three descriptive invariant statements per pack. Label the list `Descriptive invariants`; helper `Descriptions are not executable checks.` No activation control. |
| Proposed graph region | New read-only section | Heading `Proposed graph`; persistent line `Advisory. Does not change execution.` Shows evidence state, route classes, required roles/gates, reasons and host limitations. Never shows running/PASS/completed badges, fake timestamps or approved-gate styling. |
| Route class labels | New plain text labels | `Ordinary`, `Architecture`, `Sensitive`, `Publication`, driven solely by validated routeClasses. Multiple labels coexist in deterministic order; no exclusive tab selection or risk score. |
| Stage/dependency list | New semantic list/details | Each stage states kind, role/contract and reason. Each dependency reads `Requires: <stage label>` and a bounded allowlisted explanation. Proposed dependency is text, not a recorded edge. The list is the canonical presentation at every width; no free-form Mermaid/HTML rendering. |
| Host/evidence line | New text row | `Host: Controlled Codex` or `Host: Native Claude` from validated identity; unknown is `Host: unavailable`. `Assessment: available` only for matching supported identity. Otherwise `Assessment: unavailable. Selective omission is not permitted.` Limits are individually visible. |
| Recorded execution link | Existing destination reused | Link `View recorded execution` only when an authorized recorded-run destination exists. No run: `No recorded run selected.` Native partial: `Recorded execution: partial`; missing: `Recorded execution: unavailable`. Never fill a gap from the proposal. |
| Retry / reset / disclosures | Existing button/detail primitives | Retry repeats the same scoped read. Reset only removes presentation filters. Disclosure toggles retain focus. No scheduling, approval, install, release or pack-admission action is present. |

Focus mapping is exact, with no aliases or keyword inference:

| Direction | Stable ID | Candidate packs |
|---|---|---|
| Fintech + crypto | `fintech-crypto` | `money`, `crypto-execution` |
| Telemedicine | `telemedicine` | `telemedicine-workflow` |
| Venture Pipeline | `venture-pipeline` | `venture-evidence` |
| Mental Care | `mental-care` | `mental-wellbeing-safety` |

Fintech has two separate pack disclosures and six invariant descriptions, not a merged pack. Labels describe focus and candidate evidence. They do not certify investment performance, custody safety, medical compliance, diagnosis, treatment or clinical readiness. When Mental Care is selected show `Wellbeing safety descriptions only. No diagnosis or treatment claim.` Telemedicine shows `Workflow descriptions only. No clinical or compliance validation.` Finance shows `Evidence descriptions only. No custody or performance guarantee.` Venture shows `Evidence descriptions only. No investment recommendation.`

Every badge has one source: Candidate=maturity, Explicit-only=activation policy, Required=declared reviewer requirement, Missing=required stable role absent from installed inventory, Retired=installed catalog status. Do not invent “Expert”, “Validated”, “Safe”, “Active domain” or “Optimized” badges. No new image assets; existing first-party inline SVG controls may be reused without emoji or external assets.

State copy and action contract:

| State | Catalog / focus | Proposal |
|---|---|---|
| Loading first read | `Loading focus directions…` / `Loading agent catalog…`; no guessed counts | `Loading proposal…`; no skeleton stages/figures |
| Day one | `No agents installed.` Existing installation guidance may be linked, never executed by focus selection | `No proposal available for this change.` Explain missing pinned change metadata if that validated reason is supplied |
| Filter returns nothing | `No agents match these filters.` Button `Reset filters` | No filter-empty proposal: catalog search does not change graph evidence |
| Request failed | `Couldn't load focus directions.` or `Couldn't load agent catalog.` Button `Retry` | `Couldn't load proposal.` Button `Retry`; do not classify as ordinary |
| Unknown project requirements | `Reviewer requirements are unavailable. Showing the installed catalog.` | Retain mandatory/superset roles and show unavailable assessment; no narrowing |
| Unsupported schema, malformed/overflow/stale identity | Valid catalog may remain independently usable | `Proposal unavailable for this change.` Validated reason text; no partial graph or silent truncation |
| Permission refused | `You do not have access to this project.` Authorized recovery `Choose another project` | Same refusal, no leaked stage/pack/count or stale previous payload |
| Refresh same project/change | Keep last known content only with `Last loaded <timestamp>. Refreshing…` | A last known proposal is labeled `Previous proposal. Revalidation pending.` and cannot support omission; if binding differs clear it immediately |

No destructive action is introduced. Focus/reset/disclosure are low recovery-cost local presentation changes and act immediately without confirmation or undo toast. Existing destructive controls elsewhere keep their current recovery-cost tiers; this feature adds no bulk selection, hidden selection scope or confirmation ritual.

## 3. Wireframe-as-text

Desktop, within existing main Fleet column and shell, no new dashboard summary cards:

```text
<existing project selector and Fleet view navigation>
Project focus                                      <shown> of <installed>
Reviewer requirements: <known/unavailable>; <missing required roles if any>

Focus direction
[Fintech + crypto] [Telemedicine] [Venture Pipeline] [Mental Care]
Display focus only. Execution policy is unchanged.
<domain-specific limitation, one text line wrapping naturally>
> 8 core contracts available
> <pack label> · Candidate · Explicit-only

Proposed graph
Advisory. Does not change execution.
Host: <host>                   Assessment: <available/unavailable>
Routes: Architecture · Sensitive
1. <stage label>               Kind: <kind>
   Reason: <bounded reason>    Requires: <stage label or None>
2. ...
> Required delivery review: code-reviewer, qa-engineer, security-officer
Required gates: <declared gate labels; no approval status inferred>
Limitations: <each applicable host/evidence limit>
<View recorded execution | No recorded run selected.>

Agent catalog                         <All agents existing view control>
[Filter agents                 ] Sort [existing sort] [Reset filters]
<existing role rows and profile drawer>
```

Project focus's role set remains the eight available core contracts plus declared required roles; focus pack metadata is not a role-routing authority. If project requirements are unknown preserve the existing full non-retired catalog fallback. Required-but-missing roles render in the requirements text/list, not fabricated installed rows. Retired required roles remain visible with their actual status. Other catalog views and attention across the full inventory remain available. Baseline inventory is 72, but visible installed totals come from validated data rather than a fixed number.

Ordinary proposal exposes implementation → deterministic checks → delivery review as successive list groups. Delivery review always enumerates code-reviewer, qa-engineer and security-officer plus required specialists. Architecture adds actual proposed preparation/gates before implementation. Sensitive extends either path; Publication adds artifact/access/runtime proof conditions. These groups are explanatory labels, not a claim of three model calls. Nothing here changes run queues or the current quorum.

## 4. A11y contract

Target WCAG 2.2 AA for the new surface. Existing shell skip link must reach main content. Reading/tab order: project selector → existing view navigation → four focus buttons → core/pack disclosures → proposal disclosures/recorded link/retry → catalog search/sort/reset → rows → existing drawer. Static labels and graph nodes are not tab stops. Use native buttons, headings, ordered lists and details/summary; all controls have visible labels. Enter/Space activates focus buttons; standard Tab navigation is sufficient, with no new global shortcuts. Search's existing `/` shortcut must ignore editable fields and browser/assistive shortcuts.

Use group name `Focus direction`, aria-pressed on each button, with exactly one true after valid explicit selection. Buttons change presentation only; they are not radio inputs that submit project policy. No auto-focus on async response. Announce one concise polite status such as `Mental Care focus selected. Execution policy is unchanged.` Preserve current focused element while updating scoped content. Do not announce the entire stage list on every refresh. Details exposes expanded state natively. Focused item disappearing after project switch returns to the project selector; drawer close restores its triggering role when it still exists.

Focus indicator: 2px solid `--focus-ring`, 2px offset for new controls. Reserve outline space so overflow does not clip it. Keep controls on opaque neutral beds; selected controls use an underlined label plus existing accent border while their outer ring remains against a neutral parent, never a green filled bed. No focusable new content on tinted, translucent or image surfaces. Ratios computed from actual source hex values using sRGB relative luminance, not inferred from old comments:

| Surface | Dark surface | Dark ring #00d97e | Light surface | Light ring #047857 |
|---|---|---:|---|---:|
| Page | #0a0e0c | 10.38:1 | #eef2f0 | 4.86:1 |
| Card | #11161a | 9.73:1 | #ffffff | 5.48:1 |
| Muted | #161c1f | 9.20:1 | #f0f3f1 | 4.91:1 |
| Elevated | #1a2025 | 8.79:1 | #ffffff | 5.48:1 |
| Strong | #1e272c | 8.12:1 | #e2e8e4 | 4.41:1 |
| Existing drawer bed | #0f1411 | 9.95:1 | #ffffff | 5.48:1 |

Every pair exceeds 3:1. Use --text for substantive content, --text2/--text3 only on existing neutral surfaces that preserve 4.5:1 normal-text contrast. Required, Missing, Candidate, unavailable and proposed are words; color is supplementary. Forced-colors mode retains native outlines/borders/selected underline and text state labels.

Permission: hide inaccessible records and features when their presence cannot be disclosed; do not expose counts before authorization. Read-only proposal and requirements remain selectable, high-contrast text for an authorized reader. For a recoverable refusal show an operable recovery link explaining the reason. Do not disable controls and attach inaccessible tooltips. Masking is not needed because secrets must not enter the projection; any existing mask must be fixed-length.

Numeric contract: inventory counts and stage totals use tabular figures, right-aligned in numeric columns; their column headings align right too. Stage ordinal markers, dates, timestamps, versions, IDs and digests are not summable: no tabular override or right alignment. Current global numeric CSS must be overridden in those new components if necessary. No huge display figures, money, rates or estimated performance metrics are introduced. Counts have integer display precision and exact integer stored precision. Negative counts are invalid and yield unavailable, never a minus-color trick. If an existing linked financial table is displayed, retain currency-specific precision (JPY 0, TND 3), aligned decimals, written minus signs and its rounding note; this feature does not create another money format.

Absence vocabulary: measured empty count `0`; unavailable `Unavailable`; not applicable `Not applicable`; known empty predecessor list `None`. A blank or dash alone is prohibited in new fields. Rounded-to-zero, estimated/forecast, suppressed and unreliable numbers are not produced by this projection. If such upstream values appear, reject them as unsupported rather than silently coercing to zero. A missing field never becomes a successful empty graph.

## 5. Responsive contract

At >=1024px retain existing desktop shell and one main content flow. Focus controls wrap only as needed, 8px gap, minimum 32px high with existing 4px 10px internal padding. Do not create a four-card grid. Catalog rows keep their current measured layout, minimum 44px with 10px 12px padding and 16px column gap. Proposal is a vertical list at every width, so its causal meaning never depends on horizontal space.

At 768–1023px use the same source order, wrap focus controls into two rows naturally and stack host/assessment text when needed. At <=767px and any coarse pointer, focus/retry/reset/disclosure targets are at least 44px high with 8px separation; two focus buttons per row when labels fit, otherwise one per row. At 375px they fit without horizontal page scrolling. Use 12px main insets following the board's mobile work-page pattern, minimum 16px input/body text for new mobile prose, wrap IDs/reasons using overflow-wrap, and place role metadata below the role label. No ellipsis hides required roles or limitations.

At 320 CSS px / 400% zoom use a single column and full-width controls; user text enlargement removes fixed heights and permits multiline labels. Hierarchy survives through heading semantics, position and surface separation as well as size; stage kind and limit labels stay explicit. No horizontal swipe, canvas panning or hover is necessary. Respect safe-area insets for any existing fixed shell; this feature adds no fixed footer. Landscape follows available width, not device identity.

## 6. Motion contract

Reuse existing 150ms color/background/border transitions for hover and pressed states. No animated graph edges, shimmer, entrance choreography, count tweening, automatic scrolling or movement on refresh. Loading uses explicit static text with aria-busy on the affected section. With prefers-reduced-motion: reduce, all new transitions are 0ms and loading text remains fully usable. Focus changes are immediate in both modes.

## 7. 6.5 Platform integration contract

Native mobile/extension APIs: n/a, this is responsive web. No permission prompt, install flow, background sync, clipboard export, notification or new deep-link scheme. Reuse only an existing authorized recorded-run destination; no source path is made into a URL.

Offline at open without cache: `Board unavailable offline. Reconnect, then retry.` with `Retry`; do not synthesize catalog/proposal. Same-project cached content, if already held by the existing page, is labeled `Offline. Last loaded <timestamp>.` Mid-read disconnect: retain only same-project bound content with that stale label and show retry; do not queue writes or silently retry mutations. Focus remains a local browsing choice but cannot change evidence identity or make an offline proposal current. Browser permission states are n/a because none are requested.

Perceived list performance: zero skeleton rows and no placeholder figures; initial frame shows loading text. Use existing catalog list rendering and natural row height (minimum 44px, expandable with text); preserve keyboard access to every rendered record. No new virtualization or pagination dependency in this slice. Bound proposal lists to ARCH limits (128 nodes, 256 dependencies, 64 KiB); overflow is unavailable, not a shortened graph. No infinite-scroll trigger or loading footer is introduced.

Race/privacy boundary: each response must match selected project, request generation, focus ID, registry/schema version and pinned change identity. On project/focus/change switch clear mismatched proposal and private details immediately. Out-of-order success, error and finally handlers must all respect the same fence; abort alone is insufficient. A revoked/denied response purges project content rather than retaining it as a stale success. Preserve the current roster fence and extend it to every new read/disclosure.

Project authorization remains server-owned. Public JSON/DOM allowlists metadata IDs/labels, safe role/gate identifiers, bounded reason codes, availability and host limitations. Exclude private roots/overlay bindings, absolute paths, prompts, reports, tokens and source bytes, including hidden attributes, tooltips, URLs, logs and browser storage. Pack invariant text must come from the public descriptive registry only. Treat labels/reasons as inert text via established escaping/textContent; never insert raw HTML, Markdown or Mermaid from metadata. No external requests or private source reads are triggered by browsing.

## 8. Brand tokens

Use existing CSS custom properties by name. Values below are exact current source values, not proposed replacements:

| Token | Dark | Light | Role |
|---|---|---|---|
| --bg-page | #0a0e0c | #eef2f0 | Parent canvas |
| --bg-card | #11161a | #ffffff | Main neutral section |
| --bg-muted | #161c1f | #f0f3f1 | Controls |
| --bg-elevated | #1a2025 | #ffffff | Elevated detail surface |
| --bg-strong | #1e272c | #e2e8e4 | Neutral stronger surface |
| --text | #ecf2ee | #0d1a14 | Main content |
| --text2 | #8a9a92 | #56655e | Secondary text |
| --text3 | #848f88 | #5b6b64 | Metadata |
| --focus-ring | #00d97e | #047857 | Focus outline |
| --accent-text | #00d97e | #097547 | Existing accent ink |
| --border | rgba(255,255,255,.06) | rgba(0,0,0,.10) | Decorative separators |
| --border-strong | rgba(255,255,255,.12) | rgba(0,0,0,.18) | Existing hover border |
| --sans | Geist with current fallbacks | Same | Controls and prose |
| --mono / --display | Geist Mono with current fallbacks | Same | Copyable identifiers / existing display |
| --fs-caption / --fs-small | 12px / 13px | Same | Metadata / compact labels |
| --fs-body / --fs-base | 14px / 15px | Same | Desktop prose / document base |
| --fs-title-s / --fs-title-m / --fs-title-l | 16px / 19px / 22px | Same | Section / region / page |

New feature adds no global tokens. Radius 0 for the new controls/containers, matching live Fleet. Weight 400/500 only for new mono text. Section gap 20px, controls/list gap 12px, button gap 8px, list-row gap 4px reuse measured Fleet values. Decorative borders alone do not communicate selection; underline plus aria-pressed does. Owned self-hosted font files remain unchanged; do not copy the gallery's remote Google Fonts link.

## 9. Out of scope

Runtime routing activation or reduced model-call policy; merging independent reviewers; approving gates; modifying PROJECT/private admission; automatic domain discovery; clinical/compliance/custody/performance claims; paid model trials; new graph canvas; editing packs; saved focus policy; bulk operations; new permission/export/install/release flows; historical trace rewriting; redesigning global shell or existing unrelated catalog metrics. No production code is written by this design phase.

## 10. Open questions

1. No explicit focus is present on first load. Recommended default: none selected, show four choices and existing project/catalog policy; never infer a domain from project name.
2. Does an existing authorized recorded-run deep link exist for every host? Recommended default: show the existing link only when resolved; otherwise `No recorded run selected.` or the accurate partial/unavailable state, without inventing a destination.
3. Which safe reason-code wording will the final projector expose? Recommended default: a fixed English lookup in the board adapter; unknown codes show `Reason unavailable`, retaining mandatory roles and unavailable assessment.

No visual direction decision is outstanding: current board governs. The three dials intentionally match its operator-console siblings. Exact current source wins over historical aesthetic/gallery discrepancies documented above.

## 11. Implementation hand-off

Ordered hand-off, after gate:arch and the root PM's frozen ownership/acceptance contract:

1. Registry owner implements `scripts/lib/focus-registry.mjs` and its test with exact four IDs/mappings and unchanged core-role contracts/public pack metadata. Do not derive role authority from pack membership.
2. Proposal owner implements `scripts/lib/conditional-graph-proposal.mjs` and its test using ARCH's validated envelope, supported versions/limits, additive route classes, mandatory review floor, unavailable fallback and advisory/changesExecution flags. No observed-state fields or controller mutation.
3. Board owner extends `packages/board/lib/fleet.mjs` and `packages/board/server.mjs` through existing project authorization/read paths; allowlist projection and fence identities. No new write endpoint, private file read or model request.
4. The same exclusive board owner extends `packages/board/public/index.html` at Fleet title/focus note/controls/list and its existing render/state helpers. Consume the shared core registry; retain all catalog views, required missing/retired role visibility and unknown-policy fallback. Add the focus group, candidate details and semantic proposal list above catalog controls. Reuse existing drawer rather than author a competing interaction.
5. Verify frozen board tests plus fixtures for all four mappings, two finance packs, no selected default, dynamic catalog count, unknown/failed/filtered/day-one/permission/offline states, required roles outside focus, stale/unknown schema, simultaneous Architecture+Sensitive, and native partial evidence. Snapshot existing scheduling/approval/admission/recorded-trace state before/after browsing; all must remain unchanged.
6. Exercise project A slow response after B success, focus/change identity switches, and late error/finally callbacks. Inject HTML-like labels and private-path/token canaries into fixtures; confirm inert text for allowed labels and absence of forbidden data from JSON, DOM, attributes/storage and URLs.
7. Verify browser keyboard paths, both themes, coarse pointer, 375/768/1024/1440px, 320 CSS px reflow, 200% text, reduced motion and forced colors. Re-measure actual painted focus/text contrast if any surface differs from the neutral beds above. These are implementation acceptance requirements, not tests claimed by this planning artifact.
8. Preserve current independent code review, QA/security and all active gates. Run the root's canonical final gate once for the completed implementation. Publication and runtime-policy reduction retain separate authority. This draft is not gate approval or proof that any implementation/browser acceptance passed.
