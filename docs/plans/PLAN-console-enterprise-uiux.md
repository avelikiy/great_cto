# PLAN — Operator console: enterprise-grade UI/UX

Status: proposed · Created 2026-06-09 · Target: `packages/board/public/autopilot.html`

The console works and is tabbed (Inbox · Cases · Analytics · QA · Ops · Admin). But it is built for a
demo, not for an operator who signs **high-liability decisions at volume, all day**. This plan takes it
to enterprise grade.

## Where it stands today (grounded)
- **694 lines, single static file**, zero build, zero runtime deps. *(Keep this ethos — it's a feature.)*
- **8 design tokens** (`--bg --card --bd --tx --mut --grn --amb --red`) + **69 inline `style=`** — ad-hoc
  styling, no system.
- **9 a11y attributes** total — not keyboard-operable, not screen-reader-ready.
- **0 keyboard handlers** — mouse-only; no hotkeys, no queue navigation, no command palette.
- **`setInterval(refresh, 4000)`** — full re-poll every 4s; no realtime, no optimistic updates.

## What "enterprise" means for *this* product
An operator console where a licensed human signs irreversible, regulated actions. Enterprise = **density
+ speed + trust + accessibility + reliability + white-label**, not chrome. Five principles:
1. **Volume-first** — scan and act on hundreds of cases fast (keyboard, smart queues, density).
2. **Trust-by-design** — the signature is a ceremony; irreversible actions are unmistakable; evidence
   and audit are always one glance away.
3. **Never lie about state** — realtime truth, optimistic with rollback, explicit loading/empty/error.
4. **Accessible by law** — WCAG 2.2 AA is table stakes for regulated buyers (508/EAA).
5. **Yours to brand** — tenant theming / white-label, light+dark, i18n-ready.

---

## Phase 1 — Design-system foundation ✅ DONE (v-console-p1)
Architecture decision: **stay dependency-free** (no React/build), but replace ad-hoc styling with a real
system in the single file.
- **Token layer** — full scale: color (semantic: bg/surface/border/text/accent/success/warn/danger +
  state hovers), 8-pt spacing scale, type scale (Inter/Geist), radii, shadows, z-index, motion
  durations. Light + dark via `data-theme`; tenant override via CSS vars (white-label seam).
- **Component primitives (CSS classes, documented)** — `btn` (variants/sizes/loading), `card`, `pill`,
  `tag`, `field`, `select`, `table`, `drawer`, `kpi`, `toast`, `skeleton`, `empty`, `menu`. Kill the 69
  inline styles.
- **Density modes** — comfortable / compact toggle (operators want compact; persists per user).
- **Acceptance:** inline `style=` count → ~0; one source of truth for color/space/type; theme switch works.

## Phase 2 — Keyboard-first + command palette ✅ DONE
- **⌘K / Ctrl-K command palette** — jump to a tab, a vertical filter, a case id, run an action.
- **Queue navigation** — `j/k` move through the inbox, `Enter` opens the drawer, `a` approve / `e`
  escalate / `r` reject / `s` focus the signer field / `b` send-back, `?` shows the cheatsheet.
- **Focus management** — visible focus rings, focus trap in the drawer, `Esc` closes, roving tabindex in
  the tab bar and queue. Sign without touching the mouse.
- **Acceptance:** a full sign cycle (open → review → sign) is doable keyboard-only; cheatsheet via `?`.

## Phase 3 — Accessibility (WCAG 2.2 AA) ✅ DONE (axe 0 violations, light+dark)
- Semantic roles (`role="tablist/tab/tabpanel"`, `aria-selected`, `aria-live` for the inbox badge +
  toasts), labelled controls, `aria-current`, name/role/value on every interactive element.
- Contrast pass to AA (the muted greys + pills likely fail today); non-color status cues (icon + text).
- Screen-reader script for the **signature ceremony** (announces what will execute on sign).
- `prefers-reduced-motion`, `prefers-color-scheme`, 200% zoom reflow.
- **Acceptance:** axe-core 0 criticals; keyboard-only + VoiceOver walkthrough of a sign; Lighthouse a11y ≥ 95.

## Phase 4 — Realtime + performance ✅ DONE
- **SSE** (`/api/autopilot/stream`) replaces the 4s full-poll: a new gate / status change / dead-letter
  pushes a delta. Falls back to poll if the stream drops.
- **Optimistic actions** — sign/escalate/reject update the row instantly with a rollback-on-error +
  undo toast; no full reload.
- **Virtualized inbox/Cases** — render only what's visible so a 500-case queue stays smooth.
- **Skeletons + explicit empty/error states** everywhere (no silent blank panels).
- **Acceptance:** new case appears < 1s without a reload; 500-row inbox scrolls at 60fps; offline shows a banner.

## Phase 5 — The signature ceremony & trust surfaces ✅ DONE
- **Sign affordance** — the irreversible "Approve & run the write" is visually weightier; shows exactly
  what will execute (the connector + blast radius) and requires the signer's name (already) + an
  explicit confirm for `blastRadius: high`.
- **Evidence/criteria/audit polish** — the drawer becomes a 3-pane: criteria (SOP) · evidence (connector
  findings, expandable) · determination + tamper-evident audit chain with a "verified ✓" badge.
- **Undo window** — a short post-sign undo for recoverable states; never for the executed irreversible
  write (correctly final).
- **Acceptance:** an operator can't sign an irreversible action without seeing what it does; audit "verified" surfaced.

## Phase 6 — Operator productivity ✅ DONE
- **Saved views / smart queues** — "My SLA-breaching", "Auto-eligible", "Escalated to me", "High blast",
  persisted; URL-addressable.
- **Bulk with preview** — select → see a summary ("12 cases · 3 verticals · all auto-eligible") → one
  reason code → apply, with per-item result.
- **Cases table** — sortable/filterable columns, column chooser, CSV/regulator export from the UI.
- **SLA-aware sort** — oldest-waiting / closest-to-breach default; at-risk rows visually escalate.
- **Acceptance:** an operator builds + saves a personal queue; bulk-sign 20 auto-eligible in < 5 clicks.

## Phase 7 — Enterprise admin & white-label ✅ DONE
- **Tenant theming** — logo + accent + name per tenant (CSS-var seam from Phase 1); login/console reflect it.
- **Impersonation/role clarity** — a persistent banner when acting as a tenant/role; "you are signing as X".
- **Audit & export UI** — browse/verify/export the audit chain; retention status surfaced.
- **i18n-ready** — externalize strings; RTL-safe layout. (Translation later.)
- **Acceptance:** a tenant sees their brand; impersonation is unmistakable; audit export from the UI.

---

## Sequencing & sizing
P1 is the foundation (do first). P2+P3 (keyboard + a11y) pair naturally. P4 (realtime/perf) is the
biggest engineering lift. P5 is the trust differentiator. P6/P7 are productivity + go-to-market polish.
Suggested order: **P1 → P3 → P2 → P5 → P4 → P6 → P7**.

## Constraints (non-negotiable)
- Keep zero runtime deps / no CDN / runs-locally ethos; a tiny build step is acceptable only if it
  produces a single self-contained file.
- Preserve the v2.43.0 **safety invariant** and server-side **RBAC** — UI never weakens them.
- No regression to the existing tabbed shell, sign/escalate/bulk/filters/Ops.

## Validation
- axe-core + Lighthouse (a11y/perf) in CI on the console.
- A keyboard-only + screen-reader walkthrough script (the sign ceremony).
- A render load test (500-case inbox) for the virtualization.
- A DOM-sim test (like the tab-RBAC one) for new role/theme gating.
