# Changelog

All notable changes to great_cto are documented here.

---

## v2.54.0 — 2026-06-07

### Console Waves C+D — explainability · narrative · routing dial · QA · bulk · observability

Completes the console gap-roadmap (`docs/plans/PLAN-console-gap-roadmap.md`).

**Wave C**
- **Evidence-linked explainability** — the case drawer's *Evidence* section lists exactly what each
  connector found (the signals behind the AI recommendation) with the live/stub flag.
- **AI-drafted determination** — every run carries a templated rationale composed from the connector
  evidence; the signer reviews it in the drawer before signing.
- **Configurable confidence floor (the routing dial)** — admin Settings sets a per-tenant floor; a
  low-confidence approve is downgraded to *escalate* (routed to a human), and clean high-confidence
  cases are flagged **auto-eligible**.

**Wave D**
- **QA sampling** — a deterministic ~20% sample of *closed* cases lands in a QA queue (admin /
  compliance-lead) to be scored 1–5 against the work; recorded on the run + audit + Analytics.
- **Bulk actions** — multi-select awaiting cases (or "select auto-eligible") → bulk approve / reject /
  escalate with a reason, RBAC-checked per case.
- **Agent-run observability** — per-connector latency (ms) in the drawer + a **⟳ Replay** action to
  re-run a vertical.

New endpoints: `/api/autopilot/config`, `/qa`, `/qa-score`, `/bulk`. 288 lib tests.

## v2.53.0 — 2026-06-07

### Console Wave B: AI recommendation + override logging + regulatory-deadline SLAs · email invites

- **AI recommendation + confidence per case** — the runtime derives a recommendation (🟢 approve /
  🟡 escalate / 🔴 block) from what the pre-gate connectors actually found (OFAC hit, fraud-score
  refer, um-criteria not-met, hs-classify confidence, ITGC severity, …) and shows it on the card so
  the human triages fast. Confidence surfaced when a connector returns one (e.g. HS classification).
- **Override logging** — when the human decides against the AI (approve a block/escalate, or reject
  an approve), the audit trail records `override: true` + the AI's recommendation. Critical evidence
  for a "human signs the action" product; shown in the case drawer and counted in Analytics.
- **Regulatory-deadline SLAs** (`scripts/lib/sla.mjs`) — per-vertical turnaround (prior-auth 72h,
  pharma 360h/15-day ICSR, aml 720h/30-day SAR, soc 4h, freight 24h, …). The console **counts down
  to the deadline** (due in / at-risk / OVERDUE), not just elapsed time.
- **Email invites** — the admin Team panel takes an operator email and best-effort sends the invite
  link via the notify relay (falls back to copy-link if the relay only allows the verified address).
- 285 lib tests.

## v2.52.0 — 2026-06-07

### Console: the queue→platform jump (analytics · structured dispositions · escalation)

Implements Wave A of `docs/plans/PLAN-console-gap-roadmap.md` — a gap analysis vs the operator
consoles of the startups in our verticals (Cohere, Anterior, Hummingbird, Sardine, Unit21, Checkr,
Sierra, Decagon, Scytale, Descartes …). Our console was best-in-class as a *signing surface* but a
*queue, not a platform*. This closes the three most-cited gaps:

- **Analytics dashboard** — aggregate KPIs over real run data (total · completed · awaiting ·
  approval rate · escalation rate · avg time→decision · SLA breaches · rejected/escalated/sent-back),
  role- and tenant-scoped. *"Is the autopilot taking work off your desk?"*
- **Structured dispositions + reason codes** — every decision carries a controlled reason
  (meets-criteria · below-confidence-floor · policy-exception · insufficient-documentation ·
  fraud-suspected · …), recorded in the audit trail. No more un-aggregatable free text.
- **Escalation as a first-class state** — `↑ Escalate` (route to a senior; stays in the queue,
  flagged) and `↩ Send back` (needs-info; recoverable, nothing irreversible runs) alongside
  approve/reject. New `/api/autopilot/stats`, `/escalate`, `/send-back`.

Roadmap (Waves B–D) captures the rest: AI recommendation+confidence, override logging, regulatory-
deadline SLAs, evidence-linked explainability, AI-drafted narrative, QA sampling, bulk actions.
283 lib tests.

## v2.51.0 — 2026-06-07

### The admin onboards operators — scoped invite links

The CTO/admin gets full access and **invites a licensed operator into an industry**: pick a role
(which fixes the vertical scope) + a tenant + a name → mint an **invite link** to send them. The
operator opens the link and is locked to that role + tenant — no role picker, no Build board.

- **Invite store** (`scripts/lib/operators.mjs`) — `createInvite` mints a token; `resolve / accept /
  revoke` lifecycle. Rejects unknown / admin roles.
- **The token is the operator's credential** — resolved **server-side and authoritative**: an
  operator can't escalate by passing `role=admin` (the token wins). Verified: an operator sees only
  their vertical even with `role=admin` in the request; a non-admin can't create invites (403).
- **Admin Team panel** in the console — create an operator (role + tenant + name) → copy the invite
  link · list invites with status (pending/accepted) · revoke. The whole panel is admin-only.
- **Operator session** — `?invite=<token>` (saved in localStorage) → "Signed in as … · <role> ·
  tenant" banner, queue scoped to their vertical(s) + tenant, sign-out link.
- New endpoints: `POST /api/autopilot/invite`, `GET /api/autopilot/invites`,
  `GET /api/autopilot/invite-resolve`, `DELETE /api/autopilot/invite`. 280 lib tests (4 new).

## v2.50.0 — 2026-06-07

### The console is the operators' app — role-based access + case-detail drawer

Answers "does the CTO need the admin board?": **no — the Operate console is the operational staff's
surface** (the licensed humans who sign). The CTO/admin builds in the CLI and oversees; only `admin`
may switch to the Build board.

- **RBAC (`scripts/lib/roles.mjs`)** — 20 roles. An operator role (coder · BSA officer · customs
  broker · CPA · QPPV …) only **sees and signs** the cases for its own vertical(s); `compliance-lead`
  sees every queue but can't Build; `admin` does everything. Enforced on the API: `/api/autopilot/runs`
  is role-filtered, and **approve/reject/start return 403** outside a role's verticals.
- **Console** — a role picker ("I am the …") scopes the queue, hides the Build switch + "Start a run"
  for operators, and restricts the start picker to the role's verticals.
- **Case-detail drawer** — click any run → a side drawer with the full step trace, the accountable
  owner, multi-gate progress, the **audit trail**, and an **⬇ Export audit (JSON)** button.
- New `/api/autopilot/roles`. 276 lib tests (5 new RBAC tests; verified: a BSA officer can't see or
  sign an rcm case).

## v2.49.0 — 2026-06-07

### Rethink the CLI + admin board around the autopilot model (Build ⇄ Operate)

Implements `docs/plans/PLAN-cli-board-autopilot-rethink.md`. The product has two modes — **Build** an
autopilot (the gated engineering pipeline) and **Operate** one (the runtime where a licensed human
signs the risky call) — and the operator surfaces now make that explicit.

**CLI**
- **`/autopilot`** — first-class Operate command (`start | inbox | runs | show | approve | reject`),
  previously only `node scripts/autopilot.mjs`. Shares the run store with the admin board.
- **`/flow`** — dropped stale "stubs today / measured score" copy; added a "▶ run it: `/autopilot
  start <vertical>`" footer so inspect → operate is one hop.
- **`/help`** — regrouped around the two modes: Operate · Build · Compliance reviewers · Daily · Admin.
- Removed the broken `commands/s-classify.md`.

**Admin board**
- **Operate ⇄ Build mode switch** in both headers (the dev board topbar gains a "🛂 Operate ↗" link);
  the autopilot console is now the operator's primary surface, not a bolt-on page.
- **Console = a real compliance work-queue**: filter by tenant / vertical / status · per-vertical
  icons + signer role on each card · ⏱ time-in-queue SLA pill (warn >1h, breach >4h) · multi-gate
  "✍️ N of M signatures" progress · tenant badge · oldest-waiting-first ordering · all 19 verticals
  in the start picker · 🔔 push subscribe in the header.

272 lib tests.

## v2.48.0 — 2026-06-07

### Live connectors for customs / audit / pharma (22 live total) + CLI/board rethink plan

- **5 new live connector adapters** so the three newest verticals run on real domain logic, not
  mocks (keyless by default; POST to the real provider when env creds are set):
  - **hs-classify** (customs) — HS/HTSUS classification from a curated table; low confidence →
    escalate to the broker (a misclassification carries 19 USC 1592 penalties).
  - **customs-entry** (customs) — CBP Form 7501 entry generation + duty/MPF/HMF; **blocks without the
    licensed-broker signature**.
  - **itgc-test** (audit) — real ITGC control tests across the 4 domains → exception + severity
    (deficiency / significant / material weakness); significant+ escalates to the CPA.
  - **meddra-code** (pharma) — MedDRA coding of a verbatim AE term; an Important Medical Event or low
    confidence forces medical review (never auto-downgrades seriousness).
  - **safety-report** (pharma) — ICH E2B(R3) ICSR generation + 15-day expedited flag; **blocks without
    the QPPV signature**.
- Live runs confirm: customs fires hs-classify + OFAC, audit fires itgc-test, pharma fires FHIR +
  MedDRA — all pre-gate. **22 live adapters across the 19 verticals.** 271 lib tests.
- **Plan** `docs/plans/PLAN-cli-board-autopilot-rethink.md` — reframe the CLI + admin board around
  the autopilot model (Build ⇄ Operate; `/autopilot` slash command; the board's compliance work-queue).

## v2.47.0 — 2026-06-07

### 3 new verticals (19 total) + browser push to the signer + physical tenant isolation

- **3 new hard-gap verticals** (research-backed US markets), each with its own flow, connectors,
  compliance reviewer, pack/command/TM, and golden eval set — all Tier-0 wired:
  - **customs** — Customs clearance ($4.6B); a licensed customs broker signs the entry of record.
    Reuses live **OFAC/sanctions-screen** for denied-party.
  - **audit** — SOX ITGC audit ($15–25B); a CPA / engagement partner signs the ICFR opinion.
  - **pharma** — Pharmacovigilance ($1.65B outsourced); a QPPV / drug-safety physician signs before
    a safety report is filed. Reuses live **ehr-fhir**.
- **Browser push to the signer** — the autopilot console has a "🔔 Notify me" button that subscribes
  the licensed human's browser (VAPID); when a case lands in their queue they get a real push.
- **Physical multi-tenant isolation** — runs are now stored under `<base>/<tenant>/<id>.json`; a
  tenant's directory never holds another tenant's runs (logical filtering hardened to physical).
- 270 lib tests. All 19 verticals pass `--validate` and the durable run → inbox → sign → write loop.

## v2.46.0 — 2026-06-07

### Layer D — operated end-to-end autopilot service (durable runs + human-gate inbox)

Autopilots stop being flows that *describe* a pause and become a **real operated service**: a run
persists, pauses at the human checkpoint, waits in an **inbox** for a named licensed human to sign,
then **resumes and executes the irreversible action** (the write). Built on `rcm`; reusable by all 16.

- **Durable run store** (`scripts/lib/run-store.mjs`) — runs persist to
  `.great_cto/autopilot-runs/<id>.json` and survive process restarts. `startRun` → `awaiting-approval`
  at the gate; `approve(id, who)` resumes + runs the write; `reject(id, who)` ends it with nothing
  irreversible run. Every transition is appended to an immutable audit trail (who · what · when).
- **Resumable runtime** (`flow-runner.mjs`) — `runFlow` gains `startAt` + `approvedGates`. The
  v2.43.0 safety invariant now holds *end to end*: the irreversible step executes **only because a
  human signed its protecting gate** — proven across a process boundary (approve in a separate run).
- **Operator CLI** (`scripts/autopilot.mjs`) — `start · inbox · show · approve --by · reject · runs`.
- **Admin console** (`packages/board`) — additive endpoints `/api/autopilot/{runs,start,approve,reject}`
  + an **Autopilot inbox** page (`/autopilot.html`) to sign gates, with an "Autopilot" board nav link.
- Demonstrated on rcm live: intake → code → NCCI (3 live connectors) → **pause** → coder signs in the
  inbox → **837 claim submitted** (the write) → completed. Reject path submits nothing.
- **CLI ↔ board sync** — one shared store (`~/.great_cto/autopilot-runs`) so a run started in either
  tool shows in the other's inbox; approve/reject from either is reflected. Verified bidirectionally.
- **Multi-gate flows** — a flow can require several signatures in sequence. `tax` now needs two:
  the preparer signs (PTIN), then the taxpayer signs Form 8879 — the IRS e-file fires only after both.
- **Push to the signer** — the board pushes "🛂 new case awaiting your signature" when a gate opens
  (start, or the next gate of a multi-gate flow), reusing the existing web-push adapter (deduped).
- **Hardening** — multi-tenant scoping (`tenant` on a run; the inbox shows only that tenant's queue)
  + an **idempotency key** (stable per run) threaded into the write so a retry never double-submits.
- 261 lib tests.

## v2.45.0 — 2026-06-07

### Every vertical goes live — 8 new connectors, 16/16 autopilots run on real data (Wave 8)

Closes the live-connector gap: the 5 zero-live verticals (soc, insurance, mortgage, credentialing,
collections) each get a real adapter, plus deeper "brains" for prior-auth, aml and freight. Keyless
by default (deterministic real logic or a curated public slice), POST to the real provider when keyed.

- **threat-intel** (soc) — IOC enrichment: type detection + curated abuse.ch/URLhaus-style bad list + heuristic scoring. VirusTotal/GreyNoise when keyed.
- **fraud-score** (insurance) — 11 transparent P&C SIU red-flag indicators → score + `refer`.
- **aus** (mortgage) — DU/LPA-style underwriting: LTV/DTI + codified conventional/FHA/VA thresholds → Approve/Refer/Ineligible.
- **primary-source** (credentialing) — OIG LEIE / SAM exclusion screen (hard block) + real NPI Luhn check.
- **comms-outreach** (collections) — FDCPA/Reg F (7-in-7) + TCPA + 8a–9p guardrail: ALLOW/BLOCK each contact. Twilio when keyed.
- **carrier-vet** (freight) — FMCSA SAFER vetting (authority/insurance/safety + double-broker flags). Live FMCSA QCMobile when keyed.
- **um-criteria** (prior-auth) — CMS NCD/LCD-style medical-necessity matcher; **never auto-denies** — missing criteria escalates to the medical director.
- **sar-filing** (aml) — FinCEN SAR (Form 111) generation; **blocked without the BSA Officer signature**. FinCEN BSA E-File when keyed.

Plus a dispatcher fix: `call()` now owns `mode` — any live-adapter result is `mode:'live'` (the
adapter's sub-mode is kept as `adapterMode`). **17 live connectors total; all 16 verticals exercise
≥1 live connector** (14 pre-gate; legaltech e-sign + aml SAR fire post-gate by design). 252 lib tests.

## v2.44.0 — 2026-06-07

### 10 new service-autopilots — 16 verticals total

Research-backed expansion (US market, 2024–2026) beyond the original 6. Each new vertical pairs a
large displaceable-labor pool with a **legally-required named human who signs the risky call** — the
exact shape the v2.43.0 safety engine is built for. All sixteen ship green on `--validate`.

The 10 new autopilots (flow + connectors + compliance reviewer + page):

- **prior-auth** — Prior-authorization ($35–56B); medical director signs every denial.
- **aml** — KYC/AML compliance ($61B); BSA Officer signs every SAR. Reuses live **sanctions-screen**.
- **soc** — Managed-SOC / MDR (~$4–6B); SOC analyst authorizes containment.
- **insurance** — Claims & underwriting (~$36–38B); licensed adjuster/underwriter signs.
- **mortgage** — Mortgage underwriting (~$40B origination cost); DE underwriter signs clear-to-close.
- **title** — Title & escrow ($16.2B); licensed officer signs the title + authorizes the wire. Reuses live **e-signature**.
- **credentialing** — Provider credentialing; credentialing committee signs privileging.
- **collections** — Debt collection ($13.5–16B); manager/attorney signs escalation + settlements.
- **freight** — Freight brokerage ($19–125B); FMCSA-licensed broker signs binding rates.
- **cro** — Clinical-trial ops (~$20–28B US); PI / medical monitor signs eligibility + safety. Reuses live **ehr-fhir**.

- **33 new connectors** in the catalog (65 total), reusing live ones (sanctions-screen, e-signature,
  ehr-fhir, payment-rails…) so several new verticals run live on day one.
- **7 new compliance reviewers** (prior-auth, aml-bsa, soc-mdr, title-escrow, credentialing,
  collections, freight-broker); insurance / mortgage / cro reuse existing reviewers.
- Every flow carries the v2.43.0 safety invariant — irreversible step behind a human gate + an
  accountable owner. Site shows all 16 with live/stub connector badges, irreversible flags, owner.
- 250 lib tests (flow-count 6→16). Plan: `docs/plans/PLAN-vertical-expansion-10.md`.

## v2.43.0 — 2026-06-07

### The permission is never the wound — irreversible-action gating + accountable owner

Inspired by Oleksandr Torlo's *"The Permission Was the Wound"* (2026): the real danger of an agent
isn't going rogue — it's doing *exactly what it's permitted*, irreversibly, at machine speed, with no
human hesitation. GreatCTO already pauses at human checkpoints; this release makes the boundary an
**enforced runtime invariant**, not just a convention.

- **`reversible` + `blastRadius` on every flow step** — each step is tagged reversible (read / draft /
  check) or not (money move, claim submission, e-signing, fleet change, tax filing), with a
  low/medium/high blast radius.
- **The runtime refuses to execute an irreversible action autonomously** (`flow-runner.mjs`) — an
  irreversible step with no prior human checkpoint is **blocked** (`blocked-unsafe`); one that *is*
  protected runs only after the gate is signed (in a whole-flow dry-run it's recorded as `gated`, never
  auto-fired). The volume runs straight-through; the point of no return always waits for a person.
- **`validateFlow()` + `--validate`** — enforces the invariant (irreversible ⟹ preceded by a human
  gate) and that every autopilot names an **accountable owner**. All six verticals ship green.
- **Accountable owner per autopilot** — one named human answers for what it does, closing the
  "confused deputy / the AI did it" gap. Surfaced in the run trace and on each autopilot page.
- **Site** — autopilot pages now flag the irreversible steps (always behind the checkpoint) and show
  the accountable owner. 7 new tests (30 in the flow-runner suite, 220 lib total).

## v2.42.0 — 2026-06-07

### Every autopilot executes on a live connector — all 6 verticals (Phase 4 complete)

v2.41.0 shipped the connector runtime + the first two live connectors (FHIR, code-sets). This
release finishes Phase 4: **seven more live connectors** so that *every* service-autopilot vertical
runs at least one step against real data or real domain logic — not a mock. Still keyless: each
connector defaults to a public source or deterministic real generation, and POSTs to the real
provider only when env credentials are present.

- **clearinghouse** (`connectors/clearinghouse.mjs`, rcm) — generates a structurally valid **X12
  837P** claim and parses **835** remits. `GREATCTO_CLEARINGHOUSE_URL` to submit.
- **ncci-mue** (`connectors/ncci.mjs`, rcm) — real **NCCI PTP** unbundling + modifier edits and
  **MUE** unit limits before a claim goes out.
- **e-signature** (`connectors/e-signature.mjs`, legaltech) — builds a real **DocuSign** envelope and
  enforces **ESIGN/UETA** exclusions (refuses to e-sign a will, etc.). `DOCUSIGN_*` to send.
- **bank-feed** (`connectors/bank-feed.mjs`, accounting) — a real **Plaid** `/transactions/get`
  request + deterministic GL classification of each txn. `PLAID_*` to pull a live feed.
- **sanctions-screen** (`connectors/sanctions.mjs`, procurement) — fuzzy-matches a counterparty
  against a curated slice of the real **OFAC SDN** list; a hit is a **HARD BLOCK** (strict
  liability). `GREAT_CTO_OFAC_PATH` loads the full list.
- **rmm** (`connectors/rmm.mjs`, msp) — `stage-change` builds a real **staged rollout** plan
  (canary 1% → early 5% → broad 25% → fleet 100%) with a health gate + auto-halt-and-rollback per
  ring + a pre-change snapshot — never a fleet-wide push.
- **tax-engine** (`connectors/tax-engine.mjs`, tax) — a real **2025 US federal** computation
  (brackets + standard deduction) + a §6694 authority-ladder position classifier.

Phase 4 status: **9 live connectors across all six verticals** — rcm (4: FHIR · NLM · NCCI · 837) ·
legaltech (e-sign) · accounting (Plaid) · procurement (OFAC) · msp (RMM) · tax (engine). Demo
inputs thread representative payloads so `flow-runner.mjs <vertical> --live` exercises each adapter.
213 lib tests.

## v2.41.0 — 2026-06-07

### Autopilots execute the flow — connector runtime + two live connectors (Phase 4)

The service-autopilot verticals (shipped in v2.40.0) stop *describing* a flow and start
**executing** it, with the first **live connectors** reading real data — no API keys.

- **Connector runtime** (`scripts/lib/connectors.mjs`) — a `call()` dispatcher with **stub | live**
  modes, a lazy live-adapter registry, `hasLiveAdapter`, and a CLI. Stub stays deterministic +
  network-free; live hits a real adapter when one is registered, else falls back to stub.
- **Live FHIR/EHR connector** (`connectors/fhir.mjs`) — a real FHIR R4 client; defaults to the
  public HAPI sandbox (no auth), `GREAT_CTO_FHIR_BASE`/`TOKEN` for Epic/Cerner/athenahealth.
  Reads real clinical notes.
- **Live code-sets connector** (`connectors/codesets.mjs`) — real ICD-10-CM / HCPCS lookup +
  validation via the NLM Clinical Table Search Service (free, no auth). CPT is AMA-licensed, so it
  returns a clear "needs a licensed service" note rather than a wrong answer.
- **Flow-runner** (`scripts/lib/flow-runner.mjs`) — the doing layer: walks a flow's steps, runs each
  agent step's connectors, and **pauses at a human checkpoint** — the assistant↔autopilot boundary
  enforced at runtime. CLI: `flow-runner.mjs <vertical> [--live] [--full]`.

Proven end to end: `flow-runner.mjs rcm --live` runs **two live connectors** (real note via FHIR,
real ICD-10 via NLM) then halts at `gate:coding-signoff`. 39 new unit tests (205 lib total).

## v2.40.0 — 2026-06-07

### AI autopilots for business — service-autopilot verticals, a quality scorecard, and the positioning pivot

The big one: great_cto becomes **"AI autopilots for business"** — products that sell the *outcome*
of a service, not a tool to a specialist. Seven verticals, a measured quality scorecard, and a
full positioning pivot. 49 new lib tests since v2.39.0 (189 total); structural + 21 reviewers green.

**Service-autopilot family (epic great_cto-rpd).** A cross-cutting overlay + six vertical packs,
each a full reviewer + threat-model template + pack + command + measured human-sign-off gate:
- `service-autopilot-pack` + `scripts/lib/autopilot-gate.mjs` — the four autopilot invariants made
  machine-checkable: judgment boundary (confidence→escalation), accuracy-as-SLA, per-decision audit
  trail, per-outcome unit economics.
- **legaltech** (UPL · privilege · e-sign · `gate:attorney-signoff`), **rcm** (ICD-10/CPT · False
  Claims Act · NCCI · `gate:coding-signoff`), **procurement** (OFAC sanctions · FCPA · fraud/SoD ·
  `gate:payment-release`), **accounting** (GAAP/ASC 606 · SOX ICFR · `gate:financial-close`),
  **msp** (change-mgmt · JIT/PAM · SOC 2 · `gate:change-approval`), **tax** (Circular 230 ·
  §6694/6695/7216 · `gate:preparer-signoff`). 21 domain reviewers wired.

**Vertical quality scorecard (epic great_cto-h6n).** Measure each vertical 0–100 — quality is
earned, not declared.
- `scripts/lib/vertical-score.mjs` (7 weighted dimensions) + `scripts/eval/vertical-scorecard.mjs`
  (golden + adversarial cases through the reviewer + LLM judge) + a regression gate
  (`--gate`/`--rebaseline`) wired into `ai-eval-engineer`. Two measure→improve→re-measure cycles
  lifted legaltech 85→94.75 and msp 78→98.5. All seven verticals ship-ready on a measured basis.

**Autopilot pivot (epic great_cto-og7).** Positioning moves from packs/pipelines to **flows**.
- `flows/*.flow.json` (single source of truth) + `scripts/lib/flow.mjs` + `scripts/lib/connectors.mjs`
  (connector catalog, all sandbox stubs) + `/flow` command + `docs/positioning/vocabulary.md`.
- `/start` detects the business function → renders the flow; README leads with the autopilots.
  Packs / reviewers / gates are now the under-the-hood trust layer, never the headline.





## v2.39.0 — 2026-06-06

### NaCl-inspired governance: impl-brief + traceability + gap-closure waves (Phases 3–5)

Completes the governance contour started in v2.38.x (Phase 1 signed exceptions · Phase 2
strict-mode evidence-blocking gates). All logic is machine-checkable with `$0`, no new
runtime deps, lean (no Neo4j). 63 new unit tests (120 lib total).

**Phase 3 — impl-brief handoff bundle.** Each senior-dev task ships a per-task brief that
pins files-to-modify (allowlist) / **files NOT to modify** (denylist) / API-CONTRACT /
TEST-SPEC / ACCEPTANCE, so scope creep is caught mechanically, not in review prose.
- `skills/great_cto/templates/IMPL-BRIEF-template.md` + `scripts/lib/impl-brief.mjs`
  (`parseBrief` / `validateBrief` / `checkScope` — glob `**`, denylist = hard fail). CLI
  `check <brief> <changed-files…>` exits 1 on a denylist hit.
- pm Step 7b emits + validates; senior-dev Step 4 reads, Step 6b refuses an out-of-scope
  commit (override = signed exception); architect derives the denylist from ARCH Non-goals.

**Phase 4 — requirement → use-case → task → test traceability + `/trace`.** NaCl's graph
value (impact analysis + coverage gaps) modelled on beads relationships.
- `scripts/lib/trace.mjs` (`traceUp` rationale / `traceDown` impact / `coverageGaps`) +
  `/trace <id> | feature <slug>`; `/review trace` is now a thin alias for the one engine.
- architect mirrors REQ + UC into bd and wires `task→uc→req`; qa-engineer wires `test→impl`.

**Phase 5 — gap-closure waves.** Adopt strict gates on a legacy repo incrementally instead
of blocking cold: enumerate gaps, schedule into waves (criticals never deferred), hold each
deferred gap green with an interim **signed, expiring** exception — never a silent bypass.
- `scripts/lib/gap-waves.mjs` (`planWaves` / `interimExceptionsNeeded` / `validateRegister`) +
  `GAP-REGISTER` / `GAP-WAVE-PLAN` templates; `/audit` step 4b + `/migrate` step 3b emit them.

## v2.38.0 — 2026-06-06

### Context compression layer (headroom-inspired, native)

Cut the tokens agents read from logs / tool-outputs / JSON / memory — **without losing
answers** — using deterministic, $0 compressors (no LLM, no native dependency). Concepts
borrowed from [chopratejas/headroom](https://github.com/chopratejas/headroom), built native
to keep great_cto lean and local-first.

- **Compressors** (`scripts/lib/compress/`) — ContentRouter auto-detects type and applies:
  `log-template` (collapse repeats to sample + count, keep FATAL/ERROR/stack verbatim),
  `json-minify` (+ optional array crush, safe fallback on non-JSON), `line-importance`
  (keep severity + stack, elide boilerplate to budget). `compress(text,{type,budget,crush})`
  + CLI. Real numbers: CI log 31,475→155 chars (99.5%), JSON 43% minify / 98% crush, noisy
  test run 86% with the FAIL preserved.
- **CCR — Compressed Context with Retrieval** (`scripts/lib/ccr.mjs`, `/ccr`) — anything
  dropped/compressed is stored locally (`.great_cto/ccr/`, content-addressed, ~500-item GC)
  and recoverable on demand. `memory-filter` now registers what it filters out and appends a
  recall footer → **lossless-on-demand**, so we compress aggressively without risk.
- **Agent wiring** — `l3-support` (logs) and `qa-engineer` (test/build output) compress before
  reasoning via the shared `agents/_shared/compress-prompt.md` contract.
- **Fidelity gate** — `EVAL-compression-fidelity` (tuning+holdout) runs through the v2.37.0
  eval loop: a compressor ships only if the key fact survives on the holdout split.
- CI: evals-runner unit job now also runs `tests/lib`. 30 new unit tests.

### Fixed
- `ccr store` flag parsing (a `--source` value was mistaken for content); now reads stdin too.

- _Add one bullet per shipped feature._
- _Cite ADRs introduced (if any)._
- _Mention test counts and opt-out flags._

---

## v2.37.1 — 2026-06-05

### Fixed

- **pre-push hook: new-branch leak scan no longer scans entire history.**
  `scripts/hooks/pre-push.sh` computed the scan range with
  `git rev-list --remotes --not <local_sha>` (reversed — lists commits on remotes
  *not* in local). On a branch that descends from already-pushed history this
  returned empty and fell back to `range=<local_sha>`, making `git log <local_sha>`
  scan the **whole repo history** — false-flagging private project names in old
  commits and blocking legitimate pushes (worked around with `--no-verify`).
  Now uses `git rev-list <local_sha> --not --remotes` and scans only the genuinely
  new commits (`base..local_sha`). Real leaks in new commits/diffs are still blocked.
  Added `tests/hooks/pre-push.test.mjs` (3 integration tests).
  Note: existing repos keep their already-installed hook (installer skips if present)
  — re-sync manually with `cp scripts/hooks/pre-push.sh .git/hooks/pre-push`.

- _Add one bullet per shipped feature._
- _Cite ADRs introduced (if any)._
- _Mention test counts and opt-out flags._

---

## v2.37.0 — 2026-06-05

### Self-improvement loop (SIA-inspired)

Closes the agent-prompt self-improvement loop, porting the generation→evaluate→gate
cycle from [hexo-ai/sia](https://github.com/hexo-ai/sia). A learned prompt improvement
can no longer ship until it is re-run and proven on a held-out eval set.

- **Tuning / holdout eval split** — `tests/eval/runner.mjs` parses `## Cases (tuning)`
  (visible to ai-prompt-architect) vs `## Holdout cases` (gate-only, anti-overfit),
  with a new `--split all|tuning|holdout` flag. Backward-compatible: a plain `## Cases`
  heading is treated as tuning.
- **Promotion gate** — `scripts/eval-gate.mjs` blocks any candidate prompt that
  regresses on the holdout split or falls below an eval's own threshold (exit 0/1/2).
- **Closed prompt-evolution loop** — `scripts/prompt-evolve.mjs` + `/prompt-evolve`
  command: lesson → candidate prompt → holdout gate → PROMOTE/REJECT, with an auditable
  per-agent generation ledger (`.great_cto/prompt-evolution/<agent>.jsonl`).
- **Evolutionary memory** — `scripts/agent-changelog.mjs` renders a per-agent generational
  changelog (lesson + held-out eval delta + provenance), surfaced in `/agent-review`.
- **Sandbox hardening** — `scripts/lib/guards.mjs` (`safeReadFile` size-cap, `truncate`,
  `withTimeout`) wired into `scripts/memory-filter.mjs`; `scripts/sandbox-eval.sh` runs a
  candidate prompt's holdout evals in an isolated, timeout-bounded throwaway copy.
- **CI** — `evals-runner.yml` gains a no-API `unit` job (runner + gate + evolve + guards
  tests) that gates the paid judge run. 71 new/updated unit tests.
- **Docs** — `ai-eval-engineer`, `gen-evals` (now emits 70/30 tuning/holdout), EVAL-template.

- _Add one bullet per shipped feature._
- _Cite ADRs introduced (if any)._
- _Mention test counts and opt-out flags._

---

## v2.33.1 — 2026-05-29

### Fixed: 3 SessionStart config bugs in plugin.json

Closes the remaining 3 bug-hunt findings that were tracked in
`docs/PENDING-v2.32.1.md` (the other 5 — hooks + CLI — already shipped in
v2.33.0 via commit `448ad48`). All three live in the `SessionStart` hook
command in `.claude-plugin/plugin.json`:

- **#6 — `&;` broke SessionStart under bash/sh.** Six `&;` sequences
  (background + stray `;`) are accepted by zsh but rejected by bash/sh with
  a syntax error that aborted the *entire* hook (no agent/command sync, no
  PROJECT/brain load). Replaced all six `&;` → `&`. `bash -n` now passes.
- **#4 — broken model-override path.** `bash "\/scripts/apply-model-override.sh"`
  (stray backslash, missing `${PLUGIN_DIR}`) never resolved, so
  `~/.great_cto/config: agent-model` was silently ignored. Fixed to
  `"${PLUGIN_DIR}/scripts/apply-model-override.sh"`.
- **#2 — 5 routed agents never synced.** `gdpr-reviewer`,
  `us-privacy-reviewer`, `dpdpa-reviewer`, `digital-health-reviewer`, and
  `coordinator` were absent from the agent copy-list, so they were never
  written to `~/.claude/agents/` and dispatch silently failed. Appended them.

This completes the v2.32.0 bug-hunt (9 findings, all verified and closed).
Version files re-synced together (plugin.json + package.json + jsr.json) —
the original v2.32.0 drift came from a partial bump.

---


## v2.33.0 — 2026-05-29

### Fixed: digital-health-pack was non-functional + fully wired it

`digital-health-pack` (Wave 4) was registered in the pack registry but only
half-wired, so it could never actually auto-attach:

- **Detection bug (user-facing):** `detect.ts` `mineReadmeKeywords` only emitted
  Wave 1-3 pack-trigger terms, so none of digital-health's keywords (wearable,
  HRV, HealthKit, mental health, supplement AI, physician HITL, RPM, …) were
  ever surfaced — the pack was undetectable from any README. Added all Wave 4
  terms, kept in sync with `packs.ts` SIGNALS.keywords.
- **Gates:** registered the 5 pack gates (`gate:wellness-vs-samd`,
  `gate:hitl-design`, `gate:wearable-api-access`, `gate:supplement-safety`,
  `gate:mental-health-protocol`) in `ARCHETYPES.md` Domain Overlays + the
  human-gate summary (corrected the stale "13 gates / Wave 1-3" labels).
- **Reviewers:** added the missing `<!-- HANDOFF -->` block to
  `digital-health-reviewer`; added `applies_to` + HANDOFF to
  `healthcare-reviewer`.
- **Threat model:** new `TM-digital-health.md` template.
- **EVAL:** added `EVAL-digital-health-hitl-boundary`,
  `EVAL-digital-health-supplement-safety`,
  `EVAL-digital-health-mental-health-crisis`.
- **Test coverage:** new `digital-health-wearable` e2e fixture; removed the
  pack from the packs-e2e documented-exception allowlist. Every registered
  pack now has a fixture (11/11), packs-e2e 531/531 assertions pass.

---


## v2.32.0 — 2026-05-29

### Removed: AgentShield scanner

The bundled AgentShield static scanner has been fully removed. It was an
AI-security pattern scanner (OWASP LLM Top 10) that shipped its own CLI
commands, MCP tools, rule files, and SARIF/JUnit output. Pre-implementation
threat modelling is now owned entirely by the `ai-security-reviewer` agent,
which is a better fit for the gated-pipeline model.

**Breaking — removed CLI surface:**
- `great-cto scan` command (+ `--severity` / `--scanner` flags)
- `great-cto list-rules` command
- `scan` and `list_rules` MCP tools (MCP now exposes **7 tools**:
  `detect_archetype`, `estimate_cost`, `query_decisions`, `project_status`,
  `cost_summary`, `pipeline_stages`, `recent_verdicts`)
- The `~/.great_cto/guardrails.yml` file is no longer created on bootstrap
- `agentshield-rules/` rule files dropped from the published npm package

**`great-cto ci` survives** — the command now runs archetype-drift and
budget checks only (`--no-archetype` / `--no-budget` to skip). Existing CI
pipelines keep working but no longer fail on security findings.

**Unchanged:** the `secret-scan` pre-commit hook is a separate subsystem and
is unaffected. Per-file opt-out remains `// great_cto:allow-secrets`; the
whole hook honours `GREAT_CTO_DISABLE_SECRET_SCAN=1`.

---


## v2.31.0 — 2026-05-29

### Opus 4.8 upgrade

Anthropic released [Claude Opus 4.8](https://www.anthropic.com/claude/opus)
on 2026-05-28 (API id `claude-opus-4-8`). It is the new flagship for deep
reasoning — better coding at the default effort level (similar token spend to
Opus 4.7) and a 1M-token context window.

**Model bumped `claude-opus-4-7` → `claude-opus-4-8`** in:
- `architect` (`model:` pin) — cross-cutting reasoning + ADR generation
- 41 reviewer/specialist agents + `commands/review.md` (`advisor-model:` pin)

**Tier aliases unchanged.** Every `model: sonnet` / `model: haiku` agent keeps
its alias and auto-resolves — only the explicitly pinned Opus references moved.

**No cost change** — Opus 4.8 standard pricing is $5 in / $25 out per MTok,
identical to Opus 4.7. (Fast mode, if used, is $10 / $50 at ~2.5× speed.)

**Pricing docs corrected:** `agents/pm.md` and `ADR-002` carried a stale
`$15 / $75` Opus rate from the Opus 4.5 era. Updated to the current `$5 / $25`
so PM cost estimates and the model-tier policy reflect reality.

**Sonnet 4.6 + Haiku 4.5 unchanged** (no new versions released).

### ⚠️ Security note — prompt-injection regression

Anthropic's Opus 4.8 model card reports a regression in agentic
prompt-injection robustness: **9.6% attack-success rate vs 6.0% on Opus 4.7**
when processing untrusted inputs. great_cto's `ai-security-reviewer` and the
advisor escalation path both run on Opus, so when reviewing pipelines that
feed untrusted external content into tool-calling agents, treat
input-sandboxing and output-validation as higher priority than before. No
code change in this release — flagged for awareness.

---


## v2.30.0 — 2026-05-28

### Board server auto-restart on upgrade

`npx great-cto init` now automatically restarts the board server when a new
version is installed and the server was already running. No more stale admin
panel after upgrades.

**How it works:**

- `great-cto board` writes a PID file to `~/.great_cto/board.pid` on start
  and removes it on exit.
- Before spawning a new server process, `board` kills any process recorded in
  the PID file — so `great-cto board` always starts fresh with the latest code.
- `npx great-cto init` (after installing a new version) checks if the board is
  running, kills the old process, and relaunches detached with `--no-open`
  so the existing browser tab keeps working at the same port.

---

## v2.27.0 — 2026-05-28

### Claude Code quota warning at SessionStart

Adds `scripts/hooks/quota-check.mjs` — a lightweight hook that checks
Claude Code subscription quota at the start of every session and warns
before the user launches a heavy pipeline that would hit a rate limit
mid-run.

**What it does:**
- Reads `~/.claude/.credentials.json` (Claude Code OAuth token)
- Fetches `api.anthropic.com/api/oauth/usage` (undocumented endpoint,
  same one used by ai-usagebar / claudebar)
- Outputs a quota block only when thresholds are exceeded:
  - ⚡ 70%+ → warn, prefer fast-path for large features
  - 🔴 85%+ → alert, fast-path only (skip ARCH doc)
  - 🛑 95%+ → critical, do NOT start heavy pipeline
- Shows per-window pacing (ahead/on-track/under vs elapsed time)
- Shows Sonnet 7-day sub-quota separately (Sonnet has its own cap)
- Shows extra (pay-as-you-go) spend when ≥ 50% of monthly limit
- Auto-refreshes expired OAuth tokens via platform.claude.com
- 5-minute cache in `~/.great_cto/quota-cache.json` — parallel agents
  share one fetch, no API hammering
- Silent exit when credentials absent (API-key users unaffected)

**Where it appears:** between `=== STATUS ===` and `=== PATTERNS ===`
in the SessionStart output.

**Source inspiration:** akitaonrails/ai-usagebar (Rust). API endpoints,
auth flow, and response schema ported to Node.js (60 lines, no deps).

---

## v2.26.0 — 2026-05-28

### PM discovery pipeline: PRD, OST, discover, outcome roadmap, prioritisation

Five patterns from phuryn/pm-skills that complete the pre-development
Discovery → PRD → architect pipeline previously missing from great_cto.

**New commands**
- `/prd` — structured 8-section Product Requirements Document workflow.
  Accepts problem statement, gathers context (max 4 questions), generates
  PRD with Executive Summary / Background / Objectives+Metrics / Users /
  User Stories P0-P2 / Non-Goals / Constraints / Success Criteria.
  Writes `docs/requirements/PRD-<slug>.md`.
- `/discover` — full product discovery cycle. Maps 3–7 customer
  opportunities, ranks by Opportunity Score, generates ≥3 solutions per
  opportunity, designs experiments. Writes
  `docs/discovery/OST-<slug>.md`.

**New skills**
- `opportunity-solution-tree` — Teresa Torres OST framework.
  4-level structure: Desired Outcome → Opportunities → Solutions →
  Experiments. Opportunity Score = Importance × (1 − Satisfaction).
  Assumption priority: Value → Usability → Feasibility → Viability.
- `outcome-roadmap` — transforms output-focused feature lists to outcome
  statements. Formula: `Enable [segment] to [outcome] so that [impact]`.
  "So what?" chain method for deriving outcomes from features.

**Agent enhancements**
- `agents/pm.md` — added Step 0a: feature prioritisation when multiple
  features compete. Framework selection table: Opportunity Score / ICE /
  RICE / MoSCoW with formulas. Detects output-focused roadmaps and
  applies outcome-roadmap skill before task decomposition.
- `skills/pre-mortem/SKILL.md` — added Step 4b: Tigers / Paper Tigers /
  Elephants risk classification. Tigers classified as Launch-Blocking /
  Fast-Follow / Track with owner + due date. Pre-mortem template updated
  with all three blocks.

**Discovery → PRD pipeline position:**
`/discover` → `/prd` → `/architect` → `/pm` → senior-dev

---

## v2.25.0 — 2026-05-28

### agent-workflows patterns: triage gate, structured findings, hand-off rules

Inspired by [franklioxygen/agent-workflows](https://github.com/franklioxygen/agent-workflows).

#### Triage Gate — depth-based pipeline selection

- **Added** Triage Gate section to `CLAUDE.md` request classifier — classifies SIMPLE CODE (Tiny/Small/Medium) and COMPLEX CODE (Small/Medium/Large) before pipeline runs
- **Added** Escalation guard: if scope grows during work → stop and reclassify; do not continue with under-powered process

#### Reproduction Requirement — bug-fix gate

- **Added** Reproduction Requirement to `agents/coordinator.md` — before any implementation agent edits code for a bug fix, must establish: failing automated test, failing repro command, or explicit infeasibility note. "It would take effort" is NOT infeasible.
- Blocks implementation packet until repro packet completes

#### Baseline Establishment — refactoring gate

- **Added** Baseline Establishment to `agents/coordinator.md` — run full validation set (tests + lint + build) before refactoring edits; record pass/fail. Separates new regressions from pre-existing failures.

#### Structured Findings Format — review output standard

- **Added** Structured Findings Format to `skills/great_cto/SKILL.md` — Critical/Major/Minor/Nit severity tiers with Location/Problem/Why it matters/Recommended fix/Status fields
- **Added** mandatory Summary block (APPROVED/BLOCKED verdict) to all review output
- Critical + Major findings block merge and gate:ship

#### Workflow Hand-off Rules

- **Added** explicit hand-off transition table to `agents/coordinator.md` — INCIDENT→BUG-FIX, BUG-FIX→Feature, SIMPLE→COMPLEX, Cleanup→Refactoring, etc.
- Silent workflow class switches are explicitly prohibited; always notify CTO with reason

#### Per-workflow Safety Rules

- **Added** `shared/safety-rules.md` — five safety rule variants: Standard Coding, Review-Only, Behavior-Preserving, Cleanup, Incident Response
- Each rule matched to the workflow class that should use it

#### Scope Escalation Guards

- **Added** scope escalation guard to coordinator anti-patterns: "scope creep is low risk" → stop + reclassify

#### Minimal Loading Discipline

- **Added** per-class loading rules to `skills/great_cto/memory-index.md` — load only what the active workflow needs; per-class breakdown (QUESTION, SIMPLE CODE Tiny, INCIDENT)

### ag-kit patterns: coordinator, skillify, memory index (v2.24.1 content shipped in v2.25.0)

- **Added** `agents/coordinator.md` — multi-agent orchestrator with DECOMPOSE→CLASSIFY→DISPATCH→MONITOR→SYNTHESIZE→VERIFY lifecycle, Work Packet List format, Fork vs Spawn semantics
- **Added** `commands/skillify.md` — interactive 6-question interview to capture repeating patterns as SKILL.md files
- **Added** `skills/great_cto/memory-index.md` — 200-line cross-session knowledge index template with 3-level compression protocol
- **Added** Request classifier section to `CLAUDE.md` — 8-class routing (QUESTION/SURVEY/SIMPLE CODE/COMPLEX CODE/DESIGN/SLASH CMD/INCIDENT/COORDINATE)
- **Updated** dispatch semantics in `skills/great_cto/SKILL.md` — Fork vs Spawn, Never Delegate Understanding, concurrency safety
- **Updated** context compression protocol in `commands/save.md` — micro-compact, phase summary, checkpoint levels
- **Updated** validation hierarchy reference in `commands/doctor.md` — 7-layer priority (Security → Schema → Tests → Lint → Performance → UX/A11y → SEO)
- **Updated** all 13 SKILL.md files — added `effort: low | medium | high` frontmatter field

- _Add one bullet per shipped feature._
- _Cite ADRs introduced (if any)._
- _Mention test counts and opt-out flags._

---

## v2.24.0 — 2026-05-28

### OpenSRE patterns: l3-support upgrade + user guardrails

Inspired by [Tracer-Cloud/opensre](https://github.com/Tracer-Cloud/opensre) (Apache 2.0).

#### l3-support agent upgrades

- **Added** Alert Source → Tool Routing table: when an alert fires from grafana/datadog/cloudwatch/EKS/PostgreSQL/RabbitMQ/etc., the agent now calls the matching integration tools first and in parallel — eliminates the "start from scratch" investigation pattern
- **Added** Root Cause Taxonomy: structured 8-category classification (database / infrastructure / code_bug / configuration / network / performance / healthy / unknown) applied at triage time and carried through to postmortems, Beads tasks, and lessons.md
- **Added** Structured RCA output to postmortem template: `validated_claims`, `non_validated_claims`, `validity_score` (0.0–1.0), `investigation_path`, `breakthrough_tool`, `dead_ends` — machine-readable postmortems
- **Added** Parallel tool execution mandate: explicit instruction to call all primary integration tools simultaneously in each investigation round
- **Updated** lessons.md format: now includes `category` and `validity_score` fields per entry

#### agentshield: user-configurable guardrails

- **Added** user-defined guardrail rules via `~/.great_cto/guardrails.yml` — loaded and merged with built-in rules on every scan
- **Added** `action: block | audit | redact` field to user rules (inspired by OpenSRE guardrails engine)
- **Added** `loadUserRules()` and `userGuardrailsPath()` exports from agentshield public API
- **Added** `~/.great_cto/guardrails.yml` template generation during `great-cto init` with inline documentation and examples
- **Added** `userDefined: boolean` flag on Rule type to distinguish user vs built-in rules
- **Added** 4 new tests covering user guardrails: load/parse/merge/error-resilience (189/189 passing)

---

## v2.23.0 — 2026-05-28

### Spec Driven Development integration

Inspired by [FredAntB/Spec-Driven-Development](https://github.com/FredAntB/Spec-Driven-Development).

#### New: `/spec` command

- **Added** `/spec` command — SDD interview workflow that generates `requirements.md`, `design.md`, and `tasks.md` before any code is written
- Interview is conversational: one question at a time, not a form
- Four required answers: what the project does, tech stack, deployment target, AI tools used
- **Gate enforced**: no file generated until all four answers are in hand
- **Retrofit mode**: `/spec retrofit` scans existing codebase and infers specs from what already exists
- After generation: auto-updates `CONTEXT.md` and runs `great-cto adapt`

#### New: Cross-AI config generation (`great-cto adapt`)

- **Added** `ai_tools:` field to `PROJECT.md` template — declare all AI coding tools used on the project
- `great-cto adapt` now generates configs for **all declared AI tools** from the same source of truth:
  - `AGENTS.md` + `CLAUDE.md` — Claude Code (existing)
  - `.cursorrules` — Cursor AI (new)
  - `.github/copilot-instructions.md` — GitHub Copilot (new)
  - `.windsurfrules` — Windsurf (new)
  - `.aider.conf.yml` — Aider (new)
- **Added** "Project Constitution" block to all generated configs — universal hard constraints that prevent AI agents from contradicting each other

#### New: `CONTEXT.md` session resume file

- **Added** `CONTEXT.md` generation during `great-cto init`
- Standard resume block: current task, last session date, session log table, open questions
- All AI tools read `CONTEXT.md` at session start — enables seamless handoff between Claude Code, Cursor, Copilot, etc.

---

## v2.22.2 — 2026-05-28

### Fix board JS syntax errors after leash removal

- **Fixed** orphaned leash JS fragments (802 lines) left after Security tab removal — caused `SyntaxError` in browser
- **Fixed** broken `import {` block in `server.mjs` (missing closing `} from './leash-adapter.mjs'`) that prevented board from starting
- **Fixed** broken `<input>` element in Cmd-K search modal (raw style attribute visible as text in header)
- **Fixed** board version-sorting bug — server was loading from old cached v2.9.5 instead of v2.22.1 due to lexicographic sort
- Board JS now passes `node --check` syntax validation with 0 errors

---

## v2.22.1 — 2026-05-28

### Publish cleanup

- Removed stale `dist/leash.js` from npm package (leftover compiled artifact from deleted `leash.ts`)
- No functional changes vs v2.22.0

---

## v2.22.0 — 2026-05-23

### Remove runtime governance proxy integration

- **Removed** Security board tab and all proxy UI (sessions, spend, threats, HITL, rate limits)
- **Removed** `great-cto leash` CLI subcommand and `tryInstallLeash()` auto-install
- **Removed** postinstall auto-clone of governance proxy
- **Removed** leash-related env vars (`LEASH_TENANT_ID`, `LEASH_SESSION_PREFIX`, `NODE_OPTIONS`) from session init hook and PROJECT.md template
- **Removed** `LEASH_AGENT_NAME` env export from all built-in agent definitions
- **Removed** ai-leash-reviewer agent from routing table
- **Simplified** `postinstall.mjs` to a no-op placeholder
- Zero breaking changes to core init / board / agents pipeline

---

## v2.21.0 — 2026-05-23

### Flow Compiler UX

- **Compiled flow summary** — `npx great-cto init` now prints a user-facing "Compiled flow:" block (product title + jurisdiction, agents, gates, compliance, cost range) instead of internal debug steps. Internals (`archetype`, `pack`, `jurisdiction`) become routing implementation details, not user-facing choices.
- **FLOW.md artifact** — every `great-cto init` writes `.great_cto/FLOW.md` — a single file agents read to orchestrate the SDLC pipeline (agents, gates, compliance, cost, `_routing` block for power users / debugging).
- **flow.ts module** — new pure `compileFlow()` function composes `reviewersFor`, `gatesFor`, `suggestPackReviewers`, `suggestJurisdictionReviewers` into one `FlowResult`. No breaking changes to existing modules.
- **README repositioning** — hero section leads with "describe project → get pipeline" value prop. Ingredient counts (57 agents, 25 archetypes, etc.) moved to `<sub>` line.

---

## v2.20.0 — 2026-05-23

### Added — Detection v2: 12 jurisdictions, infra signals, word-boundary matching, pack hints

**Jurisdiction coverage: 8 → 12**

- **Canada (CA)** — PIPEDA · Quebec Law 25 / Bill 64 · CASL · OSFI B-10 (fintech).
  Gates: `gate:pipeda-pia`, `gate:quebec-law25-consent`.
- **Japan (JP)** — APPI 2022 · PPC Guidelines · My Number Act · FISC (fintech).
  Gates: `gate:appi-third-party-transfer`, `gate:appi-ppc-registration`.
- **China (CN)** — PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT · CAC regulations.
  Gates: `gate:pipl-consent-framework`, `gate:mlps-classification`, `gate:pipl-data-localisation`.
- **South Korea (KR)** — PIPA · ISMS-P certification · Network Act · FSC.
  Gates: `gate:pipa-isms-p`, `gate:pipa-consent-framework`.

**Infra-signal detection (`mineInfraKeywords`)**

- Scans Terraform / YAML / JSON files (depth ≤ 4) for AWS/GCP/Azure region strings.
- Reads `.env.example` / `docker-compose.yml` for `AWS_REGION=` and `TZ=` timezone hints.
- Maps `package.json` `homepage` TLD (`.de` → eu, `.jp` → jp, `.cn` → cn, `.kr` → kr, `.ca` → ca, etc.).
- `infraKeywords[]` added to `DetectionResult`; consumed by `suggestJurisdictions()`.

**Word-boundary matching (`matchesKeyword`)**

- Single-token keywords use lookbehind / lookahead regex.
- Prevents false positives: `"india"` no longer matches `"indiana"` / `"indianapolis"`.

**Pack hints for niche archetypes (`inferPackHints`)**

- `suggestedPacks?: string[]` added to `ArchetypePick`.
- Surfaces specialist packs for low-signal niche domains: `robotics-pack`, `climate-pack`,
  `clinical-trials-pack`, `drug-discovery-pack`, `hr-ai-pack`, `lending-pack`,
  `voice-pack`, `em-fintech-pack`, `api-platform-pack`.

**Tests: 179/179 pass** (37 jurisdiction tests, +19 new covering CA/JP/CN/KR + infra signals + word-boundary cases)

---

## v2.19.0 — 2026-05-23

### Added — Token economy Phase 1+2: artifact summaries + memory filter

Two-phase token-economy initiative (`docs/plans/PLAN-token-economy-2026-q2.md`).
Combined expected savings: 35-55% LLM tokens per agent start.

**Phase 1 — Artifact summaries (30-50% savings on artifact reads)**

- **`scripts/generate-summary.mjs`** — Generates `.summary.md` (≤ 250 tokens) for every
  `ARCH-*.md` / `PLAN-*.md` / `ADR-*.md` / `PHASE-*.md` / `QA-*.md` / `SEC-*.md` /
  `TM-*.md` / `RELEASE-*.md` / `PERF-*.md`. Uses Anthropic Haiku → OpenRouter (Kimi K2) →
  deterministic heuristic. Idempotent. CLI: `--all`, `--check`, `--force`.
- **`scripts/hooks/summary-enforce.mjs`** — PostToolUse hook: auto-generates `.summary.md`
  whenever an artifact is written. Fire-and-forget. Opt-out: `GREAT_CTO_DISABLE_SUMMARY=1`.
- **`scripts/hooks/pre-push.sh`** — Blocks pushes with stale summaries.
  Bypass: `GREAT_CTO_SKIP_SUMMARY_CHECK=1`.
- **`agents/_shared/artifact-summary-contract.md`** — Producer/consumer contract.
- **13 tests** in `tests/hooks/summary-enforce.test.mjs`.

**Phase 2 — Task-aware memory filter (≥25% savings on agent startup context)**

- **`scripts/memory-filter.mjs`** — Filters `lessons.md` / `decisions.md` to the top-k
  entries most relevant to the current task. Same provider chain as Phase 1.
  Cost: < $0.0001/call. Latency: ~50ms heuristic, ~200ms Haiku.
  CLI: `node scripts/memory-filter.mjs "<task>" <file> [--k=5] [--heuristic] [--stats]`.
- **`agents/_shared/memory-filter-prompt.md`** — Prompt contract + integration table.
- **`agents/architect.md`** — Replaces `tail -100` / `awk|head -60` with filtered injection.
- **`agents/senior-dev.md`** — Replaces `tail -50` / `grep|head -40` with filtered injection.
- **18 tests** in `tests/memory-filter.test.mjs`. Opt-out: `GREAT_CTO_DISABLE_MEMORY_FILTER=1`.

---

## v2.18.0 — 2026-05-22

### Added — bd upgrade + Bundled Adversarial Critics

**`great-cto upgrade [plugin]`** — force re-clone companion plugins (superpowers, beads) to
their latest semver tag, then re-apply critic overlays. Safe to run any time — idempotent
if already on latest.

- **`packages/cli/src/upgrade.ts`** — `upgradePlugin()`, `upgradeAll()`
- **`packages/cli/src/overlay.ts`** — `applyOverlays()`, `copyCriticFiles()`, `patchSkillFiles()`
  — idempotent critic installer called on every `init` and `upgrade`
- **`packages/cli/assets/skills/`** — 4 adversarial critic prompt files bundled as package assets:
  - `brainstorming/spec-critic-prompt.md` — attacks specs before planning
  - `writing-plans/arch-critic-prompt.md` — attacks file structure before tasks are written
  - `finishing-a-development-branch/schema-critic-prompt.md` — attacks DB migrations before ship
  - `finishing-a-development-branch/api-critic-prompt.md` — attacks API changes before ship

---

## v2.15.0 — 2026-05-22

### Added — Jurisdiction Detection

Third detection axis alongside `archetype` and `packs`: auto-detects applicable
compliance frameworks from project geography signals in README.

- **`packages/cli/src/jurisdictions.ts`** — new module: `JurisdictionCode` (8 codes),
  `JURISDICTION_SIGNALS`, `suggestJurisdictions()`, `suggestJurisdictionReviewers()`,
  `suggestJurisdictionGates()`, `listJurisdictions()`
- **`detect.ts`** — geo/legal keyword terms added to `mineReadmeKeywords()` (80+ terms)
- **`bootstrap.ts`** — `jurisdiction:` field auto-populated in PROJECT.md
- **`agents/gdpr-reviewer.md`** — GDPR Art.5/6/9/25/32/35 + EU AI Act + NIS2
- **`agents/us-privacy-reviewer.md`** — CCPA/CPRA + US state privacy matrix (VA/TX/FL/CO/CT)
- **`agents/dpdpa-reviewer.md`** — DPDPA 2023 + IT Act + RBI data localisation
- 20 new tests in `packages/cli/tests/jurisdictions.test.mjs`

---


## v2.14.0 — 2026-05-21

### Digital health pipeline — wearable · mental health AI · nutrition AI · physician HITL

- **`digital-health-reviewer` agent** — new specialist reviewer for mHealth / digital health products. Covers FDA General Wellness vs SaMD classification, HIPAA applicability matrix (consumer wellness vs employer/provider deployment), GDPR Article 9 special-category health data (DPIA required), CCPA/CPRA Sensitive Personal Information tier, wearable platform API rules (Apple HealthKit, Google Health Connect, Garmin, Samsung Health), drug-supplement interaction safety gates, physician HITL workflow design (trigger matrix, SLA, escalation path), mental health crisis protocol (AFSP Safe Messaging compliance, 988/116-123 crisis routing), EU AI Act Annex III healthcare classification. Outputs `TM-digital-health-{slug}.md`.
- **`digital-health-pack`** — new domain pack: chains `digital-health-reviewer` → `ai-clinical-reviewer` (on SaMD signal) → `healthcare-reviewer` (on HIPAA scope). Adds 5 human gates: `gate:wellness-vs-samd`, `gate:hitl-design`, `gate:wearable-api-access`, `gate:supplement-safety`, `gate:mental-health-protocol`. Ships 8 EVAL suites (hitl-boundary, supplement-safety, safe-messaging, refuse-to-diagnose, etc.) and a wearable integration checklist for senior-dev pre-ship.
- **`packs.ts`** — registered `digital-health-pack` with detection signals: wearable stack tokens (`healthkit`, `health-connect`, `samsung-health`, `fitbit`, etc.) and README keywords (`wearable`, `apple watch`, `mental health`, `garmin`, `samsung health`, `fitness ai`, `nutrition ai`, `supplement recommendation`, `personalised training`, `physician review`, `physician hitl`, `wellbeing`, `mindfulness ai`, and 20+ more).
- **`TYPE_MAP.md`** — added 6 new type entries: `digital-health`, `wearable-platform`, `nutrition-ai`, `clinical-hitl`, `digital-therapeutics`, each mapping to `agent-product` or `regulated` archetype with appropriate compliance tags and pack overlays.
- **`SKILL.md`** — added routing row for wearable/mental health/nutrition/physician HITL triggers → `digital-health-reviewer`.
- **`adapt.ts`** — routing table updated with digital-health-reviewer dispatch row.
- **Tests** — `tests/packs.test.mjs` (17 tests): pack trigger detection, reviewer chain composition, gate firing, false-positive guard for generic web projects.
- **README** — updated to 51 agents · 16 domain packs · 27 archetype reviewers.

---

## v2.13.0 — 2026-05-21

### AI-native self-improvement loop

- **Self-improving loop** — `session-end` hook now auto-triggers `continuous-learner` agent when `GREAT_CTO_AUTO_LEARN=1`; writes `.great_cto/.last-auto-learn` marker on each run
- **Decision scoring** — new `decision-scorer` agent (Sonnet) scores architectural alternatives across 5 weighted dimensions; `decision-eval` skill wires it into the `architect` workflow automatically after 2+ ADR variants
- **Evals Runner (CI)** — `tests/eval/runner.mjs` runs 38 EVAL-*.md scenario files through a two-agent LLM judge (Sonnet actor → Opus judge) using `ANTHROPIC_API_KEY`; GitHub Actions workflow fires on every PR touching `agents/**` or `tests/eval/**`
- **`/crystallize` skill** — distils repeating patterns from session logs into draft `skills/{domain}/SKILL.md` files; session-end hook suggests running it every 10 sessions; `knowledge-extractor` agent (Opus) does the deep clustering analysis

---

## v2.12.1 — 2026-05-18

---

---


## v2.11.0 — 2026-05-18

### Cost per feature
- **"Top features by AI spend"** section in the cost panel — bar list showing
  which features consumed the most LLM budget. Sourced from `feature=X` tags
  in verdict lines (agents that use `log-verdict.sh` get this for free).
- `/api/cost` now returns `by_feature: [{feature, llm, runs}]` sorted desc,
  top 10. Available via API for integrations.

### MCP — 4 new board tools
`great-cto mcp` now exposes **9 tools** total (was 5). New board tools:

| Tool | What it does |
|---|---|
| `project_status` | Open gates, blocked tasks, P0 incidents |
| `cost_summary` | LLM spend, daily burn, top features |
| `pipeline_stages` | Pipeline stage list with status + last verdict |
| `recent_verdicts` | Last N agent verdicts with timestamps and costs |

Board tools require `great-cto board` running. Configure via `GREAT_CTO_PORT`
(default 3141). Claude Code agents can now call `cost_summary()` before
spawning expensive tasks to check the budget.

### Daily digest notification
- New cron fires **Mon–Fri at 08:00 UTC** via the existing email + push
  infrastructure.
- Summary: yesterday's AI spend, tasks shipped, blocked tasks, open gates,
  and top-3 features by cost.
- Skips days with zero activity — no noise on quiet weekends.
- Idempotent via date-keyed dedupe (won't re-send on board restart).

### Per-project verdict attribution
- `log-verdict.sh` now writes verdicts to `<project>/.great_cto/verdicts/`
  only (dropped global `~/.great_cto/verdicts/` write).
- Adds `project=<slug>` tag to every verdict line for cross-project queries.
- `readVerdicts(cwd)` prefers per-project dir; falls back to global lines
  tagged with the matching slug. Fixes "all projects show $93" bug.
- `scripts/migrate-verdicts-to-projects.mjs` — one-shot migration for
  historical global verdicts (dry-run by default, `--apply` to write).

---

## v2.9.8 — 2026-05-18

### Board dashboard

- **Period selector** — 1D / 7D / 30D / 90D / 1Y chip toolbar above the
  sprint metrics. Choice persists in localStorage. All hero tiles, cost
  panel, and chart re-scope to the chosen window.
- **Honest cost model** — "AI spend" tile shows real LLM tokens from
  verdict logs (was: time-based estimate). "Cost savings vs FTE" uses
  human estimate = tasks × 4h × $150/hr (industry baseline).
- **Active-day denominator** — daily-avg / daily-burn now divide by days
  with actual spend (was: divided by full window, making 90D look 12×
  cheaper than 30D for the same work).
- **Race condition fix** — sequence-guarded fetches for `/api/metrics` and
  `/api/cost` so stale init responses can't overwrite newer period clicks.
- **Cache-Control headers** — HTML/JS served with `no-cache` to prevent
  stale board UI between iterations.

### Share report (public link)

- **Lifetime numbers** — share reports always show lifetime totals (this
  is a marketing/social-proof artifact, not an internal dashboard).
- **Visual upgrade**:
  - Hero big number (92px serif) + 30-day sparkline
  - Cost bar chart (humans red, AI green) + big "Nx cheaper" headline
  - 30-day activity heatmap (GitHub-style)
  - Agent bubble chart (size=time, color by category)
- **Auto-republish** — fires after every gate approval and daily at 09:00
  UTC. Manual "Republish" button removed.
- **Per-project scope fix** — toggle now correctly publishes data for the
  selected project (previously fell back to server cwd).

### Backend

- `/api/metrics?days=N` — accepts 1–365 day window
- `getMetrics()` returns `tasks.done_in_window` for period-scoped reports
- Verdict cost totals (`real_llm_usd`) now filtered by window timestamp
- Cost history always computes human cost (was: skipped when verdict data
  existed, leaving "vs Human team" at $0)
- Per-task time cap at 8h to filter wall-clock idle noise from agents_cost

---

## v2.9.7 — 2026-05-18

### Improvements

- **board/share** — public report now auto-republishes on every gate approval
  and daily at 09:00 UTC. Manual "Republish" button removed.

---

## v2.9.6 — 2026-05-18

### Bug fixes & improvements

- **board/notifications** — bell icon in topbar now opens the notification
  drawer. Red badge shows unread count. Previously the drawer had no trigger.
- **board/nav badge** — nav Notifications badge correctly shows `on` when
  email or push channel is active (was always `off` when no unread items).

---

## v2.9.5 — 2026-05-18

### Bug fixes

- **board/push toggle** — visual state now correctly reflects subscription
  status: fixed CSS class (`active` → `on`) so the toggle moves when clicked.
  Added `_pushBusy` lock to prevent async double-fire on rapid clicks.
  Added `stopPropagation` on inner checkbox to prevent bubbled duplicate calls.
- **board/security** — per-project tenant filtering for Budgets panel;
  corrected config file path displayed in footer.
- **plugin.json** — replaced `null` matcher / statusMessage values with empty
  strings to pass `claude plugin validate` (contributed by @ajayd942).

---

## v2.9.3 — 2026-05-17

### Web Push + in-app notification history

`great-cto board` now ships two new notification channels alongside the
existing email-alert relay.

**Browser push (Web Push / VAPID)**

- Zero-dep VAPID implementation using Node built-ins only (`node:crypto`,
  `node:https`) — no extra npm packages.
- P-256 ECDH key pair auto-generated on first start, stored in
  `~/.great_cto/vapid-keys.json`. Push subscriptions persist to
  `~/.great_cto/push-subscriptions.json`.
- Service Worker (`/sw.js`) receives empty-body pushes, fetches the latest
  unread notification from the server, and shows a native desktop alert.
- New endpoints: `GET /api/push/vapid-key`, `POST /api/push/subscribe`,
  `DELETE /api/push/subscribe`.
- Toggle in board → Notifications → **Browser push** card.
- Fires for the same 5 triggers as email (incident.p0, gate.stale,
  gate.blocked, cost.threshold, digest.weekly).

**In-app notification history**

- Ring-buffer of the last 100 alerts, persisted to
  `~/.great_cto/notif-history.json` across restarts.
- SSE broadcasts a `notification` event to all connected board tabs — new
  alerts appear as toasts instantly without a page refresh.
- Notification drawer slides in from the nav "Notifications" item —
  shows title, body, timestamp, project, unread dot, and a Mark all read button.
- Inline history table inside the Notifications panel (last 20 entries).
- New endpoints: `GET /api/notif-history`, `POST /api/notif-history/read`.

**Other**


---

## v2.9.0 — 2026-05-16

### Telemetry opt-IN promo (aggressive but honest)

Telemetry remains **opt-IN by default**. The change in this release is **how the
question is asked**.

**Before:** users could opt in via `GREAT_CTO_TELEMETRY=on` or by editing
`~/.great_cto/telemetry.json` — but nothing in `init` told them this was
possible. Total telemetry-opted-in users: 3.

**Now:** at the end of a successful interactive `init`, we ask once, with a
fully transparent preview of the exact payload that would be sent:

```
Help great_cto learn from how you use it?

Anonymous usage data (default: off). Helps cross-project
lessons promote to a global pattern library.

Here is exactly what would be sent — one event per command:

  {
    "version": "2.9.0",
    "command": "init",
    "archetype": "fintech",
    "node": "22.19.0",
    "os": "darwin",
    "exit_code": 0,
    "duration_ms": 1234,
    "anon_id": "852b0564"   // 8 hex chars, not reversible
  }

No code, no repo names, no file paths, no PII.
Toggle anytime: npx great-cto telemetry off

Enable anonymous telemetry? [y/N]
```

### Honest defaults

- Default answer: **N**. The prompt makes opt-IN visible, not pre-checked.
- The prompt **never re-asks**: once the user decides (yes OR no), the answer
  is persisted to `~/.great_cto/telemetry.json` and we move on. No nag.
- Skipped automatically when: `--yes`/`-y` flag, non-TTY, CI environment,
  `DO_NOT_TRACK=1` set, or user previously decided either way.

### Reversible

```bash
npx great-cto telemetry on       # opt in
npx great-cto telemetry off      # opt out
npx great-cto telemetry status   # check current state + endpoint + anon_id
npx great-cto telemetry whoami   # print your 8-hex anon_id
```

Subcommand was already in `telemetry.ts` but not wired to the main dispatch
table — fixed in this release.

### Install-ping coverage

When telemetry is enabled (either via the new prompt or via env var), every
`init` run now fires one install-ping. Lets us count re-runs after upgrades
toward WAU/MAU — previously only fired the very first time a user opted in.

### What is NOT changing

- Default is still off. We did not flip to opt-OUT.
- Payload schema unchanged: `{ts, version, command, archetype, node, os,
  exit_code, duration_ms, anon_id}`. No PII added.
- `DO_NOT_TRACK=1` still wins over everything.
- Existing opt-in users (3) keep their state untouched.

---

## v2.8.4 — 2026-05-15

### 10 more bugs fixed (security + analytics) since v2.8.3

Continued bug-hunting after v2.8.3. **2 Critical, 3 High, 5 Medium.**
No breaking changes.

**🔴 Critical (security)**

- **Localhost CSRF on /api/projects/register** (BH-23, PR #43) —
  `CORS: *` + text/plain simple-request let any web page register
  attacker-controlled paths under HOME. Now: Origin check + path
  must live inside HOME + 403 on bad origin.
- **`{{PAUSED}}` literal placeholder shipped to share-report cloud
  worker** (BH-22, PR #43) — SyntaxError if worker forgot to
  post-process. Now: replaced at server before publish, never
  serialised as literal.

**🟠 High (data integrity)**

- **Attribute-XSS via task titles** (BH-26, PR #43) — `esc()` didn't
  escape `"` or `'`, so a malicious task title could break out of
  `href="..."` / `title="..."` attributes. Now: esc() handles all
  five HTML special chars.
- **Silent 1000× cost truncation in PLAN-*.md parsing** (BH-25,
  PR #43) — `.replace(',', '')` (no `/g` flag) silently turned
  `"$1,234,567"` into `1234`. Cost reports under-reported by 3
  orders of magnitude. Now: `/g` flag.
- **/api/share crashed on malformed JSON** (BH-24, PR #43) — bare
  `JSON.parse` in async handler caused unhandled rejection + hung
  request. Now: catch → 400 with structured error (matches PR #40
  pattern for /tasks, /status, /gates).

**🟡 Medium**

- **Resume render crashed on null verdict** (BH-27, PR #43) —
  `d.verdict.toLowerCase()` lacked null guard. Now: safe-coerce.
- **Gate tasks inflated velocity** (BH-28, PR #43) —
  closed-gate tasks counted as "shipped tasks" in velocity tile.
  Now: excluded from done.length / velocity counts.
- **Dashboard hid actual verdict cost behind time-based estimate**
  (BH-21, PR #44) — hero tile showed `$2.44` (estimate) but verdict
  logs had `$6.42` (actual). Now: hero trend shows
  `actual: $X.XX` when divergence > 10%.
- **`velocity.this_week` misleading label** (BH-22, PR #44) — math
  is rolling 7d/30d, not calendar week. Now: explicit `last_7d` /
  `last_30d` keys; old aliases kept until v3.0.
- **`great-cto report --type=X` rejected with misleading error**
  (BH-26, PR #44) — only positional form worked. Now: positional +
  `--type X` + `--type=X` all accepted.

**Test pyramid**

- 53 automated tests (was 51 in v2.8.3) — +2 BH-22/26 regressions.
- 36 archetype detection fixtures + 456 pack assertions still pass.
- **545 verified contracts total.**

### Upgrade

```bash
npx great-cto@2.8.4 init
```

Restart Claude Code afterwards. No breaking changes; `velocity.last_7d`
is additive; `esc()` enhancement only changes HTML output (no API
surface).

---

## v2.8.3 — 2026-05-15

### 10 production bug fixes + monitoring observability

All discovered via systematic bug-hunting of the live admin board. Each
has a regression test. No breaking changes.

**Server hardening (BH-3 through BH-16)**

- **BH-3**: `unknown` agent (15 runs) no longer dominates `/api/metrics`.
  Non-canonical verdict logs (`backend.log`, `frontend.log`, etc.) now
  bucketed separately into `legacy_agent_runs` so real specialists
  (`architect: 8`) become the top entry, as intended.
- **BH-4**: `/api/cost?days=999` clamped to 365 (was 1000 buckets,
  memory bloat); `?days=abc` / `?days=-5` fall back to 30. Same pattern
  applied to `/api/decisions?limit`.
- **BH-5**: `?project=<unknown>` now sets explicit
  `X-Project-Fallback: requested='<slug>' served='cwd'` response
  header. Previously silent fallback meant users couldn't tell if they
  were viewing the right project's data.
- **BH-6/7/8**: `POST /api/tasks` validates input — invalid JSON → 400
  (was 500), title > 500 chars → 400 (was 500 from bd argv overflow),
  `priority=99` → 400 (was 200 silently ignored, hiding typos like
  `priority: 11` meant for `P1`).
- **BH-10**: 5 `bd` write spawnSync calls now have `timeout: 5000ms`.
  Previously a hung `bd` blocked the server thread indefinitely.
- **BH-12**: serialised all `bd` writes through `bdWriteSerialised()`
  promise queue. Concurrent writes used to deadlock on stale
  `.beads/.lock`; now 10 parallel POSTs succeed cleanly.
- **BH-14**: `/status`, `/priority`, `/gates` endpoints now catch
  JSON.parse errors → 400 (was 500). Structured error bodies (`error`,
  `received`, `message` fields).
- **BH-16**: concurrent `approve+reject` on the same gate no longer
  double-writes `decisions.md` (audit log corruption). Wrapped in
  `bdWriteSerialised`.

**Cost dashboard cleanup**

- Metrics + report use 30-day windows (was inconsistent: 7d sometimes,
  all-time elsewhere).
- Suppressed tautological "savings" when LLM cost equals human cost
  (no actual savings to report).
- Dropped global-verdict fallback in `getMetrics()` that produced
  cross-project pollution.

**Observability**

- New `/api/metrics.server.{sse_clients, bd_cache_entries}` counters.
- `X-Project-Resolved` response header (`'cwd' | 'path' | 'slug' |
  'fallback'`) exposes routing decisions on the wire.
- New `docs/operations/MONITORING.md` — diagnostic recipes, healthy
  ranges, stale-lock recovery procedure.

**Frontend — clickable resume rows (PR #34, already in 2.8.2)**

(No additional UI changes in this release.)

**Test pyramid**

- 51 automated tests (was 45 in v2.8.2) — +6 BH regression cases.
- 36 archetype detection fixtures + 456 pack assertions still pass.
- **543 verified contracts total.**

### Upgrade

```bash
npx great-cto@2.8.3 init     # new install
# or
npx great-cto@latest init    # if you typically pin to latest
```

Restart Claude Code afterwards. The board's `X-Project-Fallback` header
+ `legacy_agent_runs` field are additive; existing clients see no
breaking change.

---

## v2.8.2 — 2026-05-14

### Board UX + new `/board` slash command

**New: `/board` slash command** (PR #33)

Closes a UX gap: previously the only way to open the admin dashboard
was running `great-cto board` in a terminal. Now `/board` from Claude
Code:
- Detects if board already running (0.1s curl check)
- Starts it via `nohup ... & disown` if not (survives command exit)
- Opens browser via `open` (macOS) / `xdg-open` (Linux)
- Logs to `~/.great_cto/board.log`
- Flags: `--port N` `--no-open` `--restart`

**Board UI: clickable "Pick up where you left off" rows** (PR #34)

Recent Verdicts + Decisions columns are now interactive. Click a row →
opens a detail modal with:
- Agent · verdict · timestamp header
- Raw verdict line (monospace, preserved)
- Parsed metadata chips (feature, task, cost)
- Artefact buttons (`arch=`, `plan=`, `tm=`, `qa=`, etc.) → click opens
  the path via `vscode://file/` URL scheme (works for VS Code, Cursor,
  Windsurf, Claude Code)

Decisions rows route to the linked bd task side-panel when known.

Esc or backdrop click closes the modal.

**Notes:**
- No breaking changes
- All 45 automated tests + 36 archetype fixtures + 456 pack assertions
  still pass (537 verified contracts)

---

## v2.8.1 — 2026-05-14

### Bug fixes + test pyramid expansion

**Bug fixes (production board):**
- **BH-1**: `readVerdicts()` now correctly parses pipe-separated verdict log
  lines (`<ts> | agent | APPROVED | …`). Previously `verdict='|'` was returned
  for the pipe form, breaking `/api/pipeline` status display for any agent
  writing in that format. 3 of 8 stages on the live board were affected.
- **BH-2**: `/api/cost.savings_x` now returns `null` when there's no human
  estimate, distinguishing "no estimate available" from "computed zero
  savings". UI can show `—` for the null case.

**Test coverage expansion (+18 cases, +2 files):**
- `tests/openrouter-pack-overlays.mjs` (NEW) — 10/10 v2.8.0 domain packs
  validated through 5-stage real-LLM pipeline ($1.84/run)
- `tests/packs-integration.test.mjs` (NEW, 5 cases) — pack-registry
  consistency (reviewer files, gate naming, harness ↔ registry parity)
- `tests/pipeline-contracts.test.mjs` (+2 BH regressions)
- `tests/openrouter-multi-archetype.mjs` extended with optional 8-stage
  flow via `OR_DOWNSTREAM=1` (qa-engineer → security-officer → devops →
  l3-support added after archetype-reviewer)

**Test pyramid (full coverage):**
- 45 automated cases (cost / gate / pipeline / resume / parity / contracts /
  agent-integrity / pack-integrity) at $0
- 36 archetype-detection fixtures + 456 pack assertions at $0
- Real-LLM tiers: $0.10 reviewers → $1.84 packs → $4-9 full archetype pipeline

**README:** added "Test pyramid" section documenting 537 verified contracts.

---

## v2.8.0 — 2026-05-14

### 10 domain packs + 15 new reviewers (Pioneer Fund portfolio coverage)

Major expansion of domain coverage. Overlay packs activate on top of the
existing 25 archetypes when CLI detects pack-specific signals.

**New reviewer agents (15):**
- `voice-ai-reviewer` — TCPA, STIR/SHAKEN, state recording-consent, EU AI Act Art. 50, deepfake laws
- `ai-clinical-reviewer` + `fda-reviewer` — GMLP-10, PCCP, SaMD classification (510(k) / De Novo / PMA), IEC 62304, ISO 14971
- `hr-ai-reviewer` — NYC LL 144 AEDT, EEOC, Illinois AIVIA, Colorado SB 205, EU AI Act Annex III
- `api-platform-reviewer` — rate-limit, OAuth 2.1, webhooks (HMAC + replay), idempotency, RFC 8594 Sunset
- `lending-credit-reviewer` — ECOA / Reg B, FCRA, NMLS state matrix, MLA, BISG fair-lending
- `clinical-trials-reviewer` + `bio-data-reviewer` — ICH-GCP E6(R3), 21 CFR Part 11, CDISC, FHIR R5, OMOP, DICOM, de-id
- `robotics-safety-reviewer` — ISO 10218 / ISO TS 15066 (cobot) / IEC 61508 (SIL), HARA, SROS2, sim-to-real
- `emerging-markets-fintech-reviewer` — India DPDP/RBI, Nigeria CBN, Brazil BCB/LGPD, MAS, OJK, BSP + local rails
- `climate-mrv-reviewer` + `biosecurity-reviewer` — GHG Protocol, Verra/Gold Standard, CBAM, NIH DURC, IGSC HSP v2
- `drug-discovery-ml-reviewer` + `glp-glab-reviewer` + `lab-automation-reviewer` — ChEMBL/BindingDB versioning, AD bounds, ALCOA+, SiLA2, IQ/OQ/PQ

**Pack auto-detection:**
- `packages/cli/src/packs.ts` — `suggestPacks(detection)` returns matched packs
- 26 new stack signals in `detect.ts` (twilio, livekit, deepgram, elevenlabs, hume, razorpay, paystack, flutterwave, mercadopago, fastify, trpc, graphql, openapi, dicom, ros 2 via package.xml)
- 80+ pack-specific README terms emitted as raw tokens

**Pipeline integration:**
- 19 new human-gate types (gate:voice-compliance, gate:samd-class, gate:aedt-audit, gate:fair-lending, gate:hara-signoff, gate:durc-signoff, gate:model-card-signoff, …)
- 15 TM-template files (skills/great_cto/templates/TM-*.md)
- 10 pack-overlay files (skills/great_cto/packs/*-pack.md)
- 15 new `/commands` (/voice-compliance, /samd-classify, /aedt-bias-audit, /api-contract-review, /fair-lending-audit, /part11-audit, /biodata-conformance, /hara, /em-fintech-review, /carbon-mrv, /dna-screen, /drug-ml-review, /glp-audit, /iq-oq-pq, /clinical-compliance)

**Reference EVAL suites (38):**
- tests/eval/EVAL-*.md — golden-set templates for each pack's critical scenarios
- Cross-referenced to TM templates + human gates + reviewer agents

**Testing:**
- 10 new fixture dirs (tests/fixtures/voice-twilio, clinical-ai, clinical-trial-edc, hr-ai-recruiting, api-platform-stripe, lending-bnpl, robotics-ros2, em-fintech-india, climate-mrv-verra, drug-discovery-rdkit)
- E2E archetype suite extended with `packs` assertion — 36/36 fixtures pass with correct archetype + pack attachment
- 2 new structural validators: `test_new_reviewers.py`, `test_eval_pack_mapping.py`
- 181 total tests passing across CLI unit + E2E + structural

**Coverage:** ~90% of Pioneer Fund Future of Health portfolio + ~65% of total Pioneer portfolio (voice-AI, clinical, HR-AI, lending, API platform, clinical trials, robotics, EM-fintech, climate/biosec, drug-discovery patterns).

Full overlay matrix: [skills/great_cto/ARCHETYPES.md](skills/great_cto/ARCHETYPES.md#domain-overlays-wave-1-3-specialised-reviewers).

49 agents · 0 lint errors · 0 warnings.

---

## v2.7.1 — 2026-05-14

### `/help`, welcome banner, and heavy-context-safe `/digest` + `/inbox`

Three small UX fixes prompted by first-install feedback:

1. **New `/help` command.** A compact reference card listing all 22
   commands grouped by area (Daily / Pipeline / Ops / Memory / Agents),
   plus the admin board URL (`http://localhost:3141`) and the
   "first-time? run /start" pointer. Topic routing supported:
   `/help commands`, `/help board`, `/help agents`. Static card lives at
   `docs/help-card.md` so the slash command body stays tiny — works even
   on heavy-context sessions.

2. **Welcome banner on first install.** SessionStart hook now calls
   `scripts/hooks/welcome.sh` which prints a one-time banner with the
   command groups, the admin board URL, and a `/help` pointer. Marker
   file `~/.great_cto/.welcomed-<MAJ.MIN>` makes it idempotent — silent
   on every subsequent session, re-prints after a minor version bump.

3. **`/digest` and `/inbox` no longer trip `Prompt is too long`.** The
   old flow piped 300 lines of helper output straight into the model's
   prompt via `bash ... | head -300`. On sessions with large tool/skill
   lists, that pushed total tokens over the limit. New flow writes
   helper output to `.great_cto/cache/{digest,inbox}-out.txt` and tells
   the agent to `Read` the file — agent controls paging, prompt stays
   bounded.

No agent or pipeline changes. Pure UX.

---

## v2.7.0 — 2026-05-09

### Cross-prompt consistency rules + model-tier policy

v2.6.0 shipped a structural linter (14 rules) that catches frontmatter
drift, missing sections, and stale paths. v2.7.0 closes the next gap:
**semantic consistency across the 18 reviewer agents and 8 pipeline
agents**.

Three new linter rules (all `warn` for soft-launch, promoted to `error`
in v3.0):

| Rule | What it locks in |
|---|---|
| **CONS-MODEL** | model tier matches the agent's role (architect ∈ {opus, sonnet}, continuous-learner ∈ {haiku}, …) |
| **CONS-OUTPUT** | every reviewer declares a `docs/<dir>/<PREFIX>-{slug}.md` output file |
| **CONS-SIGNOFF** | every reviewer references `sign-off` / `gate:` / `HANDOFF` semantics |

The policy lives in `MODEL_TIER_POLICY` (single source of truth) inside
`scripts/agent-prompt-lint.mjs`. New agents added without a tier
assignment get a warning at PR time instead of leaking opus-cost into
production.

Why this matters:
- **Cost control** — prevents `continuous-learner` accidentally on opus
  ($5/run for a task that takes haiku 30¢).
- **Quality floor** — prevents `architect` accidentally on haiku
  (shallow ADRs, missed cross-cutting concerns).
- **Reviewer contract** — board API + senior-dev handoff break silently
  if a reviewer skips its TM-{slug}.md output. Now caught at lint time.

Pipeline: 61 → 62 tests (linter rule count: 14 → 17). 0 errors, 1
pre-existing warning across all 34 agents — clean baseline.

### ADR
- **[ADR-002](docs/adr/ADR-002-model-tier-policy.md)** — model-tier
  policy with per-role tier table + cost analysis + migration path.

### Files
- `scripts/agent-prompt-lint.mjs` — +3 rules + `MODEL_TIER_POLICY` map
- `docs/adr/ADR-002-model-tier-policy.md` — new
- `docs/AGENT-LINT-RULES.md` — CONS-* section + updated roadmap

### Roadmap deferred to v3.0
- **CONS-MODEL → error** after one minor cycle of warn-level catalogue
- **CONS-ARCHETYPE** — archetype-specific reviewer ↔ `archetypes.ts` mapping
- **EVAL-*** — LLM-as-judge (requires API key, opt-in)
- **BEH-*** — behaviour tests via real Claude Code SDK (CI cost)

---

## v2.6.0 — 2026-05-09

### Agent prompt linter — structural validation for all 34 agents

We had **60 pipeline tests for the plumbing** (CLI, hooks, board API,
sync, cost math) but **zero tests for the 34 markdown files in `agents/`**
that drive the SDLC pipeline. Prompt regressions (deleted phase-task
section, malformed frontmatter, stale path references) only surfaced as
"the agent didn't do X" months after landing.

This release closes that gap with a Node-based structural validator.

**`scripts/agent-prompt-lint.mjs`** — runs the rule set below against
every `agents/*.md`. Exits 1 on errors, 0 on clean (warnings allowed).

### Rule set v1 (14 rules)

| Category | Rules | Coverage |
|---|---|---|
| **FM-***  (Frontmatter) | FM-001 parses, FM-002 description, FM-003 model tier, FM-004 tools list | All agents |
| **STR-*** (Structure)   | STR-001 has ## heading, STR-002 ≤50KB | All agents |
| **PHASE-*** (Phase task)  | PHASE-001 has section, PHASE-002 references helper, PHASE-003 correct slug | 8 pipeline agents only |
| **MEM-***  (Memory paths) | MEM-001 lessons.md in shell, MEM-002 decisions.md in shell | All agents |
| **OUT-***  (Output contract) | OUT-001 explicit output | Pipeline + reviewer agents |
| **DEPS-*** (Cross-platform) | DEPS-001 superpowers HOST guard | All agents |

Full spec: `docs/AGENT-LINT-RULES.md`.

### Audit results — clean baseline

After running against all 34 prompts:
- **0 errors**
- **1 warning** (architect.md = 55KB, exceeds 50KB context-warning threshold —
  acceptable for the longest prompt in the system)

The rule set caught **2 false-positive errors** during development that
were rule bugs, not prompt bugs:
- FM-003 originally rejected `claude-haiku-4-5` (full model name) — fixed
  to accept both short tier (`haiku`) and fully-qualified form
- MEM-001/002 originally flagged narrative `lessons.md` mentions — fixed
  to only flag shell-command operations on bare paths

Both regex refinements are documented in `AGENT-LINT-RULES.md`.

### CI integration

`scripts/test-pipeline.sh` L1 adds a new check:

```
✓ agent-prompt-lint: 0 errors across all agents/
```

Pipeline test count: 60 → **61**. Run before each release.

### What's NOT in v2.6.0

Deferred to v2.7.0+ (each needs its own ADR):

- **CONS-*** cross-prompt consistency (all reviewers use same gate schema)
- **EVAL-*** LLM-as-judge mode (requires API key + cost budget)
- **BEH-*** behaviour tests via real Claude Code SDK (CI cost)
- **CONS-MODEL** model-vs-task fit heuristics

---

## v2.5.10 — 2026-05-09

### `phase-task.sh` close fix + 5 new pipeline tests + validation checklist

**Bug:** `bd close <id>` refuses when the task has an open dependency
(e.g. linked to gate via `bd dep add`). The phase-task helper was using
plain `bd close` → all phase tasks remained `in_progress` after the
agent finished. Pipeline UI showed tasks but wrong status.

**Fix:** `phase-task.sh` close path now uses `bd close --force` (with
fallback to plain close for older Beads). Phase task represents "agent
X did its work" — that fact stands regardless of gate aggregation.

**Validation:** `scripts/test-pipeline.sh` adds **L4b — Phase task
lifecycle** with 5 checks:
- Helper creates labelled task
- Open is idempotent (re-open returns same id)
- Close --verdict ok closes despite open gate dependency
- Close --verdict fail marks blocked
- 8-stage simulation produces 8 closed phase tasks

Total: 55 → **60** pipeline tests.

**Manual checklist:** `docs/validation/PHASE-TASKS-CHECKLIST.md` documents
the 3 real-session validation paths users should run before trusting v2.5.7+
in production:
- Test 1: happy path (`/start "feature"` → 6+ phase tasks closed)
- Test 2: QA fail/remediate cycle (blocked + new task on rerun)
- Test 3: bd-unavailable fallback (writes to `.great_cto/tasks.md`)

Plus failure-mode table for diagnosing "phase tasks not appearing" symptoms
(usually agent prompt too long → instruction context-trimmed).

---

## v2.5.9 — 2026-05-09

### Honest cost ratio — 7500× → 500× (LLM rate corrected)

User report: COST SAVINGS VS FTE tile showed `7638×` — not believable. The
underlying constant `LLM_RATE_PER_HR = $0.02` was a placeholder that didn't
reflect actual Sonnet 4.6 / Haiku 4.5 economics.

**Cost model audit:**
- Sonnet 4.6: $3/1M input + $15/1M output → typical agent task ($0.165) /
  30 min → **$0.33/AI-hour**
- Haiku 4.5: $1/1M input + $5/1M output → ~$0.055/task → **$0.11/AI-hour**
- Mixed pipeline (architect Sonnet, qa Haiku, etc.): **~$0.30/AI-hour**

**Fix:** default `LLM_RATE_PER_HR` raised from $0.02 → $0.30. Ratio drops
from 7500× (hype-tier) to 500× — still a huge advantage, but defensible.

**New env var overrides:**
- `GREATCTO_LLM_RATE_PER_HR=0.50` (e.g. all-Sonnet pipeline)
- `GREATCTO_HUMAN_RATE_PER_HR=200` (SF senior engineer fully-loaded)

### Verdict-cost overlay — supplementary, not headline

Earlier code preferred sum-of-verdict-costs over time-based estimate when
verdicts had `cost=$X` tags. Problem: verdict data is often synthetic
test fixtures or partial coverage (only some agents log cost), which
produced `25,864×` ratios on test projects with $0.05 fake values.

**Fix:** time-based estimate is now the canonical headline number. Real
verdict cost is exposed as `cost.real_llm_usd` (and per-agent
`agents_cost[].real_llm_usd`) for transparency, but doesn't drive the
savings ratio. v2.6.0+ may re-engage the overlay when coverage ≥50% AND
implied hourly rate ≥$0.05/hr.

### UI: honest tile sub-text

`Cost savings vs FTE` tile now reads:

> `500× faster, est. at $0.30/AI-hr · $150/human-hr`

instead of the generic "X× cheaper than human (rough est.)".

### Tests

Pipeline assertion `metrics math: human/llm ratio ≈ 7500×` updated to
`≈ 500×` (470-530 tolerance for per-agent rounding drift). 55/55 pass.

---

## v2.5.8 — 2026-05-09

### CI hardening + plugin cache hygiene

Three operational warts visible to anyone browsing the repo, all addressed.

**1. Removed dead `UI e2e (Playwright)` workflow**

`tests/ui/` is fully gitignored — never committed to the repo. The
`ui-e2e.yml` workflow tried to install deps from a non-existent
`tests/ui/package.json` and failed on every push. **Result before:** ✗
red badge on every release. **Now:** workflow deleted (zero noise).

When real e2e tests get committed, a fresh workflow can be added with
correct cache paths.

**2. `tests/structural/validate.py` already passing**

Recent runs (post v2.5.7 commits) show ✓ — the CMD-loop sync is now
correct for all 22 commands. Earlier failures were the validator
**correctly** flagging missing entries; we addressed those by listing
new commands in the SessionStart bash one-liner.

**3. Plugin cache cleanup — `--keep 3` policy in SessionStart**

Users updating via `npx great-cto@latest` accumulate plugin caches at
`~/.claude/plugins/cache/local/great_cto/{1.0.x, 2.0.0, 2.1.0, ...}`.
SessionStart syncs the latest but never cleaned up — typical install had
7+ stale dirs (~70 MB).

The SessionStart bash one-liner now ends with:

```bash
ls -d "$HOME"/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null \
  | sort -V \
  | awk -v k=3 '{a[NR]=$0} END {for (i=1; i<=NR-k; i++) print a[i]}' \
  | xargs -I{} rm -rf {} 2>/dev/null || true
```

- `sort -V` — semver-aware ordering
- `awk` (BSD/GNU portable) instead of GNU-only `head -n -3`
- `|| true` — cleanup failure never breaks SessionStart
- Keeps the 3 most recent (rollback-safe)

After SessionStart on a 9-version install, only 3 newest remain.
Verified: 9 → 3 (drops oldest 6) on a synthetic test.

### Full QA pass — 10 bugs fixed (label `qa-2026-05`)

A full QA run against v2.5.7 (per `docs/qa/TEST-PLAN-FULL.md`) found 10
bugs across pipelines, board API, metrics, and reports. All 10 closed in
this release. Full report: `docs/qa/runs/2026-05-09/REPORT.md`. E2E trace:
`docs/qa/runs/2026-05-09/E2E-SAAS-PIPELINE.md`.

**Cost pipeline (P1)** — cost dashboard was permanently zero in production:
- `/api/cost` skipped every verdict because real verdicts didn't carry a
  `cost=$X` tag. (QA-006)
- `/api/metrics.cost` only used PLAN files or task-estimate sources;
  verdict cost was ignored entirely. (QA-007)
- **Fix:** `scripts/log-verdict.sh` — canonical helper writing verdict line
  with mandatory `cost=$X` tag and tee'ing `<ts> <agent> <usd>` to
  `cost-history.log` as fallback source. `getMetrics()` now picks among 3
  sources by priority: plans → verdicts (new) → task estimate; each path
  tags `source` so the UI distinguishes real from estimated.
- **Doc:** `agents/_shared/verdict-format.md`.
- **Verified:** $0.50 + $1.25 + $0.30 → `/api/cost.total_llm = $2.05, runs = 3`.

**Board UX (P1)** — admin UI returned raw 500 from `bd` for predictable cases:
- `POST /api/tasks` and `POST /api/gates/<id>` failed with `no beads
  database found` when project lacked `.beads/`. (QA-002, QA-004)
- **Fix:** `checkBeadsAvailable(cwd)` helper returns
  `409 { error: "beads_not_initialized", message, cwd, hint }` so the UI
  can show "Initialize this project" instead of an opaque error.

**Metrics integrity (P2)** — agent attribution and runtime config:
- `/api/metrics.agents` listed phantom agents like `test-agent`, `backend`
  pulled from verdict text without cross-checking the installed list. A
  typo created a phantom forever. (QA-008)
  - **Fix:** `getCanonicalAgents()` reads `~/.claude/agents/great_cto-*.md`
    once per 30s; unknown names bucketed under `unknown`.
- `/api/tasks/<bad-id>/history` returned 200 with `{events: []}` for any
  string. (QA-005)
  - **Fix:** pre-check via `getTasks(cwd)`; non-existent IDs return
    `404 { error: "task_not_found", id }`.
- `PORT` env-var was hardcoded — only `BOARD_PORT` was respected. (QA-009)
  - **Fix:** `PORT = BOARD_PORT || PORT || 3141`.

**Structural validation (P1)** — `validate.py:97` regex `[a-z\s]+?`
choked on hyphenated commands (`agent-review`, `agent-retire`), falsely
reporting all 22 commands as missing from the SessionStart sync list.
(QA-001) — **Fix:** regex changed to `([a-z][a-z0-9\s\-]*?);\s*do`.

**Sub-agent sandbox (P1)** — closed as documented design constraint, not
a fixable bug. (QA-010)
- Claude Code sub-agents launched via the `Agent` tool are isolated by
  design; `additionalDirectories` does not propagate.
- **Doc:** `agents/_shared/sandbox-cwd-policy.md` — full constraint
  explanation + workarounds (inline-mode, settings.local.json pre-grant).
- **Template:** `.claude-plugin/settings.example.json` for users who need
  `additionalDirectories`, with caveat about subagent isolation.
- **`commands/start.md`** — pre-flight `cwd` check; CTO must confirm the
  cwd is the intended project root before pipeline starts. Prevents the
  silent "agents wrote nothing because path was wrong" failure.

**`/api/memory ?project=<slug>`** (QA-003) — closed as already-supported.
The existing global cwd resolver at `server.mjs:1065` already routes
`?project=` to the registered project's path.

### Other changes

- `docs/plans/PLAN-v2.5.8-ci-hardening.md` — plan for this release
- `docs/qa/TEST-PLAN-FULL.md` — comprehensive plan for full QA passes
- E2E pipeline trace on a SaaS fixture (architect → enterprise-saas-reviewer
  → pm → senior-dev → qa-engineer → security-officer) verified end-to-end
  with all artefacts persisted and verdict trail complete.

---

## v2.5.7 — 2026-05-09

### Pipeline phase tasks — agents now create per-stage Beads tasks

Codex Test review surfaced that great_cto's `/start` flow created only
**epic + gates** in Beads. None of the actual work stages (architect,
senior-dev, QA, security, code review, devops) were tracked. Effect:
the board UI showed "27 tasks shipped" but zero visibility into what
agent did what.

**Fix:** new helper `scripts/phase-task.sh` provides 4 actions:
- `open <agent> <feature>` — creates a labelled phase task (idempotent —
  re-running returns the existing id, so the protocol is safe to retry)
- `start <id>` — moves to in_progress
- `close <id> --verdict ok|fail|blocked` — closes or marks blocked
- `latest <agent>` — most-recent open phase task for that agent

Each pipeline agent prompt (architect / pm / senior-dev / qa-engineer /
security-officer / performance-engineer / devops / l3-support — 8 agents)
now includes a "Phase task tracking (mandatory)" section that invokes
the helper at start + end of its phase.

Falls back to `.great_cto/tasks.md` when Beads is unavailable. Never
blocks the actual phase work — observability is best-effort.

After this change, the board's `/api/tasks` shows real per-stage
progress: `architect: stripe-subs` (closed), `senior-dev: stripe-subs`
(in_progress), `qa-engineer: stripe-subs` (open) — instead of just the
two gates.

### Cost-history off-by-one window bug

`getCostHistory(days=30)` built only 30 buckets covering `[today-29 ...
today]` instead of the inclusive `[today-30 ... today]` window users
expected. On a project where a batch of tasks closed exactly 30 days
back, those tasks fell out of the history overnight (visible jump in
`active_days` from 5 → 4 + `total_runs` from 16 → 10 between sessions).

**Fix:** loop `<= days` instead of `< days` → 31 buckets, includes
day-30. Verified math invariants: `total_llm/30 ≈ daily_avg`,
`daily_avg*30 ≈ projected_monthly`, sum(series.llm) === total_llm.

### Test runtime: production-readiness plan

`Test/docs/plans/PLAN-runtime-production-readiness.md` — concrete v0.4.0
plan for the Codex-reviewed agent runtime. Two pieces (~3h LLM-agent /
~1.5 weeks human):

1. **Typed tool result schema** — `ToolResult` + `ToolMetadata` (cost,
   tokens, cached, truncated, source). Backwards-compat adapter for
   legacy `Callable[[str], str]` tools.
2. **OpenTelemetry tracing hooks** — span hierarchy (run → plan →
   execute → tool.\<name>) with canonical attributes (`agent.*`, `tool.*`).
   Default off; opt-in via `init_tracing()`.

Memory / policy engine / eval harness / async deferred — each needs its
own ADR before implementation.

---

## v2.5.6 — 2026-05-09

### Cursor + Codex UX hardening — six operational issues from real-user dogfooding

Codex test report against great_cto running in Cursor surfaced six UX issues
that were technically "working as designed" but read as broken. All addressed:

**1. CLI shows hint when slash-only commands are tried as `npx great-cto X`**
- Previously `npx great-cto start "build feature"` failed with cryptic
  "unknown argument" errors. Users reasonably expected slash commands to
  also work via CLI.
- Now: trying any of `start / audit / inbox / digest / review / doctor /
  burn / save / resume / learn / agent-review / agent-retire / rfc /
  release / ownership / oncall / sec / poc / promote / crystallize / migrate`
  via CLI prints a clear redirect:
  ```
  error: 'start' is a chat slash command, not a CLI subcommand.
  To run it, open Claude Code, Cursor, or any AI assistant with great_cto
  installed and type:  /start [args]
  The CLI surface only exposes: init · scan · ci · mcp · adapt · serve · ...
  ```

**2. `init` refuses to run in `$HOME` (no project context)**
- First-time users tried `npx great-cto init` from `~` (no project), got
  greenfield/low-confidence detection. Looked broken.
- Now: explicit refusal with `cd /path/to/project` instructions:
  ```
  error: refusing to initialize great_cto in $HOME (/Users/foo).
  great_cto is meant to run inside a project repository, not your home directory.
  ```

**3. `init` clearer message when `.great_cto/` exists**
- Previously: "Aborted." — looked like an error.
- Now: explains exactly which command achieves what:
  ```
  .great_cto/ already exists in this directory.
  To preserve existing config: nothing to do, you're already initialized.
  To start fresh: back up .great_cto/ first, then re-run with --force:
      npx great-cto init --force
  To override the detected archetype without re-init:
      npx great-cto init --force --archetype agent-product
  ```
- Also: user-initiated abort now exits 0 (not 1) — it's not a failure.

**4. `ci` archetype-drift error includes resolution paths**
- Previously: `archetype drift: declared=greenfield, detected=ai-system`
- Now: tells user exactly how to resolve:
  ```
  archetype drift: declared=greenfield, detected=ai-system (high). Either:
    • run 'npx great-cto adapt --platform <yours>' to refresh configs
    • run 'npx great-cto init --force --archetype ai-system' to align PROJECT.md
    • pass '--no-archetype' to ci to skip this check
  ```

**5. README documents board API schema explicitly**
- Codex smoke scripts assumed `/api/projects` returned `{projects: [...]}`
  — actually returns array directly. Same for `/api/tasks`.
- New "Board API surface" section in README with the exact return shape
  for every endpoint plus a Python/curl gotcha example.

**6. `agent-product` archetype detection broadened**
- Codex's hand-built agent runtime (no LangChain, no vector DB, just
  `agent_runtime/`, `tools.py`, `planner.py`) was classified as greenfield.
- Detection now also weighs project-shape signals: `agent-runtime`,
  `tool-calling`, `tool-use`, `planner`, `tool-allowlist`, `mcp-server`,
  `mcp-client`, `agent-loop`, `deterministic-agent`, etc. (3+ matches → +5,
  2 → +3, 1 → +1). Plus pattern `agent-(runtime|product|loop|kit|sdk)`
  in stack names → +2.

---

## v2.5.5 — 2026-05-09

### Critical: `/inbox` and `/digest` failed with "Prompt is too long"

`commands/inbox.md` was 30 KB, `commands/digest.md` was 46 KB — those entire
files get sent to the LLM as the slash-command prompt. With any reasonable
session context already loaded, both commands hit Anthropic's prompt limit
before doing any work. Users saw `API Error: Prompt is too long`.

**Fix:** moved all bash data-collection logic to two helper scripts:

- `scripts/cmd-data/inbox-data.sh` (23 KB) — emits labelled sections
  (OPEN_GATES / STALE_GATES / P0_OPEN / BLOCKED / RECENT_ACTIVITY /
  SLO_BURN / DORA_CFR / GATE_DRIFT / COST_ALERT / ON_CALL / RFC_OVERDUE)
- `scripts/cmd-data/digest-data.sh` (32 KB) — emits DORA / RELIABILITY /
  DELIVERY / TEAM / COST / OPS / AGENTS sections with delta arrows

`commands/inbox.md` and `commands/digest.md` now just describe the helper's
output contract and how to format it (2.6 KB and 4.0 KB respectively —
**12× smaller**). The agent invokes the helper, parses sections, formats
the response.

### Codex bugfix: closed gates appeared as P0_open in `/api/inbox`

`packages/board/server.mjs` `mapStatus()` checked the `gate` label before
checking the `closed` status:

```js
if (labels.includes('gate') || issue_type === 'decision') return 'gate';
case 'closed': return 'done';
```

Effect: a closed gate task got `status: 'gate', raw_status: 'closed'`. The
P0/Pending-decisions/Active-pipeline aggregates that filter on `status !==
'done'` then counted those closed gates as still-open work — Codex test
report showed 3 closed gates appearing as `P0 open: 3`.

**Fix:** terminal status (`closed`, `blocked`) takes precedence over gate
classification:

```js
if (status === 'closed') return 'done';
if (status === 'blocked') return 'blocked';
if (labels.includes('gate') || issue_type === 'decision') return 'gate';
// ...
```

---

## v2.5.4 — 2026-05-09

### Cross-platform host detection — env-var-first

v2.5.3 used filesystem-only detection (`~/.claude` / `~/.codex` / etc). Bug:
power users have multiple tools installed simultaneously, and the order of
filesystem checks then determined which host "won" — wrong answer when the
user is currently running in tool A but has tool B also installed.

**Fix:** detection now uses runtime env vars first (set by the host process
that actually invoked the skill), filesystem markers only as fallback when
env is empty (manual invocation, CI):

| Host | Detection signal |
|---|---|
| Claude Code | `$CLAUDECODE=1` or `$CLAUDE_CODE_ENTRYPOINT` |
| OpenAI Codex CLI | `$CODEX_HOME` or `$CODEX_SESSION` |
| Cursor | `$CURSOR_TRACE_ID` or `$TERM_PROGRAM=Cursor` |
| Aider | `$AIDER_VERSION` |
| Continue | `$CONTINUE_GLOBAL_DIR` |
| Generic | (none of the above) |

Verified: real Claude Code session (with both `~/.claude` and `~/.codex` on
disk) now correctly resolves to `HOST=claude-code` via `$CLAUDECODE=1`.

### Cursor extension polish

- Added 128×128 marketplace icon (converted from `docs/screenshots/logo.svg`)
- Trimmed keywords from 6 → 5 (marketplace only indexes first 5)
- VSIX now 12.56 KB (was 7.11 KB) with icon embedded
- Ready for `vsce publish` once the publisher account + PAT are configured

### Strategic note

v2.5.4 closes the cross-platform gap: every supported host now resolves
correctly to its native classification, so dependency checks, brainstorming
fallbacks, and platform-specific behaviours all fire as designed.

---

## v2.5.3 — 2026-05-09

### Codex / Cursor / Aider compatibility — host detection + Beads write-test

Findings from a real Codex installation test:

**Issue 1: `DEPS_MISSING: superpowers` on non-Claude hosts**
- The dependency check in `SKILL.md` searched `~/.claude/skills/superpowers/`
  unconditionally. In Codex, Cursor, Aider, Continue this directory doesn't
  exist — emit'ed false-alarm "missing dependency" warning.
- **Fix:** added host detection (`HOST` = claude-code | codex | cursor | aider |
  generic, derived from filesystem markers like `~/.codex`, `~/.cursor`,
  etc.). The superpowers check now runs only on Claude Code. On other hosts,
  the brainstorming step uses an inline 5-question discovery built into the
  architect agent — no plugin dependency.
- **New diagnostic levels:** `DEPS_MISSING_HARD` (Beads — required everywhere)
  vs `DEPS_MISSING_SOFT` (superpowers — Claude Code only). Soft missing
  doesn't block, just warns once.

**Issue 2: weak Beads check returned BEADS_OK on empty dir**
- Old: `bd list 2>/dev/null | head -1` returns success on empty dir because
  `bd list` outputs nothing and exits 0. False positive — `bd init` never
  runs even when no DB exists.
- **Fix:** new check is `[ -d .beads ] && bd ready >/dev/null 2>&1`. `bd ready`
  requires a usable DB and fails cleanly when uninitialized. Also added a
  **post-init write-test:** `bd create` a probe issue, capture the ID via
  `grep -oE 'bd-[a-z0-9-]+ '`, then `bd close` it. Catches the case where
  `bd init` exited 0 but the DB ended up unwritable (read-only filesystem,
  permission errors, etc.).

### Strategic note

great_cto v2.5.0 claimed cross-platform support but the SKILL.md still had
Claude-Code-isms baked into the bootstrap. v2.5.3 closes the gap — Codex
users get DEPS_OK (clean start) instead of a confusing DEPS_MISSING warning.

Tested in `~/development/Test` against Codex per real-user dogfooding report.

---

## v2.5.2 — 2026-05-09

### Distribution materials

- `packages/cursor-ext/great-cto-cursor-2.5.0.vsix` — packaged Cursor extension
  ready for marketplace upload (`vsce publish`)

### Strategic note

v2.5.0 → v2.5.2 closed the loop on the multi-platform pivot:
- v2.5.0 added the features (webhooks, SSE, reports, Cursor stub, ADR)
- v2.5.1 fixed a critical bug in the security scanner found by E2E testing
- v2.5.2 added distribution prep

---

## v2.5.1 — 2026-05-09

### Critical bugfix: scan/ci missed findings on relative paths

`great-cto scan ./vulnerable.ts` and `great-cto ci ./vulnerable.ts` returned
**0 findings** when the path was relative — even on the canonical fixture
that should produce 5 findings. Absolute paths worked correctly. Discovered
during E2E testing of v2.5.0.

**Root cause:** `fileMatchesGlobs()` in `scanner.ts` used a sentinel-based
multi-pass replace to convert globs to regex (`**` → SOH → `.*`). The pattern
for `**/*.ts` produced `.*/[^/]*\.ts` which **requires** a slash. Files at
the root of cwd (`vulnerable.ts`) have no slash → pattern rejects them →
all rules skipped → 0 findings.

**Fix:** rewrote glob-to-regex with token-based walker. `**/` now correctly
becomes `(?:.*\/)?` (zero-or-more path segments) so `vulnerable.ts` matches
`**/*.ts`. Regex anchored to suffix (`(?:^|/)<pattern>$`) for correctness.

This bug existed since v2.0.0 (when AgentShield merged into the CLI). All
prior versions affected. Recommend immediate upgrade.

### Impact

Anyone running `npx great-cto scan` or `npx great-cto ci` on a relative
path containing files at the cwd root saw false-clean results. CI workflows
that ran `great-cto ci ./` before this release silently passed even with
critical findings.

---

## v2.5.0 — 2026-05-09

### Production-grade webhooks + MCP SSE + reports + Cursor extension

Five major additions extending the multi-platform foundation laid in v2.4.0.
Single biggest release since v2.0.

**1. Webhooks production-grade — HMAC + retry + DLQ + outbound**

- HMAC-SHA256 verification on incoming webhooks (constant-time comparison via
  \`crypto.timingSafeEqual\`)
- Three native handlers: GitHub (\`X-Hub-Signature-256\`), Sentry
  (\`X-Sentry-Signature-256\`), generic (configurable)
- Outbound dispatcher with exponential-backoff retry (1s → 4s → 16s → 64s,
  4 attempts) and dead-letter queue at \`~/.great_cto/webhook-dlq.log\`
- Format adapters: Slack incoming-webhook, Discord, PagerDuty Events API v2,
  generic JSON POST
- Config persisted at \`~/.great_cto/webhooks.json\`
- New subcommand:
  \`\`\`bash
  great-cto webhook list
  great-cto webhook add-incoming github --secret <hmac>
  great-cto webhook add-outgoing ops-slack --url <slack-url> --format slack \\
                                            --triggers pr.opened,incident.p0
  great-cto webhook test ops-slack
  great-cto webhook remove ops-slack
  \`\`\`
- Insecure mode (\`great-cto serve --insecure\` or
  \`GREATCTO_WEBHOOK_INSECURE=1\`) only for local development
- Server endpoints: \`/webhook/github\`, \`/webhook/sentry\`,
  \`/webhook/generic\`, \`/events\`, \`/dlq\`, \`/healthz\`

**2. MCP SSE mode — multi-client / remote**

\`great-cto mcp --sse --port 8765\` runs a long-running HTTP server with the
standard MCP SSE transport:

- \`GET /sse\` opens an event stream and emits the per-session endpoint
- \`POST /message?sessionId=<id>\` accepts inbound JSON-RPC
- Multiple clients can connect concurrently
- Same 5 tools as stdio mode (\`scan\`, \`list_rules\`, \`detect_archetype\`,
  \`estimate_cost\`, \`query_decisions\`)

**3. \`great-cto report\` — shareable HTML/JSON artifacts**

Three report types, two output formats. HTML output is fully self-contained
(no external CSS/JS) — emailable, attachable, hostable as GitHub Pages:

\`\`\`bash
great-cto report cost --period 30d > cost.html       # CFO-friendly
great-cto report agents --period 7d --format json    # CI / scripts
great-cto report compliance --archetype fintech      # board / audit
\`\`\`

Embeds inline SVG charts (no JS dependencies). Dark mode via
\`prefers-color-scheme\`.

**4. Cursor extension stub — \`packages/cursor-ext/\`**

VS Code / Cursor extension scaffold (TypeScript + vsce-ready). Four commands
in the command palette:

| Command | Action |
|---|---|
| \`great_cto: Generate Cursor config\` | \`great-cto adapt --platform cursor\` |
| \`great_cto: Scan workspace\` | \`great-cto scan\` in terminal |
| \`great_cto: Run pre-merge CI gate\` | \`great-cto ci .\` |
| \`great_cto: Generate cost report\` | \`great-cto report cost\` → opens HTML |

Status-bar shield icon for one-click scan. Extension is a thin wrapper —
shells out to npx so updates flow through npm.
\`packages/cursor-ext/README.md\` documents marketplace publish flow.

**5. ADR-001: Multi-tenant board — path to managed SaaS**

\`docs/adr/ADR-001-multi-tenant-board.md\` lays out the architectural
decision (deferred to v2.6.0+) for going multi-tenant: DB-per-tenant
SQLite for self-hosted, RLS-Postgres for managed SaaS, OAuth-only auth,
proposed pricing tiers ($20/seat Starter → $50/seat Growth → custom
Enterprise). Implementation guarded by demand validation gates.

### Pipeline tests

\`scripts/test-pipeline.sh\` extended from 48 → **55 checks** (added 7 covering
webhook config, HMAC verification, MCP SSE, all 3 report types). Full run
in ~16 sec.

### Strategic note

v2.5.0 cements great_cto as **"AI orchestration layer for any AI-coding
tool"**. Cursor extension closes the loop on the 4M-MAU Cursor user base.
Webhooks transform the local board into a control plane that reacts to
external events (GitHub PRs, Sentry alerts) and broadcasts notifications
(Slack, PagerDuty). Reports give CFO/compliance officers a read-only window
into AI engineering ROI without cloning a single repo.

---

## v2.4.0 — 2026-05-09

### Multi-platform support — works in Codex, Cursor, Aider, Continue, Claude Code

great_cto is no longer Claude-Code-only. The npm package becomes the universal
adapter that works with **any** AI-coding tool that supports either AGENTS.md
(de-facto cross-platform standard) or MCP (Model Context Protocol). Four new
subcommands ship together:

**`great-cto adapt --platform [claude|codex|cursor|aider|continue|all]`**
- Generates platform-native config files derived from `.great_cto/PROJECT.md`
- AGENTS.md (cross-tool spec used by Codex CLI + most others)
- CLAUDE.md (Claude Code)
- .cursorrules + .cursor/rules/great-cto.mdc (Cursor)
- .aider.conf.yml + CONVENTIONS.md (Aider)
- .continue/rules.md (Continue)
- All variants share the same AGENTS.md core, so editing PROJECT.md updates
  every consumer with one re-run

**`great-cto ci`** — single-command CI gate
- Runs scan + archetype-validate + budget-check
- Auto-emits GitHub Actions \`::error\` annotations when \`\$GITHUB_ACTIONS=true\`
  → findings appear inline on PR diffs
- Optional SARIF (\`--sarif\`) for GitHub Security tab
- Optional JUnit XML (\`--junit\`) for test reporters
- Exit codes: 0 clean, 1 findings, 2 setup error
- Drop-in for any GitHub Actions workflow:
  \`\`\`yaml
  - run: npx great-cto@latest ci ./ --sarif results.sarif
  - uses: github/codeql-action/upload-sarif@v3
    with: { sarif_file: results.sarif }
  \`\`\`

**`great-cto mcp`** — MCP server (stdio mode)
- Exposes 5 tools: \`scan\`, \`list_rules\`, \`detect_archetype\`,
  \`estimate_cost\`, \`query_decisions\`
- Hand-rolled JSON-RPC over stdio (no SDK dependency, ~200 LOC)
- Compatible with Claude Desktop, Cursor, Continue, any MCP-aware host
- Add to Claude Desktop config:
  \`\`\`json
  { "mcpServers": { "great-cto": { "command": "npx", "args": ["great-cto", "mcp"] } } }
  \`\`\`

**`great-cto serve`** — webhook receiver (preview)
- Endpoints: \`POST /webhook/github\`, \`POST /webhook/generic\`,
  \`GET /events\`, \`GET /healthz\`
- Persists events to \`~/.great_cto/webhook-events.log\` (JSONL)
- Foundation for v2.5.0 — full GitHub PR scan-on-open, Sentry alert routing,
  signature verification, retry/DLQ. **v2.4.0 is scaffolding only**.

### Strategic shift

This release reframes great_cto from "Claude Code plugin" to "universal AI
engineering management layer". The Claude Code plugin remains the richest
consumer, but Cursor (~4M MAU), Codex CLI, and Aider users now get the same
archetype detection, security scanning, ADR query, and cost estimation
through MCP — without installing Claude Code.

### Pipeline tests

\`scripts/test-pipeline.sh\` extended from 41 → **48 checks** (added 7 covering
new subcommands). Still runs in ~12 sec.

### Files

- New: \`packages/cli/src/{adapt,ci,mcp,serve}.ts\` (~900 LOC)
- New: \`docs/plans/PLAN-npm-multi-platform.md\` (architectural plan)
- Updated: \`packages/cli/src/main.ts\` (subcommand dispatch + help)
- Updated: \`scripts/test-pipeline.sh\` (7 new checks)

---

## v2.3.4 — 2026-05-08

### `scripts/test-pipeline.sh` — automated pre-merge gate

Single command that runs Levels 1–5 of the pipeline test plan in ~10 sec:

```
scripts/test-pipeline.sh             # all 41 checks (L1 → L5)
scripts/test-pipeline.sh --quick     # L1 + L2 only (~5 sec, 12 checks)
scripts/test-pipeline.sh --skip-l4   # skip board (no port)
scripts/test-pipeline.sh --verbose   # show command output on failure
```

**Levels covered:**
- **L1** — npm test (112 unit), archetype regression (28 cases), syntax checks
- **L2** — CLI smoke: `--version`, `list-rules` (24 rules), scan fixtures, SARIF
- **L3** — All 4 hooks (secret-scan, format-check, cost-guard, session-end)
- **L4** — All 11 board API endpoints, math invariants (7500× ratio sanity),
  11 memory layers, 34 installed agents
- **L5** — Plugin sync: 22 commands + 34 agents present, plugin.json valid

Exit code = number of failed checks. Coloured output. Per-check ✓/✗ and a
failure list at the end with `--verbose` hint.

Use this in pre-commit hook, CI, or by hand before any release. Replaces
ad-hoc "check that it works" with a structured 41-point gate.

---

## v2.3.3 — 2026-05-08

### Money formatting — space separator instead of comma

Cost tiles previously rendered `$195,960` via `toLocaleString()` — but the
comma is read as a decimal separator in EU/RU/many other locales, so users
saw "195.96" and reported it as a bug. Switched to SI / ISO 80000-1 standard:
non-breaking thin space (U+202F) as thousands separator → `$195 960`.

Affects: `vs Human team` tile, "saved $X" sub-text, "vs humans" trend line
on the LLM SPEND hero tile.

---

## v2.3.2 — 2026-05-08

### Memory panel — surfaces all 11 layers

Previously the Memory tab showed only 5 files (PROJECT / CODEBASE / brain /
lessons / HANDOFF) plus global patterns. After dogfooding it became clear
several documented memory layers were invisible:

**Project-local additions** (`.great_cto/`):
- `ARCHETYPES.md` — archetype catalogue synced from plugin (L1)
- `SKILL.md` — pipeline skill definition (L1)
- `local.md` — project-local notes, gitignored (L3)

**Cross-project additions** (`~/.great_cto/`):
- `decisions.md` — append-only ADR log written on every gate approval (L4)
- `preferences.md` — user-level CTO preferences / defaults (L4)
- `lessons.md` — cross-project lessons promoted from project-local L3 (L4)

The sidebar now groups files into two sections — `PROJECT-LOCAL · .great_cto/`
and `CROSS-PROJECT · ~/.great_cto/` — so it's clear which scope each file
lives at. Files that don't exist yet stay listed with "not yet written"
hints so users see what `/audit`, `/learn`, `/crystallize` etc. would
produce.

---

## v2.3.1 — 2026-05-08

### Board admin polish — metrics, bars, logs

Bugfixes after v2.3.0 dogfooding on a real fintech project.

**Metrics tiles populate from tasks when no PLAN-\*.md / verdict-cost data exists**
- `LLM SPEND`, `COST SAVINGS VS FTE`, `LAST 30 DAYS`, `VS HUMAN TEAM`, `DAILY BURN`,
  `PROJECTED MONTH` previously showed `—` / `$0` until a `docs/plans/PLAN-*.md`
  was written. Now derived from `bd` tasks with assigned agents using the same
  $0.02/AI-hr × $150/human-hr model as `agents_cost`.
- Tile labels surface the source: `(est. from tasks)` / `(rough est.)` so the
  fallback is transparent. Real plan-derived data still wins when present.

**Cost-history bug: multiple tasks closed on the same day**
- `getCostHistory` had a `b.runs === 0` guard meant to prevent double-count,
  but it also skipped subsequent tasks closing the same day. On a project with
  15 tasks closed on 2026-04-09, only 1 was counted → `LAST 30 DAYS` showed
  $4.48 instead of the correct $5.72. Fixed: fallback engages all-or-nothing
  across the whole series, no per-bucket guard.

**Agent utilization & cost bars rendering empty**
- `<span class="fill">` lacked `display: block`, so inline `<span>` ignored
  the `width: N%` set by JS — bars rendered as empty rails. Fixed: added
  `display: block` + `min-width: 2px` so even sub-1% bars stay visible.

**Logs panel synthesizes from verdicts when no /save logs exist**
- Previously empty until first `/save` invocation. Now falls back to
  day-grouped entries built from `~/.great_cto/verdicts/*.log` — every
  project with agent activity gets useful Logs immediately.
- Auto-entries marked `· auto` in the list and "auto-synthesized from
  verdicts" in the detail view.

**QA pass-rate regex broadened**
- Old regex `verdict.*pass` only matched a narrow format. Now accepts any of
  "verdict / status / result" + "✅ / ✓ / pass / passed" (and the equivalents
  for fail / blocked).

### Time-estimate phrasing — LLM-agent vs human-team

Throughout README and landing the time estimates now distinguish:
- **LLM-agent time** — wall-clock from `/start` to ship-ready PR (e.g. ~45min)
- **Human-team equivalent** — one mid-level engineer at ~6 productive hrs/day
  including reviews, meetings, context switches (e.g. 2–3 days)

Updated:
- README "scale" table — added LLM-agent time + human-team equivalent columns
- README `/start` example — `LLM agent: ~45min  (human team: 2–3 days)`
- Landing hero terminal, before/after split, FAQ — same framing throughout

---

## v2.3.0 — 2026-05-08

### Agent workforce management — Phase 5 of v2 plan

Reframes great_cto from "dev pipeline tool" to "management layer for your AI
engineering team". Adds three commands covering the agent lifecycle.

**`/agent-review [name]`** — performance scorecard for LLM agents
- List mode (no args): table of all agents with invocations / pass-rate / cost / last-seen
- Detail mode (\`<name>\`): full scorecard with verdicts breakdown, cost outliers,
  top 3-5 failure modes, prompt-tuning suggestions, comparison to previous window
- Flags: \`--top-cost\` (sort), \`--idle\` (retire candidates), \`--since 90d\` (window)
- Saves scorecard to \`~/.great_cto/agent-reviews/<name>-<date>.md\` for trend analysis
- Uses Haiku via Task tool for failure-mode clustering (~\$0.05 per detail review)

**`/agent-retire <name>`** — graceful deprecation flow
- \`--list-candidates\`: show agents with 0 invocations in last 90 days
- Confirmation prompt requires typing the agent name (prevents fat-finger)
- Archives \`agents/<name>.md\` → \`agents/_retired/<name>.md\` with retirement marker
- Removes from \`plugin.json\` SessionStart sync list automatically
- Logs to \`~/.great_cto/decisions.md\` with reason + reversibility note
- **Preserves verdicts** in \`~/.great_cto/verdicts/<name>.log\` for audit trail
- Reversible: \`mv agents/_retired/<name>.md agents/<name>.md\` + restore plugin.json
- Built-in safeguard for core pipeline agents (architect, pm, senior-dev, etc.)

**`/cost feature <slug>`** — ROI per shipped feature
- Total LLM cost broken down by agent (invocations, cost, avg/inv)
- Comparison to human-equivalent at \$150/hr × 12h estimate (override via env vars)
- ROI multiplier (e.g. "195x")
- Cross-reference: top 5 similar features in same archetype (mean cost benchmark)

**`/cost agent <name>`** — lighter per-agent cost summary
- Total invocations, total cost, avg/invocation
- Pointer to full \`/agent-review <name>\` for detailed analysis

### Wired in plugin.json

SessionStart sync list extended with \`agent-review\` and \`agent-retire\`
slash commands (now 22 commands synced to \`~/.claude/commands/\`).

### Strategic positioning shift

Previous: "GreatCTO is 33 specialist agents that handle architecture, review,
QA, security, and deploy" — a *dev pipeline tool*.

New: "GreatCTO is the management layer for your AI engineering team —
hire (\`/template install\`), review (\`/agent-review\`), route (cost-per-feature),
retire (\`/agent-retire\`)." Sets up clear differentiation vs Cursor/Aider
and creates a defensible positioning ("AI engineering ops").

### Files

\`\`\`
commands/agent-review.md       NEW   ~150 lines
commands/agent-retire.md       NEW   ~140 lines
commands/cost.md               EDIT  +110 lines (feature + agent subcommands)
.claude-plugin/plugin.json     EDIT  sync list +2 commands
README.md                      EDIT  Three-commands table + What's new
\`\`\`

No new automated tests — these are slash commands tested via manual
smoke tests on real session data.

### Deferred to Phase 6

- \`/agent-discover\` (L, 30h) — marketplace integration with template-broker
- Multi-model routing (L, 40h) — needs careful eval framework first
- Agent A/B testing harness (M, 25h) — needs prompt-versioning infrastructure
- Token economy / caching dashboard (M, 25h) — needs Anthropic API caching telemetry
- Agent drift detection (M, 20h) — month-over-month verdict quality compare

---

## v2.2.0 — 2026-05-08

### 3 new archetypes — `edtech`, `gov-public`, `insurance` + 3 specialist reviewers

Adds three high-value archetypes covering markets underserved by existing tooling.

**`edtech`** — education technology with child-safety obligations
- Detection: `canvas-lms`, `moodle-api`, `schoology-sdk`, `google-classroom`, `lti`, `scorm`, `clever-sdk` + README keywords (`student`, `classroom`, `k-12`, `coppa`, `ferpa`, `parental consent`)
- Reviewer agent: `agents/edtech-reviewer.md` — COPPA verifiable parental consent (5 FTC-approved methods), FERPA student-data handling, GDPR-K geo-detection (13/14/15/16 per member-state), Section 508 + WCAG 2.2 AA accessibility, state student-privacy laws (SOPIPA-CA, NY 2-D)
- Compliance auto-attached: `coppa`, `ferpa`, `gdpr-k`, `wcag-2.2-aa`, `section-508`, `sopipa-ca`

**`gov-public`** — government / civic tech with FedRAMP/NIST burden
- Detection: `login-gov-sdk`, `id-me-sdk`, `usds-design-system`, `uswds`, `uk-gov-design-system`, `gov-uk-frontend` + README keywords (`fedramp`, `fisma`, `nist 800-53`, `section 508`, `ato`, `government`, `federal`, `agency`)
- Reviewer agent: `agents/gov-reviewer.md` — FedRAMP authorization-boundary scoping (Moderate/High/Tailored), NIST 800-53 Rev 5 control mapping (18 control families), FISMA, Section 508 + VPAT prep, PIA draft for E-Government Act §208, CJIS for law-enforcement, StateRAMP
- Compliance auto-attached: `fedramp`, `nist-800-53`, `fisma`, `section-508`, `pia`, `ato`, `cjis`, `stateramp`

**`insurance`** — InsurTech with multi-state regulatory burden
- Detection: `acord-standards`, `naic-schemas`, `drools-rules`, `solvency2-calc`, `guidewire-cloud`, `duck-creek`, `majesco-sdk` + README keywords (`policy`, `underwriting`, `premium`, `claim`, `actuarial`, `naic`, `insurtech`, `solvency`)
- Reviewer agent: `agents/insurance-reviewer.md` — NAIC 50-state filing matrix, Solvency II SCR/MCR/ORSA, IFRS 17 contract measurement (GMM/PAA/VFA), ACORD message validation, ASOP 41/56 actuarial documentation, anti-discrimination pricing analysis (disparate impact, ZIP-code proxies), bordereau reporting for reinsurance, NYDFS 23 NYCRR 500 if NY-in-scope
- Compliance auto-attached: `naic`, `solvency-ii`, `ifrs-17`, `gdpr`, `ccpa`, `anti-discrimination-pricing`, `actuarial-asops`, `state-doi`

### Detection logic

- `packages/cli/src/archetypes.ts` — 3 new `Archetype` types, 3 new scoring rules, updated `TIE_BREAK_PRIORITY`, expanded `suggestCompliance()` with 3 new mapping blocks
- `packages/cli/tests/archetypes.test.mjs` — 9 new tests (3 per archetype) — 50/50 archetype tests passing

### Plugin wiring

- `.claude-plugin/plugin.json` — SessionStart sync list extended with `edtech-reviewer`, `gov-reviewer`, `insurance-reviewer` (now 33 agents synced on session start)

### Board UI

- `packages/board/public/index.html` — 3 unique SVG icons in `ARCHETYPE_ICONS`:
  - `edtech` — graduation cap (`#0ea5e9` cyan)
  - `gov-public` — capitol building (`#1e3a8a` navy)
  - `insurance` — protective shield (`#d97706` amber)

### Documentation

- README — archetype count 22 → 25, agent count 30 → 33, comparison-table + ASCII diagram updated
- 3 new landing pages generated via `site/for/_generate.mjs` (local-only, gitignored)

### Test status

```
141 / 141 tests passing
  CLI suite (incl. archetype tests): 112 / 112  (+9 new)
  Hooks suite:                        29 /  29
```

---

## v2.1.0 — 2026-05-08

### Merged `agentshield` into `great-cto/cli` (refactor)

The standalone `@great-cto/agentshield` package (introduced in v2.0.0) is now a built-in `scan` subcommand of `great-cto`. Removes the need for a separate npm org / JSR scope / publish workflow while preserving every feature.

**New CLI subcommands:**
- `npx great-cto scan ./` — AI-specific security scan (OWASP LLM Top 10 + 24 rules)
- `npx great-cto scan --severity high --json` — CI-friendly output
- `npx great-cto scan --sarif file.sarif` — GitHub Code Scanning integration
- `npx great-cto list-rules` — print rule catalog

**Migration:**
- `packages/agentshield/src/*` → `packages/cli/src/agentshield/`
- `packages/agentshield/rules/*.yaml` → `packages/cli/agentshield-rules/`
- `packages/agentshield/tests/*` → `packages/cli/tests/agentshield/`
- Deleted: `packages/agentshield/`, `.github/workflows/publish-agentshield.yml`, tag `agentshield-v0.1.0`

**Why:** maintenance ceremony of a separate package wasn't justified for the v2.0 launch — single install / single version is cleaner. Functionality unchanged. `agents/ai-security-reviewer.md` updated to invoke `npx great-cto scan` instead.

---

## v2.0.0 — 2026-05-08

### Phase 3 of v2 plan — `@great-cto/agentshield` AI-security scanner (later merged into v2.1.0)

Standalone npm package for AI-specific security scanning. Pure regex over text, zero deps, boots in <1s. Works with any LLM SDK (Claude/OpenAI/Anthropic/etc.).

**5 scanners, 24 rules:**
- `prompt-injection` (PI-001..005, OWASP LLM01) — template-literal injection, Python f-string injection, tool URL injection, override-language detection, eval-on-output
- `secrets-in-prompts` (SP-001..004) — hardcoded API keys, DB connection strings, .env piped to model, CONFIDENTIAL markers
- `ssrf-in-tools` (SS-001..004, OWASP LLM07) — URL fetch without allowlist, file-path without sandbox, exec/spawn user-controlled, file:// gopher:// scheme bypass
- `rag-poisoning` (RAG-001..005, OWASP LLM01-indirect) — retrieved chunks in system prompt, no source provenance, user ingest, embeddings without truncation, unbounded topK
- `cost-runaway` (CR-001..006, OWASP LLM06) — LLM in unbounded loop, public endpoint without rate-limit, recursive agents, missing max_tokens, missing AbortSignal, flagship-model for trivial tasks

**Output formats:** Human-readable (color-coded), JSON, SARIF 2.1.0 for GitHub Code Scanning. 10/10 scanner tests pass.

**Note:** v2.0.0 was the last release of the standalone package. Merged into `great-cto/cli` at v2.1.0 — see migration above.

---

## v1.2.0 — 2026-05-08

### Phase 2 of v2 plan — continuous learning loop

Two-tier memory system that captures session patterns and re-uses them across sessions and projects.

**New agent — `agents/continuous-learner.md`** (Haiku, ~$0.05/run)
Reads session transcript + git + verdicts + cost log; extracts ≤3 lessons matching one of 5 shapes (reviewer-catch, cost-outlier, repeated-mistake, discovery-miss, tool-decision); writes to `.great_cto/lessons.md`. Strict quality gates: silence > noise.

**New command — `commands/learn.md`** (slash command `/learn`)
Manual trigger for focused extraction (`/learn cost`, `/learn security`, `/learn architecture`).

**New script — `scripts/lessons-merge.mjs`**
Aggregates `~/.great_cto/projects/*/lessons.md` by pattern slug. Promotes any pattern with ≥3 distinct projects to `~/.great_cto/decisions.md`. Tracks already-promoted slugs; supports `--dry-run` and `--force`. 8/8 tests pass.

**Updated agents to read `lessons.md` + `decisions.md` at session start:**
- `architect.md` — reads `~/.great_cto/decisions.md` + `lessons.md` FIRST before any architecture decision; filtered by archetype
- `senior-dev.md` — consults lessons for known anti-patterns before claiming a task; cites in commit messages
- `pm.md` — calibrates cost estimates against cost-outlier lessons (shape B)

**Updated `scripts/hooks/session-end.mjs`** — now registers project as symlink in `~/.great_cto/projects/<slug>/` and spawns `lessons-merge` in background after each session.

**ADRs:**
- ADR-015 — learning loop architecture (two-tier rationale, threshold=3, Haiku rationale, subagent vs inline)
- ADR-016 — privacy guardrails (what learner MUST NOT capture, default-local)
- ADR-017 — skill candidate promotion criteria (locked spec for v1.4.0)

**User-facing docs:** `docs/LEARNING.md` — config, opt-out, inspection, reset.

---

## v1.1.0 — 2026-05-08

### Phase 1 of v2 plan — Claude Code hooks foundation

Four new hooks fill gaps in existing Claude Code lifecycle coverage.

**`scripts/hooks/secret-scan.mjs`** (PreToolUse for Edit/Write/MultiEdit)
Blocks writes containing AWS Access Key IDs, AWS Secret Keys, GitHub PATs (classic + fine-grained + OAuth), Stripe live/restricted keys, OpenAI keys, Anthropic keys, Google API keys, Slack tokens, PEM private keys, JWT bearers. 13-pattern catalog, severity-tiered (block vs warn), test/fixtures allowlist, opt-out via `GREAT_CTO_DISABLE_SECRET_SCAN=1` env or `# great_cto:allow-secrets` comment.

**`scripts/hooks/format-check.mjs`** (PostToolUse for Write/Edit/MultiEdit)
Auto-format on save: prettier (JS/TS/JSON/MD/YAML), ruff/black (Python), gofmt (Go), rustfmt (Rust). Non-blocking — logs failures to `.great_cto/format.log`.

**`scripts/hooks/cost-guard.mjs`** (UserPromptSubmit)
Cost-cap awareness: warns when prompt triggers expensive operation (`/start`, `/audit`, "architect this", large refactor). Reads `cost-cap-usd-month` from `PROJECT.md` and recent spend from `cost-history.log`.

**`scripts/hooks/session-end.mjs`** (SessionEnd)
Phase 1 stub: writes session snapshot to `.great_cto/logs/session-*-end.md`. Phase 2 (v1.2.0) plugs in continuous-learner.

**ADRs:**
- ADR-013 — hook execution model (Node.mjs over bash, blocking rules)
- ADR-014 — secret detection patterns (what, why, allowlist rationale)

**User-facing docs:** `docs/HOOKS.md` — full reference of every hook.

All hooks honor `GREAT_CTO_DISABLE_<NAME>=1` opt-out env vars. Tests: 21 hook tests passing.

---

## v1.0.184 — 2026-05-07

### JSR mirror + expanded README badges

- Added `packages/cli/jsr.json` — enables JSR auto-publish on tag (mirrors npm)
- New badges on README: JSR, npm downloads, GitHub issues, last commit, Socket.dev, Snyk Advisor
- Released `@avelikiy/great-cto@1.0.184` on JSR (live at https://jsr.io/@avelikiy/great-cto)
- New workflow `.github/workflows/jsr-publish.yml` — auto-publish to JSR on every `v*` tag

---

## v1.0.183 — 2026-05-07

### Mandatory minimum-discovery + corrected LLM cost estimates

**Hard-gate for high-risk archetypes** — Architect now refuses to proceed without 4 mandatory answers (mode, team-size, cost-cap, geo) for `fintech`, `healthcare`, `regulated`, `enterprise-saas`, `commerce`, `web3`. Prevents silent assumptions like "$4,500/mo Aurora multi-region for a hackathon prototype" (real bug caught during neobank PoC test).

**Mandatory discovery in `/start`** — added Step 2.5 (4-question batch) before PROJECT.md write, even when archetype is detected with high confidence. Skip via explicit `--skip-questions` flag (writes `discovery-defaults-applied: true` to PROJECT.md as audit trail).

**Updated LLM cost estimates** in `pm.md` with measured 2026 rates:
- architect: $2–4 (was $0.50, severely underestimated)
- pci-reviewer / regulated-reviewer / oracle-reviewer / ai-security-reviewer: $0.40–0.80 (new)
- devops: $0.10–0.30 (was $0.02)
- senior-dev: $0.50–1.20 per task
- Mode budgets revised: PoC > $5, MVP > $25, Full > $100 (was $1/$5/$20)

Pricing table added: Opus $15/$75, Sonnet $3/$15, Haiku $0.80/$4 per 1M tokens.

---

## v1.0.182 — 2026-05-07

### Pipeline-blocker fixes (board + senior-dev)

Discovered during full-pipeline neobank PoC test that exposed multiple blockers.

**Senior-dev fallback** — fixed `isolation-fallback: none` → `cwd` so the agent works on non-git projects (`/tmp/` test dirs). Eliminated tool-denial errors when worktree creation fails.

**Board task sync** — added `parseTasksMd()` parser + Beads-fallback chain. Board now reads both `.great_cto/tasks.md` markdown format AND Beads JSON, fixing zero-tasks-displayed bug for projects without Beads initialized.

**Project registration** — added `POST /api/projects/register {path}` endpoint. Board can now discover projects outside `~/development/` (e.g. `/tmp/neobank-test`).

**Archetype extraction** — implemented 3-pattern regex fallback (`archetype:` → `primary:` → `- Primary:`) + 20+ alias normalizer. Fixed all-projects-defaulting-to-`web-service` bug. Default changed from `'web-service'` to `'unknown'`.

**Archetype icons** — added 11 unique SVG icons in board's project switcher: `enterprise-saas`, `cms`, `cli-tool`, `marketplace`, `streaming`, `healthcare`, `mlops`, `devtools`, `data-engineering`, `greenfield`, `unknown`. Each with distinct color and symbol.

---

## v1.0.181 — 2026-05-07

### Board logs tab + agents status + archetype badge + plugin polish

- Board: added `/api/logs` endpoint + new "Logs" tab in UI (live SSE stream from `.great_cto/agent-writes.log`)
- Board: agent status grid shows idle/running/blocked/done with last-active timestamp
- Board: archetype badge on each project card
- Plugin: `/save` and `/resume` commands shipped as built-ins; PROJECT.md template gained 3-Layer Query Rule for context-efficient memory usage
- Plugin: minor SessionStart resilience fixes for nonexistent helper files

---

## v1.0.180 — 2026-05-04

### 5 new archetypes — 17 → 22 archetypes / 24 → 29 specialist agents

Added 5 of the most-requested missing pipelines (analysis identified them as top-5 gaps with combined coverage of 25-40% of real-world projects).

- **`enterprise-saas`** + `enterprise-saas-reviewer` — multi-tenant B2B SaaS. Covers tenant isolation (RLS / schema-per-tenant / DB-per-tenant), SSO + SAML + SCIM, immutable audit log, data residency, tier / entitlements, admin impersonation safety, SOC2 Type 2 readiness. Detects via `workos`, `auth0`, `okta`, `samlify`, `passport-saml`, `@scim2/core` + multi-tenant README keywords.
- **`mlops`** + `mlops-reviewer` — model training & lifecycle (distinct from `ai-system` inference). Covers dataset lineage (DVC / LakeFS), training cost budgets, model registry (MLflow / W&B), drift detection (Evidently / WhyLabs), bias / fairness audit, shadow + canary serving, EU AI Act high-risk classification + Article 9 / 13 docs. Detects via `mlflow`, `wandb`, `dvc`, `kubeflow`, `bentoml`, `seldon`, `kserve`, `sagemaker`, `vertex-ai`, `ray`.
- **`streaming`** + `streaming-reviewer` — event-driven / real-time (distinct from batch `data-platform`). Covers exactly-once semantics, idempotency proofs, ordering, backpressure, DLQ + poison-message handling, Schema Registry compat, stateful checkpoint storage, p99 latency budgets, CDC fidelity. Detects via `kafkajs`, `rdkafka`, `kinesis`, `pulsar`, `flink`, `beam`, `debezium`.
- **`marketplace`** + `marketplace-reviewer` — two-sided platform (distinct from single-merchant `commerce`). Covers Stripe Connect / Adyen MarketPay payouts, seller KYC + KYB (Persona / Onfido / Sumsub), OFAC + sanctions screening, marketplace facilitator tax (Wayfair v. SD), 1099-K, escrow, dispute mediation, EU DSA + P2B Regulation. Detects via `stripe-connect`, `adyen-marketpay`, `persona`, `onfido`, `sumsub` + marketplace README keywords.
- **`cms`** + `cms-reviewer` — content / publishing platform. Covers schema.org structured data, Core Web Vitals (LCP / INP / CLS), DMCA workflow + registered agent, UGC moderation (CSAM hash + NCMEC), image pipeline (AVIF / WebP), SEO hygiene, WCAG 2.2 AA, EU DSA Article 16. Detects via `sanity`, `contentful`, `strapi`, `payload`, `ghost`, `gatsby`, `eleventy`.

Total agents: **24 → 29**. Total archetypes: **17 → 22**. New archetype detection signals added to `detect.ts` + Rule scoring in `archetypes.ts` with TIE_BREAK_PRIORITY updated. New compliance keywords integrated into `suggestCompliance()`.

### Landing — 5 new `/for/<archetype>` pages

Generated via existing `site/for/_generate.mjs` template — `enterprise-saas`, `mlops`, `streaming`, `marketplace`, `cms`. Same structure: hero → before/after split → 4 specialist agents → install CTA. All 22 cards on landing now link to dedicated pages.

---

## v1.0.170 — 2026-05-04

### 7 new specialist reviewers — coverage 71 → 88 average

Added dedicated pre-implementation reviewers for archetypes that previously fell back to generic agents. Each follows the same pattern as `pci-reviewer` / `regulated-reviewer`: outputs `docs/sec-threats/TM-{slug}.md`, signs off Critical/High mitigations before senior-dev claims tasks.

- **`mobile-store-reviewer`** — App Store / Play Store policy, IAP receipt validation, privacy nutrition labels, universal-link verification. Fixes README ↔ reality drift (was promised, didn't exist).
- **`library-reviewer`** — semver enforcement via api-extractor / cargo-public-api / pyright, backward-compat matrix, CHANGELOG discipline, OpenSSF Scorecard ≥ 7.
- **`infra-reviewer`** — tfsec / checkov / cdk-nag pre-apply, IAM least-privilege via Access Analyzer, public-S3 hard-block, KMS rotation, rollback-path enforcement, drift detection.
- **`cli-reviewer`** — shell-injection sweep (argv arrays only), destructive-op gate (--yes / interactive confirm), CLI UX checklist (--help / --json / NO_COLOR / exit codes), cross-platform path handling.
- **`game-reviewer`** — COPPA under-13 detection, ESRB / PEGI / IARC alignment, loot-box odds disclosure (BE / NL banned, DE / China explicit), WCAG 2.2 + game-a11y guidelines.
- **`data-platform-reviewer`** — PII inventory + classification, retention codification, OpenLineage / dbt docs lineage, SAR / Article 17 erasure scripts, Spark / Airflow / dbt log redaction, cross-border SCC declaration.
- **`devtools-reviewer`** — Sigstore signing + SLSA L3 provenance, telemetry-leak sweep (no paths / no usernames / no source), reproducible builds, auto-update signature verification.

Total agents: **17 → 24** (8 universal + 16 specialist).

### Landing — dedicated `/for/<archetype>` for all 17 archetypes

Previously only `/for/agent-product`, `/for/fintech`, `/for/healthcare` existed; remaining 14 cards on landing rendered as non-clickable `<div>` even though they implied detail pages. Generated via `site/for/_generate.mjs` from a single template + per-archetype data array — covers `web-service`, `ai-system`, `commerce`, `mobile-app`, `cli-tool`, `library`, `browser-extension`, `game`, `web3`, `data-platform`, `devtools`, `iot-embedded`, `infra`, `regulated`. Each page: hero → before/after split (5 archetype-specific bugs) → 4 specialist agents → install CTA.

### Public-repo cleanup

Removed `workers/` (Cloudflare Workers — infra stays private), `tests/ui/` and `tests/e2e/` (internal tooling), `enforcement/` (moved `prose-deny.txt` → `agents/_shared/`), `demo/`, `docs/marketplace/`, `docs/design/`, `docs/README-old.md`. Kept `tests/eval/` (LLM golden-set) and `tests/fixtures/` (archetype detection examples). Expanded `.gitignore` to prevent `node_modules`, `dist`, `.wrangler` re-commit.

### Stats widget removed from landing

Removed `installs/week`, `installs/month`, `total installs`, `npm DL/week` widget — early stage, numbers detract from message.

---

## v1.0.160 — 2026-05-01

### Dark emerald theme across admin + report + landing

Full visual redesign — admin board and public report flipped from light "Ghibli" theme to **dark emerald** matching the new `greatcto.systems` landing.

- **Admin** (`packages/board/public/index.html`): Geist + Geist Mono fonts, `#0a0e0c` background with subtle radial-gradient emerald glows, all cards on `#11161a`, status pills + p0/p1/p2 colors mapped to dark equivalents. Removed Ghibli landscape SVG (replaced with pure CSS gradient).
- **Report** (`packages/board/public/share.html`): same emerald palette, brand mark unified with admin (6-stroke bold asterisk SVG).
- **Brand mark**: redrawn favicon + nav-logo as 6-stroke bold asterisk (was 12-pointed thin star — illegible at 16×16). Same path used in admin sidebar, report header, browser favicon.

### Gate approval logic — `raw_status` fix

Closed gates were still showing Approve/Reject buttons because `mapStatus()` returns `'gate'` for any gate-labeled card regardless of bd's actual status. `getTasks()` now exposes `raw_status` (the bd-native open/in_progress/closed/blocked field), and both `cardHTML` and `openSide()` use it to determine `isOpenGate`.

### Pipeline SSE realtime

`/api/sse` now streams `pipeline` and `inbox` events in addition to `tasks` whenever:
- `.beads/interactions.jsonl` changes (per-project, debounced)
- `~/.great_cto/verdicts/*.log` changes (any agent emitting a verdict)

Client subscribes to all three event types — Active pipeline track + Inbox summary + Kanban update without polling.

### Markdown rendering — marked.js + DOMPurify

Replaced ~50-line hand-rolled `mdToHtml` regex parser with `marked@14.1.3` + `DOMPurify@3.1.7` (both SRI-pinned via CDN). Memory tab now renders proper GFM tables, autolinks, nested lists, code blocks. Falls back to escaped `<pre>` if CDN blocked.

### Playwright e2e + CI

`tests/ui/board.spec.mjs` — 11 specs covering sidebar, Inbox (gates / summary / 7-stage pipeline), Kanban (cards + descriptions), side panel, ⌘K search, Metrics (Cost panel + agent util + activity), Memory tab, Share toggle, full API contract.

`tests/ui/setup-fixture.mjs` — bootstraps isolated bd-fixture project on port 3146, spawns server.mjs from this repo (not npm cache).

`.github/workflows/ui-e2e.yml` — runs on PR + push to `packages/board/**` or `tests/ui/**`. Installs bd from source, runs Playwright with chromium, uploads trace + report on failure.

### Landing site (greatcto.systems)

- Removed live-iframe section + screenshot PNGs (light-theme PNGs clashed with dark page) → replaced with **DOM-rendered mockups** in the same emerald-dark palette. Pixel-perfect visual continuity, smaller payload, always in sync.
- Migrated GH Pages → **Cloudflare Pages** (300+ edge nodes vs ~10, ~30ms TTFB vs ~80ms). `_headers` + `_redirects` shipped in repo for CF native config.
- `great_cto-site` repo flipped to private (CF Pages serves private repos via GitHub App).

---

## v1.0.159 — 2026-05-01

### Board admin: Inbox + Memory + Cost panel + inline gate approval

- **Inbox tab** (default home) — time-aware greeting, summary pills (gates / P0 / blocked / stale > 48h), pending decisions list with inline Approve/Reject buttons, "Active pipeline" 7-stage track (architect → senior-dev → reviewers → qa → security → devops → l3-support).
- **Memory browser tab** — 4-layer memory viewer (PROJECT.md / CODEBASE.md / brain.md / lessons.md / HANDOFF.md) + cross-project global patterns (`~/.great_cto/global-patterns/`), inline minimal markdown renderer.
- **Cost panel** in Metrics — 30-day daily-burn bar chart from `docs/plans/PLAN-*.md` mtime + verdict `cost=$X` tags. 4 summary cells: last-30d / projected-month / vs-human / daily-avg. Monthly-budget alert if projected > `monthly-budget` in PROJECT.md.
- **Inline gate approval** — Approve/Reject buttons on gate-labelled Kanban cards, in Inbox rows, and in side-panel detail. POST `/api/gates/:id` with `bd update --status closed/blocked + --notes`, SSE rebroadcast.
- **Per-archetype icons** in project switcher / breadcrumbs / dropdown — 16 archetypes mapped to lucide-style stroke icons with brand colors (web-service → layers, ai-system → brain, web3 → diamond, etc.).
- **⌘K topbar search** — filters tasks across title / id / agent / labels / status, switches to Board tab when typing.
- **Project switcher dropdown** — multi-project navigation with archetype + description, query filter.
- **Task descriptions** in side-panel + card preview — gates show context before approval.

### Public report: AI vs Human compare card

- New compare panel: `AI agents $X vs Human team $Y · Nx cheaper` (explicit comparison).
- Hero stats reordered: **Tasks shipped / AI time / LLM cost** (was: shipped / spend / FTE).
- Compact paddings + brand mark unified with admin (`✱ greatcto` Space Grotesk 600).

### Landing site (greatcto.systems)

- New sections: **Two decisions per feature** pipeline schema · **12-angle code review** chip grid · **Memory + 94% MTTR** with 4-layer cards · **Pricing transparency** ($34/month breakdown).
- Hero now embeds **live iframe** of the public report demo (proves the product works).
- Font swap: Fraunces serif → **Space Grotesk** (technical/geometric across landing + admin + report).
- Mobile responsive: H1 sizing, nav nowrap, CTA stack, dashboard preview hidden < 800px.
- Brand: SVG logo (cream star + greatcto) + favicon family + apple-touch-icon.

### README

Compacted from 503 → 242 lines. Multica-style structure: hero / what is / two decisions / features / quick install / cost / vs comparison / collapsed details (memory / archetypes / MCP / triggers / limitations).

### Server endpoints (`packages/board/server.mjs`)

- `GET /api/inbox` — pending_gates / blocked / p0_open / stale_in_progress + summary
- `GET /api/memory` + `GET /api/memory-pattern?id=GP-XXX`
- `POST /api/gates/:id` — `{ action: "approve"|"reject", reason? }` → bd update + SSE
- `GET /api/cost?days=N` — daily series, projected monthly, budget comparison
- `GET /api/pipeline` — current 7-stage SDLC pipeline state
- `getTasks` exposes `description / design / acceptance / notes` from bd
- Verdict parser supports `cost=$X` tag (stripped from raw, exposed as `cost_usd`)

---

## v1.0.158 — 2026-04-30

### Light-theme redesign + new landing page

Full Ghibli-inspired light-theme redesign — replaces the dark Linear/Notion aesthetic across all surfaces.

- **New `site/`** — public landing page deployed to GitHub Pages (already wired via `.github/workflows/pages.yml`). Hero with hand-drawn SVG landscape (dawn variant), dashboard preview, "How it works" 3-step, six headline metrics, founder/VP-eng quotes, 17-agent table, terminal CTA. Pure static HTML/CSS — no build step.
- **`packages/board/public/index.html`** — board admin rewritten in light theme. Sidebar with project switcher + nav (Tasks/Metrics/Share/Agents), Fraunces-serif headings, soft pastel landscape background, kanban columns with ring/half/filled status dots, redesigned Metrics page (3 hero + 4 secondary cards + agent utilization + activity feed), Share tab with toggle. All `/api/tasks`, `/api/metrics`, `/api/share`, `/api/sse` wiring preserved.
- **`packages/board/public/share.html`** — public report on light landscape background, glass card with serif headline, three hero stats (Tasks shipped / LLM spend / vs FTE) + three secondary (AI time / QA pass rate / In progress), recently shipped list, paused state. Server template placeholders (`{{PROJECT}}`, `{{DATE}}`, `{{METRICS_JSON}}`, `{{TASKS_JSON}}`, `{{PAUSED}}`) unchanged — server.mjs and Cloudflare worker unaffected.

Stack: vanilla HTML/CSS/JS — zero deps for client install.

---

## v1.0.157 — 2026-04-30

### great_cto board — Kanban + CTO Dashboard + Shareable report URL

**New: `great-cto board` command**

```bash
great-cto board              # opens localhost:3141 in browser
great-cto board --port 4000  # custom port
great-cto board --no-open    # headless server
```

**`packages/board/server.mjs`** — local HTTP server
- Reads Beads tasks via `bd list --json --all --include-gates`
- `/api/tasks` → tasks with Kanban column mapping
- `/api/metrics` → velocity, cost savings, QA/security stats, agent utilization
- `/api/sse` → Server-Sent Events: live updates via `.beads/interactions.jsonl` watch
- `/api/share` GET/POST → toggle shareable report URL on/off

**`packages/board/public/index.html`** — self-contained SPA (zero deps)
- **Kanban tab**: 5 columns (Gates · Backlog · In Progress · Done · Blocked), live SSE updates, click → side panel with task details + close reason
- **Dashboard tab**: 6 stat cards (features shipped, avg completion, cost savings, QA%, security), agent utilization bars, verdict timeline
- **Share tab**: toggle on/off, copy URL, private link management

**`packages/board/public/share.html`** — shareable report template
- Executive-friendly: project name, date, 6 metrics, recently shipped features
- `{{PAUSED}}` placeholder → Worker serves paused state without deleting data
- No source code, no private data — aggregated metrics only

**`workers/share/index.js`** — Cloudflare Worker + R2
- `POST /r/` → publish report, returns `{ url, hash, expires_at }`
- `GET /r/{hash}` → serve HTML (or paused page if disabled)
- `POST /r/{hash}` `{ enabled }` → toggle on/off (preserves data)
- TTL 30 days, auto-delete from R2, `X-Robots-Tag: noindex`

---

## v1.0.156 — 2026-04-30

### Agent audit: tool gaps fixed + 3 new specialist subagents

**Tool fixes (9 agents)**

| Agent | Added tools |
|---|---|
| pm | `Edit`, `advisor_20260301`, `memory_20250929` |
| ai-prompt-architect | `Edit`, `Bash`, `advisor_20260301` |
| ai-eval-engineer | `Edit`, `WebFetch`, `WebSearch` |
| l3-support | `Edit`, `advisor_20260301`, `memory_20250929` |
| web-store-reviewer | `Bash`, `advisor_20260301` |
| project-auditor | `Edit`, `advisor_20260301`, `memory_20250929` |
| qa-engineer | `WebSearch` |
| devops | `WebSearch`, `memory_20250929`, `mcp__great_cto_llm_router__ask_kimi` |
| security-officer | `mcp__great_cto_llm_router__ask_kimi` |

**Skill fixes (skill-discover.sh)**
- `pm._default`: + `risk-register`
- `ai-prompt-architect._default`: + `secure-sdlc`
- `project-auditor._default`: + `vendors`, `cost-model`, `risk-register`

**New subagents**

- **`regulated-reviewer`** — pre-impl specialist for `regulated`/`fintech`. Covers DORA ICT (Art. 5 & 16), NIS2 Art. 21, ISO 27001 SoA, SOX ITGC (Access, Change Mgmt, Computer Ops, SoD), HIPAA PHI. Outputs `TM-*.md`. Blocks senior-dev on Critical/High findings.
- **`performance-engineer`** — SLO contract design, k6 load tests, latency regression, N+1 detection, capacity planning. Outputs `docs/performance/PERF-*.md`. Active when `performance-sla:` set or archetype=data-platform/enterprise/commerce.
- **`db-migration-reviewer`** — migration safety: lock duration analysis, zero-downtime patterns (CONCURRENTLY, nullable-first, shadow table), rollback verification, PII column detection. Outputs `docs/migrations/MIGRATE-*.md`. Blocks deploy if no rollback path.

---

## v1.0.155 — 2026-04-29

### Safeguards: non-negotiable invariants wired across the pipeline

**`skills/great_cto/templates/ARCH-default.md`** — `## Safeguards` section added
- 4 categories: Data integrity · Security · Performance · API contracts
- Archetype hints: commerce, ai-system, web3, iot-embedded, regulated

**`skills/great_cto/templates/ARCH-ai.md`** — AI-specific `## Safeguards` section added
- LLM safety (input sanitisation, no PII in prompts, hard token cap, output filter)
- Cost & abuse (per-user spend cap, BudgetTracker, anomaly threshold)
- Data isolation (tenant_id scoping, tool output sanitisation)
- Auditability (tool call logging, ≥3 EVAL-*.md eval gate)

**`agents/architect.md`** — Proof Loop extended
- 2 new checks: Safeguards section present + archetype-appropriate
- Safeguards generation guidance section added (3 sources: archetype defaults, feature-specific, anti-patterns)

**`agents/senior-dev.md`** — Safeguards pre-flight added (Step 0b)
- Reads `## Safeguards` from ARCH doc before writing any code
- Every unchecked `- [ ]` must be implemented or blocked — no silent skips

**`agents/security-officer.md`** — Safeguards cross-check added (CSO Proof Loop 5c)
- New Proof Loop item: `ARCH ## Safeguards cross-check: all items verified?`
- Bash block verifies each `- [ ]` item; unimplemented → P1 minimum; ai isolation/cost-cap → P0

---

## v1.0.154 — 2026-04-29

### Rename: tech-lead → architect + new skills/tools

**`agents/architect.md`** (renamed from `agents/tech-lead.md`)

- Agent renamed: `tech-lead` → `architect` across all 66 source files (agents, commands, skills, templates, tests, demos, site)
- `CHANGELOG.md` preserved as-is (historical record)
- `plugin.json` stale-cleanup loop now removes `great_cto-tech-lead.md` from old installs

#### New tools for Architect
- `advisor_20260301` — Opus 4.7 advisor escalation for hard architectural reasoning
- `mcp__great_cto_llm_router__ask_kimi` — consult external LLM (Kimi) on contested trade-offs

#### New skills for Architect (frontmatter)
- `anthropic-skills:system-architect` — system architecture methodology
- `anthropic-skills:adr` — ADR writing methodology
- `well-architected` — AWS/MSFT Well-Architected lens
- `discovery` — project discovery phase

#### New skills in AGENT_SKILLS `_default`
- `cost-discipline` — cost-aware architecture decisions
- `decision-log` — architect logs every significant decision
- `secure-sdlc` — promoted from archetype-specific to `_default` (security is a universal architecture concern, not just for high-risk archetypes)

`secure-sdlc` was previously duplicated in 5 archetype-specific entries; now single entry in `_default` inherited by all.

---

## v1.0.152 — 2026-04-29

### PM agent: LLM cost model + human comparison

**`agents/pm.md`** + **`skills/great_cto/references/pm-planning.md`**

PM agent now estimates projects in **LLM agent terms** (token cost) and shows a side-by-side
comparison with human developer cost.

#### What changed

**`pm-planning.md` additions:**
- Human equivalent cost model: role rates (architect $200/h, backend $150/h, QA $80/h, security $200/h, etc.)
- Human hours per task type table (12 task types × optimistic/pessimistic range)
- Cost comparison formula: `savings_ratio = human_total / llm_total`
- Expected savings benchmarks: PoC ~3,000–10,000x, MVP ~3,000–10,000x
- PLAN-*.md schema updated: task breakdown now includes `Token cost` + `Human equiv` columns
- New `## Cost comparison` section in every PLAN document

**`agents/pm.md`** Step 4 expanded:
- LLM cost: per-agent breakdown (tech-lead Opus, pm/senior-dev/security Sonnet, qa/devops Haiku)
- Human equivalent: task → role → hours → USD (mid-senior US, +30% coordination overhead)
- Savings ratio computed and shown in both PLAN file and CTO summary

**Step 10 CTO presentation** now includes:
```
── Cost breakdown ────────────────────────────────
LLM agents:  $X.XX – $X.XX
Human team:  $X,XXX – $X,XXX  (+30% coordination)
Savings:     ~XXXx cheaper  (~$X,XXX saved)
```

**Proof Check** (Step 8) gains 2 new items:
- LLM cost estimate computed (per task + total)?
- Human equivalent cost + savings ratio shown?

---

## v1.0.151 — 2026-04-29

### New agent: PM (Project Manager)

**`agents/pm.md`** + **`skills/great_cto/references/pm-planning.md`**

New agent in the pipeline: **tech-lead → PM → (gate:plan) → senior-dev**.

#### What PM does

1. Reads the latest ARCH doc after `gate:arch` approval
2. Extracts every task (SCHEMA/API/SVC/UI/INFRA/LLM/SEC/TEST/CSO) from the architecture
3. Builds a dependency graph (text tree showing sequential vs. parallel)
4. Estimates duration per task using the estimation table in `pm-planning.md` (by task type × mode)
5. Applies buffer: PoC 0%, MVP +25%, Full +40%
6. Identifies parallel-safe tasks (disjoint file ownership)
7. Allocates agents: N concurrent senior-devs + qa-engineer + security-officer
8. Generates a Mermaid Gantt diagram + ASCII fallback table
9. Writes `docs/plans/PLAN-<slug>.md`
10. Creates `gate:plan` — human approval required before any senior-dev starts
11. Handles CTO adjustments: fewer agents, PoC mode, re-collapse parallel pools

#### Project modes

| Mode | Trigger | Task limit | Goal |
|------|---------|------------|------|
| `poc` | `project_size: nano` or `.great_cto/poc-mode.active` | ≤10 | ≤3 days |
| `mvp` | `project_size: small` | ≤30 | ≤4 weeks |
| `full` | `medium/large/enterprise` | unlimited | honest estimate |

#### Skills

PM uses: `pm-planning`, `pre-mortem`, `cost-model`, `anti-patterns` + archetype packs.
AGENT_SKILLS matrix: 15 agents × 110 archetype entries (222 skill references, all resolving).

#### Pipeline wiring

- `agents/tech-lead.md` Step 7 Report: now mentions PM handoff + when to skip (nano)
- `skills/great_cto/SKILL.md` Step 1b: PM inserted between gate:arch and senior-dev
- `GATE:PLAN` described in SKILL.md with 72h expiry and adjustment protocol

---

## v1.0.150 — 2026-04-29

### Fixed — project-auditor: deduplication, self-fix guard, risk/vendor scaffolding

Three gaps surfaced from a real PoC run producing 8 duplicate ticket pairs.

#### Deduplication — `bd_create_if_new` helper (Phase 8)

Re-running `/audit` on the same repo created duplicate Beads tasks for every finding.
Root cause: `bd create` was called unconditionally — no check against open tasks.

Added `bd_create_if_new <keyword> <title> [flags]` shell function to Phase 8:
- Runs `bd search <keyword>` before creating
- If any open/in-progress match → prints `SKIP (duplicate)` and returns
- If no match → creates the task normally
- All example `bd create` calls in Phase 8 updated to use this pattern
- Also applied to cost-cap tasks in Phase 4b (LLM spend exceeded / approaching)
- Phase 9 report now shows `[N created, M skipped — duplicates]`

#### Self-fix guard

Auditor was filing tickets for issues it had already auto-fixed in the same run
(e.g. updating `infra: fly.io → render.com` in PROJECT.md then creating a task for it).

Added explicit **Self-fix guard** section in Phase 8: if the fix is already applied
in this run, emit `AUTO-FIXED:` log line and skip `bd create`.

#### Risk / vendor directory scaffolding

`docs/risks/RISK-REGISTER.md` and `docs/vendors/` only exist after running `/start`
with tech-lead. Pure `/audit` on an existing repo silently skipped all risk and vendor
management (commands read these with `[ -f ... ]` guards).

Added scaffolding block before the caching layer in project-auditor's pre-flight:
- Creates `docs/risks/RISK-REGISTER.md` with header table if missing
- Creates `docs/vendors/.gitkeep` if missing
- Idempotent — never overwrites existing content

---

## v1.0.149 — 2026-04-29

### Fixed — LLM router infrastructure: secrets.env template, doctor hint, pre-flight check

Root cause: `mcp__great_cto_llm_router__ask_kimi` always returned `"OPENROUTER_API_KEY not set"`
even when users had the key. `~/.great_cto/secrets.env` was never created by the
installer — so the MCP server's layered loader (env → .env.local → secrets.env) always
fell through to None.

The MCP server config passes `"OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}"` — when the
shell env var is unset, Claude Code passes empty string, which is falsy, so the server
correctly falls through to file lookup. But since the file didn't exist, it got None →
fallback.

**Fixes:**

1. **`packages/cli/src/main.ts`** — installer now creates `~/.great_cto/secrets.env`
   template on first install (or when missing). Never overwrites an existing file.
   Template contains commented instructions + key placeholder. Logged as:
   `created ~/.great_cto/secrets.env (add OPENROUTER_API_KEY for LLM router)`

2. **`commands/doctor.md` Check 8b** — "not configured" message upgraded from `ℹ` to `⚠`,
   now shows both locations explicitly:
   - Global: `echo 'OPENROUTER_API_KEY=...' >> ~/.great_cto/secrets.env` (preferred)
   - Per-project: `echo 'OPENROUTER_API_KEY=...' >> .env.local`

3. **`commands/start.md` Step 5c pre-flight** — added LLM router check block. Reads key
   from all 3 locations. If missing: creates `~/.great_cto/secrets.env` template with
   commented placeholder so user knows exactly where to add it.

**How to activate now (existing installs):**
```bash
echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> ~/.great_cto/secrets.env
# Then restart Claude Code — no reinstall needed.
```

---

## v1.0.148 — 2026-04-29

### Fixed — PoC field-test: bd fallback, worktree graceful degradation, Python buffering, pytest-timeout

Four gaps surfaced during a real-world Agent Company Factory PoC run.

#### P0 — bd CLI without Dolt backend: silent degradation → explicit fallback

`bd init` silently succeeds even when the Dolt binary is missing (CGO not compiled).
All subsequent `bd list/add/create` calls fail without any user-visible error — the
entire task-tracking pipeline breaks invisibly.

**Fixes:**
- `/start` Step 3: `bd init` now checks if backend actually works with `bd list --status open`. On failure: creates `.great_cto/tasks.md` (markdown fallback table) and prints a clear warning with fix instructions.
- `/start` Step 5c (**new pre-flight block**): checks `bd`, worktree hooks, and git state. Outputs `⚠` lines surfaced in Step 6 confirmation. Never blocks — always warns.
- `agents/senior-dev.md`: added explicit `**If bd unavailable**: write to .great_cto/tasks.md` note to step 11 (was already there, now more prominent).

Fix for bd: `CGO_ENABLED=1 go install github.com/steveyegge/beads/cmd/bd@latest` or download pre-built from releases.

#### P0 — senior-dev `isolation: worktree` hard-fails without hooks

`Agent(subagent_type="senior-dev")` with `isolation: worktree` throws:
`Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured`

This kills every parallel implementation task even for valid git repos that simply
haven't configured the hooks.

**Fixes:**
- `agents/senior-dev.md`: added `isolation-fallback: none` frontmatter.
- Added **Worktree isolation** section explaining: if worktree fails → continue without isolation, prefix output with `⚠`, commit frequently as checkpoints.
- Included copy-paste `settings.json` snippet for WorktreeCreate/WorktreeRemove hooks.
- `/start` pre-flight (Step 5c) now checks for `WorktreeCreate` in settings.json and warns if missing.

#### P1 — Python stdout buffering when tests run in background

`pytest ... & ; sleep 5; tail /tmp/out.log` returns empty file — Python buffers
stdout when not in a TTY. `tail` reads the empty buffer.

**Fixes:**
- `agents/senior-dev.md`: all pytest examples now use `PYTHONUNBUFFERED=1 pytest -x -v`.
- Added background pattern: `PYTHONUNBUFFERED=1 pytest > /tmp/test-out.log 2>&1 &`.
- `agents/senior-dev.md` and `agents/qa-engineer.md`: all `pytest 2>/dev/null` fallback invocations updated to `PYTHONUNBUFFERED=1 pytest --timeout=30 2>/dev/null`.

#### P2 — No pytest-timeout in Python project bootstrap

Tests can hang indefinitely (network calls, deadlocks, infinite loops in LLM agents).
No default timeout means CI/CD pipelines and PoC runs block forever.

**Fix:**
- `agents/senior-dev.md` Stack Detection section: added Python project bootstrap snippet with `[tool.pytest.ini_options]` including `timeout = 30` and `timeout_method = "thread"`. Triggered when no `pyproject.toml`/`pytest.ini` exists.

---

## v1.0.147 — 2026-04-28

### Fixed — sort correctness, integration tests, doctor check, /migrate command, hook extraction

Closes gaps A7, A12, A20/A25 (partial), A22, and M1+ identified in the v1.0.146 gap audit.

#### A7 — Lexicographic `sort | tail -1` on numbered docs (CRITICAL)

`ls ARCH-*.md | sort | tail -1` uses lexicographic order, so `ARCH-10.md` sorts
before `ARCH-9.md` — the wrong document is loaded. Fixed **13 sites** across 7 files
to use `sort -V | tail -1` (version-aware natural sort):

- `agents/devops.md` (4 sites: QA report, CSO report, ARCH doc, changelog FEATURE grep)
- `agents/qa-engineer.md` (FEATURE_SLUG extraction)
- `agents/security-officer.md` (latest QA read)
- `agents/senior-dev.md` (2 sites: ARCH doc hint, Requirements Checklist)
- `commands/digest.md` (2 sites: latest AUDIT, latest REVIEW)
- `commands/inbox.md` (latest AUDIT)
- `commands/doctor.md` (`find_latest` helper)
- `skills/great_cto/SKILL.md` (3 sites: LAST_PM, PREV_QA, PREV_CSO)
- `.claude-plugin/plugin.json` SessionStart (QA + CSO phase-context reads)

#### A12 — Integration test: agent × archetype → skill path resolution (NEW)

Added `tests/structural/test_agent_skills.py`. Parses the AGENT_SKILLS matrix in
`scripts/skill-discover.sh` and verifies every bundled skill name resolves to a real
`.md` file under `skills/great_cto/`. Currently validates 201 skill references across
14 agents × 93 archetype entries (2 external `superpowers:*` skills skipped).

Run: `python3 tests/structural/test_agent_skills.py`

#### M1+ — Check 2c in `/doctor`: archetype confidence validation

Added **Check 2c** to `commands/doctor.md`. Reads `archetype_confidence:` from
`PROJECT.md` and warns when the value is `medium` or `low` (detector uncertain) or
missing (old install). Shows alternatives and recommends `/audit` or `/migrate`.

#### A25 — New `/migrate` command

Added `commands/migrate.md`. Appends missing `PROJECT.md` fields to existing installs
without touching current values. Fields migrated: `archetype_confidence`,
`archetype_alternatives`, `archetype_rationale`, `security_tier`, `project_size`.
Supports `--dry-run` to preview changes.

#### A22 — Extract UserPromptSubmit inline Python to external script

Moved the 10-line inline Python from the `UserPromptSubmit` hook in `plugin.json` to
`scripts/hooks/user-prompt-submit.py`. Hook now calls
`python3 "${PLUGIN_DIR}/scripts/hooks/user-prompt-submit.py"`.
Easier to test, diff, and extend.

---

## v1.0.146 — 2026-04-28

### Fixed — pipeline gap audit triggered by real-world test on AI agent project

Field-test on `/tmp/great-cto-test/ai-agent-demo` (Anthropic SDK + Node) surfaced
a regression that has been live since v1.0.89 plus several smaller leaks. This
release closes 7 gaps grouped by impact tier.

#### G1 — `find … | head -1` resolves to **stale** plugin version (CRITICAL)

When multiple plugin versions are cached at `~/.claude/plugins/cache/local/great_cto/<v>/`,
`find … | head -1` returns the first match in filesystem order — not the latest version.
Result: agents read `ARCHETYPES.md` / `TYPE_MAP.md` / `agent-security.md` from
v1.0.88 even though v1.0.145 is installed. **Every agent change between v1.0.89 →
v1.0.145 was silently invisible at runtime when v1.0.88 happened to be present.**

Fixed in **12 call sites** across:
- `agents/`: tech-lead, senior-dev (impl), qa-engineer (×2), security-officer (×3),
  devops (×2), project-auditor (×2)
- `commands/`: start (×2), crystallize (×1)

Pattern: `find … | head -1` → `find … | sort -V | tail -1` (semver-aware).
Variant with `-exec dirname {} \;` rewritten to
`find … | sort -V | tail -1 | xargs dirname`.

The 3 remaining `find . .great_cto … | head -1` sites are **project-local fallback
lookups** (single-file scope, no version risk) — left unchanged.

#### G2 — `applies_to` not exposed in skills-registry.json (CRITICAL)

`skill-discover.sh` was scoring presence of `applies_to:` for quality (15pt)
but not extracting the values. Open-world skill discovery (v1.0.142+) instructed
agents to scan tier2/tier3 by `summary` keywords with no archetype tags to filter
by — making the registry's per-skill metadata invisible.

Fixed: `emit_entry()` now extracts `applies_to:` (both flow-style
`[a, b]` and block-style `- a\n  - b` YAML) and emits a JSON array per skill.

Result: **60/62 tier-1 skills** now expose `applies_to`. Open-world discovery
becomes structured matching (`if archetype in skill["applies_to"]`) instead of
substring match on summary.

#### M3 — `README.md` in `templates/` polluted scoring

`templates/README.md` was meta-documentation but indexed as a skill at score 20.
Fixed: skip files matching `README` or starting with `_` during tier-1 scan.

#### M4 — backfill `references/` frontmatter (29 files)

All 29 reference files (`agent-security`, `agent-style`, `anti-patterns`,
`board-narrative`, `burn-rate`, `cost-discipline`, `cost-model`, `decision-log`,
`deprecations`, `discovery`, `dora`, `gate-health`, `grafana-ops`,
`incident-patterns`, `knowledge-extraction`, `llm-router`, `onboarding`,
`phases`, `poc-mode`, `pre-mortem`, `quarterly-review`, `reliability`,
`risk-register`, `sec-metrics`, `secure-sdlc`, `security-tiers`,
`skills-architecture`, `vendors`, `waivers`) now ship with canonical
SKILL.md frontmatter (`name` / `description` / `when_to_use` / `applies_to`).

**Result: tier-1 quality avg 22 → 99.4** (v1.0.143 → v1.0.146).
Zero skills below score 50.

#### G3 + G4 — extend AGENT_SKILLS matrix (8 archetypes added)

`agent_skills` map in `skill-discover.sh` was missing per-archetype entries for
**iot-embedded, fintech, data-platform, mobile-app, library, enterprise, web-app,
marketing-site, devtools, infra**. Cross-archetype agents (devops, l3-support,
project-auditor) had only `_default`.

Coverage matrix now (out of 17 archetypes):
- tech-lead: **17/17**
- senior-dev: 16/17
- qa-engineer: 13/17
- security-officer: 10/17 (purposefully selective — no marketing-site/library/etc.)
- devops: 9/17
- l3-support: 8/17
- project-auditor: 6/17

Specific additions: regulated archetype now pulls full compliance pack
(DORA-ICT, DORA-third-party, NIS2, ISO27001-SoA, SOX-ITGC, TISAX, 21CFR11);
fintech pulls PCI-DSS-SAQ-D + DORA + SOX; commerce gains PCI-DSS-SAQ-A.

#### M1 — persist detection confidence in PROJECT.md

Previously `confidence: medium` was printed once at install and lost. Now
`bootstrap()` writes:

```yaml
archetype_confidence: medium
archetype_alternatives: [library]
archetype_rationale: AI/LLM tooling detected (Anthropic SDK)
```

`/inbox` v1.0.146 surfaces a banner whenever `archetype_confidence != high &&
!= user-specified` so the user can override before the pipeline commits.

#### M2 — force registry refresh on plugin version mismatch

CLI bootstrap now compares `skills-registry.json` `plugin_version` against the
just-installed version. On mismatch (typical on upgrade), the stale registry is
deleted and `skill-discover.sh` re-runs against the new plugin tree. Versions
are sorted with proper semver compare (not lexicographic — fixes the
`1.0.10 < 1.0.9` lexicographic bug).

#### Site — landing + agents page

- Hero stats line (`14 agents · 14 archetypes · …`) now `text-align:center` —
  was left-aligned in centered container.
- `agents.html` was showing **11 cards** ("14 agents" badge above). Added
  the 3 specialist subagents shipped in v1.0.143:
  - `pci-reviewer` (commerce — PCI-DSS scope, SCA, idempotency)
  - `oracle-reviewer` (web3 — oracle strategy, MEV, upgradeability, L2)
  - `firmware-reviewer` (iot-embedded — OTA, ETSI EN 303 645, secure boot)

Total cards now **14/14**.

---

## v1.0.145 — 2026-04-28

### Changed — backfill canonical SKILL.md frontmatter in tier-1 packs/templates

v1.0.144 shipped quality scoring; tier-1 average came in at **22/100** because most packs and templates predated the SKILL.md frontmatter convention. This release backfills the convention across all in-scope artefacts.

#### Files updated (31)

**Packs (13)** — `skills/great_cto/packs/`:
agent-pack, ai-pack, browser-extension-pack, commerce-pack, data-pack, devtools-pack, enterprise-pack, game-pack, infra-pack, library-pack, mobile-pack, web-pack, web3-pack

**Templates (18)** — `skills/great_cto/templates/`:
ARCH-ai, ARCH-browser-extension, ARCH-default, ARCH-defi-protocol, ARCH-game, THREAT-MODEL-AI, EVAL-template, ADR-LLM, ADR-PROMPT, PCI-DSS-SAQ-A, PCI-DSS-SAQ-D, DORA-ICT-risk-assessment, DORA-third-party-register, NIS2-article21-controls, 21CFR11-checklist, TISAX-VDA-ISA-results, ISO27001-SoA, SOX-ITGC-checklist

Each file now opens with:

```yaml
---
name: <skill-name>
description: <one-sentence purpose>
when_to_use: <when an agent should consult this>
applies_to:
  - <archetype>
---
```

#### `scripts/skill-discover.sh` — env override

`PLUGIN_DIR` is now respected when set in env (`: "${PLUGIN_DIR:=…}"`). Lets developers re-score against the dev tree instead of the cached marketplace copy.

### Result

- **Tier-1 average quality: 22 → 61.9** (+182%)
- **Packs**: all 13 score ≥ 80 (was 20)
- **Templates**: 18/19 score ≥ 80 (only `README.md` left at 20 — meta, intentionally skipped)
- Remaining low-score items are 28 `references/` (out of scope; future iteration)

Why it matters: agents that scan the registry now see proper `applies_to` tags + when-to-use hints, enabling open-world skill discovery (v1.0.142+) to match by archetype reliably instead of by name alone.

---

## v1.0.144 — 2026-04-28

### Added — auto-flow visibility + detection confidence + skill quality

User feedback: "How do I trust that archetype is correct? How do I trust that skills are quality?" Plus README/landing didn't surface the auto-loading flow that v1.0.140-143 built. This release closes both gaps.

#### `packages/cli/src/main.ts` — Detection confidence display

When `pickArchetype()` returns `confidence: low` OR `confidence: medium` with ≥ 2 alternatives, the CLI now shows a **highlighted warning** with:
- Top candidate + rationale
- Alternatives list
- Override command: `--archetype <name>` or edit PROJECT.md after install

User can spot a wrong detection at install time and override before the pipeline commits to the choice.

#### `scripts/skill-discover.sh` — Quality scoring per skill

Every skill in the registry now has `quality_score` (0–100) computed from:
- Frontmatter present (---) — 30 pts
- `description:` ≥ 30 chars — 20 pts
- `when_to_use:` or `summary:` field — 15 pts
- `applies_to:` field (archetype tags) — 15 pts
- Body ≥ 50 lines — 10 pts
- File size ≥ 2 KB — 10 pts

Current scores (after this release):
- Tier 3 (personal repo) avg: **100** — `rag-cascading-search` is canonical SKILL.md format
- Tier 2 (anthropic) avg: **67** — well-formed but lack `when_to_use` field
- Tier 1 (great_cto built-in) avg: **22** — packs/templates lack frontmatter; surfaces real cleanup work

Agents can prefer high-score skills when multiple match a task. Low scores aren't blocking — they're diagnostic for content quality work.

#### `README.md` — "How auto-loading works" section

New section above commands table, explaining the 3-layer auto-loading flow with ASCII flowchart:

```
Layer 1: Archetype auto-detected from repo (15 manifest signals → 14 archetypes)
Layer 2: Agents auto-wired by archetype (commerce → +pci-reviewer, etc.)
Layer 3: Skills auto-suggested per (agent × archetype)
```

Plus quality + override paragraphs.

#### Site (`great_cto-site` repo) — same auto-loading section

Three side-by-side cards on landing page after archetypes section: Layer 1 (Archetype) / Layer 2 (Agents) / Layer 3 (Skills). Site bumped to v1.0.144.

#### README — agent count corrected

Header line: `7 Claude Code subagents` → `14 Claude Code subagents` (was stale since v1.0.134/136/143 added specialists).

### Why this matters

**Confidence display** answers: "Did detection get it right?" — user sees rationale + alternatives, can override before commit.

**Quality scoring** answers: "Is this skill worth consulting?" — agents make informed choices when multiple skills match a task.

**Auto-flow visibility** answers: "What does this thing actually do at install?" — visitors to README/landing see the 3-layer mechanism, not just outcome.

### Coverage

- 14 agents (no change vs v1.0.143)
- Registry now includes `quality_score` per skill (82 skills × scores)
- README + site both show auto-loading explanation

---

## v1.0.143 — 2026-04-28

### Added — three new specialist subagents (commerce / web3 / iot)

Same pattern as v1.0.134 AI specialists + v1.0.136 web-store-reviewer: each archetype with high domain-specific complexity gets a pre-impl reviewer that consults its pack + templates and produces a tailored TM-{slug}.md before senior-dev claims tasks.

| Subagent | Archetype | Specialises in |
|---|---|---|
| **`pci-reviewer`** (Sonnet 4.6) | `commerce` | PCI-DSS scope (SAQ-A vs SAQ-D), idempotency proof, webhook signature validation, refund/dispute flow, SCA / PSD2 (EU), PSP failover |
| **`oracle-reviewer`** (Sonnet 4.6) | `web3` | Subtype block-ship gates, oracle strategy (Chainlink + Pyth + TWAP), MEV protection, upgradeability matrix (Immutable / UUPS / Diamond / Beacon), L2 resilience, custody/multisig, bug bounty TVL tier |
| **`firmware-reviewer`** (Sonnet 4.6) | `iot-embedded` | OTA strategy (signing + A/B + auto-rollback + fleet), ETSI EN 303 645 13 provisions, secure boot, HIL test, wireless protocol security (BLE/Wi-Fi/Zigbee/Matter/LoRa) |

### Wiring

- `security-officer.md` pre-impl mode delegates to each new specialist for matching archetype (commerce/web3/iot-embedded)
- `tech-lead.md` § Subagent delegation table extended with rows for new specialists
- `plugin.json` AGENT loop adds 3 new agents (now **14** agents total)
- `ARCHETYPES.md` § Required Agents adds new subsection for commerce/web3/iot specialists with full pipeline diagrams
- `scripts/skill-discover.sh` adds `agent_skills` entries for the 3 new subagents

### Coverage

| | Before | After |
|---|---|---|
| Agents | 11 | **14** |
| Specialist subagents per archetype | AI (3) + browser-extension (1) | + commerce (1) + web3 (1) + iot (1) |
| Templates | 19 | 19 (no change) |
| Archetypes | 14 | 14 (no change) |

### Pattern parity across security-critical archetypes

| Archetype | Specialist subagent | Coverage depth |
|---|---|---|
| `ai-system` | ai-security-reviewer + ai-prompt-architect + ai-eval-engineer | Full chain |
| `agent-product` | same as ai-system | Full chain |
| `browser-extension` | web-store-reviewer | Single specialist |
| `commerce` | pci-reviewer | Single specialist |
| `web3` | oracle-reviewer | Single specialist |
| `iot-embedded` | firmware-reviewer | Single specialist |
| `regulated` | security-officer pre-impl + enterprise-pack | Generic STRIDE + compliance frameworks |

---

## v1.0.142 — 2026-04-28

### Fixed — gaps surfaced by 3 parallel field-test simulations of v1.0.140

Three agent-based field tests on v1.0.140 (ai-system / commerce / cross-tier consumption) found 4 P0 bugs and several P1s. This release patches them.

#### `scripts/skill-discover.sh` — broadened scan paths

- **Top-level skills now scanned**: `$PLUGIN_DIR/skills/<name>/SKILL.md` for skills like `skeptical-triage`, `done-blocked`, `prose-style`, `cso`, `investigate`, `ship`, `canary` (tier1 went from 56 to 63 skills).
- **superpowers + beads broader find**: previously matched only `superpowers/skills` directly; now matches multiple install layouts including `marketplaces/*/superpowers/`, `plugins/superpowers/plugins/superpowers/skills/`. Same for beads.
- **Summary truncation**: 200 → 280 chars, no mid-word cuts (uses regex to trim at last whitespace before limit).

#### `agents/tech-lead.md` — SECURITY_REQUIRED case fixed

Line 711 case statement was missing `agent-product` and `browser-extension` — silent regression where TM hard-halt didn't fire. Fixed:
- Added `agent-product` (multi-tenant agents need TM)
- Added `browser-extension` (Web Store policy review needs TM)

`NEED_COST` case also extended to include `agent-product` (cost-model required for production AI projects).

#### Open-world skill discovery — agents instructed to scan beyond suggestions

v1.0.140 agent Step 0 said "read your `_default` and decide which to Read." This was closed-world: agents would not discover relevant tier2 (anthropic) or tier3 (personal) skills not pre-listed.

v1.0.142 adds explicit instruction to all 7 agents with Step 0c (tech-lead has full bash, others have one-liner reference): **scan `tier2_external` and `tier3_personal` for skills whose `summary` matches current task keywords**. Agent decides which to Read.

### Why this matters

**Before**: tech-lead working on "MCP integration for Linear API" would consult only suggestions in `agent_skills["tech-lead"]["agent-product"]` (5 items). Would miss `anthropic:mcp-builder` skill in tier2 (designed exactly for this).

**After**: same agent now scans full registry, finds `anthropic:mcp-builder`, reads its description, decides whether to consult. Real cross-tier discovery.

### Coverage (no architecture change, all incremental fixes)

- Registry: 63 tier1 + 18 tier2 + 1 tier3 = 82 skills locally discoverable (was 80)
- 7 agents updated with open-world hint
- 1 critical regression (SECURITY_REQUIRED) fixed
- Description quality improved (no mid-word cuts)

### Skipped from field-test findings

- **`pci-reviewer`, `oracle-reviewer`, `firmware-reviewer` specialist subagents** — moved to v1.0.143 (separate release, focused work)
- **`/skills search <keyword>` command** — current bash pattern in tech-lead.md Step 0b is sufficient; new command is overkill until catalog grows past 200+ skills
- **Smart embedding-based discovery** — deferred until tier3 grows past 20 skills

---

## v1.0.140 — 2026-04-28

### Added — local skill catalog model: archetype → agents → agent picks skills

Architecture: **archetype determines which agents run; each agent decides which skills to consult from a locally-cached catalog.** This release closes three gaps left in v1.0.139:

1. Skills bootstrapped at install time (not just first SessionStart)
2. Per-(agent × archetype) skill suggestions in registry
3. Each of 11 agents has Step 0 guidance to consult registry

#### `packages/cli/src/main.ts` — Skills bootstrap during `npx great-cto init`

Added Step 4c between plugin install and PROJECT.md bootstrap:
- Clone `anthropics/skills` → `~/.great_cto/anthropic-skills` (depth=1, 30s timeout)
- Clone `avelikiy/ai-agent-skills` → `~/.great_cto/personal-skills`
- Run `skill-discover.sh` to build initial registry

User no longer waits for first SessionStart hook to populate catalog. Cold-cache delay shifts from session-1 to install-time (more visible, but also retry-able with `--force`).

#### `scripts/skill-discover.sh` — Per-(agent × archetype) suggestions

Registry now has `agent_skills` field:

```json
{
  "agent_skills": {
    "tech-lead": {
      "_default": ["pre-mortem", "risk-register", "vendors", "cost-model", "anti-patterns"],
      "ai-system": ["+ARCH-ai", "+ai-pack", "+secure-sdlc"],
      "agent-product": ["+ARCH-ai", "+agent-pack", "+secure-sdlc"],
      "commerce": ["+ARCH-default", "+commerce-pack", "+secure-sdlc"],
      "web3": ["+ARCH-defi-protocol", "+web3-pack"],
      ...
    },
    "ai-prompt-architect": {
      "_default": ["ADR-PROMPT", "ai-pack", "agent-pack"]
    },
    ...11 agents total
  }
}
```

`+` prefix = additive on top of `_default`. Agent reads `agent_skills["<my-name>"]["_default"]` plus `agent_skills["<my-name>"]["<archetype>"]`, then decides which to actually `Read`.

#### `scripts/skill-discover.sh` — Description extraction fix

Previously most `summary` fields were empty (parser fell back to first text after `---` which often hit a blank line). Now tries 4 sources in order: frontmatter `description:`, frontmatter `summary:`/`when_to_use:`, first non-empty body paragraph (skipping headings + quotes), quote-block bold text. ~40 of 56 tier-1 skills now have meaningful summaries (up from ~5).

#### Agents — Step 0 (or Step 0c) added to all 11

Each agent now has a Step 0 block instructing: "read `~/.great_cto/skills-registry.json` → `agent_skills["<my-name>"][...]` → decide which SKILL.md to Read." `tech-lead.md` has the full bash pattern; the other 10 reference it briefly to avoid duplication.

### Why this design

- **Archetype → agents**: structural (ARCHETYPES.md Required Agents table — already worked)
- **Agent → skills**: judgment-based, not auto-load. Agent at runtime knows what's relevant to current task; static archetype-pack mapping is too coarse. Suggestions framework: "here are the skills this combo usually needs; you decide what's actually relevant."

### Coverage

- 11 agents have Step 0 skill-catalog-browse guidance
- Per-(agent × archetype) suggestions for every meaningful combination
- Initial registry built at `npx great-cto init`, refreshed every 24h via SessionStart hook
- Description quality improved across tier-1 skills

### Skipped (deferred)

- **Scheduled-tasks weekly sync** — current 7d cache pull on SessionStart is sufficient. If users want forced cron-style refresh, `/doctor --skills-refresh` exists. Adding scheduled-task overhead doesn't justify the marginal benefit.

---

## v1.0.139 — 2026-04-28

### Added — Skills auto-discovery + 4-tier architecture

For users building AI agents in great_cto-tracked projects, skills come from multiple places: built-in packs, dependency plugins (superpowers / beads), Anthropic's official catalog, and custom personal libraries. v1.0.139 makes all four discoverable from one registry, auto-refreshed at session start.

#### `scripts/skill-discover.sh` (NEW)

Scans 4 tiers and writes `~/.great_cto/skills-registry.json`:

| Tier | Source | Update cadence |
|---|---|---|
| **1** | great_cto built-in (`packs/`, `templates/`, `references/`) | per plugin release |
| **2** | external dependencies (superpowers, anthropics/skills, beads) | 7d auto-pull |
| **3** | personal repo (default `avelikiy/ai-agent-skills`) | 24h auto-pull |
| **4** | on-demand (`/template fetch`, MCP servers) | per-invocation, not enumerated |

Run via SessionStart hook (24h cache) or manually `/doctor --skills-refresh`.

#### `.claude-plugin/plugin.json` SessionStart hook updated

Now clones (background, non-blocking):
- `https://github.com/anthropics/skills` → `~/.great_cto/anthropic-skills` (7d cache)
- `https://github.com/avelikiy/ai-agent-skills` → `~/.great_cto/personal-skills` (1d cache)

Plus runs `skill-discover.sh` (24h cache) to refresh registry.

#### `commands/doctor.md` — Check 8c + new flags

- `/doctor` → shows skills registry summary in default output
- `/doctor --skills` → archetype-relevant skills auto-loaded for current project
- `/doctor --skills-refresh` → force re-scan all 4 tiers immediately

#### `skills/great_cto/references/skills-architecture.md` (NEW)

Full design doc: 4-tier rationale, registry schema, agent-side consumption pattern, SKILL.md format, manual control commands, what's NOT here (marketplace integration, semantic search, versioning) and why.

### What ships separately (NEW external repo)

[`avelikiy/ai-agent-skills`](https://github.com/avelikiy/ai-agent-skills) — personal library of AI agent development skills. Started with one example: `rag-cascading-search` (production RAG with hybrid retrieval + LLM reranking + provenance, fully worked-out cost model + anti-patterns + EVAL coverage).

Users with their own AI agent projects clone this repo into `~/.great_cto/personal-skills`, write their own skills there, and great_cto auto-discovers them.

### Coverage

- 4 skill tiers
- ~56 tier-1 skills auto-discovered (packs + templates + references)
- ~12 tier-2 skills (superpowers) once cloned
- ~20-30 tier-2 anthropic skills once cloned (Anthropic's repo)
- 1 tier-3 starter skill (rag-cascading-search) — extend yourself

### What's next (v1.0.140 — agent-side consumption)

Agent Step 0 reads the registry and auto-loads packs for current archetype (currently: each agent must manually `Read` packs). After v1.0.140, agents see "you're working on `agent-product` — consult these 5 packs" automatically at session start.

---

## v1.0.138 — 2026-04-27

### Fixed — skills frontmatter consistency across 6 agents

Skills inventory audit found that 4 specialist subagents declared only `prose-style`, missing the workflow skills (`beads`, `done-blocked`, `skeptical-triage`) they actually need. Plus 2 core agents missed `superpowers:requesting-code-review` despite using it implicitly.

#### Specialist subagents — added workflow skills

| Subagent | Was | Added |
|---|---|---|
| `ai-prompt-architect` | `prose-style` | `+ skeptical-triage` (register choice + ADR triage) `+ beads` (one bd task per ADR-PROMPT) `+ done-blocked` (handoff) |
| `ai-eval-engineer` | `prose-style` | `+ superpowers:test-driven-development` (eval = TDD by nature) `+ beads` (one task per EVAL scenario) `+ done-blocked` |
| `ai-security-reviewer` | `prose-style` | `+ skeptical-triage` (severity calibration) `+ beads` (Critical/High threats → bd) `+ done-blocked` |
| `web-store-reviewer` | `prose-style` | `+ skeptical-triage` (permissions justification) `+ beads` (preflight findings) `+ done-blocked` |

#### Core agents — added code-review skill

| Agent | Added |
|---|---|
| `tech-lead` | `+ superpowers:requesting-code-review` (architecture-level review before ARCH gate) |
| `senior-dev` | `+ superpowers:requesting-code-review` (self-review before PR) |

### Why

Skills declared in agent frontmatter signal what the runtime should preload + which workflows the agent can invoke. With only `prose-style`, the 4 specialists couldn't enforce bd-tracking on their outputs (Critical threats, ADR-PROMPTs, EVAL scenarios, permissions findings) — those would silently end up in TodoWrite again, the same bug v1.0.131 fixed for senior-dev.

This release closes the same gap for specialist subagents.

### Coverage (no functional changes — declarative only)

- 11 agents, all skills now consistent with workflows they execute
- No new agents, no new templates, no new commands
- Documentation-style fix; runtime behaviour unchanged on agents that already worked, runtime improved on subagents that previously couldn't tracker their outputs

---

## v1.0.137 — 2026-04-27

### Added — observability layer for AI archetypes + marketplace prep

After v1.0.131–136 closed enforcement gaps and shipped templates + specialist subagents, AI projects now produce real artefacts. v1.0.137 makes those artefacts visible **between** deploys: in-session signals via `/inbox` and quarterly board reporting via `/digest board`.

#### `commands/inbox.md` — AI Health section (NEW)

Show only when `archetype: ai-system | agent-product`. Nine cheap signals:

1. **PoC deadline approaching** (≤ 7d) / overdue (P0)
2. **Monthly LLM budget at 80%** (warning) / **exceeded** (P0) — reads `cost-history.log`, `logs/llm-cost.log`, `logs/audit.jsonl` for current-month `cost_usd` sum
3. Eval suite stale — no `EVAL-*.md` updated in 14d
4. Cross-user isolation test missing (P0 for `agent-product`)
5. Threat model age > 90d (re-run ai-security-reviewer)
6. Floating model tag in src/ (drift risk; pin via ADR-LLM)
7. ARCH § LLM Scope roles count > ADR-PROMPT count (run ai-prompt-architect)
8. `monthly-budget-llm-usd` not set (warning for AI archetypes)
9. (Hooks for) prompt drift detection — sha256 in code vs ADR-PROMPT stored hash

#### `commands/digest.md` — AI Operations section (NEW, board mode)

When `BOARD_MODE=true` AND archetype is AI, the quarterly board report now includes an **AI Operations** table:

| Metric | Source |
|---|---|
| Sessions this Q | `cost-history.log` `session_id` deduplicated |
| Avg cost per session (USD) | `cost_usd` sum / sessions |
| Total LLM spend vs budget (% of cap) | sum vs `monthly-budget-llm-usd × 3` |
| Eval pass rate (overall) | parse `## History` table tail in each `EVAL-*.md` |
| Prompt-injection bypass count | `EVAL-prompt-injection.md` history `BLOCK` verdicts |
| Cross-user isolation failures | `EVAL-cross-user-isolation.md` history |
| Models in production (pinned versions) | `grep "## Decision" docs/decisions/ADR-*-LLM-*.md` |
| Outstanding prompt drift | re-compute sha256 of prompts in src/ vs stored hash |
| ADR-PROMPT revisions this Q | `git log` count of ADR-PROMPT file changes |
| Active threat model age | `stat -f %m docs/sec-threats/TM-*.md` |

Surfaces for the board:
- Cost trajectory vs cap → predict need for raise
- Eval pass rate trend → product reliability over time
- Bypass + isolation failures → security health (target 0, escalate if > 0)
- Drift signals → maintenance debt accumulating

#### `docs/marketplace/SUBMISSION.md` (NEW)

Pre-built submission package for Claude Code Plugin Marketplace (when Anthropic opens it). Contents:

- One-line description (≤ 280 chars)
- Long description (≤ 2000 chars)
- Categories (primary + secondary)
- Pricing model (free, MIT)
- Requirements (Claude Code, Node 18.17+, optional Superpowers + Beads)
- Install command
- Screenshots inventory + recording recipes for new ones
- Demo video render commands (VHS script in repo)
- Marketing copy snippets + differentiation vs alternatives (Cursor / Aider / Cline / Superpowers / Templates / tech-debt-skill / raw Claude Code)
- Submission checklist
- Realistic expectations (review timeline, first-week installs)
- Source-state inventory at v1.0.137 (verified: 11 agents, 18 templates, 14 archetypes, 13 packs, 16 commands, 27 compliance keys)

Will be submitted when the marketplace officially opens.

### Coverage

| | v1.0.136 | v1.0.137 |
|---|---|---|
| Agents | 11 | 11 (no change) |
| Templates | 18 | 18 (no change) |
| `/inbox` signals | core only | + 9 AI Health signals (when AI archetype) |
| `/digest board` sections | 5 | 6 (added AI Operations) |
| Marketplace prep | absent | ready (`docs/marketplace/SUBMISSION.md`) |

### What this completes

The retro-driven cycle that started in v1.0.131 (after the AI pipeline silently failed) is now closed end-to-end:

- **v1.0.131** — Hard halts for AI archetypes (Discovery / mode / Beads enforcement)
- **v1.0.132** — Print-without-halt fix for commerce/web3/regulated/iot/fintech
- **v1.0.133** — 14 mandatory artefact templates + security-officer pre/post split + AI cost-cap audit
- **v1.0.134** — 3 AI specialist subagents (prompt-architect / eval-engineer / security-reviewer)
- **v1.0.135** — Field-test fixes (9 P0 from real-execution attempt)
- **v1.0.136** — Non-AI ARCH templates + web-store-reviewer subagent
- **v1.0.137** — `/inbox` AI signals + `/digest` AI metrics + marketplace prep

Knowledge → enforcement → templates → specialists → fixes → coverage → observability.

### What's next

Field test the observability layer on a real AI project that ran through the full v1.0.131-137 chain. Or wait for marketplace to open and submit. Or pivot to a new direction (templates for non-AI specialist subagents — e.g. `pci-reviewer` for commerce, `oracle-reviewer` for defi, `firmware-reviewer` for iot-embedded).

---

## v1.0.136 — 2026-04-27

### Added — non-AI ARCH templates + browser-extension specialist subagent

v1.0.133 shipped templates for AI / compliance archetypes. v1.0.136 closes the gap for the rest: game / browser-extension / web3 (defi subtype) / default. Plus a new `web-store-reviewer` subagent for browser-extension preflight — same pattern as the v1.0.134 AI subagents.

#### `skills/great_cto/templates/` — 4 new ARCH templates

| Template | For archetype | Mandatory sections |
|---|---|---|
| `ARCH-game.md` | `game` | Engine choice, Multiplayer netcode, Anti-cheat tier, Performance budget per platform, Steam Deck Verified, Age rating + IARC, Live-service ops, PC launch milestones |
| `ARCH-browser-extension.md` | `browser-extension` | Manifest version, Three-worlds split (SW / content / popup / offscreen), Storage decision table, Permissions justification (every entry), Web Store pre-flight checklist, Cross-browser compat |
| `ARCH-defi-protocol.md` | `web3` (defi / bridge / lending / dex / aggregator) | Subtype + block-ship gate, Smart contract security stack, Upgradeability decision matrix, Oracle strategy, MEV protection, L2 resilience scenarios, Custody/multisig, Bug bounty (TVL-tiered), Insurance fund |
| `ARCH-default.md` | All other archetypes (web-service / library / mobile-app / data-platform / infra) | Standard sections: Decision with alternatives / Components / API contracts / Data model / Non-goals / WPs / Cost / Risks |

#### `agents/web-store-reviewer.md` (NEW, model: sonnet)

Plays the role of a Chrome Web Store / Mozilla AMO / Edge Add-ons reviewer **before** submission — catches issues that get extensions rejected (1–7 day delay) or removed post-publish.

- Reads ARCH § Permissions Justification, manifest.json (if exists), `browser-extension-pack.md`
- Generates `docs/sec-threats/TM-{slug}.md` with: permissions audit, single-purpose declaration check, CSP audit, three-worlds isolation review, cross-browser compat, AI-extension cross-pack check
- Appends Web Store pre-flight checklist to ARCH `## Security`
- Hand-off: manifest.json fields to set, mitigations to land, tests required, reviewer-side gotchas
- Refuses common rejection patterns: `<all_urls>` upfront (use `optional_host_permissions`), API key in extension storage, `unsafe-eval` for SDK, content script doing API calls, CDN-loaded jQuery

### Changed — security-officer pre-impl delegates to web-store-reviewer

For `archetype: browser-extension`, security-officer pre-impl mode spawns `web-store-reviewer` instead of running the generic STRIDE flow. Falls back to template copy if subagent unavailable.

### Changed — tech-lead Step 0a documents subagent chain by archetype

Subagent delegation table now covers AI archetypes + browser-extension. Pipeline for browser-extension: tech-lead → web-store-reviewer → senior-dev → qa-engineer (re-checks manifest static rules) → security-officer post-impl → devops (Web Store unlisted/internal channel).

### Changed — qa-engineer Step 0b strengthens browser-extension checks

- Web Store preflight TM must exist at `docs/sec-threats/TM-{slug}.md`
- No `unsafe-eval` / `unsafe-inline` in `manifest.json` (Web Store rejection territory)
- Points at web-store-reviewer subagent for delegation

### Changed — `plugin.json` AGENT loop + `ARCHETYPES.md` Required Agents

- AGENT copy loop adds `web-store-reviewer` (11 total)
- `ARCHETYPES.md § Required Agents` gains "Browser-extension specialist subagent" subsection

### Changed — `templates/README.md`

Trigger → template mapping covers all archetypes now (was AI + compliance only). Including ARCH-default for everything not covered by archetype-specific templates.

### Coverage

- 11 agents total (was 10): added `web-store-reviewer`
- 18 templates total (was 14): added `ARCH-game`, `ARCH-browser-extension`, `ARCH-defi-protocol`, `ARCH-default`
- 14 archetypes, 13 packs, 27 compliance keys, 16 commands

### What's next (v1.0.137)

`/inbox` AI-archetype signals (PoC-deadline approaching, monthly-budget at 80%, prompt drift, eval regression) + `/digest` board mode AI metrics + marketplace listing prep.

---

## v1.0.135 — 2026-04-27

### Fixed — field-test discovered execution-blocking bugs in v1.0.134

Three parallel agent simulations on v1.0.134 (greenfield AI / CWD trap recovery / late-pipeline gates) found 27 gaps. This release fixes the **9 P0 bugs** that prevented v1.0.134 AI pipeline from actually running on real systems.

#### Path fix — `docs/sec threats/` → `docs/sec-threats/`

Literal space in directory path broke shell escaping across 9 files (`agents/*.md`, `commands/promote.md`, `templates/*.md`). Rewritten to `docs/sec-threats/` (hyphen). Affects: tech-lead, senior-dev, qa-engineer, security-officer, ai-prompt-architect, ai-eval-engineer, ai-security-reviewer, promote.md, ARCH-ai.md, THREAT-MODEL-AI.md, README.md.

#### Portable sha256 in ai-prompt-architect

`sha256sum` is Linux-only. macOS users (most Claude Code users) hit "command not found" → prompt-hash drift detection silently broken. Replaced with portable helper that tries `sha256sum`, falls back to `shasum -a 256`, halts if neither.

#### Slug fallback collision

`tech-lead.md` SECURITY_REQUIRED + Pre-mortem blocks fell back to `SLUG="feature"` when no ARCH file existed yet. First two AI projects in same repo overwrote each other's `TM-feature.md` / `PRE-feature.md`. Fixed: derive slug from PROJECT.md project name + date suffix as last resort.

#### `mkdir -p` for new docs paths

`ai-security-reviewer.md`, `tech-lead.md` Write to `docs/sec-threats/`, `docs/architecture/`, `docs/decisions/` — paths that don't exist on greenfield. Added explicit `mkdir -p` before any Write.

#### ai-security-reviewer Step 0 actually copies template

Previously said "from template" without `cp`. Now: `cp $PLUGIN/skills/great_cto/templates/THREAT-MODEL-AI.md $TM`, replaces `{slug}` placeholder, halts if template not found (broken plugin install).

#### `/promote` flow updated for v1.0.134 (P0 — was using old semantics)

Old `/promote` didn't know about: AI subagents, `monthly-budget-llm-usd`, `discovery` field, compliance artefacts, AI eval thresholds (3 → 5 → 10). New steps:

- **Step 2 — Threat model**: hard halts if TM file missing OR Critical/High threats `__pending__`. For AI archetypes delegates to `ai-security-reviewer`.
- **Step 2b — AI prompts + evals** (new, ai-system / agent-product only):
  - ≥ 1 ADR-PROMPT-*.md required → invoke `ai-prompt-architect` if missing
  - Eval count: ≥ 5 (ai-system) / ≥ 10 (agent-product) → invoke `ai-eval-engineer`
  - `monthly-budget-llm-usd` must be set
- **Step 3b — Compliance artefacts** (new): for each value in `compliance: [...]`, evidence file must exist (DORA / NIS2 / GxP / TISAX / ISO27001 / SOX / PCI-DSS).

#### `agents/devops.md` — `agent-product` + `devtools` deploy strategies (P0)

Previously fell through to undefined behavior. Now explicit:
- `agent-product` → feature-flag canary 1% on staging, conversation state must persist, queue-drain on rollback (in-flight runs must complete)
- `browser-extension` → Web Store unlisted/internal channel for review
- `game` → Steam beta branch, console dev-kit, mobile TestFlight/Play Internal
- `devtools` → SDK pre-release tag, API gateway canary on tenant boundaries

`agent-product` and `devtools` added to canary archetype list.

### Coverage

- Files modified: 11
- All space-paths replaced with hyphens
- 9 P0 bugs from field test → fixed
- 18 P1/P2 gaps documented for v1.0.136/137

### What's next (v1.0.136)

Non-AI templates (ARCH-game, ARCH-browser-extension, ARCH-defi-protocol, ARCH-default) + browser-extension subagent (web-store-reviewer for MV3 / Web Store policy preflight).

### What's next (v1.0.137)

`/inbox` AI-archetype signals (PoC deadline, monthly-budget at 80%, prompt drift) + `/digest` board mode AI metrics + marketplace listing prep.

---

## v1.0.134 — 2026-04-27

### Added — three AI specialist subagents (P2 from retro)

v1.0.131 + v1.0.132 enforced halts. v1.0.133 supplied the templates those halts demand. v1.0.134 ships the **specialist agents** that consume those templates so the AI pipeline doesn't fall on the main agent (which produces "magic LLM wrappers" instead of disciplined, versioned, testable artefacts).

#### `agents/ai-prompt-architect.md` (NEW, model: sonnet)

Designs and versions LLM system prompts. Outputs `docs/decisions/ADR-{NN}-PROMPT-{name}.md` per LLM role identified in ARCH § LLM Scope.

- Reads ARCH § LLM Scope + ARCH § Failure Modes + TM § 1 Prompt Injection
- Writes prompts grounded in those constraints (refuse-when-uncertain, scope bound, citation requirement, prompt-injection resistance lines)
- Computes sha256 hash for CI drift detection
- Generates ≥ 5 jailbreak test cases per prompt across 7 categories: direct override, role swap, encoding, indirect via retrieved, authority impersonation, refusal-bypass, prefix injection
- Hands off to ai-eval-engineer with explicit list of suggested EVAL files
- Refuses anti-patterns: "you are a helpful assistant", embedded user data, tone-only instructions, unbounded "respond in detail"

#### `agents/ai-eval-engineer.md` (NEW, model: haiku)

Builds and maintains the eval pipeline. Outputs `tests/eval/EVAL-*.md` files + a runner (pytest / ts / shell depending on stack).

- Cross-references ARCH § Failure Modes + TM § Sections + ADR-PROMPT hand-off → eval scenario inventory
- Enforces minimums: ≥ 3 EVAL for ai-system, ≥ 5 for agent-product (must include cross-user-isolation + prompt-injection)
- Per scenario: golden citation, refuse-when-uncertain, output schema, prompt injection (50+ cases), budget overrun, cross-user isolation, tool misuse
- Writes CI runner (`tests/eval/test_evals.py` for Python, `eval.test.ts` for TS, `run.sh` fallback)
- Drift detection: prompt sha256 mismatch, model floating-tag, output schema diff
- Records baseline + revision history in each EVAL `## History`
- Refuses anti-patterns: substring-match assertions, unpinned model versions, temperature > 0 without sampling

#### `agents/ai-security-reviewer.md` (NEW, model: sonnet, advisor: opus 4.7)

AI-specific pre-impl threat modelling. Specialises in OWASP LLM Top 10 — security-officer pre-impl mode delegates to it for AI archetypes.

- Reads ARCH § Trust Boundaries + § LLM Scope, packs (agent-pack, ai-pack)
- Per-section deep dives: prompt-injection inventory (3 vectors per untrusted boundary), SSRF (if tool layer), cost-runaway, cross-user isolation (agent-product), supply chain
- Severity rubric: Critical = full system compromise / cross-tenant exfil / regulatory breach / >$10k cost; High = single-user PII / system-prompt disclosure
- Refuses lazy mitigations: "mitigated by good prompt" → accepted-residual not mitigated; "user won't do that" → assume hostile
- Hands off to senior-dev with specific code-change list + EVAL file list

### Changed — security-officer pre-impl delegates to ai-security-reviewer

For `archetype: ai-system | agent-product`, security-officer pre-impl mode now spawns `ai-security-reviewer` instead of running the generic STRIDE flow. Falls back to template copy if subagent unavailable.

### Changed — tech-lead Step 0a documents the AI subagent chain

For AI archetypes, tech-lead documents the delegation chain after ARCH:
```
tech-lead (ARCH) → ai-security-reviewer (TM) → ai-prompt-architect (ADR-PROMPT) → ai-eval-engineer (EVAL) → senior-dev
```
Each subagent has an `<!-- HANDOFF -->` block in its output that the next reads.

### Changed — qa-engineer Step 0b BLOCKED messages reference ai-eval-engineer

When ai-system / agent-product archetype lacks the required EVAL count, qa-engineer points the user at `ai-eval-engineer` subagent for delegation instead of leaving them to write evals themselves.

### Changed — `plugin.json` AGENT loop + `ARCHETYPES.md` Required Agents

- AGENT copy loop in SessionStart hook adds 3 new subagents (10 total)
- `ARCHETYPES.md § Required Agents` gains "AI specialist subagents" subsection with invocation conditions
- Pipeline diagram for ai-system / agent-product documented end-to-end

### Coverage

- 10 agents total (was 7): tech-lead, senior-dev, qa-engineer, security-officer, devops, l3-support, project-auditor + ai-prompt-architect, ai-eval-engineer, ai-security-reviewer
- 14 archetypes, 13 packs, 14 templates, 27 compliance keys

---

## v1.0.133 — 2026-04-27

### Added — mandatory artefact templates + security-officer split + AI cost-cap (P1 from retro)

v1.0.131 + v1.0.132 closed the enforcement gap (turn print-only "BLOCK" into real `exit 1`). v1.0.133 supplies the **content** that those halts demand and splits security-officer so the gates can actually be cleared.

#### `skills/great_cto/templates/` — 13 mandatory artefact templates (NEW directory)

| Template | When required | Used by |
|---|---|---|
| `ARCH-ai.md` | `archetype: ai-system | agent-product` | tech-lead writes, senior-dev reads § Security |
| `THREAT-MODEL-AI.md` | `archetype: ai-system | agent-product` | security-officer pre-impl, blocked by senior-dev Step 0b |
| `EVAL-template.md` | `archetype: ai-system | agent-product` | qa-engineer Step 0b checks count |
| `ADR-LLM.md` | AI / agent picks LLM | tech-lead during ADR phase |
| `ADR-PROMPT.md` | AI / agent writes prompt | versioned prompts; CI compares hash |
| `DORA-ICT-risk-assessment.md` | `compliance: [dora]` | tech-lead compliance gate |
| `DORA-third-party-register.md` | `compliance: [dora]` | tech-lead compliance gate |
| `NIS2-article21-controls.md` | `compliance: [nis2]` | tech-lead compliance gate |
| `21CFR11-checklist.md` | `compliance: [gxp | 21cfr11]` | tech-lead compliance gate |
| `TISAX-VDA-ISA-results.md` | `compliance: [tisax]` | tech-lead compliance gate |
| `ISO27001-SoA.md` | `compliance: [iso27001]` | tech-lead compliance gate |
| `SOX-ITGC-checklist.md` | `compliance: [sox]` | tech-lead compliance gate |
| `PCI-DSS-SAQ-A.md` | `compliance: [pci-dss-saq-a]` | tech-lead compliance gate |
| `PCI-DSS-SAQ-D.md` | `compliance: [pci-dss]` (full scope) | tech-lead compliance gate |

Plus `templates/README.md` mapping triggers → templates → destination paths.

When tech-lead's compliance gate fires `BLOCKED:` for a missing artefact, it now points the user at the matching template and gives the exact `cp` command. Same for SECURITY_REQUIRED — `BLOCKED: ARCH missing ## Security` now references `templates/ARCH-ai.md § Security`, and `BLOCKED: TM missing` references `templates/THREAT-MODEL-AI.md`.

#### `agents/security-officer.md` — pre-impl / post-impl modes (NEW split)

Previously security-officer ran only post-implementation, which meant threats could not block ARCH or implementation. Now two modes:

| Mode | When | Outputs | Halts on |
|---|---|---|---|
| `pre-impl` | After tech-lead writes ARCH, BEFORE senior-dev claims tasks | `TM-{slug}.md` (from `THREAT-MODEL-AI.md` template for AI; STRIDE for traditional), `ARCH § Security` appended | Critical/High threats with `__pending__` mitigations or sign-off |
| `post-impl` | After senior-dev finishes, BEFORE devops ships | `CSO-{slug}-{date}.md`, `gate:ship` verdict | unmitigated Critical findings |

Mode auto-detects: if ARCH exists but no source code yet → pre-impl. Otherwise post-impl. Manual override via `SEC_MODE=pre-impl` env var or first arg.

In pre-impl mode, security-officer **copies the matching template** from `skills/great_cto/templates/` for AI archetypes, then prompts the user to fill placeholders before the threat-model file is considered complete.

#### `agents/project-auditor.md` — Phase 4D AI cost-cap check (NEW)

For `archetype: ai-system | agent-product`, audit verifies actual LLM spend has not exceeded `monthly-budget-llm-usd` declared in PROJECT.md.

- Cost telemetry sources scanned: `.great_cto/cost-history.log`, `logs/llm-cost.log`, `logs/cost.log`, `logs/audit.jsonl` (jsonl with `cost_usd` field)
- Threshold violations:
  - `monthly-budget-llm-usd` unset → P0 Beads task ("AI cost cap unset for $ARCHETYPE archetype")
  - Spend ≥ 100% of cap → P0 ("LLM spend exceeded budget")
  - Spend ≥ 80% of cap → P1 ("LLM spend approaching budget cap")
  - No cost telemetry instrumented → P1 ("LLM cost telemetry not instrumented — agent-pack BudgetTracker not adopted")
- References `agent-pack.md § Budget Cap Enforcement Pattern` for remediation

#### `agents/tech-lead.md` — template references in BLOCKED messages

When SECURITY_REQUIRED block fires `exit 1`, the BLOCKED message now points at the specific template path and gives the `cp` command. Same for compliance artefact gate. Reduces user friction from "BLOCKED: file missing" to "BLOCKED: file missing → cp this template".

### What's next (P2, planned for v1.0.134)

- Three new AI subagents (`ai-prompt-architect`, `ai-eval-engineer`, `ai-security-reviewer`) wired into a dedicated AI pipeline branch — they consume the templates shipped in v1.0.133

### Coverage

- Templates: 13 + README
- Agents updated: tech-lead, security-officer, project-auditor (3 agents)
- Hard halts now reference actual templates instead of saying "see pack" (7 BLOCKED messages enriched)

---

## v1.0.132 — 2026-04-27

### Fixed — enforcement-print-without-halt across security-critical archetypes (P0 from cross-archetype audit)

After v1.0.131 closed the AI-pipeline bypass, three parallel agent simulations
(commerce / web3 / regulated) confirmed the same enforcement bug in every
security-critical archetype: `echo "BLOCK:"` prints at multiple gates without
`exit 1`. tech-lead happily emits DONE for a Stripe checkout with no threat
model, a DeFi lending pool with no upgradeability ADR, and a DORA project
with no DORA-checklist.md. This release converts every cosmetic BLOCK into
a real halt.

#### `agents/tech-lead.md` — three new hard halts

1. **SECURITY_REQUIRED block** (lines 633–) now exits 1 when:
   - ARCH file lacks `## Security` section for archetype in
     `ai-system|commerce|web3|iot-embedded|regulated|fintech`
   - Threat model `docs/sec threats/TM-${SLUG}.md` does not exist
   - SLUG resolves from latest `ARCH-*.md` instead of placeholder `<feature-slug>`

2. **Compliance artefact gate** — new check after COMPLIANCE is read.
   For each value in `compliance: [...]` in PROJECT.md, the corresponding
   evidence artefact must exist:
   ```
   dora        → docs/compliance/DORA-ICT-risk-assessment.md + DORA-third-party-register.md
   nis2        → docs/compliance/NIS2-article21-controls.md
   gxp/21cfr11 → docs/compliance/21CFR11-checklist.md
   tisax       → docs/compliance/TISAX-VDA-ISA-results.md
   iso27001    → docs/compliance/ISO27001-SoA.md
   sox         → docs/compliance/SOX-ITGC-checklist.md
   pci-dss     → docs/compliance/PCI-DSS-SAQ-D.md (or SAQ-A for saq-a)
   ```
   Closes the orphaned-pack bug — packs were declared but agents never
   verified the evidence existed.

3. **Pre-mortem hard halt for `mode: production`** — previously printed
   "Pre-mortem required. Generating $PRE" and continued. Now exits 1 if
   `PRE-${SLUG}.md` is missing AND `mode: production`. PoC and MVP modes
   keep the previous advisory behaviour.

#### `agents/senior-dev.md` — Step 0b archetype security pre-conditions

For `archetype in [ai-system, agent-product, commerce, web3, iot-embedded,
regulated, fintech]`, refuses to claim or implement bd tasks unless:
- `docs/architecture/ARCH-*.md` exists
- ARCH has `## Security` section
- `docs/sec threats/TM-<slug>.md` exists

Plus archetype-specific pre-impl rules table (idempotency for commerce,
Slither + Foundry-fuzz for web3, manifest_version: 3 for browser-extension,
per-user `tenant_id` namespace for agent-product, etc.) — pushed back to
tech-lead before claiming the task if the implementation plan does not
address the relevant rule.

#### `agents/qa-engineer.md` — Step 0b archetype QA artefact gates

Before signing off any QA report, verify archetype-specific artefacts and
CI gates exist:

- **web3**: Slither report or CI step + Foundry fuzz with `--fuzz-runs ≥
  10000` configured in CI
- **commerce**: idempotency proof test exists + grep for raw PAN in code
  and logs (excluding Stripe test cards)
- **iot-embedded**: `tests/qemu/` or `tests/hil/` directory exists
- **browser-extension**: `manifest.json` declares `manifest_version: 3`
- **agent-product**: cross-user isolation test + prompt-injection regression
  suite (Garak or custom)
- **ai-system**: ≥ 3 EVAL-*.md scenarios in `tests/eval/`

QA-engineer cannot write a "pass" report when the gate that would catch the
threat does not exist.

#### `agents/devops.md` — PoC mode hard halt on prod deploy

Previously narrative-only ("refuse production deploys" in prose). Now an
actual bash check at start: if `mode: poc` AND target is
`prod | production | main | live` → exit 1 with remediation pointing to
`/promote`.

### Why

v1.0.131 fixed the AI archetype enforcement gap with `exit 1` calls. The
audit confirmed the same gap existed for commerce / web3 / iot-embedded /
regulated / fintech — same pattern, same blast radius. PROJECT.md's
`compliance:`, `qa-extras:`, and `packs:` fields had been **decorative**:
no agent enforced their semantics. v1.0.132 closes that loop end to end.

### What's next (P1, planned for v1.0.133)

Mandatory artefact templates: `templates/ARCH-ai.md`,
`templates/THREAT-MODEL-AI.md`, `templates/EVAL-template.md`,
`templates/ADR-LLM.md`, `templates/ADR-PROMPT.md`, plus compliance-framework
templates (DORA / NIS2 / GxP / TISAX / ISO27001 / SOX / PCI-DSS).
security-officer split into `mode=pre-impl` (threat model) and `mode=post-impl`
(CSO report). project-auditor cost-cap check against `monthly-budget-llm-usd`.

### What's next (P2, v1.0.134)

Three new AI subagents: `ai-prompt-architect`, `ai-eval-engineer`,
`ai-security-reviewer` wired into a dedicated AI pipeline branch.

---

## v1.0.131 — 2026-04-27

### Fixed — pipeline bypass on AI projects (P0 from retro)

A real-world session ran `/start` from a directory that already had a `PROJECT.md`. The guard refused to overwrite, and the agent silently fell back to free-form Q&A — never created PROJECT.md, never invoked tech-lead, never wrote a threat model for an AI-system project that touched prompt injection, SSRF, and a runaway-cost surface. Three structural fixes ship this release.

#### `commands/start.md` — Auto-cd suggestion + AI hard-trigger Discovery

The existing-project guard now lists the **new-project escape hatch as option 1**, not an afterthought. It computes a slug from the description (`/start "build news agent for hashtags"` → suggests `mkdir ../news-agent && cd ../news-agent && /start "..."`) and explicitly forbids silent fallback to Q&A.

Discovery trigger gains an **AI hard-trigger**: any of `ai-agent | agent-product | rag-system | ml-training | ml-serving | mcp-server | voice-agent | multimodal-app | computer-vision | recommendation-engine | anomaly-detection | llm-ops` — Discovery runs regardless of description length. AI-specific questions: audience, EU AI Act / GDPR memory trigger, data residency, kill-switch (who and how fast), monthly LLM cost cap, eval set source. PoC / MVP / production mode is mandatory.

PROJECT.md schema gains three required fields:
- `mode: poc|mvp|production`
- `poc-deadline: YYYY-MM-DD` (required when mode=poc)
- `discovery: required|completed|skipped`
- `monthly-budget-llm-usd:` (required for ai-system / agent-product)

#### `agents/tech-lead.md` — Step 0a hard-gate

For `archetype in [ai-system, agent-product]`, tech-lead now refuses to write ARCH or call sub-agents until `discovery: completed` (or explicit `discovery: skipped`) AND `mode:` is set in PROJECT.md. Returns BLOCKED with a clear remediation message instead of falling through.

#### `agents/senior-dev.md` — Step 0a Beads enforcement

Hard rule: senior-dev **never uses TodoWrite for implementation tasks**. TodoWrite is in-memory and evaporates with the session. Step 0a runs `bd init` if missing, `bd list` for context, and creates one `bd` task per work-package in the ARCH doc before claiming any work. If the orchestrator above used TodoWrite for tracked tasks, senior-dev's first action is to promote them to `bd`.

#### `references/poc-mode.md` — AI archetype skip matrix override

The default skip matrix lets PoC drop ARCH ceremony, TDD strictness, and pentest. AI archetypes can NOT fully skip security in PoC: prompt-injection bypass and cost runaway are baseline risks regardless of project lifetime.

For PoC mode on `ai-system` / `agent-product`:
- Threat model: 3-section minimum (`ai-system`) / 5-section minimum (`agent-product`) — covers prompt-injection vector, output exfiltration, cost runaway, plus tool sandbox + cross-user isolation for agent-product
- Eval set: 3 scenarios minimum (`ai-system`) / 5 scenarios (`agent-product`) — golden citation, refuse-when-uncertain, output-schema-stability, plus 1 prompt-injection + 1 budget-overrun case for agent-product
- `monthly-budget-llm-usd`: mandatory even at $5/mo
- Kill-switch documented in ARCH (1 line)
- SSRF allowlist required if tool layer fetches LLM-suggested URLs

### Why this release matters

Without these fixes, the AI archetype "knows" about EU AI Act and OWASP LLM Top 10 in `ai-pack` and `agent-pack` — but the pipeline never enforced consultation of those docs because the agents were never invoked. v1.0.131 closes the enforcement gap. Knowledge without gates is just trivia.

### What's next (P1, planned for v1.0.132)

- Mandatory artefact templates: `templates/ARCH-ai.md`, `templates/THREAT-MODEL-AI.md`, `templates/EVAL-template.md`, `templates/ADR-LLM-{model}.md`, `templates/ADR-PROMPT-{name}.md`
- Pre-implementation security gate for ai-system: security-officer split into `mode=pre-impl` (threat model) and `mode=post-impl` (CSO report)
- `project-auditor` Phase 4 cost-cap check against `monthly-budget-llm-usd`

### What's next (P2, planned for v1.0.133)

- Three new AI subagents: `ai-prompt-architect`, `ai-eval-engineer`, `ai-security-reviewer`
- Pipeline branch for ai-system / agent-product with these subagents wired in

---

## v1.0.130 — 2026-04-27

### Improved — `/audit` adopts ideas from ksimback/tech-debt-skill

Studied [ksimback/tech-debt-skill](https://github.com/ksimback/tech-debt-skill)
(255+ ⭐, single-purpose tech-debt audit skill for Claude Code). Folded the
unique design choices into `agents/project-auditor.md` without breaking the
7-phase + 14-archetype flow.

- **Phase 4A.0 — Hot-spot identification (size × churn intersection)**:
  top-20 largest files ∩ top-20 most-modified files in last 6 months. Files
  in the intersection MUST receive concrete `file:line` citations in
  findings.
- **Phase 6 audit report template** — three new required sections:
  Architectural Mental Model paragraph, Findings Table with `file:line`
  on every finding (30–80 cap), and the **Things That Look Bad But Are
  Actually Fine** required section (3–10 entries; empty = audit didn't look
  hard enough).
- **Hard rules**: cite `file:line`, no rewrites, no padding ("Nothing
  material" for empty categories), no sycophancy.
- **Repeat-run mode**: prior findings tagged `RESOLVED` / `REGRESSED`; new
  findings tagged `NEW`. Audit becomes living document.

### Added — promotion package + identity cleanup

#### LICENSE file at repo root
GitHub API was reporting `license: null` because MIT was declared only in
`plugin.json` and `packages/cli/package.json`. Added root `LICENSE` (MIT).
This unblocks enterprise adoption gates that check for `LICENSE` file presence.

#### README — comparison table
New "How is this different from X?" section explicitly positions great_cto
against raw Claude Code, Cursor / Copilot, Aider / Cline, the built-in
`/review`, obra/superpowers, davila7/templates, and ksimback/tech-debt-skill.
Each row says what the alternative does and what it doesn't, then closes with
the unique slot great_cto fills (process layer above the AI, below the human).

#### GitHub topics trimmed 19 → 8
Old topics diluted signal. New set: `claude-code-plugin`,
`claude-code-subagents`, `claude-code-skills`, `agentic-coding`, `sdlc`,
`code-review`, `multi-agent`, `cto`. GitHub topic-search ranking improves
when fewer, sharper topics are used.

### Changed — single-contributor identity

All git commits, file references, copyright lines, and footers are now under
the canonical `avelikiy <avelikiy@users.noreply.github.com>` identity. Three
prior commits authored under work-email and personal-Gmail identities have
been rewritten via `git filter-branch`. SHAs of those commits change; tags
v1.0.0–v1.0.129 are recreated to point at the new SHAs.

Files updated to drop legal-name copyright lines (replaced with `avelikiy`):
`LICENSE`, `packages/cli/LICENSE`, `packages/cli/package.json` (`author`),
`README.md` (Author section), `SECURITY.md` (security contact email →
GitHub private advisory), `site/*.html` (footers + `meta name="author"`),
`docs/articles/*.md` (article bylines).

### Coverage

Auditor patches + promotion infrastructure + identity hygiene. No CLI changes,
no archetype changes, no agent prompt changes outside `project-auditor`.

---

## v1.0.128 — 2026-04-27

### Added — agent writing-style reference (21 rules)

Adapted from [yzhao062/agent-style](https://github.com/yzhao062/agent-style) v0.3.1
(CC BY 4.0) — 12 canonical rules from Strunk & White / Orwell / Pinker plus 9 rules
from field observation of LLM output 2022–2026. Applied at **generation time** to all
prose-heavy agents.

#### `skills/great_cto/references/agent-style.md` (NEW)

Condensed 21-rule guide with severity (critical/high/medium/low), BAD→GOOD examples
in technical contexts, and a 5-second self-check (reader named, active voice, no filler
bullets, numbers on every claim, citations or admit absence). Source attribution kept
per CC BY 4.0 license.

#### Wired into all 7 agents — `## Writing Style` section before Step 0

- **tech-lead**: ARCH docs / ADRs / RFCs / brain.md — reader named in first sentence,
  no throat-clearing
- **senior-dev**: commit messages / PR descriptions / code comments — imperative active
  voice, body explains why not what
- **qa-engineer**: QA reports — every "regression" / "improvement" carries a number
  (p95, RPS, run count); active voice on failure descriptions
- **security-officer**: CSO reports / threat models — RULE-H strictest gate, every
  "best practice" claim cites a NIST / OWASP / CVE / log line
- **devops**: release notes / rollback runbooks — short, concrete, no "we are excited
  to announce" preambles
- **l3-support**: postmortems — active voice on root cause, timeline with UTC
  timestamps + person/system per action, never close with "in summary"
- **project-auditor**: audit reports — every gap carries effort estimate + impact;
  every "outdated" claim links to upstream EOL announcement

### Why

Pipeline-test agents in v1.0.125–127 sometimes produced AI-tells: em-dash habit,
"Additionally / Furthermore" transitions, summary sentences at every paragraph end,
handwavy "industry best practice" citations, abstract category nouns ("various
metrics", "performance issues"). These are mechanical and fixable at generation
time with a rule reference; the 21-rule set covers ~80% of failure modes.

The 5-second self-check before each prose artifact catches most violations without
slowing the pipeline. Heavier enforcement (LanguageTool linter, post-generation
review pass) deferred to v1.0.129+.

---

## v1.0.127 — 2026-04-26

### Closed gaps surfaced by v1.0.126 pipeline dry-runs on remaining archetypes

Pipeline simulation on `commerce`, `web3`, `agent-product` (the highest-stakes
existing archetypes) flagged real gaps. This release patches them.

#### `commerce-pack.md` — two new sections

- **Subscription reactivation flow**: three reactivation cases (PM-valid /
  PM-expired / paused) with Stripe patterns and edge cases. Hard rules: no
  silent reactivate, pro-rate first cycle for 30-day reactivations,
  idempotency keys namespaced as `reactivate:{user_id}:{epoch_day}`, webhook
  handler distinguishes `created` vs `resumed`.
- **Stripe ↔ DB reconciliation job**: hourly + daily full-sync schedule, RPO
  targets (1h active / 25h archived), 0-tolerance drift on subscription
  status, 7-year audit log retention for PCI / financial audit.

#### `ARCHETYPES.md` Parameter Values — 11 new compliance keys

Closes the gap where pack documents referenced compliance values that
ARCHETYPES.md didn't define, leaving security-officer ambiguous on what
checklist to run. Added: `pci-dss-saq-a`, `pci-dss-saq-a-ep`, `eu-vat`,
`consumer-rights-directive`, `csp`, `mv3-security`, `age-rating`,
`accessibility`, `coppa`, `openssf`, `api-stability`, `soc2-type-2`.

#### `web3-pack.md` — six new sections

- **`interest-rate-model`** QA extra (lending): kink-curve fuzzing,
  utilization invariants, monotonicity proofs, 100k+ runs, gas cost <60k
  for `accrueInterest`.
- **`liquidation-keeper-decentralization`** QA extra (lending): top-1
  keeper share <50% over 30 days, public liquidation interface (no
  allowlist), Dutch auction or batch settlement preferred.
- **`insurance-fund`** QA extra: bad-debt absorption mechanism, reserve
  factor flow, haircut formula, ≥0.5% TVL coverage at launch.
- **`l2-resilience`** QA extra: sequencer halt, force-inclusion via L1
  entrypoint, reorg up to L1 finality, cross-domain message delays. Each
  scenario as Foundry fork test.
- **Upgradeability decision matrix**: Immutable / UUPS / Transparent /
  Diamond / Beacon — when to use each, when to avoid, tooling. Universal
  upgrade discipline (timelock tiers, storage gaps, layout diff in CI,
  4-of-7 multisig).
- **Block-ship gate disambiguation by subtype**: token / lending / AMM /
  bridge / aggregator each have different hard gates. Lending = `flash-loan-sim`
  with 0 profitable vectors.
- **Bug bounty sizing**: pre-launch contest (Code4rena / Sherlock) → post-launch
  Immunefi tier mapped to TVL: <$5M → $50k crit, $5–50M → $250k, $50–500M →
  $500k–1M, >$500M → $1M–10M. Safe-harbour clause + payout SLA.

#### `agent-pack.md` — five new sections

- **Irreversible-action heuristic**: auto-promote any tool call to `high`
  trust if it matches verb/recipient/monetary/permission/destructive/cross-system
  patterns. Safety net for tools that forgot to declare `irreversible: true`.
- **MCP server trust pattern**: allowlist + scope mapping in
  `config/mcp_servers.yaml`, SHA256-pinned binaries, per-user OAuth (never
  service-account), high-trust actions through internal adapters not raw MCP,
  audit log on every tool call.
- **Multi-identity scenarios**: `(user_id, account_id, scope)` model for
  users with personal+work Gmail/Notion. Disambiguation rules: explicit
  account on every call, no silent merging across accounts, switch-account
  as first-class action, token revocation cascades.
- **Output filter concrete recommendations**: Llama Guard 3 (self-hosted),
  Anthropic safety classifier (built-in to Claude API), OpenAI Moderation,
  custom regex/NER as always-on layer for deterministic leaks.
- **Per-user rate limiting**: 4-layer matrix — API gateway, orchestrator
  (concurrent sessions / RPM / daily token cap), per-tool (gmail.send ≤
  10/h), budget tracker (per-session $0.50 default / $5 max). UI surfaces
  quota usage; silent throttling is hostile UX.

### Coverage

Same 14 archetypes + 13 packs. Pack file sizes: commerce-pack ~340 lines
(was ~310), web3-pack ~210 lines (was ~107), agent-pack ~430 lines (was
~356), ARCHETYPES.md +11 compliance keys.

---

## v1.0.126 — 2026-04-26

### Closed gaps surfaced by v1.0.125 pipeline dry-runs

End-to-end pipeline simulation on the three new archetypes (browser-extension,
game, devtools) flagged real architectural gaps in each pack. This release
patches them.

#### `browser-extension-pack.md` — three new sections

- **Long-running work / `chrome.offscreen`**: decision table for work duration
  (< 50ms / 50ms–5s / > 5s), offscreen document quickstart, LLM-inference
  pattern (extension as thin client, backend holds the API key, streamed
  results via `chrome.runtime.sendMessage`).
- **Sidebar / iframe injection (Grammarly / Honey pattern)**: Side Panel API
  vs injected iframe trade-offs, iframe isolation rules (`chrome-extension://`
  URL, `style.all = initial`, postMessage with origin check, z-index).
- **Cross-pack stacking**: when to load `[browser-extension-pack, ai-pack]`
  vs `[..., web-pack]` vs `[..., web3-pack]` vs `[..., commerce-pack]`. Calls
  out prompt-injection-via-page-content as the most-missed risk for AI
  extensions.

#### `game-pack.md` — four new sections

- **Team-size sanity check**: red-flag matrix for engine choice (solo/2 picking
  Unreal 5, 3–5 going custom, AAA-3D-in-Godot). Default rule: team ≤ 5,
  PC/mobile only → Godot 4 (2D) or Unity 6 (3D); Unreal 5 needs ≥ 8 engineers.
- **Netcode decision tree**: explicit top-to-bottom rules covering co-op PvE
  (≤ 4 → P2P relay, 5–8 → cheap dedicated). Calls out the common indie-studio
  mis-pick of authoritative servers for 4-player co-op.
- **Steam Deck Verified — the de-facto indie PC baseline**: requirements
  matrix (60 FPS at 1280×800, < 4 GB RAM, gamepad-mandatory, suspend/resume,
  Linux-compatible AC). Notes Vanguard incompatibility with Proton.
- **PC launch milestones**: 6-mo/12-mo timeline template (vertical slice →
  Steam Next Fest demo → closed beta → EA → 1.0 → v1.1) with per-milestone
  block-ship gates. Wishlist targets: 50k = break-even, 100k = ramen
  profitable, < 25k → delay or pivot.

#### `devtools-pack.md` — four new sections

- **SDK release orchestration**: tooling matrix (Stainless pipeline, npm
  changesets, Google release-please, custom Actions matrix) and the rule that
  CI must block tag if any SDK fails its language matrix — no "patch Python
  tomorrow" exceptions.
- **WebSocket / streaming APIs**: AsyncAPI 3.0 spec, auth-on-upgrade-not-send,
  token in subprotocol not URL, reconnection contracts (stateless vs cursor
  resume vs exactly-once), message versioning (`type@v2`), heartbeats,
  backpressure as explicit disconnect, idle close.
- **Multi-tenancy**: tenant identity model (API key vs JWT-with-claim vs OAuth
  audience), isolation level matrix (logical RLS / schema-per / DB-per /
  cell-per), per-tenant rate limits + quota + flags + credentials rotation +
  status page.
- **Sandbox / test mode (Stripe-style)**: separate base URL + separate API
  keys + same spec/SDK + realistic latency-and-failure injection + free
  usage + `x-environment` indicator.

### Coverage

Same 13 archetypes + 13 packs. Pack file sizes: browser-extension-pack ~410
lines (was ~314), game-pack ~370 lines (was ~311), devtools-pack ~390 lines
(was ~297). No CLI changes.

---

## v1.0.125 — 2026-04-26

### Added — three new archetypes: `devtools`, `browser-extension`, `game`

Coverage gap closed. The 10-archetype taxonomy was missing API-platform/SDK
products (~20% of YC W26), browser extensions (CSP / MV3 / Web Store review
specifics), and games (netcode, anti-cheat, age ratings, loot-box jurisdiction
rules). All three now have first-class archetypes with their own packs.

- **`devtools`** — API-platform / SDK / developer-tools / agent-platform.
  Compliance defaults: `openssf`, `api-stability`, `soc2-type-2`, `gdpr`.
  QA gates: OpenAPI/GraphQL stability, multi-language SDK parity, deprecation
  channels (RFC 9745 header + SDK warnings), docs-as-product.
  Pack: **`skills/great_cto/packs/devtools-pack.md`** (~280 lines).

- **`browser-extension`** — Chrome/Firefox/Edge MV3 extensions. Detection:
  `manifest.json` with `manifest_version: 2|3`, WXT (`wxt.config.ts`), Plasmo.
  Compliance defaults: `csp`, `mv3-security`, `gdpr`. QA gates: Web Store
  review pre-flight (single-purpose policy, permissions justification, privacy
  practices form), service-worker patterns, host-permissions scrutiny.
  Pack: **`skills/great_cto/packs/browser-extension-pack.md`** (~340 lines).

- **`game`** — Unity / Unreal / Godot / Phaser / Cocos. Detection:
  `ProjectSettings/`+`Assets/` (Unity), `*.uproject` (Unreal), `project.godot`
  (Godot), web-game deps via package.json. Compliance defaults: `coppa`,
  `age-rating` (ESRB/PEGI/USK/IARC), `accessibility`. QA gates: netcode
  (lockstep / rollback / authoritative), anti-cheat (server-side validation
  always), loot-box jurisdiction matrix (Belgium/NL bans, CN/KR drop-rate
  disclosure), platform certifications (Sony TRC, Xbox XR, Nintendo Lotcheck).
  Pack: **`skills/great_cto/packs/game-pack.md`** (~360 lines).

### Changed

- **`packages/cli/src/archetypes.ts`** — `Archetype` union extended from 11
  to 15 (added `agent-product`, `devtools`, `browser-extension`, `game`).
  New scoring rules with priority 6–8 to override `library` / `mobile-app`
  fallback when explicit signals present. `suggestCompliance` now seeds the
  three new archetypes with their default compliance sets.

- **`packages/cli/src/detect.ts`** — new detection signals:
  - browser-extension: parses `manifest.json` for `manifest_version`, detects
    WXT / Plasmo configs.
  - game: detects Unity (`ProjectSettings/`), Unreal (`*.uproject`), Godot
    (`project.godot`), and web-game npm deps (phaser, cocos2d, playcanvas).
  - devtools: detects OpenAPI / Swagger specs at common paths, GraphQL schema,
    Stainless config, multi-language SDK directories (≥3 language sub-dirs in
    `sdks/` or `clients/`), Mintlify (`mint.json` / `docs.json`).
  - Aggregate: `openapi-spec` + `multi-sdk` ⇒ explicit `devtools-api` flag.

- **`skills/great_cto/TYPE_MAP.md`** — reroutes:
  - `browser-extension` / `chrome-extension-mv3`: `mobile-app` → `browser-extension`
  - `vscode-extension`: `mobile-app` → `library` (IDE plugins are marketplace
    packages, not browser extensions)
  - `game`: `library` → `game`
  - Adds 4 new keyword rows + Mapping Table rows for `api-platform`,
    `sdk-platform`, `developer-tools`, `agent-platform` → `devtools`.

- **`packages/cli/src/main.ts`** — `--help` now lists 13 archetypes (was 10).

### Coverage

- 13 archetypes (was 10), 13 domain packs, 75+ specific types in TYPE_MAP.

---

## v1.0.124 — 2026-04-26

### Added — automatic update check at session start

When a new version of great_cto is published to npm, users now see a one-line
banner at the start of their next Claude Code session offering the upgrade
command. No manual checking required.

- **`scripts/check-update.sh`** (NEW): silent background update check called
  from SessionStart hook. Compares cached plugin version against
  `https://registry.npmjs.org/great-cto/latest`. Caches result for 24h to avoid
  hammering npm. 3-second timeout so offline doesn't block session start.
  Banner shows: current version, latest version, version delta (major/minor/patch),
  upgrade command (`npx great-cto init --force`), changelog URL.
- **`plugin.json` SessionStart hook**: appends call to `check-update.sh` at
  the end. Runs after pattern injection so it's the most recent thing user sees.
  Existence check (`-x`) means missing script doesn't break session start.
- **`commands/doctor.md` Check 8**: extended with on-demand version freshness
  check that bypasses the 24h cache. `/doctor` now shows whether the local
  cache is current with npm's latest.

### How it works

```
[every 24h, on SessionStart, silent unless update available]
1. Read PLUGIN_DIR/.claude-plugin/plugin.json → CURRENT_VER
2. curl npm registry → LATEST_VER (3s timeout, fail silently)
3. If LATEST_VER > CURRENT_VER (semver): print banner
4. Cache check timestamp in ~/.great_cto/.last-version-check
```

```
╭─────────────────────────────────────────────────────────────────╮
│  💡 great_cto 1.0.124 is available (you have 1.0.122, +2 patch) │
│     Upgrade:  npx great-cto init --force                        │
│     Changelog: https://github.com/avelikiy/great_cto/blob/...   │
╰─────────────────────────────────────────────────────────────────╯
```

Verified across 5 scenarios: stale cache (banner shows), hot cache (silent),
already on latest (silent), missing plugin.json (graceful skip), no network
(3s timeout, silent).

---

## v1.0.123 — 2026-04-26

### Added — 5 new domain packs + extended stack detection (closes archetype coverage gaps)

After auditing archetype coverage against the actual 2026 ecosystem, found that 6 of 11 archetypes
had no domain pack, and stack detection missed major frameworks (Flutter, Tauri, Pulumi, dbt, vLLM,
DuckDB, Iceberg, Adyen, etc.). This release closes those gaps in one batch.

#### New packs (5)

- **`packs/web-pack.md`** (319 lines): framework decision tree (Next/Nuxt/SvelteKit/Astro), backend
  framework choice (Hono/Fastify/NestJS), ORM (Drizzle/Prisma/Kysely), auth providers (Clerk/Auth.js/Lucia),
  edge runtime constraints, realtime patterns, perf budgets, OWASP defaults, anti-patterns specific to web.
- **`packs/library-pack.md`** (282 lines): supply-chain security focus — OpenSSF Scorecard ≥ 7.5
  baseline, npm provenance + PyPI Trusted Publishing (OIDC), SBOM generation via Syft, semver
  enforcement (semantic-release/Changesets/cargo-semver-checks), bundle size budgets, ESM-first
  exports, deprecation policy, security disclosure template, CLI-specific extras.
- **`packs/mobile-pack.md`** (236 lines): native vs Flutter vs RN vs KMM vs Tauri decision tree,
  build pipelines (Fastlane/EAS), App Store rejection patterns (4.3, 5.1.1, 2.1, 3.1.1, 4.7),
  Google Play API 34 requirements, OWASP MASVS V1-V8 detailed checklist, push (APNs/FCM),
  IAP (RevenueCat), OTA (EAS Update/Shorebird), passkeys-first auth.
- **`packs/infra-pack.md`** (264 lines): IaC tool decision (Terraform/OpenTofu/Pulumi/CDK/Crossplane),
  state backends, policy-as-code (OPA/Checkov/tfsec), GitOps (ArgoCD/Flux), cluster management
  decision per cloud, service mesh "only when you need it" guidance, secrets management, OTel +
  LGTM observability stack, FinOps essentials with Karpenter and Spot, DR strategy table.
- **`packs/commerce-pack.md`** (271 lines): payment provider decision (Stripe/Adyen/Paddle/Polar),
  subscription billing (Stripe Billing/Lago/Stigg/Orb), PCI-DSS scope reduction (SAQ-A target),
  idempotency patterns, webhook signature verification, refund/dispute workflow, fraud detection
  (Radar/Sift/Signifyd), multi-currency, tax compliance (Stripe Tax / Paddle MoR), pricing patterns.

#### Pack updates (2)

- **`packs/ai-pack.md`**: appended "Tooling Reference (2026 stack)" section — vLLM/Ollama/llama.cpp
  for serving, DSPy/Instructor/Outlines for prompt engineering, Ragas/DeepEval/Promptfoo/Braintrust
  for evaluation, vector DB decision (pgvector/Pinecone/Qdrant/Turbopuffer/LanceDB), Langfuse for
  observability.
- **`packs/data-pack.md`**: appended "Tooling Reference (2026 stack)" section — dbt + DuckDB for dev,
  Polars replacing pandas, Dagster as default orchestrator, Iceberg as lakehouse standard, Snowflake
  Polaris catalog, ClickHouse for OLAP, Confluent/Redpanda for streaming, Great Expectations / Soda
  for quality, DataHub / OpenMetadata for catalog.

#### Stack detection (`packages/cli/src/detect.ts`)

Added detection for 15+ new frameworks/tools:

- **Mobile**: Tauri (`@tauri-apps/api`), Capacitor, Flutter (`pubspec.yaml`)
- **AI**: LangGraph, CrewAI, AutoGen, DSPy, vLLM, Ollama, Mastra, Vercel AI SDK, Ragas, DeepEval, OpenCV/YOLO
- **Commerce**: Adyen, Paddle, LemonSqueezy, Polar
- **DBs**: Kysely, Lucia, WorkOS, Neon, PlanetScale, Turso (libsql), DuckDB
- **Data**: dbt (`dbt_project.yml`), Dagster (`dagster.yaml`), Polars, Iceberg
- **Infra**: Pulumi (`Pulumi.yaml`), AWS CDK (`cdk.json`), Helmfile, ArgoCD
- **Embedded**: Zephyr (`west.yml`), ESP-IDF, Embassy (Rust)

#### Library archetype detection — strong signal

`detect.ts` now identifies library projects by manifest signals (npm `main`/`exports`/`bin` without
`private:true`, Python `[project]` without `manage.py`/`main.py`, Go `go.mod` without `main.go`,
Rust `[lib]` without `[[bin]]`). When detected, `archetypes.ts` scores library at priority **7**
(was 2, weak fallback). Library projects now classify with **high confidence** instead of fallback.

#### `ARCHETYPES.md`

Added "Packs Auto-load Map" table — explicit mapping of each archetype to its pack, plus 5
common multi-pack combinations (e.g. `[ai-pack, enterprise-pack]` for regulated AI, `[web-pack,
commerce-pack]` for SaaS with checkout, `[mobile-pack, commerce-pack]` for IAP-heavy mobile).

### Pack coverage summary (after this release)

| Archetype | Pack? |
|-----------|-------|
| web-service | ✅ web-pack (was ❌) |
| mobile-app | ✅ mobile-pack (was ❌) |
| ai-system | ✅ ai-pack (updated) |
| agent-product | ✅ agent-pack |
| data-platform | ✅ data-pack (updated) |
| infra | ✅ infra-pack (was ❌) |
| library | ✅ library-pack (was ❌) |
| commerce | ✅ commerce-pack (was ❌) |
| web3 | ✅ web3-pack |
| iot-embedded | ⚠ no pack, only detection signals |
| regulated | ✅ enterprise-pack |

**10 of 11 archetypes now have domain packs (was 5).** iot-embedded keeps detection-only coverage
since the existing TYPE_MAP entries (`embedded-iot`, `hardware-driver`) link to enterprise-pack
when compliance overlaps.

---

## v1.0.122 — 2026-04-25

### Added — OWASP LLM Top 10 audit completion + LLM router cost telemetry + multi-IDE truth + smoke test runbook

Closes the four "next priorities" items from v1.0.121: OWASP gaps, cost-savings data
backing, honest multi-IDE matrix, and a production smoke test plan.

- **`skills/great_cto/references/agent-security.md`**: 5 OWASP categories without dedicated
  audit sections (LLM02 Output Handling, LLM03 Training Data, LLM08 Excessive Agency,
  LLM09 Overreliance, LLM10 Model Theft & Key Security) now have full audit checklists,
  test prompts, and BLOCK/HIGH/MEDIUM thresholds. The OWASP table now anchors each row to
  its detail section. CSO report template (`## Agent Security Assessment`) updated with
  per-OWASP verdict slots so the security officer fills 10 verdict lines, not 4.
- **`commands/cost.md`**: new "LLM router savings (lead the report with this)" section.
  Reads `.great_cto/llm-router-usage.log`, computes Kimi-vs-Sonnet differential, prints
  saved $ and %, validates against the README "60–80%" claim. Auto-suppresses if the log
  is empty (no false claim). The intro now leads with cost savings before infra cost.
- **`docs/multi-ide.md`** (NEW, 168 lines): honest multi-IDE adaptation guide. Verified
  YAML frontmatter parses cleanly across all 7 agents; documented Cursor / Codex CLI /
  Gemini CLI / Antigravity adaptation steps; explicit list of what's lost outside Claude
  Code (8 items) and what ports cleanly (skills + packs + ARCHETYPES). README compatibility
  matrix downgraded from optimistic ✅/⚠️ to honest ✅/🟡/❌ per feature × IDE; links to
  the new doc for deep adaptation.
- **`docs/smoke-test.md`** (NEW, 235 lines): 7-phase runbook to verify everything works
  on a real project. Each phase has explicit PASS / FAIL signals; verdict matrix
  (GREEN / YELLOW / RED) at the end; reporting protocol via `bd create` for found issues.
- **`README.md`** Links section: added entries for `docs/multi-ide.md` and
  `docs/smoke-test.md`.

---

## v1.0.121 — 2026-04-25

### Fixed — first-run experience: PROJECT.md template tells users about Phase 0 discovery

After v1.0.117 introduced the discovery skill, fresh installs from `npx great-cto init`
still produced a PROJECT.md whose Notes section only mentioned `/audit`. Users who
ran the installer never learned that `/start` will walk them through structured
discovery if their input is sparse. Result: they'd accept the guessed archetype
silently and miss the value.

- **`packages/cli/src/bootstrap.ts`**: Notes section in generated PROJECT.md now
  explicitly says "the archetype and compliance above are best-effort guesses",
  documents three refinement paths (`/audit`, `/start "<description>"` with Phase 0
  pointer, or direct edit). Compiled to dist/bootstrap.js.
- Cleanup-only: removed v-prefixed plugin cache duplicates from manual rsyncs;
  installer convention is bare version (`1.0.121`, not `v1.0.121`).

---

## v1.0.120 — 2026-04-25

### Changed — outcome-led positioning + memory/MCP/multi-IDE narrative (P1 + P2 from gap analysis)

We compete against `claude-mem` (67k★) on memory and `caveman`/`rtk` (35–46k★) on token cost
without telling the user that, and we lead with process ("two decisions per feature") instead
of outcomes. After v1.0.119 fixed discoverability, this release fixes positioning.

- **README hero rewritten** outcome-first: "Ship features in 45 minutes, not 5 hours" headline,
  "two decisions per feature" preserved as USP detail. Two new badges in hero:
  `LLM costs down 60–80%` (from llm-router Kimi fallback) and `MTTR down 94% after first incident`
  (verified from /crystallize loop). Tagline pills now lead with `cross-project memory` and
  `MCP-native` instead of generic `hooks · skills`.
- **README "Memory" section** (replaces "The brain"): explicit 4-layer narrative with table —
  L1 PROJECT.md, L2 CODEBASE.md, L3 brain.md, L4 ~/.great_cto/global-patterns/. Differentiates
  from generic memory plugins ("we synthesize, not record"). Disk usage stated (~10–50 KB).
  ASCII diagram of the file layout. Concrete claim: 94% MTTR drop on second occurrence.
- **README "MCP integrations" section** (NEW): table listing Grafana, LLM router (built-in,
  60–80% cost reduction), Beads, "your own". JSON snippet showing how to add new servers.
- **README "Extending the agent roster" subsection** (NEW): documents existing
  template-bridge integration → 419 specialist agents + 336 commands available as sub-agents.
- **README "Multi-IDE compatibility" section** (NEW): compatibility matrix for Claude Code /
  Cursor / Codex CLI / Gemini CLI. Honest scoring (✅ / ⚠️ / ❌) per feature.
- **`site/index.html` hero**: outcome-led headline mirror, version pill v1.0.115 → v1.0.120,
  added cost-savings + MTTR pills.

---

## v1.0.119 — 2026-04-25

### Changed — discoverability overhaul (P0 from gap analysis)

After auditing top-30 Claude Code plugin/agent repos (April 2026), our four discoverability
surfaces — GitHub topics, npm keywords, plugin.json keywords, site meta — were inconsistent
or missing critical terms. Direct competitors (`wshobson/agents`, `ruvnet/ruflo`,
`Yeachan-Heo/oh-my-claudecode`) have 30k+ stars; we had 4. Biggest single gap: **0 GitHub topics
set on the repo** — searches for `claude-code-plugin`, `multi-agent`, `agentic-coding` did
not surface us.

- **GitHub topics set (19)**: claude-code, claude-code-plugin, claude-code-subagents,
  claude-code-commands, claude-code-skills, claude, anthropic, ai-agents, agentic-coding,
  agentic-engineering, multi-agent, multi-agent-systems, sdlc, orchestration, automation,
  code-review, devops, mcp, plugin
- **`plugin.json` keywords**: 5 → 21 (added claude-code, claude-code-plugin,
  claude-code-subagents, claude-code-commands, claude-code-skills, claude, anthropic, plugin,
  ai-agents, agentic-coding, agentic-engineering, multi-agent-systems, orchestration, mcp,
  code-review, devops). Previous keywords were disjoint from npm.
- **`packages/cli/package.json` keywords**: 28 → 39 (added the same agentic-* and claude-code-*
  terms; kept compliance + tdd + startup terms).
- **Site meta tags**: index.html keywords expanded 8 → 26 terms; added keyword meta to
  commands.html, agents.html, archetypes.html (previously: none).
- **README intro**: rewritten with "**Claude Code plugin** that turns one engineer into a
  full SDLC team" + explicit "agentic coding · multi-agent orchestration" phrasing. Tagline
  band shows "7 Claude Code subagents · 16 commands" (was: "7 agents · 11 archetypes ·
  12-angle review · 13 compliance frameworks · 15 commands"). Stale "15 commands" fixed to 16.

### Added — submitted to two awesome-lists

- **PR opened**: [ComposioHQ/awesome-claude-skills#734](https://github.com/ComposioHQ/awesome-claude-skills/pull/734)
  added great_cto under Development & Code Tools.
- **Pre-filled submission URL** generated for `hesreallyhim/awesome-claude-code` (their
  policy forbids `gh` CLI submissions; one-click manual submit by maintainer).

---

## v1.0.118 — 2026-04-25

### Fixed — discovery Option C path + 24-scenario test coverage

Live test of v1.0.117 revealed the discovery skill described 3 options but didn't
specify what to do when user picks **Option C (don't build it)**. Without explicit
handling, agent could create a PROJECT.md anyway and start the pipeline.

- **`skills/great_cto/references/discovery.md`**: split "What to write after CTO picks
  an option" into two paths. Option A/B writes PROJECT.md as before. Option C writes
  `.great_cto/DISCOVERY-NO-BUILD.md` with: inputs verbatim, why no build, vendor shortlist,
  re-evaluation criteria (4 conditions all-must-hold), action items + 6-month revisit reminder.
  Critical: do NOT also write PROJECT.md when Option C wins.
- **`commands/start.md`**: existing-project guard now also detects DISCOVERY-NO-BUILD.md.
  If present → stops with re-confirm / supersede / reset options. Prevents re-running
  /start from quietly overriding a deliberate "don't build" decision.

### Verified — 24-scenario deterministic test of mapping rules

Encoded mapping rules from discovery.md as Python; ran across 24 representative
scenarios spanning all 9 archetypes. Distribution: A=54% (teams with capacity),
B=37% (solo founders / hackathons), C=8% (solo + heavy compliance only).

Verified the skill's key heuristic: "solo + 2+ compliance regimes → Option C dominant"
fires correctly for AI support bot with PII+PCI (sc#1) and regulated archetype solo (sc#14)
but not for healthcare RAG with 5-15 team (sc#6, picks A) — capacity matters.

---

## v1.0.117 — 2026-04-25

### Added — Discovery skill (no new agent — reusable across `/start`, `/audit`, `/poc`)

Sparse input is the most common failure mode at project start: a one-sentence description
forces agents to guess archetype, size, compliance. The fix is structured discovery — an
8-question domain framework that maps answers to PROJECT.md fields and proposes 2–3 concrete
approaches (Option A/B/C) with explicit tradeoffs.

Implemented as a **skill, not an agent.** Sub-agents are bad at multi-turn user dialog;
slash commands in the main session are not. Skills make the framework reusable across
three entry points without forking logic.

- **`skills/great_cto/references/discovery.md`** (NEW): 8-question framework in 4 blocks
  (audience+pain, system shape, constraints, capacity+scope), mapping rules from answer
  patterns to archetype / project_size / compliance / poc-mode, synthesis rule that always
  proposes 2–3 options with Option C explicitly considering "don't build it / use existing tool",
  and stop conditions (don't drag past 5 questions when archetype is already clear).
- **`commands/start.md`**: new **Phase 0: Discovery** block runs before Step 1 type detection.
  Triggers when description is short, vague, or has conflicting archetype signals. Replaces
  the old narrow "ask one question and guess" path. Open-ended ideation falls back to
  `superpowers:brainstorming` (different tool: brainstorming finds scope, discovery narrows it).
- **`commands/audit.md`**: when README + git history don't reveal audience or compliance,
  agent invokes the discovery skill for the 2–3 questions the codebase couldn't answer.
  Audit gives stack; discovery fills audience + compliance. No re-asking obvious facts.
- **`commands/poc.md`**: when the hypothesis is shorter than 8 words and not falsifiable,
  Step 2 first runs discovery Block 1 (audience+pain) + Q8 (scope cut) before requiring a
  falsifiable claim. Prevents POCs from drifting into research projects.

PROJECT.md gains two new optional fields: `discovery: completed | defaulted` and
`discovery-summary` (verbatim audience / pain / scope-cut + chosen approach), read by
`tech-lead` at ARCH time so user intent isn't lost when only field values are kept.

---

## v1.0.116 — 2026-04-25

### Added — `/crystallize` can now improve **skills**, not just agents

Previously, every crystallized pattern targeted an agent file (`agents/<name>.md`) and was
matched at runtime via Step 0 Pattern Lookup. Some learnings — new LogQL templates, new
postmortem rules, new threat-model techniques — apply across multiple agents and belong in
shared reference docs (`skills/great_cto/references/<topic>.md`).

- **`skills/great_cto/references/knowledge-extraction.md`**: KE schema now supports
  `target_skill: <relative-path>` as an alternative to `target_agent: <name>`.
  KE files use exactly one of the two.
- **`commands/crystallize.md`**:
  - `review` subcommand validates that every KE has either `target_agent` or `target_skill`
    (skips with explicit message if neither). Proposal `Target` line reflects the chosen route.
  - `approve` subcommand splits into two paths:
    - **Agent route**: pattern matched at runtime via Step 0 (no file edit needed)
    - **Skill route**: appends a crystallized entry block to the skill file with proposed change,
      detection method, fix template, verification, and source GP-NNNN. Auto-commits to plugin repo.

End-to-end verified: synthetic KE with `target_skill: skills/great_cto/references/grafana-ops.md`
correctly creates GP file, generates proposal, and on approval appends a complete pattern entry
to the skill doc with attribution.

---

## v1.0.115 — 2026-04-25

### Fixed — `/crystallize` wired into SessionStart + documented in README

- **`plugin.json` SessionStart CMD loop**: added `crystallize` to the loop that copies command
  files to `~/.claude/commands/` on every session start. Previously the command file existed in
  the repo but was never installed for users — `/crystallize` would fail with "command not found".
- **`README.md`**:
  - Added `/crystallize` row to the advanced commands table with a one-line description
  - Extended "The brain" section with a cross-project learning paragraph explaining the
    KE → `/crystallize` → GP → Step 0 loop in plain language
  - Updated "Fully automatic" table: session start now shows global patterns loaded;
    added P0 trigger row; `/digest` line updated to mention pattern library stats

---

## v1.0.114 — 2026-04-25

### Added — Step 0 Pattern Lookup in all 6 remaining agents

Completes the self-improving loop: every agent now opens a session by surfacing known patterns
from `~/.great_cto/global-patterns/` before starting its standard workflow.

- **`agents/tech-lead.md`**: Step 0 before ARCH design — surfaces `arch-rework` patterns as
  architecture constraints so past decisions aren't repeated. Architecture decisions blocked by
  a pattern are documented in the new ARCH doc.
- **`agents/senior-dev.md`**: Step 0 before implementation — surfaces known stack pitfalls with
  `fix` field so the developer applies proven fixes immediately. KE trigger added: if advisor
  called AND root cause absent from ARCH doc, write KE before DONE.
- **`agents/qa-engineer.md`**: Step 0 before test plan — surfaces `why_standard_checks_missed_it`
  per matched pattern so those exact failure modes become Priority 0 test cases. KE trigger:
  escaped bug or advisor called more than once.
- **`agents/security-officer.md`**: Step 0 before security checklist — surfaces `security-gap`
  patterns with their verification first-step. KE trigger: new vulnerability class not in
  existing checklist.
- **`agents/devops.md`**: Step 0 before deploy sequence — surfaces deployment failure patterns
  so pre-deploy verification of known failure modes runs before gate:ship check.
- **`agents/project-auditor.md`**: Step 0 before Phase 1 stack fingerprinting — surfaces
  `audit-recurrence` patterns (same debt found in two consecutive audits) and flags them as
  RECURRING in the report, requiring structural remediation not just a finding. KE trigger:
  same debt category appears in this and prior audit.

---

## v1.0.113 — 2026-04-25

### Added — Self-improving agent system (`/crystallize` + Knowledge Extraction)

Every resolved incident, blocked QA run, or completed audit now feeds a structured learning loop:
agent extracts knowledge → `/crystallize` promotes it to a global pattern → next session,
agents surface matching patterns before starting standard diagnostics.

- **`skills/great_cto/references/knowledge-extraction.md`** (NEW): KE schema and extraction protocol.
  Defines when extraction is mandatory (P0 incidents, iterations > 3, new vulnerability class, etc.),
  full YAML schema for `~/.great_cto/extractions/KE-*.yaml` (symptom, dead_ends, breakthrough_tool,
  detection_order_next_time, why_standard_checks_missed_it), anonymized canonical example
  (Grafana jsonData.database null — visible only in Playwright browser console, 8 iterations, 4h),
  and a privacy scan bash script (no project names, URLs, credentials in KE files — plugin is public).
- **`commands/crystallize.md`** (NEW): CTO-approval workflow for promoting KE files to global patterns.
  Subcommands: `status` (pending KEs + proposals + active pattern stats), `review` (KE→GP promotion
  with noise filter: high=auto-promote, medium≥5 iterations, low≥8 iterations, plus dedup check),
  `approve GP-NNNN` (applies proposal to agent file + git commit + copies to `~/.claude/agents/`),
  `reject GP-NNNN reason`, `rollback GP-NNNN` (git revert), `prune` (archive zero-hit patterns
  older than 90 days). MTTR reduction tracked in `~/.great_cto/metrics/crystallize.log`.
- **`agents/l3-support.md`**: new **Step 0 Pattern Lookup** block runs before all diagnostics.
  Reads `~/.great_cto/global-patterns/`, filters by project archetype + stack fingerprint,
  surfaces matching patterns with `detection_order[0]` as Priority 0 diagnostic.
  Canonical: "No data in Grafana" → GP match → Playwright browser console first → saves 4h.
  New **Knowledge Extraction** block at end of workflow: mandatory when P0 or iterations > 3;
  guides agent to write `~/.great_cto/extractions/KE-*.yaml` with privacy-safe content.
- **`plugin.json` SessionStart hook**: injects active global patterns matching current project archetype
  at session start. Each matched pattern surfaces symptom + first detection step so agents apply
  proven shortcuts before re-discovering known root causes.
- **`commands/digest.md`**: new `PATTERN LIBRARY` section in format output and data gather block.
  Shows: active pattern count, total hits, avg MTTR reduction, top 3 patterns by hits.

Pattern files live in `~/.great_cto/global-patterns/` (local machine only — never committed to repo).
KE files live in `~/.great_cto/extractions/` (local machine only). Public repo contains schemas only.

---

## v1.0.112 — 2026-04-25

### Added — Grafana-native monitoring in `l3-support`

Upgrades `l3-support` incident detection from grep/tail/Docker logs to Grafana MCP
(`query_loki`, `search_alerts`, `query_tempo`, `get_panel`, `list_dashboards`) with
graceful file-based fallback for projects without Grafana configured.

- **`agents/l3-support.md`**: frontmatter `tools:` adds 5 Grafana MCP tool names;
  new `## Grafana Setup` block detects `grafana-url` / `grafana-api-key-env` from PROJECT.md
  and sets `$GRAFANA_OK` / `$GCX_OK` flags at startup; Step 2 (Check logs) becomes
  Grafana-first — `search_alerts` + `query_loki` as Priority 0, full file/Docker/journalctl
  chain preserved as Priority 1–4 fallback; Step 3 (Quick diagnostics) adds
  `gcx alerts list --state firing` and `gcx correlate --commit HEAD` when gcx is present;
  new `## Proactive Alert Polling` section enables pre-P0 alert detection from Grafana before
  users notice; P0 Response Angle 4 gains Tempo trace lookup via `query_tempo` to pinpoint
  the slow span in a distributed system failure.
- **`mcp-servers/grafana.md`** (NEW): setup guide for `grafana/mcp-grafana`, `loki-mcp`,
  and `gcx` CLI — install commands, Claude Code `settings.json` snippet, required Grafana
  API key scopes, PROJECT.md fields, tool-to-workflow-step mapping, and verification commands.
- **`skills/great_cto/references/grafana-ops.md`** (NEW): ops reference — 6 LogQL patterns
  (error spike, latency, OOM, panic, auth failure, dependency timeout), PromQL SLI queries
  (availability, p95 latency, error budget burn rate, anomaly band), gcx command reference,
  proactive alert classification table, and the full alert correlation workflow
  (firing alert → Loki → Tempo → gcx correlate → root-cause statement).
- **`commands/start.md`**: `## L3` section in PROJECT.md template now documents 4 optional
  Grafana fields (`grafana-url`, `grafana-api-key-env`, `loki-datasource`, `tempo-datasource`).

---

## v1.0.111 — 2026-04-25

### Added — `agent-product` archetype

New archetype for user-facing autonomous agents built on Claude Agent SDK, LangGraph, CrewAI, AutoGen, and similar frameworks. Differentiated from `ai-system` (which covers internal ML/LLM infrastructure).

- **`skills/great_cto/ARCHETYPES.md`**: added `agent-product` to all three tables — definition,
  QA strategy, and deploy method. Security tier: `deep` always (user input controls tool execution).
  Compliance: OWASP LLM Top 10 + EU AI Act + GDPR if storing memory.
- **`skills/great_cto/packs/agent-pack.md`** (NEW): full AI agent stack reference — orchestration
  framework decision tree, memory tier selection (L1–L4), tool sandboxing (E2B vs Docker),
  observability setup (Langfuse + OTel), agent constitution template, per-user isolation pattern,
  budget cap enforcement, loop bounds, OWASP LLM Top 10 compliance checklist.
- **`skills/great_cto/references/agent-security.md`** (NEW): security officer audit reference —
  OWASP LLM Top 10 audit mapping with thresholds, prompt injection test patterns, per-user
  isolation audit procedure, tool permission matrix template, loop bounds audit commands,
  supply chain audit for agent deps, observability gate, EU AI Act checklist.
- **`skills/great_cto/TYPE_MAP.md`**: added detection keywords for `agent-product` type
  (Claude Agent SDK, user-facing agent, LangGraph agent, CrewAI, AutoGen, agent app, AI copilot).
- **`agents/security-officer.md`**: added `agent-product` to mandatory archetype list and
  tier-computation case statement (deep). Added dedicated Agent Security Audit section with
  6 checks: injection resistance, per-user isolation, loop bounds/budget, observability,
  tool permission matrix, OWASP LLM Top 10 checklist.
- **Landing page + README**: updated archetype count 10 → 11, added `agent-product` card to
  both the hero grid and archetypes page, added `agent-pack` to domain packs list.

---

## v1.0.110 — 2026-04-25

### Improved — visibility + ecosystem positioning

Based on KDnuggets "10 repos to master Claude Code" competitive analysis:

- **README hero keywords**: added `hooks · skills · MCP · subagents · SDLC pipeline · approval gates`
  code pill row — the terms developers search for when evaluating Claude Code extensions.
- **Comparison table**: added `affaan-m/everything-claude-code` (hackathon winner, closest scope
  competitor) and `gsd-build/get-shit-done` (same pipeline philosophy, different depth) with honest
  positioning notes.
- **Landing page badge**: updated hero pill to `hooks · skills · MCP · subagents`.
- **PRs submitted to ecosystem catalogs**:
  - `hesreallyhim/awesome-claude-code` → Tooling › Orchestrators section
  - `VoltAgent/awesome-claude-code-subagents` → Meta & Orchestration category
    (includes `categories/09-meta-orchestration/great-cto-pipeline.md` agent definition)

---

## v1.0.109 — 2026-04-25

### Improved — DORA depth sprint (`/digest`)

Inspired by Habr "DORA-метрики: как собирать, интерпретировать и не переусердствовать, ч.2"
and AI-Zoo 2026 (Hermes memory-cap pattern):

- **Rework Rate (5th DORA metric)**: counts Beads tasks labelled `hotfix`, `rework`, or
  `unplanned` in the digest window, expressed as % of deploys. Appears alongside
  Change Failure Rate in the DORA block.
- **Delta arrows**: each DORA metric now shows `↑N worse` / `↓N better` / `— same`
  vs the previous `/digest` run. Values persisted to `.great_cto/dora-baseline.log`
  (already gitignored) after every run; last 10 snapshots kept.
- **Context disclaimer**: one-line warning at the top of every digest output —
  "These numbers describe this service only. Context determines what 'good' looks like."
  Prevents the common anti-pattern of ranking teams by raw DORA numbers.
- **SPACE capsule**: three lightweight developer-experience signals added after the
  DORA block: on-call burden (incidents/engineer), CI predictability (success%),
  and review pressure (P1/P2 count from last `/review`).
- **brain.md size guard**: Dream Cycle now enforces a 4000-char cap on `.great_cto/brain.md`.
  When exceeded, oldest Evidence Timeline entries are trimmed first; Current Synthesis
  (the useful half) is always preserved. Mirrors the Hermes MEMORY.md pattern.
- **RECOMMENDATION examples**: added Rework Rate and SPACE-signal example recommendations.

---

## v1.0.108 — 2026-04-24

### Added — browseable web UI

- **`site/archetypes.html`** — 10-archetype grid with default tier badges (baseline / standard / deep).
- **`site/agents.html`** — 7-agent grid with model tier (Haiku / Sonnet / Opus) and role description.
- **`site/commands.html`** — 15 commands grouped by usage: Primary (3) / Project lifecycle (5) / Security (5 `/sec` subcommands) / Team & governance (6).
- **Shared stylesheet** — inline `<style>` block (426 lines) in `site/index.html` extracted to `site/assets/site.css`; all four pages share it.
- **Cross-page nav** with current page highlighted.
- **`site/sitemap.xml`** updated with three new URLs.

### Fixed

- **Hero scale metrics**: landing now reads "7 agents · 10 archetypes · 15 commands · 12-angle review · 13 compliance frameworks" — the real counts (was "9 agents · 13 archetypes").
- **`site/assets/demo.tape`**: output lines were being executed as shell commands, producing `syntax error near unexpected token '('` throughout the GIF. Rewrote every output line as `echo '...'` and replaced the ANSI-escape PS1 (which VHS's bracket parser mangled into `clear114m\]`) with a neutral `export PS1='> '`. GIF re-rendered cleanly.
- **Nav menu wrapping**: long labels ("How it works", "12-angle review") wrapped to 2–3 lines and pushed the Install button off-screen. Trimmed to 6 nowrap items.
- **Footer version pin**: was still `v1.0.101`; now reads `v1.0.108`.

### Cleanup

- **`.gitignore`** tightened from `.claude/settings.local.json` to `.claude/` (covers runtime artefacts like `scheduled_tasks.lock` that accidentally got committed in v1.0.107).
- **`.claude/scheduled_tasks.lock`** removed from the tree.

---

## v1.0.107 — 2026-04-24

### Added — launch polish sprint (README + landing)

Closed competitive gaps against top Claude-Code adjacent projects
(`anthropics/claude-code`, `obra/superpowers`, `davila7/claude-code-templates`,
`ruvnet/claude-flow`, `conductor.build`):

- **Demo GIF** (`site/assets/demo.gif`, rendered via `site/assets/demo.tape`
  using charmbracelet/vhs). 45-second terminal recording: `/start "add Stripe
  subscriptions"` → tech-lead architecture → approval → senior-dev TDD →
  12-angle review → QA → CSO → devops canary → ship. Embedded in README
  header and landing hero.
- **Logo in README header** — centered SVG + badge row aligned under it
  (previously text-only H1).
- **Scale metric row**: "9 agents · 13 archetypes · 12-angle review · 13
  compliance frameworks" in both README and landing hero. Concrete numbers
  readers can verify.
- **Release-velocity signal**: "shipped 5 releases in 24h" pill in hero.
- **GitHub Discussions enabled** (`gh api -X PATCH /repos/... -F
  has_discussions=true`). Linked from README, nav, and Links section. Free
  community channel — no Discord setup overhead.
- **Comparison table extended** (README): rows for `obra/superpowers`
  (skills library we integrate on top of, not replace) and
  `davila7/claude-code-templates` (registry we consume via `template-broker`,
  not duplicate). Stops the two most-frequent "how is this different from
  X?" questions at the door.

No agent / pipeline behavior changes in this release.

---

## v1.0.106 — 2026-04-24

### Added — prose-style rules for agent output

Adopted a 7-rule subset from [yzhao062/agent-style](https://github.com/yzhao062/agent-style)
v0.3.1 (CC-BY-4.0 / MIT) to raise the bar on agent-written prose:
audit findings, CSO reports, QA reports, CHANGELOG entries.

- **New:** `skills/great_cto/prose-style.md` — RULE-01 (curse of knowledge),
  RULE-03 (abstract → concrete), RULE-04 (filler words), RULE-05 (dying
  metaphors), RULE-08 (claim calibration), RULE-A (bullet overuse), RULE-H
  (citation discipline — critical). One BAD/GOOD pair per rule; upstream
  carries the full 5-example blocks.
- **New:** `enforcement/prose-deny.txt` — reference-only deny-list (~40
  phrases) covering RULE-04/05/H. Not mechanically loaded; the warn-only
  grep in `agents/qa-engineer.md` inlines a smaller curated pattern.
- **New:** `NOTICE.md` — third-party attribution (CC-BY-4.0 + MIT).
- **Wired in 3 agents** (`security-officer`, `qa-engineer`, `project-auditor`):
  `skills:` frontmatter + one-paragraph "Writing discipline" reminder. QA
  report now runs a warn-only prose grep before emitting DONE — catches
  "in order to", "state-of-the-art", "push the boundaries" and similar
  filler/clichés in agent output without blocking the pipeline.
- **`commands/audit.md`:** finding format pinned — severity + one-line
  evidence with file:line or metric; no adjectives-as-findings.

Not wired in `senior-dev` and `tech-lead`: the skill is loaded via their
SessionStart context when needed; no explicit reminder required (avoiding
the "5 dup reminders" anti-pattern).

---

## v1.0.105 — 2026-04-24

### Fixed (P2) — `great-cto init` scaffolded PROJECT.md that agents couldn't parse

The installer CLI wrote `primary: <archetype>` without the `archetype:` key
agents read. It nested `size:` under `## Team` instead of writing `team-size:`
at root (the key `/rfc` actually greps for), and used a non-existent
`frameworks:` key instead of `compliance:`. Fresh installs scaffolded a
PROJECT.md that silently failed the v1.0.104 tier/guard logic. Fixed: CLI now
writes `archetype:`, `project_size:`, `team-size:` at root, and `compliance:`.

### Fixed (P2) — pre-1.0.104 legacy commands stuck in `~/.claude/commands/`

Users upgrading from < 1.0.104 have unmarked command files the SessionStart
cleanup loop can't touch (it only deletes marked files, for safety). Those
stale commands keep showing up in Claude Code forever. Fixed: `great-cto init`
now runs a one-shot cleanup on upgrade detection — removes files in
`~/.claude/commands/` matching our known legacy names **and** referencing
great_cto **and** lacking the 1.0.104 marker. Hand-written user files with
the same names are preserved (they won't match the great_cto reference test).

---

## v1.0.104 — 2026-04-24

### Fixed (P0) — devops still used v1.0.101 binary `IS_MANDATORY` model

`devops.md` gated pre-deploy on `archetype ∈ {ai-system, commerce, web3, iot-embedded, regulated}`
and required a full `docs/security/CSO-*.md` for any `medium+` project. After
v1.0.102 the tier model explicitly says **baseline tier writes no CSO file**, so
every `medium+` library / web-service / mobile-app / data-platform would **block
at deploy** on "No CSO security report." Fixed: devops now computes the same
effective tier as `security-officer` and accepts the one-line baseline verdict
from `.great_cto/verdicts/security-officer.log` when tier=baseline; CSO file
required only at `standard` / `deep`.

### Fixed (P0) — SessionStart hook deleted user files

The SessionStart hook in `plugin.json` ran `rm -f ~/.claude/commands/{update,status,dora,...}.md`
unconditionally. Command names in that list (`update`, `status`, `dora`) are
generic — if a user had another plugin or a hand-written command with the same
name, great_cto silently deleted it on every session start. Fixed: copied
commands are now tagged with a `<!-- great_cto-managed -->` marker, and the
stale-cleanup loop only removes files that contain that marker.

### Fixed (P1) — `security-gate:` left in TYPE_MAP.md after v1.0.102

v1.0.102 replaced per-type `security-gate: mandatory` overrides with the tier
model but left 20+ stale rows in TYPE_MAP.md. The migration doc said "ignored"
but new types copy-pasted the pattern. Scrubbed all `security-gate:` entries
from TYPE_MAP.md; ARCHETYPES.md example PROJECT.md snippet now shows
`default-tier:` + `tier-override-reason:` instead.

### Fixed (P2) — `/rfc` team-size guard silently bypassed on malformed input

`team-size: many` (or any non-numeric value) was stripped to `""` by
`tr -d '[:alpha:]'`, defaulted to 1, and the guard passed with `1 -lt 10`.
Looked like guard fired correctly but allowed any malformed value through.
Fixed: validate with regex `^[0-9]+$`; warn on malformed input.

### Fixed (P2) — E2E test harness false-positive success on skipped runs

`tests/e2e/run_pipeline.sh --assert-only` with `CLAUDE_CLI_AVAILABLE` unset
printed "✓ all assertions passed" and exited 0, so CI saw green without the
pipeline ever running. Fixed: exits 77 (Autotools SKIPPED convention) when
bootstrap-only. Set `GREAT_CTO_E2E_ALLOW_SKIP=1` to opt back into lenient
behaviour for fixture smoke tests.

### New — additional tier-test coverage

`tests/structural/test_security_tiers.sh` now also asserts that:
- valid waivers emit `SEC_WAIVER: dep=<name> owner=<@x> expires=<date>`
- expired and owner-less waivers emit `WARN_WAIVER_REJECTED: ...`

11 cases total; runs in ~1s.

---

## v1.0.103 — 2026-04-24

### New — Allowlist waiver parser (`.great_cto/security-allowlist.yml`)

v1.0.102 documented the waiver format in `security-tiers.md` but the agent
couldn't read it. Now it can.

`security-officer` parses `.great_cto/security-allowlist.yml` during tier
computation. A waiver suppresses its matching signal only if **all three** are
valid:

- `reason:` non-empty (documented intent)
- `approved-by:` starts with `@` (named owner — not a blank line or "team")
- `expires:` a real ISO date, in the future, ≤ 90 days out

Invalid, expired, or owner-less entries are **rejected** — the signal stays
active and a `WARN_WAIVER_REJECTED` line is logged. Valid suppressions emit
`SEC_WAIVER: <target> owner=<@x> expires=<date>` to the audit log for
traceability.

When every pending `*-dep-introduced` signal is covered by a valid waiver,
the tier is recomputed — a correctly-waived pci-dep signal drops a
web-service back from `standard` to `baseline`.

### New — Structural test `tests/structural/test_security_tiers.sh`

Eight fixture scenarios pinning the tier-computation contract:

- archetype defaults (library→baseline, web3→deep, web-service→baseline)
- signal-driven upgrade (auth-path-changed lifts baseline→standard)
- explicit `default-tier` override
- valid waiver suppresses the upgrade
- expired waiver rejected (stays upgraded)
- waiver missing `@owner` rejected
- waiver for unrelated package doesn't suppress

Runs in ~1s. Mirrors the bash in `agents/security-officer.md` — edits there
should bump this test in lockstep.

### Deferred

- **HTTPS enforcement for greatcto.systems** — cert still provisioning at
  Let's Encrypt (24h SLA from CNAME setup). Will enforce via
  `gh api -X PUT /pages -F https_enforced=true` once state flips from `none`.

---

## v1.0.102 — 2026-04-24

### Changed — Risk-based security tiers replace binary mandatory/conditional gate

The previous `mandatory | conditional | none` model had three systemic holes:

1. **`library → none`** was a supply-chain default. In 2026 npm/PyPI supply
   chain attacks are the #1 vector; zero gate is never right.
2. **"conditional" read as "off by default"** on archetypes that actually own
   the blast radius (web-service with auth, infra with IAM).
3. **Archetype is a proxy for risk, not risk itself** — a web-service handling
   auth for 10M users is more security-critical than a commerce demo, but the
   old model said the opposite.

### New — Three tier model

| Tier | Runs | Time | Skippable? |
|---|---|---|---|
| `baseline` | CVE scan + secret scan + dep freshness | ~2 min | **never** — floor |
| `standard` | baseline + STRIDE threat model + OWASP checklist + compliance map | ~15–25 min | requires explicit waiver with owner + expiry |
| `deep` | standard + penetration-style review + external-dep supply-chain audit + formal dataflow + kill-chain analysis | ~45–90 min | never on deep-tier archetypes |

### New — Signal-driven tier upgrades

`senior-dev` emits `SECURITY_SIGNAL:` lines to `.great_cto/security-signals.log`
when it detects risky changes in the diff. `security-officer` reads these and
upgrades the tier for the pipeline run. Signals only upgrade — never downgrade.

| Signal | Detected on |
|---|---|
| `pci-dep-introduced` | new dep in stripe/plaid/square/braintree/adyen |
| `crypto-dep-introduced` | new dep in jose/jsonwebtoken/bcrypt/argon2/libsodium |
| `auth-path-changed` | file changes in `auth/**`, `iam/**`, `middleware/auth*` |
| `pii-field-added` | migration adds ssn/dob/passport/medical_*/health_* column |
| `iac-perimeter-changed` | Terraform diff touching security_group/iam/public bucket |
| `high-cve-in-dep` | `npm audit` / `pip-audit` / `cargo audit` reports ≥ High |

### Archetype → default tier mapping

| Archetype | Default tier |
|---|---|
| `web3` · `iot-embedded` · `regulated` | **deep** |
| `ai-system` · `commerce` · `infra` | **standard** |
| `web-service` · `mobile-app` · `data-platform` · `library` | **baseline** |

**`library` now runs baseline** (was: no gate). Supply-chain attacks made the
old default indefensible. Two minutes of CVE + secret scan closes the hole.

### New / updated

- **`skills/great_cto/references/security-tiers.md`** — single source of truth for tier model, archetype mapping, signal matrix, waiver rules.
- **`agents/security-officer.md`** — tier-aware execution; baseline runs without CSO report file.
- **`agents/senior-dev.md`** — emits signals during implementation.
- **`/sec status`** — reports current tier + fired signals in every run.
- **`ARCHETYPES.md` / `README.md` / site landing** — tier column replaces binary gate.

### Migration

If PROJECT.md has the old `security-gate: mandatory|conditional|none`, it is
now ignored (tier derives from archetype + signals). Most projects need zero
config change — new defaults are strictly more secure without adding review
burden where it wasn't needed.

To pin a tier explicitly:

```
## Security
default-tier: standard
tier-override-reason: "internal service but handles auth tokens for 10M users"
```

---

## v1.0.101 — 2026-04-24

### Changed — Pareto cut: 22 commands → 15 (7 primary + 8 conditional)

After 100 releases the surface area had drifted past useful. Most of the
extra commands duplicated data that `/inbox` or `/digest` already compute,
or were specialist playbooks that fit naturally under a single security
umbrella.

**Deleted (4 — zero functionality loss):**
- `/triage` — backlog hygiene (duplicates, stale tasks, unowned P0/P1) is
  now a section in `/inbox` that fires only when thresholds trip.
- `/gates` — gate health + drift detection was already in `/inbox`; the
  dedicated command only repeated the same numbers.
- `/dora` — the 4 DORA metrics are already computed and emitted by
  `/digest` on its weekly cadence.
- `/investigate` — use Superpowers' `systematic-debugging` skill, or
  spawn the `l3-support` agent with the question. `/inbox` references
  updated to name the agent directly.

**Merged under `/sec`:**
- `/threat-model` → `/sec threat [arch-slug]`
- `/sbom` → `/sec sbom [version]`
- `/security-incident` → `/sec incident "<desc>"`

`/sec` is now a dispatcher:
```
/sec                         # posture metrics (default = status)
/sec status [days]           # same, explicit
/sec threat [arch-slug]      # STRIDE threat model
/sec sbom [version]          # CycloneDX SBOM
/sec incident "<desc>"       # DORA/GDPR workflow
/sec rotate                  # overdue secret rotations only
```

The three playbook files (threat-model, sbom, security-incident) moved
to `skills/great_cto/playbooks/` — same content, accessed through the
dispatcher. No behaviour change, just one less mental anchor.

**SessionStart hook now cleans up stale commands** from earlier versions
(`~/.claude/commands/{triage,gates,dora,investigate,threat-model,sbom,security-incident,update,status,capture,revisit,board-report}.md`).
Users upgrading from any past version get a clean command list.

### Numbers

| | v1.0.100 | v1.0.101 | Δ |
|---|---|---|---|
| Commands total | 22 | 15 | −32% |
| Commands in README primary | 3 | 3 | — |
| Lines in `commands/` | 6915 | ~5200 | −25% |
| Cognitive load (commands to remember) | 22 | 7 (primary + /sec family) | **−68%** |

### What stayed

All 7 agents, all scheduled automation, gate system, PROJECT.md contract,
LLM router. None of the cuts touched the core pipeline — pure surface-area
reduction.

### Migration

Run `/doctor` after upgrading to confirm old commands are cleaned from
`~/.claude/commands/`. Old muscle memory:

- `/triage` → `/inbox` (hygiene section fires automatically)
- `/gates` → `/inbox` (already shows gate health)
- `/dora` → `/digest`
- `/investigate "<q>"` → spawn `l3-support` with the question
- `/threat-model foo` → `/sec threat foo`
- `/sbom 1.2.3` → `/sec sbom 1.2.3`
- `/security-incident "creds leaked"` → `/sec incident "creds leaked"`

---

## v1.0.100 — 2026-04-24

### Added — LLM router (OpenRouter / Kimi K2) as cost saver

Anthropic tokens are the single largest cost of running great_cto on an
active project. Most agent calls genuinely need Sonnet — architecture, TDD,
security review — but ~20–30% is grunt work (log triage, summarization,
POC smoke tests) that Kimi K2 handles fine at ~5× lower cost.

v1.0.100 adds an optional MCP server `great_cto_llm_router` that exposes a
single tool, `ask_kimi`, to specific agents. Opt-in, zero-config when
disabled, zero external dependencies.

**New files:**
- `mcp-servers/llm-router/server.py` — stdlib-only MCP server (Python 3.9+).
  Implements MCP 2024-11-05 over stdio. Exposes `ask_kimi` + `router_status`.
  Appends usage JSONL to `.great_cto/llm-router-usage.log` for later cost
  reporting. Graceful fallback: if `OPENROUTER_API_KEY` is unset, the tool
  returns a structured `fallback` signal instead of erroring — agents are
  instructed to do the task natively.
- `skills/great_cto/references/llm-router.md` — setup, config, which
  agents use it and when, security caveats, troubleshooting.

**Config (env vars, layered lookup `env > .env.local > ~/.great_cto/secrets.env`):**
- `OPENROUTER_API_KEY` — required to enable
- `GREAT_CTO_ROUTER_MODEL` — default `moonshotai/kimi-k2`; any OpenRouter slug
- `GREAT_CTO_ROUTER_MAX_TOKENS` — default 4096
- `GREAT_CTO_ROUTER_TIMEOUT` — default 60s

**Wired agents:**
- `l3-support` — routine log triage, error clustering, stack-trace
  summarization. P0/P1 reasoning + postmortem writing stay on Claude.
- `senior-dev` — POC mode only: smoke tests and boilerplate scaffolding.
  MVP / production code stays on Claude.
- `qa-engineer` — POC mode only: smoke test generation. Production QA
  stays on Claude.

**Never delegates**: tech-lead, security-officer, devops, /audit. Critical
reasoning stays on native Claude by design.

**Onboarding:**
- `/start` now enforces `.env.local` in `.gitignore`, mentions the router
  as a one-time optional cost saver (with setup hint), and shows router
  status in the confirmation line when active.
- `/doctor` has a new Check 8b that pings OpenRouter `/auth/key` to show
  live quota, verifies `.env.local` is git-ignored, and warns if not.

**Cost reporting:**
- `/digest` reads the usage log and emits an `LLM ROUTER` section with
  calls, tokens, Kimi spend, Sonnet-equivalent cost, and savings.

**Security:**
- `senior-dev` credential-scan updated to recognize OpenRouter key shape
  (`sk-or-v1-[a-f0-9]{32,}`) — blocks accidental commits.
- `.env.local` git-ignore enforced in `/start`, verified in `/doctor`.
- Doc warns against sending PII / secrets through the router.

**Expected savings**: 20–30% on total LLM spend for active projects.
Zero overhead for users who don't configure the key — pipeline is
unchanged.

### Files modified
- `.claude-plugin/plugin.json` — `mcpServers` block added.
- `commands/start.md` — Step 5b (gitignore + optional router setup hint).
- `commands/doctor.md` — Check 8b (router health + key-leak guard).
- `commands/digest.md` — LLM ROUTER cost report.
- `agents/l3-support.md` — `ask_kimi` wired for routine triage.
- `agents/senior-dev.md` — POC-mode delegation + OpenRouter key pattern in
  credential scan.
- `agents/qa-engineer.md` — POC-mode delegation.

### When to skip
- Solo project shipping one feature / week — savings rounding error.
- Strict-compliance env (HIPAA, PCI) without an OpenRouter BAA.
- Offline / air-gapped.

---

## v1.0.99 — 2026-04-24

### Added — POC mode (hypothesis-driven pipeline extension)

CTOs often need to validate a risky assumption before committing to production
rigor — ship a prototype in 3 days, see if users care, keep it or throw it
away. Full SDLC (ARCH → threat-model → SBOM → CSO → QA) is expensive overhead
when the code will be deleted by Friday.

v1.0.99 adds **POC mode**: a lightweight path with forced timebox and
forced ship/pivot/kill decision. Not a parallel pipeline — a mode flag that
agents read and adjust rigor accordingly.

**New commands:**
- `/poc <hypothesis>` — start a POC. Writes `docs/poc/POC-<slug>.md` with
  hypothesis, success criteria, hard timebox (default 7d, max 14d), and
  explicit out-of-scope list. Flips `mode: poc` + `poc_slug:` +
  `poc_expires:` in PROJECT.md.
- `/poc decide` — forced ritual at expiry. Ship / Pivot / Kill.
  Evidence required. Always writes `docs/poc/POC-<slug>-learnings.md`.
- `/poc extend <days>` — max 1×7d. Burns reputation.
- `/promote` — all-or-nothing gate from POC → production. Runs full
  ARCH, threat-model (if archetype requires), SBOM, cost-model, security
  CSO, QA. Flips mode back. Partial promotion is prevented by design.

**Agent skip matrix (see `skills/great_cto/references/poc-mode.md`):**
- **tech-lead**: 1-pager ARCH (Problem / Decision / Risks only). Skip
  full Requirements / Non-functional / Alternatives sections.
- **senior-dev**: one smoke test per hypothesis criterion. Skip
  coverage target, skip edge-case tests. **Credential-scan still runs.**
- **qa-engineer**: smoke tests only. Binary PASS / FAIL verdict. QA
  report headed "POC QA — not production QA".
- **security-officer**: skip CSO entirely. Run credential-scan only.
  One-line verdict.
- **devops**: refuse production deploys. Preview / dev / local /
  ephemeral staging only.

**One rule that never relaxes:** credential-scan. In all modes, agents
grep the diff for `sk-[A-Z]`, `AKIA[0-9A-Z]{16}`,
`-----BEGIN * PRIVATE KEY-----`, `.env` tokens. Match → abort and
move to `.env.local` / env var.

**/inbox banner:** when `mode=poc`, /inbox emits POC_ACTIVE /
POC_URGENT (≤2 days) / POC_EXPIRED signals at the top.

**Principles:**
1. One POC at a time (enforced via PROJECT.md flag).
2. Hard expiry — no silent slippage.
3. Observable success criteria (not "users like it").
4. Forced decision at expiry — no limbo.
5. Learnings always captured, even on kill.
6. Promotion requires full rigor — no sneak-through.

### Files added

- `commands/poc.md`
- `commands/promote.md`
- `skills/great_cto/references/poc-mode.md`

### Files modified

- `commands/inbox.md` — POC banner at top of Gather Data.
- `agents/tech-lead.md` — MODE read + POC-mode behaviour.
- `agents/senior-dev.md` — MODE read + POC-mode behaviour + credential-scan exception.
- `agents/qa-engineer.md` — MODE read + POC-mode behaviour.
- `agents/security-officer.md` — MODE read + POC-mode behaviour.
- `agents/devops.md` — MODE read + POC-mode behaviour.
- `.claude-plugin/plugin.json` — CMD loop adds `poc promote`.

### When NOT to use POC mode

- Anything that touches money, PII, or production user data.
- Core architecture decisions (use ADR + full ARCH instead).
- "I just want to skip the boring parts" — that's production code
  with less rigor, not a POC. /promote requires full audit, not
  retroactive rubber-stamp.

---

## v1.0.98 — 2026-04-24

### Added — Cross-doc link rot lint (L1–L4)

Docs reference each other — ARCH → ADR, PM → ARCH, TM → ARCH,
RELEASE → SBOM. Links rot silently when files are renamed or
deleted. Inspired by the ghost-link lint pattern from
cablate/llm-atomic-wiki (Karpathy-style atomic wiki, but the idea
we borrowed is the cheap deterministic lint, not the compile
pipeline).

- **New rules L1–L4** in `skills/great_cto/references/anti-patterns.md`:
  - **L1** — relative markdown link to a non-existent `.md` file
  - **L2** — inline artefact reference (`ARCH-<slug>.md`,
    `PM-<date>.md`, `ADR-NNNN.md`, etc.) without a matching file
  - **L3** — orphan ADR / RFC (no incoming links from any other doc)
  - **L4** — expired temporal markers (`current version`, `latest
    release`, `TBD`) in docs older than 90 days
- **`/audit lint` extended** — scans all `docs/**/*.md` against
  L1–L4. Skips fenced code blocks and template placeholders
  (`<slug>`, `<feature>`, `NNNN`, `foo/bar/baz`) to avoid false
  positives on example snippets.
- **Waiver syntax respected** — add
  `<!-- anti-pattern-waiver: L2 reason:<why> -->` on the offending
  line to suppress.

### Why
Link rot is the definitive boring problem. A deterministic grep-level
scan finds 90% of it in seconds without an LLM in the loop. Anything
subtler (semantic contradictions across docs, drift in claims) stays
in the "too expensive for every run" bucket — that's what the
security-officer / project-auditor agents are for.

### Non-goals
- Not a semantic linter (doesn't read meaning, only names and links)
- Not a docs-system generator (we don't compile a wiki from scratch —
  we trust the folder layout the pipeline already produces)
- Not a replacement for human review — findings are advisory

---

## v1.0.97 — 2026-04-24

### Added — Anti-pattern blocklist + `/audit lint`

Negative rules are sharper than positive guidance. This release adds a
curated blocklist of shapes engineering artefacts take when they're
theatrical rather than useful, plus a mechanical lint pass that detects
them. Inspired by the anti-cliché blocklist pattern
(ConardLi/web-design-skill), applied here to architecture, threat
models, SBOMs, postmortems, and gate verdicts.

- **`skills/great_cto/references/anti-patterns.md`** — 5 categories,
  28 rules with grep-able **tells** and "do instead" guidance:
  - **ARCH** (A1–A8): no `## Non-goals`, marketing adjectives
    (scalable/reliable/performant) without numbers, unnamed
    infrastructure ("a database"), deferred observability, one-line
    `## Security`, greenfield rewrites without migration
  - **Threat models** (T1–T6): mitigation = "input validation" alone,
    accepted risks without owner+expiry, missing dataflow, STRIDE
    boilerplate left unchanged
  - **SBOM** (S1–S4): <5 components (tool didn't run), missing
    integrity hashes, unpinned versions
  - **Postmortems** (P1–P6): root cause = "human error", action items
    without owner+date, same lessons as prior PMs, skipped 5-whys,
    PM-SEC without notification log
  - **Gate verdicts** (G1–G4): PASS without evidence, batch
    rubber-stamping (3+ verdicts in 60s), self-approval
- **`/audit lint`** — scans all artefacts against the blocklist,
  reports findings with rule ID + file:line + offending snippet.
  Advisory, not blocking. Respects waivers via
  `<!-- anti-pattern-waiver: <rule-id> reason:<why> -->`.
- **Agent prompts reference the blocklist** — `tech-lead` (when
  writing ARCH), `commands/threat-model` (when writing TM),
  `l3-support` (when writing PMs) now cite the relevant rule range
  inline so authors avoid the patterns at drafting time, not at
  review time.

### Why
One well-placed "never" beats ten "try to"s. Positive guidance
("write good architecture") lets mediocre docs through; negative
constraints with detectable tells stop specific failure modes. The
cheap win is that most of these patterns are **grep-detectable** — so
a linter catches them without a model-in-the-loop review.

### Non-goals
- Not a style guide (no prose quality opinions)
- Not a code linter (artefact-level only)
- Not a gate blocker (findings are advisory; waive if intentional)

---

## v1.0.96 — 2026-04-24 🛡

### Added — `/sec` (five security metrics, DORA-style)

DORA gives us four delivery-health numbers. Nothing equivalent existed
for security posture trend. This release adds a fifth number-set —
**five metrics computed entirely from artefacts great_cto already
produces**, no external scanners required, no new telemetry. They
trend the same way DORA metrics do: up-and-right or down-and-right.

- **`/sec [period_days]`** (default 30) — computes the snapshot:
  - **CVE MTTR** — median days from public advisory to our resolution
    in the window. Healthy < 14d; critical < 7d. Source: append-only
    `docs/cve-log.md`.
  - **Dependency freshness** — % of direct deps whose latest release
    is ≤ 180 days old. Healthy ≥ 70%. Source: latest `SBOM-*.json` +
    registry timestamp cache (`.great_cto/dep-freshness-cache.jsonl`).
  - **Threat-model coverage** — % of ARCH docs in window that have a
    `## Security` section AND a matching `TM-<slug>.md`. Healthy ≥ 90%
    for security-critical archetypes (ai-system / commerce / web3 /
    iot-embedded / regulated / fintech).
  - **Pentest burn-down** — severity-weighted `open / (open + closed)`
    ratio from `docs/security/PENTEST-*.md` finding tables. Trended,
    not alerted — slow burn-down is a team-culture conversation.
  - **Secret rotation overdue** — count of secrets past `rotation_due`
    in `.great_cto/secrets.md`. The only binary metric in the set.
- **`skills/great_cto/references/sec-metrics.md`** — explains why
  these five, why not SAST counts / coverage / bug-bounty intake,
  and documents gaming guards (finding reopen rate, selective dep
  updates on low-import crates).
- **`/inbox` signals** — four new triggers fire when thresholds trip:
  `SEC_CVE_ALERT` (≥1 critical CVE open > 14d), `SEC_ROTATION` (any
  secret overdue), `SEC_TM_GAP` (< 60% TM coverage on
  security-critical archetypes), `SEC_FRESHNESS` (reserved for when
  freshness cache lands). Pentest burn-down is intentionally
  **not** alerted.
- **`.great_cto/sec-baseline.log`** — append-only snapshot history,
  same pattern as `.great_cto/perf-baseline.log`. Used by `/digest`
  for weekly security trend.

### Why
**CVE MTTR** is what a CISO asks about first. **Freshness** is the
leading indicator; MTTR is lagging. **TM coverage** is the proxy for
"is the team doing design-time security" (SSDF PW.1). **Pentest
burn-down** tells you whether the team treats findings as real work
or theatre. **Rotation overdue** is the binary one — you either did
or you didn't. Five numbers, one snapshot, no new infrastructure.

### Next
Dependency-freshness cache populator — currently `/sec` reports `-`
when the cache is absent. A cron-able fetcher that warms
`.great_cto/dep-freshness-cache.jsonl` from npm / PyPI / crates.io
closes the last data gap.

---

## v1.0.95 — 2026-04-24 🛡

### Added — `/security-incident` (DORA Art. 17-23 workflow)

Security incidents have different mechanics than ops incidents:
regulatory clocks start at detection, the classification axes are
C/I/A rather than P0/P1/P2, and the paper-trail requirements are
larger by an order of magnitude. v1.0.94 added the **preventive**
side of secure SDLC (threat models, SBOMs). This release adds the
**response** side.

- **`/security-incident "<description>"`** — walks the operator from
  detection to sign-off. Classifies C/I/A impact + DORA class (major
  / significant / non-significant). Computes notification deadlines
  from T+0 (DORA 24h / 72h / 1 month; GDPR Art. 33 72h). Drafts
  `PM-SEC-<id>.md` with a separate template (meta, timeline,
  evidence, scope assessment, notification log, regulatory analysis,
  Agent Verdict Audit). Generates **drafts** of DPA / competent-
  authority / customer notifications — never sends them. Regulatory
  filing stays a human legal act, forever out of scope for this tool.
- **PM-SEC-*.md template** — separate from ops PMs. Fields include
  Classification block (C/I/A + DORA class + affected subjects),
  Evidence (attach, don't paraphrase), Scope assessment with
  confidence level, Notification log (every external comm logged by
  timestamp + recipient), Regulatory analysis (GDPR 33/34, DORA 19,
  PCI DSS, HIPAA if applicable), and the same Agent Verdict Audit
  pattern used in ops PMs — applied to security-officer, threat
  model (tech-lead/TM), QA, red team, and SBOM review.
- **`l3-support` routes security events** before ops triage. A new
  "Security classification gate" step (3b) lists seven signals that
  indicate a security event (auth bypass, data exfiltration,
  credential exposure, etc.) and hands off to `/security-incident`
  immediately. Combined events (compromised service that is also
  DOWN) run `/security-incident` for the regulatory clock, then
  continue ops triage for service restoration.

### Principles baked into the workflow

- **Speed first, paperwork second.** First 60 min of any incident is
  containment, not classification. The command is used once
  containment is underway.
- **Never auto-notify.** Every notification is a legal act; the
  command drafts, a human reviews, a human sends.
- **Preserve evidence.** Every log query, screenshot, and timestamp
  goes into the PM. No paraphrasing of logs.
- **Classify before escalating.** Wrong class costs more than a
  30-minute delay in notification.

### Commands catalogue is now 18

Added to the CMD loop: `security-incident`. Full list: `start audit
inbox digest review ownership oncall rfc release triage doctor dora
burn gates cost investigate threat-model sbom security-incident`.

### Next

- v1.0.96 — `/sec` security-DORA metrics (CVE-MTTR, dep freshness,
  % features with threat model, pentest burn-down, secret rotation)
  + signals in `/inbox`.

---

## v1.0.94 — 2026-04-24 🛡

### Added — Secure SDLC foundation (NIST SSDF + SLSA L1 + DORA Art. 28)

Security was not missing from great_cto — it was diffused across agents
with no authoritative mapping. v1.0.94 introduces the **Secure SDLC
layer**: one reference that says "here's what practice X looks like in
this framework, and here's the great_cto component that implements it."
No new certification claims, no new telemetry — just honest scaffolding
that an auditor or CTO can follow.

Scope of this release is deliberately narrow: **threat modeling +
supply chain + third-party risk**. These are the three gaps most
external audits of engineering-process frameworks flag first.

- **`skills/great_cto/references/secure-sdlc.md`** — authoritative
  mapping of great_cto components to NIST SSDF (SP 800-218), SLSA
  (v1.0), and EU DORA (Reg. 2022/2554). Includes explicit
  out-of-scope declarations so auditors can see what great_cto does
  *not* promise.
- **`/threat-model [slug]`** — generates a STRIDE-based threat model
  from the latest (or named) ARCH doc. Writes
  `docs/threat-models/TM-<slug>.md` with dataflow, asset table,
  threat matrix, mitigation map, and accepted risks. Auto-appends a
  `## Security` section to the ARCH doc pointing at the TM. Closes
  SSDF practice PW.1 (design for security).
- **`/sbom [version]`** — generates a CycloneDX 1.5 SBOM for the
  current release. Uses ecosystem-native tools when available
  (`npm sbom`, `cyclonedx-py`, `cyclonedx-gomod`, `cargo-cyclonedx`),
  falls back to a minimal hand-built SBOM when they aren't. Writes
  `docs/releases/SBOM-<version>.json` and cross-references it in the
  RELEASE doc. Closes SSDF PS.2 / SLSA L1.
- **`devops` agent invokes `/sbom` on every production deploy**
  (step 9c), before generating the CHANGELOG entry. If CI already
  emits a signed SBOM (cosign + OIDC → SLSA L2), the agent references
  the CI artefact instead of generating locally.
- **`tech-lead` enforces `## Security` section** in every ARCH-*.md
  for archetypes `ai-system`, `commerce`, `web3`, `iot-embedded`,
  `regulated`, `fintech`. Missing section blocks the ARCH gate.
- **VENDOR schema extended** with DORA Art. 28 fields: ICT-3P
  register flag, critical-or-important-function classification, data
  categories shared, data location, sub-processors, concentration
  risk, and a mandatory **exit strategy** section (trigger, migration
  path, alternatives, estimated time, data portability, tested?).
  Fields are marked "n/a" for non-financial projects so the structure
  survives a future audit without forcing EU-regulatory ceremony on
  every team.

### What this does *not* do

`secure-sdlc.md` is explicit about the scope limits:

- great_cto does not claim certification readiness for any framework.
- Regulatory notifications (DORA Art. 19, GDPR Art. 33) remain legal
  acts that a human must perform — out of scope.
- SLSA L3+ requires external build infrastructure and is out of scope;
  L1-L2 is achievable with the patterns this release establishes.
- Dedicated security teams for regulated-sector entities are still
  needed for entities in scope for DORA proper.

### Commands catalogue is now 17

Added to the CMD loop: `threat-model`, `sbom`. Full list:
`start audit inbox digest review ownership oncall rfc release triage doctor dora burn gates cost investigate threat-model sbom`

### Next (not in this release)

- v1.0.95 — `/security-incident` with DORA Art. 17-23 notification
  timeline (24h → 72h → 1 month) + `PM-SEC-*.md` template.
- v1.0.96 — `/sec` command: security DORA (CVE-MTTR, dependency
  freshness, % features with threat model, pentest-findings burn-down,
  secret-rotation overdue count).

---

## v1.0.93 — 2026-04-24

### Added — `/investigate` (AI SRE command)

Inspired by Gouthamve Venkatasubramanyam's _"I built an AI SRE in 60
minutes"_ (2024). The core observation: an investigation agent is
useless on day one and invaluable after five incidents — because
pattern recognition compounds. The knowledge base, not the model, is
the moat.

great_cto already produces that knowledge base (postmortems,
crystallised lessons, DORA baseline) — it was missing the command that
reads it.

- **`/investigate "<alert>"`** — given an alert description, loads
  prior postmortems, lessons, the curated pattern library, recent
  deploys, active risks, and the last 48h of commits, then produces
  **three ranked hypotheses** with the cheapest diagnostic for each.
  Ranks by `likelihood × cheapness_of_test`, not by "interestingness."
  Never writes fixes — hands off to `l3-support` or `senior-dev` with
  a concrete proof plan.
- **`skills/great_cto/references/incident-patterns.md`** — curated
  pattern library. Append-only. Format: `P-<num>` with `Tell`,
  `Hypothesis`, `Confirm with`, `Fix`, `Seen in`, `Applies to`.
  `l3-support` adds entries after each postmortem where the root cause
  generalises beyond the specific service.
- **Wired into `/inbox`.** BURN_ALERT and DORA_TRIGGER now both suggest
  `/investigate` as the next step, so an on-call engineer can go from
  "something's wrong" to "three ranked hypotheses" in one command.
- **`l3-support` pattern-extraction step** — after each PM, the agent
  computes the next `P-<num>` and prompts whether to append a new
  entry. Skipped for one-off business-logic bugs.

### Why now

The five-command health dashboard (`/dora /burn /gates /cost`) answers
"is something wrong?" — it did not answer "what's wrong and what should
I check first?" `/investigate` closes that gap using artefacts we were
already producing. No new infrastructure, no new integrations.

---

## v1.0.92 — 2026-04-24

### Added — Deployment Rework Rate (5th DORA metric, 2024)

The classic four DORA metrics measure **what went out and how reliably** —
they don't tell you whether a deploy delivered value or just cleaned up
yesterday's mess. A team doing ten deploys a week, six of them hotfixes,
looks great on DF and MTTR but is burning capacity. The 2024 DORA report
flagged Rework Rate as the single best predictor of "feels fast but isn't
shipping." great_cto now tracks it.

- **New `kind` column in `.great_cto/deploys.log`** — `devops` agent tags
  each deploy as `feature` / `hotfix` / `rollback` / `patch`. Branch-name
  heuristic (`hotfix/*`, `fix/*`) + revert-commit detection picks the
  right label automatically; legacy rows without `kind` are treated as
  `feature` for backwards compatibility.
- **`/dora` reports Rework Rate** — 5th line in the snapshot, with delta
  vs previous window and verdict marker. Elite threshold: < 10%.
- **Rework signal in `/inbox`** — fires when 7-day Rework Rate > 10% and
  there are ≥3 deploys in the window (to avoid noise from tiny samples).
- **CFR thresholds tightened** per 2024 DORA: elite < 5%, high 5–15%,
  concerning > 15%. `/inbox` now emits `level=warn` at 5–15% and
  `level=alert` at > 15%, so growing teams see the signal before it's
  already a fire.

### Added — Gaming guards in `/dora`

Metrics become lies when teams optimize the **number** instead of the
process. `/dora` now runs two automated anti-manipulation checks after
computing the snapshot:

- **Guard 1**: DF and Rework both rising > 10% — flags possible empty /
  technical deploys being counted to inflate DF.
- **Guard 2**: CFR dropped > 30% in a single window — flags possible
  incident-definition narrowing.

Two more manipulations (task fragmentation, rework hidden in features)
aren't mechanically detectable but are documented for tech-lead in
`skills/great_cto/references/dora.md` with detection heuristics.

### Baseline schema

`.great_cto/dora-baseline.log` gained a `rework_rate` column. Existing
baselines stay readable (extra column at the end, ignored by older
tooling).

---

## v1.0.91 — 2026-04-24 🛡

### Trust-signal pass — addressing external audit findings

A pass over the parts of the repo that shape first impressions for new
users and potential contributors. No behavioural changes — just trust
signals and honesty.

- **`SECURITY.md` rewritten.** Replaced the default GitHub template
  placeholder with a real policy: threat surface, supported-versions
  table, private reporting channel (email + GitHub security advisory),
  response SLA (72h ack / 7d triage / 30d fix for High/Critical),
  coordinated disclosure window, and a threat model distinguishing
  out-of-scope (LLM-layer issues) from in-scope (hook bypass,
  over-broad agent `tools:` frontmatter, shell injection in command
  skills, CLI installer bugs).
- **Versioning unified.** `packages/cli/package.json` was drifting at
  `0.1.4` while the plugin was at `1.0.90`, creating ambiguity about
  what's versioned. CLI and plugin now ship on the same track.
  `scripts/bump-version.sh` updates both in lockstep going forward.
- **Economic claims softened in README.** The old "$400/yr vs $1.07M/yr"
  framing replaced by an honest statement: great_cto is process, not a
  team, and the numbers are indicative Anthropic-API spend (varies with
  context size and model).
- **Limitations & non-goals section added to README.** Explicit list of
  what great_cto does *not* do: it's not an IDE, not a CI/CD system,
  not a secrets manager, not deterministic, and not audited against any
  compliance framework. Archetype scaffolds are starting points, not
  certifications.

---

## v1.0.90 — 2026-04-21

### Added — Cost & capacity (the third axis after reliability and delivery)

A feature that ships on time with 99.99% uptime but doubles the cloud
bill per 1k users is still a failed feature. Cost is a silent SLO — no
pager fires when you cross a threshold, so the discipline has to come
from the release process itself.

- **`/cost [days]`** — monthly run-rate (aggregated across services),
  cost-per-deploy, WoW/MoM delta, top movers (≥20% change MoM), and
  headroom vs `monthly-budget` in PROJECT.md. Flags cost-added spikes,
  near-budget conditions, and rising cost-per-deploy.
- **Devops appends cost estimates automatically** to
  `.great_cto/cost-history.log` after every production deploy, pulled
  from the latest ARCH doc's "Total estimated addition" line.
  Structured format: `ISO8601 | service | estimated | actual | source |
  feature`. Actuals fill in via monthly cloud-console reconcile (15 min
  per month — see `cost-discipline.md`).
- **Cost alert in `/inbox`.** Fires on run-rate ≥ `budget-alert-threshold`
  (default 80%) or on any service +30% MoM spike. Points at `/cost` for
  the full breakdown and action items.
- **Budget config in PROJECT.md.** Two optional fields —
  `monthly-budget: <usd>` and `budget-alert-threshold: <pct>`. Omit
  both to disable headroom signals (estimate-only mode still works).
- **`skills/great_cto/references/cost-discipline.md`** — why cost is an
  engineering signal, how to run the monthly reconcile, anti-patterns
  to refuse ("optimize later", "reserved instances will fix it",
  "ignore the one-off"), and workflows for top-mover and near-budget
  alerts.

With this release, `/dora` + `/burn` + `/gates` + `/cost` cover the four
CTO health axes: delivery, reliability, process, economics — each
visible at-a-glance from `/inbox` and drill-down on demand.

`.great_cto/cost-history.log` is gitignored (may contain contract values).

---

## v1.0.89 — 2026-04-20

### Added — Quality gate health (catch gates that have started rubber-stamping)

A gate that always passes is not a gate — it's theater. The only way to
know whether a gate is real is to compare its verdicts against subsequent
reality (incidents, postmortem agent-verdict audits). This release makes
that comparison a single command.

- **`/gates [days]`** — per-agent pass rate, drift vs prior window,
  time-to-verdict, and effectiveness (% of audited PMs where the agent's
  PASS was actually correct). Healthy window: 70–90% pass rate. Outside
  that, flag. Drift +10pp upward while already at >85% triggers
  "rubber-stamping?" warning. Effectiveness <70% triggers "missed too
  many incidents."
- **Two verdict log formats supported.** Per-agent files
  (`qa-engineer.log`, space-delimited) and per-day files
  (`2026-04-20.log`, pipe-delimited) are both parsed automatically.
- **Postmortem audit cross-reference.** `/gates` parses the
  "Agent Verdict Audit" tables from every PM in the window and counts
  per-agent "Correct? = no" rows to compute effectiveness.
- **Gate drift signal in `/inbox`.** Cheap version of the same check
  surfaces a warning when any agent crosses the rubber-stamping
  threshold, with a pointer to `/gates` for the breakdown.
- **`skills/great_cto/references/gate-health.md`** — calibration table,
  the 70–90% window rationale, anti-patterns to refuse ("disable noisy
  gate", "auto-approve when busy"), and workflows for both
  rubber-stamping and low-effectiveness flags.

No new data input required — `/gates` reads the existing
`.great_cto/verdicts/*.log` and `docs/postmortems/PM-*.md` artefacts.
Effectiveness scoring activates as soon as your PMs include the
"Agent Verdict Audit" section.

---

## v1.0.88 — 2026-04-21

### Added — SLO burn rate (catch exhaustion before it happens)

A point-in-time SLO check tells you "78% consumed" but not whether you got
there gradually (fine) or in the last 6 hours (not fine). Burn rate is
the derivative — and multi-window burn rate catches both fast incidents
and slow regressions days before the budget runs out.

- **`/burn [service]`** — multi-window burn rate (24h / 7d / 30d) per
  service+SLI, with projected exhaustion in days at the current 7d pace.
  Thresholds match the Google SRE multi-window pattern: 14.4× normal in
  24h pages on-call, 6× in 7d files a ticket, 1× in 30d goes on the
  review pile.
- **Burn alert in `/inbox`.** When any service crosses fast (24h) or
  slow (7d) burn threshold, `/inbox` surfaces it with the multiplier
  and a pointer to `/burn` for the breakdown — proactive rather than
  reactive.
- **`/digest` writes a snapshot per run** to `.great_cto/slo-burn-history.log`.
  Burn rate needs at least 2 snapshots; weekly digest cadence gives 7d
  resolution. Run `/digest 1` daily to make 24h burn meaningful.
- **`skills/great_cto/references/burn-rate.md`** — multi-window pattern,
  the four numbers and what they mean, anti-patterns to refuse
  ("just lower the SLO" is not the answer), and the workflow split
  between fast-burn (incident response) and slow-burn (planning).

`.great_cto/slo-burn-history.log` is gitignored. Snapshots are derived
from `slo-budget-current.md` so no new data input is required — only
the cadence at which `/digest` runs determines burn-rate resolution.

---

## v1.0.87 — 2026-04-21

### Added — DORA aggregator (the loop, not the dashboard)

Four numbers that tell you whether the engineering system is healthy,
computed from artefacts you already produce.

- **`/dora [period]`** — snapshot of Deployment Frequency, Lead Time for
  Changes, Change Failure Rate, and MTTR for the last N days (default 30),
  with week-over-week deltas. Reads `.great_cto/deploys.log`,
  `docs/postmortems/PM-*.md`, and `bd` closed tasks; no new services.
- **CFR signal in `/inbox`.** When 7-day CFR exceeds 15%, `/inbox` flags
  it with the latest 3 incidents — so the metric becomes an actionable
  prompt in the daily workflow, not a dashboard nobody opens.
- **Weekly DORA snapshot in `/digest`.** Existing DORA section now reads
  `deploys.log` first (fallback: `perf-baseline.log`), so the weekly
  Monday digest carries real numbers instead of placeholders.
- **`devops` writes a single line per production deploy** to
  `.great_cto/deploys.log` (timestamp, service, version, status,
  MR-merge-time). This is the only new data input the feature requires.
- **`skills/great_cto/references/dora.md`** — reference for `tech-lead`
  and `qa-engineer`. Encodes the Ostrovok pattern: when CFR rises, look
  at Lead Time first; "stricter QA" is rarely the right answer.

`.great_cto/dora-baseline.log` accumulates one row per `/dora` run for
local trend-over-time without re-computation. Gitignored.

---

## v1.0.86 — 2026-04-20

### Added — ADR lifecycle + incident lesson crystallization

Decisions don't rot silently anymore, and incidents leave durable traces
that tech-lead reads on every new feature.

- **ADR review candidates.** `/doctor` now surfaces decisions older than
  180 days with zero references in the code (`src/`, `app/`, `lib/`, …).
  Old ADRs that still drive live code stay quiet; truly forgotten ones
  get flagged as candidates to revisit or mark superseded.
- **Supersession tracked both ways.** `/rfc new` accepts an optional
  `Supersedes: ADR-003, ADR-007` header. On `/rfc close accept`, the
  listed ADRs are auto-marked `Status: SUPERSEDED` with a reciprocal
  `Superseded-by:` link back to the new RFC/ADR. `/doctor --fix` repairs
  any one-way links.
- **Incidents crystallize into lessons.** When `l3-support` finishes a
  P0 postmortem, it appends a single actionable line to
  `.great_cto/lessons.md` (date | service | root cause | prevention).
  `tech-lead` now reads this log at the start of every new feature —
  recurring failure patterns become architecture constraints before the
  next ship, not after the next incident.

---

## v1.0.85 — 2026-04-20

### Removed

- **11 orphan files** across `docs/qa-reports/`, `docs/demo/`, `docs/plans/`,
  and `CONTRIBUTING.md`. These were historical artefacts from closed releases
  (QA reports for v1.0.2, planning docs for shipped features, an unused demo
  gif) that no command, README link, or skill referenced. Repo is ~1500 lines
  lighter and easier to navigate.

---

## v1.0.84 — 2026-04-20

### Fixed

- **Stale gates now surface on macOS.** `/inbox` and the great_cto skill no
  longer silently report every gate as fresh under zsh — the age calculation
  correctly detects gates older than 24h regardless of shell.
- **Force-push protection closed a gap.** The PreToolUse guard now blocks
  `git push --force-with-lease` (previously only `--force` / `-f` were caught),
  matching the policy intent.
- **Write audit covers bulk edits.** Multi-file edits are now logged to
  `permission-denied.log` the same way single-file writes are.

### Added

- **`scripts/bump-version.sh`** — single command to bump `plugin.json` and
  sync the README badge + "actively maintained" line, removing the drift
  that let version references go out of sync in earlier releases.

---

## v1.0.83 — 2026-04-20

### Added

- **`/doctor --fix`** — one-shot remediation. Creates missing artefact
  directories (`docs/audit`, `docs/security`, `.great_cto/verdicts`, …),
  regenerates `.great_cto/env.sh`, migrates old PROJECT.md to the v1.0.76
  format with stub `Stack:`/`Type:` lines, rotates stale
  `permission-denied.log`, initialises `bd` if absent.
- **`docs/validation/README.md`** — documents the three-tier test strategy
  (L1 structural, L2 e2e assert-only, L3 manual dogfood) and when to run each.
- **`docs/scheduling/README.md`** — how to set up recurring `/digest` (Mon
  09:00) and `/audit` (monthly) via Claude scheduler, cron, or Actions.
- **`docs/postmortem/SILENT-PIPELINE-FAILURE.md`** — write-up of the
  six-month-silent-failure that motivated v1.0.78–v1.0.82 hardening.

### Changed

- README now lists `/doctor` in the advanced commands table.

---

## v1.0.82 — 2026-04-20

### Added — two more e2e fixtures

Extended the test harness with two new fixtures that cover the most common archetypes and reproduce known failure modes:

- **`tests/fixtures/trading-system-rust/`** — reproduces the <private-project> failure mode: committed API keys (`render.yaml` with `OPENROUTER_API_KEY`, `GEMINI_API_KEY`), `unwrap()` panic on hot path, no kill-switch, no risk tests, outdated `reqwest 0.11`. Manifest asserts `security-officer | BLOCKED` verdict — validates the v1.0.79 hard rule (P0 + SEC label must BLOCK).
- **`tests/fixtures/web-fullstack-node/`** — covers `web-fullstack` primary / `web-service` archetype. Next.js 13 with unauthenticated `/api/admin`, committed `.env.local`, green-lie tests (`echo no tests && exit 0`). Manifest asserts CSO BLOCKs on unauthenticated admin endpoint.

### Changed

- `tests/e2e/assert_manifest.py`: added optional `after_cso` block processing and `cso_ran()` detection; bootstrap existence check now accepts `pyproject.toml | package.json | Cargo.toml | go.mod | pom.xml` (previously Python-only).
- `.github/workflows/plugin-ci.yml`: e2e matrix expanded from `[cli-tool-python]` to all three fixtures.

---

## v1.0.81 — 2026-04-20

### Fixed — zsh compatibility in /doctor and SessionStart

Dogfooding `/doctor` on <private-project> on macOS (default shell: zsh) surfaced two shell incompatibilities that produced noisy stderr output and broken branches:

1. **`grep -c PATTERN 2>/dev/null || echo 0`** — when grep finds zero matches it still prints `0` AND exits 1, so `|| echo 0` runs, producing `"0\n0"`. The captured value then fails `[ "$X" -gt 0 ]` integer tests with "integer expression expected".
2. **`ls docs/audit/AUDIT-*.md 2>/dev/null`** — zsh without `setopt nomatch` prints "no matches found" to stderr *before* the command runs, so `2>/dev/null` inside the command can't suppress it.

**Fixes:**

- `commands/doctor.md`: replaced `|| echo 0` with `VAR=${VAR:-0}` guard; replaced `ls PATTERN` with `find <dir> -maxdepth 1 -name <pat>` in all artefact and verdict-log lookups.
- `.claude-plugin/plugin.json` SessionStart hook: same two fixes in the inline P0 banner + audit-staleness detection.

**Dogfood result on <private-project>** (previously failing, now clean):
```
✓ PROJECT.md present, old format (no Stack:/Type: — will migrate)
✗ 6/6 pipeline phases — no artefacts ever written
17 Beads open, 1 in_progress, P0 SEC (leaked API keys) pinpointed
0 verdicts, 0 permission denials
```

---

## v1.0.80 — 2026-04-20

### Added — Test harness foundation

Until now, the only way to test the plugin was "run /audit on a real project and eyeball the output". Slow, non-reproducible, hides silent failures. v1.0.80 introduces three layers of automated tests.

**Layers:**

- **Structural** — `tests/structural/validate.py` verifies `plugin.json` is valid semver JSON with required keys; every `commands/*.md` and `agents/*.md` has a parseable YAML frontmatter with required fields; the SessionStart CMD-copy loop references only files that exist (and vice versa — no orphan commands); `TYPE_MAP.md` has well-formed rows with backticked slugs. Fast (< 1s). Catches contract drift before any runtime.
- **E2E harness** — `tests/e2e/run_pipeline.sh <fixture>` copies a fixture to a tmpdir, `git init`s it, optionally invokes `claude -p "/audit"` when `CLAUDE_CLI_AVAILABLE=1`, then runs `assert_manifest.py` against the fixture's `expected/manifest.json`. Supports `--assert-only` for CI runs without the Claude CLI.
- **Fixtures** — `tests/fixtures/<name>/` each carry deliberately seeded problems an agent should detect, plus a golden `expected/manifest.json` describing the required post-audit state (artefact paths, PROJECT.md format lines, verdict-log patterns, Beads coverage topics, min/max issue counts).

**First fixture:** `cli-tool-python` — 6 seeded problems (committed fake token, CVE-2023-32681 in pinned requests, bare except, missing tests, TODO on entry point, type detection). Small enough to iterate on quickly.

**CI:** `.github/workflows/plugin-ci.yml` runs structural + e2e-assert-only on every push/PR that touches `commands/`, `agents/`, `skills/`, `.claude-plugin/`, or `tests/`. The full e2e path (actual `/audit` via `claude -p`) is wired but gated on `CLAUDE_CLI_AVAILABLE=1` and will run nightly once the Anthropic key is configured as a GitHub secret.

**Why this matters: the v1.0.79 observability work only helps if someone looks. CI with real fixtures turns "did the pipeline write its artefacts" from a human check into an automated gate.**

Next fixtures (v1.0.81): `web-fullstack-node`, `trading-system-rust`.

---

## v1.0.79 — 2026-04-20

### Added — Observability foundation

The audit of great_cto's own behaviour on real projects (<private-project>, <private-project>) revealed a systemic failure mode: **agents run, then fail silently**. Beyond PROJECT.md and Beads, no pipeline artefacts ever landed on disk — no audit reports, no ARCH docs, no QA reports, no CSO reports. Silent Write/Bash denials (v1.0.78 diagnosed the cause — plan mode inheritance) produced partial work without alerting the user.

v1.0.79 makes failure visible.

**New:**

- `/doctor` command — health check that reports: required-file presence, PROJECT.md format version (v1.0.76+ Stack/Type contract), artefact freshness per phase (audit/arch/qa/cso/ADR/digest with configurable max-age), Beads backlog (P0/P1/in_progress counts, stall detection), verdict log tail, PermissionDenied tail, scheduled-task health, plugin install integrity. No writes — diagnosis only. Ends with a prioritised "Next actions" list.
- `.great_cto/verdicts/YYYY-MM-DD.log` — one-line verdict each time a pipeline agent terminates. Format: `ISO_TS | agent | DONE|BLOCKED | artefacts=N | <domain_metric>`. Enables audit trail and powers `/doctor`.
- **Mandatory artefact post-condition** in `project-auditor`, `qa-engineer`, `security-officer`, `tech-lead`: before emitting DONE, each agent verifies its expected artefact file exists on disk. Missing file → `BLOCKED: <agent> post-condition failed — <path> not written` rather than a vacuous DONE.
- **SessionStart banner** (plugin.json hook):
  - Red P0 banner with top-3 P0 titles when any P0 is open.
  - Audit staleness warning when `docs/audit/AUDIT-*.md` is > 30 days old or absent.
  - Digest staleness warning when `.great_cto/digest-latest.md` is > 8 days old (catches broken Mon 09:00 scheduler).
- `doctor` added to the plugin's SessionStart CMD copy loop — `/doctor` is now available out of the box.

**Rationale: without these three layers (post-conditions + verdicts + banner), a pipeline that silently produces nothing is indistinguishable from a pipeline that was never run. The audit of <private-project> — 6 months of activity, 12 Beads issues, P0 leaked API keys open for 6 days — showed exactly that failure mode.**

---

## v1.0.78 — 2026-04-20

### Fixed — Spawned sub-agent reliability (bugs found during <private-project> pipeline run)

Three issues observed when spawning `project-auditor`, `qa-engineer`, and `security-officer` via the `Agent` tool from a parent session:

1. **`qa-engineer` returned "I need bash access"** despite `Bash` being in frontmatter `tools:`. Root cause: spawned sub-agents inherit the parent session's `permissionMode`. If the parent was in plan mode (or any restrictive mode), `Bash`/`Write` are blocked at the session layer regardless of what the agent declares.
2. **`security-officer` cut off mid-sentence** with no summary. Root cause: `maxTurns: 25` / `timeout: 600` was too tight for HIGH-effort security scans with CVE lookups.
3. **`project-auditor` / `qa-engineer` could not write artefacts** even when their analysis completed — same `PermissionDenied` cause as (1).

**Fixes:**

- `agents/security-officer.md` — bumped `maxTurns: 25 → 40`, `timeout: 600 → 900`, added `Edit` to `tools:`.
- `agents/qa-engineer.md` — bumped `maxTurns: 35 → 40`, `timeout: 600 → 900`, added `Edit` to `tools:`.
- **Pre-flight probe** in all three agents (`project-auditor`, `qa-engineer`, `security-officer`): before any real work, the agent attempts `mkdir -p .great_cto && touch .great_cto/.<name>-probe`. On `PermissionDenied`, it emits a clear `BLOCKED: permission denied (Bash/Write)` message with remediation (exit plan mode, or `/permissions` allow-list), rather than silently producing useless partial output.
- `README.md` — FAQ entry documenting the plan-mode inheritance issue and pointing users at `.great_cto/permission-denied.log`.

**Not fixed (by design):** the permission inheritance itself is a Claude Code platform behaviour, not something a plugin can override. The plugin's `PermissionDenied` hook (v1.0.x) already logs each denial to `.great_cto/permission-denied.log` for forensics.

---

## v1.0.77 — 2026-04-20

### Fixed — Docs + command-reference hygiene

Trivia release caught by a full command smoke test. Three user-facing hints still pointed at `/update` — a command removed in v1.0.52 — and the README version badge had been frozen at 1.0.70 for six releases. Zero behaviour changes, zero cache impact, zero agents touched.

**1. Stale `/update` references replaced:**
- `commands/digest.md:244` — "Consider /update to audit agent coverage" → "Consider /audit to scan agent/tooling coverage"
- `commands/start.md:260` — "sections (added later via `/update`)" → "sections (added later via `/audit` refresh or edited by hand as the project matures)"
- `commands/start.md:377` — "catalog unavailable — run /update when online" → "catalog unavailable — SessionStart hook will retry on the next session"

**2. README version badge + text** — 1.0.70 → 1.0.77 (line 6 badge, line 267 "actively maintained" line).

**Integration summary:**
- `commands/digest.md` (1 line): stale-command hint
- `commands/start.md` (2 lines): stale-command hints
- `README.md` (2 lines): version badge + maintenance copy

**Cache discipline.** Zero agent edits. SessionStart hook byte-identical with v1.0.76. Pure copy-fix release.

**Verification.** Full smoke test of all 10 commands and 7 agents: bash syntax OK (known `<placeholder>` false-positives preserved), SessionStart hook CMD/AGENT loops match filesystem (10 + 7), every `skills/great_cto/references/*.md` (12 files) exists, no orphaned subagent_type references, `/digest` board + architecture modes wired, `/rfc` team-size guard in place, `/start` three scheduled tasks (Mon digest + Sun audit + Q1 arch-review) for medium+ projects.

---

## v1.0.76 — 2026-04-19

### Fixed — Audit reliability: stop hallucinated types, surface Stack/Type in every report

Patch release driven by a real-world audit run on an AI-orchestrator project that produced two silent failures: a secondary type (`neobroker`) that does not exist in TYPE_MAP.md, and a chat summary with no Stack or Type line for the CTO to verify. Three narrow fixes close both holes without touching agents unrelated to audit.

**1. TYPE_MAP.md — new keyword row for AI orchestrators.**
Added `AI orchestrator, agent orchestrator, multi-agent orchestration, agent router, workflow orchestrator, agent coordinator → ai-agent-framework`. Projects that describe themselves as "orchestrator" now resolve deterministically instead of being forced into `ai-agent` + invented secondary.

**2. project-auditor Phase 7 — mandatory type validation.**
Before writing `.great_cto/PROJECT.md`, the detected primary and secondary types are validated against the canonical list of backticked tokens in TYPE_MAP.md. Invalid primary → **BLOCKED** with the 10 nearest valid types printed. Invalid secondary → dropped with a warning. No more silent inventions of vertical labels (`neobroker`, `fintech`, `crypto`) as types — those belong in a `## Domain` section, not `## Type`.

**3. project-auditor Phase 9 — Stack/Type lines are now mandatory, not optional.**
Reporting Contract upgraded: every DONE or BLOCKED summary MUST include two verbatim lines before the DONE/BLOCKED terminator:
```
Stack: <language> <major-version> / <primary framework> / <database> / <deploy target>
Type:  <primary> [+ <secondary>]   archetype: <archetype>
```
Detection-failure path is explicit (`Stack: detection failed (<reason>)`) rather than silent omission. Type-preservation path is explicit (`Type: <primary> (preserved, PROJECT.md < 7d old)`). Rationale: without these two lines the CTO cannot spot misdetection until it has already polluted the Beads backlog.

**Integration summary:**
- `skills/great_cto/TYPE_MAP.md` (+1 row): orchestrator keyword mapping
- `agents/project-auditor.md` (+45 lines): type validation block in Phase 7; mandatory summary block in Reporting Contract

**Cache discipline.** One agent edit (project-auditor only). Other six agents untouched. SessionStart hook byte-identical with v1.0.75 — full prefix cache survives.

**Backward-compat.** Strictly additive. Existing PROJECT.md files with valid types pass validation unchanged. The only "breaking" path is intentional: a future audit that would have hallucinated a type now blocks and asks for a canonical choice — this is the desired behaviour, not a regression.

---

## v1.0.75 — 2026-04-19

### Added — Synthesis consumers: executive narrative + quarterly architecture review

Fifth and final release in the arc (v1.0.71 → v1.0.75). **Zero agents touched.** Just `/digest` and `/start` — yet this is the largest functional delta of the arc. Q-review and the board narrative consume every artifact the four prior releases produced.

**Why last and why agents-free.** The v1.0.71–v1.0.74 releases added writing surfaces: risks, waivers, deprecations, SLOs, incident-log, pre-mortems, vendors, cost models, onboarding. This release adds the **reading surfaces** that turn those files into decisions. Keeping it agents-free preserves the prompt cache prefix exactly as it stood after v1.0.74 — CTOs who never invoke the synthesis modes pay zero cache cost.

**Two new synthesis modes in `/digest`:**

**1. Executive narrative** (extends `board` mode, auto-triggered). Appends a connected-story section to the board report: **What we shipped** (one-liner per ARCH-*.md / RFC-*.md from the period, each cited by artifact slug), **Why it matters** (synthesized from ARCH "Business context" + ADR rationale — no inventions), **Metrics that tell the story** (existing DORA numbers + trend interpretation), **Risks on the horizon** (top-3 H×H / H×M from RISK-REGISTER + any EXHAUSTED SLO row), **Next quarter focus** (Beads tasks tagged `epic:q<N+1>`). Synthesizer rule: every line traces to a file. Fallbacks for first-quarter / zero-risk / small-project.

**2. Architecture review** (new `architecture` mode: `/digest Q2 architecture`). Generates `docs/architecture/ARCH-REVIEW-<YEAR>-Q<N>.md` in **draft status** — CTO reviews and removes the `> Draft` marker to finalize. Subsequent runs refuse to overwrite finalized reviews. Sections: Decisions Landscape, Drift Analysis, God Nodes Evolution, Aged Tech Debt, Active Risks Summary, Unresolved Waivers, Pre-mortem Post-Reviews Due, Reliability Summary, Cost Drift, Deprecations on the Horizon, Recommendations for Q+1. Every recommendation cites its evidence. First run of each quarter snapshots `.great_cto/brain.md` as `brain-<Y>-Q<N>-snapshot.md` for the next review's diff base.

**Scheduled automation for Q-review.** `/start` registers a third scheduled task for `project_size: medium` or larger: `0 10 1 1,4,7,10 *` (1st of Jan/Apr/Jul/Oct at 10:00). Skipped for nano/small projects where Q-review is overkill.

**Integration summary:**
- `/digest` (+160): executive narrative builder extending board mode; full architecture review mode with draft-status protection + brain.md snapshotting
- `/start` (+15): third scheduled task (quarterly review) for medium+ projects

**Two new references** in `skills/great_cto/references/`: `board-narrative.md` (source mapping, synthesizer rules, fallback behaviors) and `quarterly-review.md` (input inventory from v1.0.71–v1.0.74, output schema, draft/final lifecycle, massive-review summarization rule, small-project skip).

**Backward-compat**: pure additive. Projects that never invoke `/digest architecture` see zero change (all existing modes unchanged). Projects that invoke `board` get the narrative section appended to their existing board report — original DORA table stays intact below. Every access guarded — missing sources produce explicit fallback text, never fabricated data.

**Cache discipline — the important one**: **zero agent edits this release**. The agents/*.md prompt surface is byte-identical to v1.0.74. SessionStart hook byte-identical (verified). `/digest` and `/start` are user-invocable commands — their output is outside the agent's prompt cache path entirely. Maximum feature delta, minimum prefix disruption.

**Behavioral change worth flagging**: `/digest board` now produces a longer output (narrative + DORA instead of DORA alone). `/digest architecture` is a new capability entirely. Neither changes any existing agent's behavior.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `commands/{digest,start}.md`, `skills/great_cto/references/{board-narrative,quarterly-review}.md` (2 new). **No agent files edited.**

### Arc summary (v1.0.71 → v1.0.75)

Five releases closed the gap between "Great CTO does X" and "plugin captures X":

| Release | Artifacts introduced | Files |
|---------|---------------------|-------|
| v1.0.71 | Risk register, waivers, deprecations | 3 new refs, 3 agent edits |
| v1.0.72 | SLO + INCIDENT-LOG + error budgets | 1 new ref, 3 agent edits |
| v1.0.73 | Pre-mortem + vendor register | 2 new refs, 2 agent edits |
| v1.0.74 | Cost attribution + onboarding | 2 new refs, 2 agent edits |
| v1.0.75 | Executive narrative + Q-review | 2 new refs, **0 agent edits** |

Total: **10 new references, 15 file edits, 5 new artifact families**, ~1000 LOC across 5 commits. Every release backward-compatible; every release preserved SessionStart hook byte-identical; every release additive with `[ -f ... ]` guards on every access.

---

## v1.0.74 — 2026-04-19

### Added — Cost attribution + auto-generated onboarding

Fourth release in the arc (v1.0.71 → v1.0.75). Addresses the "features ship, cost compounds, nobody tracks" problem and the "new engineer needs 2 weeks to ramp" problem — both by making previously-tribal knowledge into greppable files.

**Two new artifact patterns:**

**1. Cost Model section — inside each qualifying ARCH-*.md.** Not a separate file; kept coupled to the decision it justifies. Required for `project_size ≥ medium` OR archetype `ai-system`/`commerce`/`regulated`. Schema: runtime cost table (compute, database, data transfer, external APIs with vendor-register cross-reference), unit economics (per-DAU, per-transaction, break-even), cost controls (caps, rate limits, cache, scheduled scale-down), quarterly review cadence. For teams, the estimate mirrors into `OWNERSHIP.md` "Expected cost/mo" column so per-team cost attribution is answerable without re-parsing every ARCH.

**2. `docs/onboarding/README.md`** — synthesized single-file onboarding. project-auditor combines `.great_cto/brain.md`, `DECISION-LOG.md`, `CODEBASE.md` god-nodes, `OWNERSHIP.md`, runbooks, and top Beads tasks into a linear read. Regenerated monthly by `/digest`; first-created by `/audit` if `team-size ≥ 2`. Respects hand-edits (checks generated-date marker before overwriting).

**Actual-vs-estimate reconciliation** (optional). If the CTO wires a FinOps source to populate `.great_cto/cost-actual.log` via cron / GitHub Action, `/digest` flags any service > 20% over estimate at quarter start. No live billing integration inside the plugin — files only.

**Integration summary:**
- tech-lead (+21): Cost Model section injection in ARCH for qualifying projects; vendor-register cross-reference for external APIs
- project-auditor (+26): onboarding synthesis with conflict-flagging and hand-edit respect
- `/audit` (+26): cost-model coverage scan on IaC files; onboarding first-run generation
- `/digest` (+22): quarterly cost reconciliation; monthly onboarding refresh

**Two new references** in `skills/great_cto/references/`: `cost-model.md` (schema, data sources, OWNERSHIP.md coupling, actual-vs-estimate file format) and `onboarding.md` (schema, source mapping table, regeneration rules, conflict handling).

**Backward-compat**: pure additive. ARCH docs without Cost Model remain valid (retroactive enforcement absent). Projects without `docs/onboarding/` see zero change. Solo founders (team-size: 1) skip onboarding generation entirely. Every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.73 works unchanged.

**Cache discipline**: tech-lead edited once more (4th consecutive release — each edit is an appended section, preserving stable prefix). project-auditor gets its first touch in this arc. security-officer, devops, l3-support all untouched this release. SessionStart hook byte-identical.

**Behavioral change worth flagging**: for `medium`+ ARCH docs, tech-lead now writes a Cost Model section as a mandatory part of output. CTO sees one more section in the ARCH doc (runtime cost + unit economics + cost controls). For smaller projects: zero change.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,project-auditor}.md`, `commands/{audit,digest}.md`, `skills/great_cto/references/{cost-model,onboarding}.md` (2 new).

---

## v1.0.73 — 2026-04-19

### Added — Forward-looking: pre-mortem + vendor register

Third release in the arc (v1.0.71 → v1.0.75). Moves risk thinking from reactive (postmortem after incidents) to proactive (pre-mortem before ship) and makes third-party vendor dependency a tracked artifact.

**Two new artifact families:**

**1. `docs/pre-mortems/PRE-<slug>.md`** — forward-looking failure analysis generated by tech-lead before finalizing ARCH. Triggered automatically when `project_size` is `large`/`enterprise`, or archetype is `web3`/`iot-embedded`/`regulated`, or CTO flags `risk: high`. Schema: scenario dated 6 months post-ship, ≥5 brainstormed failure modes, P×I ranking, early warning signs, mitigations mapped to gates, risks fed into the register. Distinct from ADR (decision record), postmortem (past incident), and threat model (adversarial security).

**2. `docs/vendors/VENDOR-<slug>.md`** — per-vendor register for paid SaaS / critical third-party services (Stripe, OpenAI, Twilio, etc.). Schema: role, criticality (critical/high/medium/low), SLA, incident history, fallback plan, compliance certs, contract/renewal, linked risks. Scope deliberately excludes npm libraries (those are deprecations.md) and low-criticality utilities (avoids register fatigue).

**Closing the learning loop.** Pre-mortems include an empty "Post-ship review" filled 90 days post-launch. `/digest` surfaces overdue reviews — scenarios that didn't happen teach what signal was noise; scenarios that happened but weren't brainstormed become future-pre-mortem prompts in `.great_cto/brain.md`.

**Integration summary:**
- tech-lead (+54): pre-mortem trigger+generation before ARCH finalizes; vendor check at ARCH time (block `critical` without fallback plan)
- security-officer (+38): pre-mortem mitigation-to-gate verification (unenforced H×H mitigations block gate:compliance); quarterly vendor review pass
- `/digest` (+28): overdue pre-mortem review reminder; quarterly vendor review trigger (month 1/4/7/10)
- `/audit` (+16): scan deps for known vendor SDKs, flag any without matching VENDOR-*.md

**Two new references** in `skills/great_cto/references/`: `pre-mortem.md` (triggers, brainstorming prompts, schema, post-ship loop) and `vendors.md` (criticality gate, review cadence, risk coupling).

**Backward-compat**: pure additive. Projects without `docs/pre-mortems/` or `docs/vendors/` see zero behavior change; every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.72 works unchanged. `pre-mortem: skip` in PROJECT.md suppresses trigger for otherwise-qualifying repos.

**Cache discipline**: tech-lead + security-officer edited this release. tech-lead touched in v1.0.71, v1.0.72, v1.0.73 — each edit is additive/appended-section (prefix unchanged). security-officer untouched in v1.0.72; this is its second edit. `/audit` and `/digest` both touched again. SessionStart hook byte-identical.

**Behavioral change worth flagging**: for `large`/`enterprise` projects, ARCH now spawns a pre-mortem generation step before completing. CTO sees one additional artifact path ("Pre-mortem written → docs/pre-mortems/PRE-<slug>.md") and one optional step (approve/amend failure-mode brainstorm). For smaller projects: zero change.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,security-officer}.md`, `commands/{audit,digest}.md`, `skills/great_cto/references/{pre-mortem,vendors}.md` (2 new).

---

## v1.0.72 — 2026-04-19

### Added — Reliability layer: SLO, INCIDENT-LOG, error budgets

Second release in the arc (v1.0.71 → v1.0.75). Builds on the risk/waiver foundation from v1.0.71 to make reliability a **measured artifact** rather than tribal knowledge.

**Three new files managed by the plugin:**

**1. `docs/reliability/SLO.md`** — per-service SLO definitions + response policy. Seeded by tech-lead when a new network-facing service is introduced in ARCH (default: availability 99.9%, latency p95 < 200ms, error rate < 0.5%; 30d rolling window). CTO tightens or loosens based on product criticality. Tightening retroactively requires an ADR per the reference.

**2. `docs/reliability/INCIDENT-LOG.md`** — append-only, chronological, exact 4-line-per-entry format that `awk` can grep in one shot. Written by `l3-support` after every postmortem with SLI impact and by `devops` on canary failure (rollback triggered). Makes reality a first-class artifact alongside intent (SLO).

**3. `.great_cto/slo-budget-current.md`** — computed cache. `/digest` recomputes it from INCIDENT-LOG over the 30d rolling window. Statuses: `ok` / `warn` (50–80%) / `WARN` (80–100%) / `EXHAUSTED` (>100%). Read-only at runtime by `devops` (gate:ship blocks on EXHAUSTED, requires CTO approval on WARN) and `/inbox` (surfaces any WARN/EXHAUSTED row).

**Policy, not paging.** The layer is deliberately **manual reality log + computed budget** — no Datadog / Prometheus integration, no automated alerts, no per-endpoint SLOs. Alerts stay in the team's existing monitoring system; this is a **decision record** that makes "are we within budget?" answerable from files in the repo.

**Enforcement in the pipeline:**
- `ok` → proceed normally
- `warn` → log in RELEASE doc, proceed
- `WARN` (80%+) → devops pauses, requires CTO explicit approval
- `EXHAUSTED` (>100%) → **deploy blocked** except for hotfix with WAIVER per v1.0.71 enforcement
- Multiple SLIs burned simultaneously → tech-lead drafts `STABILITY-PLAN-<date>.md` within 24h; team executes a stability week before new features resume

**Integration summary:**
- tech-lead (+21): seed SLO.md entry when introducing new service in ARCH
- devops (+35): SLO budget check in gate:ship (block on EXHAUSTED, pause on WARN) + INCIDENT-LOG append on canary failure
- l3-support (+15): append INCIDENT-LOG on postmortems with SLI impact
- `/inbox` (+14): surface WARN/EXHAUSTED rows from budget cache
- `/digest` (+54): recompute SLO budgets from INCIDENT-LOG, write cache

**One new reference** in `skills/great_cto/references/`: `reliability.md` — canonical schemas for all three files, budget computation bash, entry format contract, source/consumer tables.

**Backward-compat**: pure additive. Projects without `docs/reliability/` see zero behavior change; every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.71 works unchanged.

**Cache discipline**: three agent edits this release (tech-lead, devops, l3-support) — none of which were touched in v1.0.71's foundation release. Prompt prefix unchanged where possible.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,devops,l3-support}.md`, `commands/{inbox,digest}.md`, `skills/great_cto/references/reliability.md` (1 new).

---

## v1.0.71 — 2026-04-19

### Added — Foundation artifacts: risk register, waiver log, deprecation calendar

First release in a 5-part arc (v1.0.71 → v1.0.75) that closes the gaps between **"Great CTO does X"** and **"the plugin actually captures X"**. Release 1 lays three new artifact foundations that later releases consume.

**1. Risk register (`docs/risks/RISK-REGISTER.md`).** Persistent reality of active architectural, operational, and security risks. Different from backlog (tasks have done-state — risks don't) and from postmortems (past vs forward-looking). Scored by probability × impact over 6 months. Sources: tech-lead's ARCH "Risks" section, security-officer's CVE-pattern detection (3+ similar findings in 90d), recurring INCIDENT-LOG causes via `/digest`, deprecation EOLs approaching, manual CTO entries. Consumed by `/inbox` (top-5 H×H / H×M surfaces), `/audit` (pre-audit summary), and future pre-mortem synthesis.

**2. Waiver log (`docs/waivers/WAIVER-*.md`).** Makes "skip this gate" a **tracked artifact** instead of a silent shortcut. security-officer and devops now refuse to skip gates without a waiver containing: reason, follow-up action (Beads task created automatically), and expiry (max 14 days; 48h for emergency). `/inbox` surfaces expired waivers with open follow-ups; `/digest` detects repeat-skip patterns (same gate 3+ times in 90d) as a process-debt signal.

**3. Deprecation calendar (`docs/deprecations/DEPRECATION-CALENDAR.md`).** Explicit lifecycle for frameworks, APIs, runtimes, regions being sunset. tech-lead greps it before finalizing an ARCH stack — proposed use of a deprecated thing gets surfaced in the "Stack considerations" section. `/audit` auto-suggests entries for packages with > 24-month silent releases. `/inbox` shows EOLs within 90 days; `/digest` calls out EOLs within the next quarter. When an EOL < 6 months remaining has no active migration, `/audit` auto-creates a risk-register entry linking back.

**Integration summary:**
- tech-lead (+27 LOC): risk append from ARCH; deprecation consult before stack
- security-officer (+35): CVE-pattern → risk; waiver enforcement on gate:compliance skip
- devops (+15): waiver enforcement on gate:ship skip
- `/inbox` (+37): top risks, upcoming EOLs, waiver expiry
- `/digest` (+33): recurring-cause risk detection; waiver expiry + pattern; EOL calls
- `/audit` (+28): pre-audit risk summary; deprecation auto-suggest

**Three new references** in `skills/great_cto/references/`: `risk-register.md`, `waivers.md`, `deprecations.md` — canonical schemas with ID schemes, dedup rules, and lifecycle diagrams.

**Backward-compat**: pure additive release. Projects without the new artifacts see zero behavior change; agents check `[ -f ... ]` before every access. Old `PROJECT.md` from v1.0.68–v1.0.70 works unchanged.

**Cache discipline** (per v1.0.69): each agent edited exactly once in this release. `tech-lead.md` gets both risk and deprecation blocks in one delta; `security-officer.md` gets risk-pattern and waiver together; `devops.md` gets waiver only. Future v1.0.72–v1.0.75 will each touch different agents to keep prompt prefix stable across most releases.

**Behavioral change worth flagging**: gate skips are no longer silent. When CTO says "skip security this time", security-officer now demands reason + follow-up + expiry before proceeding. This is intentional — silent skips were the dominant source of tracked debt loss.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,security-officer,devops}.md`, `commands/{inbox,digest,audit}.md`, `skills/great_cto/references/{risk-register,waivers,deprecations}.md` (3 new).

---

## v1.0.70 — 2026-04-19

### Changed — Pareto simplification (UX surface shrunk; internals unchanged)

The 20% of the surface area that drives 80% of real usage now fits on one screen. Everything else is still present — just moved out of the first fold. Zero functionality removed; backward-compatible for every existing `PROJECT.md`.

**1. README rewrite.** Top fold is now four things: one-paragraph pitch, one `/start` example, one install command, three commands. Down from 430 to ~220 visible lines. Eight deep sections (`<details>`): ROI math, 10 archetypes, 13 compliance frameworks, 7 agents, artifacts, competitive compare. The first-time visitor reads in ~60 seconds instead of scrolling past 11 tables.

**2. Three primary commands, everything else demoted.** `/start`, `/review`, `/inbox` are the only commands on the first screen. `/audit`, `/rfc`, `/digest`, `/release`, `/ownership`, `/oncall`, `/triage` are still in `plugin.json` (nothing deleted from the plugin) but sit behind a collapsed "More commands" block.

**3. Pipeline sizes: 5 → 3 user-facing.** The CTO chats about `quick` / `standard` / `deep`. Internally the five canonical sizes (`nano` / `small` / `medium` / `large` / `enterprise`) still back the agents — `/start` maps user-facing to internal at write time. Agent files untouched (preserves the cache discipline from v1.0.69).

**4. Approval levels: 5 → 2 user-facing.** Default is `review` (the old `gates-only`); `auto` is unchanged. The three advanced levels (`strict`, `expert`, `step-by-step`) remain opt-in — written verbatim to PROJECT.md when the CTO asks for them. All seven agents continue to grep for the canonical names.

**5. "73 types" removed from user-facing docs.** `TYPE_MAP.md` is now marked **internal** in its header — it's an auto-detection dispatch table, not user configuration. `README.md` no longer surfaces the "73 types" count. The 10 archetypes stay; the CTO never picks a type manually.

**Backward compat**:
- Every existing `PROJECT.md` from v1.0.68/v1.0.69 keeps working without migration
- Agents read the same canonical values as before (`nano`…`enterprise`, `gates-only`…`step-by-step`)
- The simplification is purely a UX layer over unchanged internals

**What we did NOT change**:
- 12-angle `/review` (killer feature, untouched)
- brain.md, CODEBASE.md, HANDOFF.md hooks
- Advisor pattern (Opus escalation)
- Agent files (cache discipline preserved per v1.0.69)
- `plugin.json` command list (all 10 commands still dispatch)
- Compliance auto-detection, packs, archetypes

Files: `README.md`, `commands/start.md`, `skills/great_cto/ARCHETYPES.md`, `skills/great_cto/TYPE_MAP.md`, `.claude-plugin/plugin.json`, `docs/plans/PLAN-pareto-simplification.md` (new).

---

## v1.0.69 — 2026-04-19

### Changed — Cache discipline across SessionStart, /review, and file globs

Five surgical changes that make our prompt structure cache-friendly for the KV-cache in Claude Code's transport. Zero semantic change — same data, same agents, same gates. Just stable-prefix-first / volatile-suffix-last.

**1. SessionStart hook reorder** (`.claude-plugin/plugin.json`). `=== LOCAL ===` moved from the top (between PREFERENCES and PROJECT) to after CODEBASE and before HANDOFF. The stable prefix is now: `PREFERENCES → PROJECT → PHASE → BRAIN → CODEBASE`, followed by the volatile `LOCAL → HANDOFF → QA/CSO/PERF → STATUS`. A CTO edit to `.great_cto/local.md` no longer invalidates the cache for PROJECT/brain/codebase.

**2. Phase cache implication documented** in `skills/great_cto/references/phases.md`. Switching phase mid-pipeline is now flagged as a cache-invalidation event. Switch between pipelines (after gate:ship closes), not during one.

**3. Deterministic sort on every `ls *.md` / `find … *.md` that feeds context** — `commands/inbox.md`, `commands/digest.md`, `commands/release.md`, `commands/rfc.md`, `commands/oncall.md`, `commands/audit.md`, `commands/start.md`. Previously filesystem order leaked into prompts (different on macOS HFS+ vs APFS vs Linux ext4), producing different token prefixes across runs. Every list is now `| sort`-stable.

**4. Runtime-immutability rule for `agents/*.md` and `commands/*.md`** added to the File Layout Invariant in `skills/great_cto/SKILL.md`. Task-specific state flows through `$ARGUMENTS`, `bd`, or sibling files — never through mutation of an agent document. Preserves the largest cache-hot blocks we ship.

**5. `/review` cache-discipline note** (`commands/review.md`) after Setup, before Angle 1. The diff + archetype + design-system detection is the stable prefix across all 12 angles; re-reading or reordering it between angle evaluations forfeits prefix caching. Codified so future edits don't regress.

**Why this is the right ROI:**
- Zero-risk edits: every change is a one-line doc note, a one-argument `| sort`, or a single block reorder
- Total ~30 LOC across 10 files; each item independently reversible
- Biggest practical win on `/review` (12 angles × same diff) and on daily `/inbox` runs

**Source of principles:** prompt-caching works on exact-token-prefix match; any edit in the middle invalidates everything after. Our job is just to keep volatile content at the tail.

Files: `.claude-plugin/plugin.json`, `commands/{inbox,digest,release,rfc,oncall,audit,start,review}.md`, `skills/great_cto/SKILL.md`, `skills/great_cto/references/phases.md`, `docs/plans/PLAN-cache-discipline.md` (new).

---

## v1.0.68 — 2026-04-19

### Added — `/triage`, DONE/BLOCKED contract, file-layout invariant

**1. New command `/triage`** — cross-backlog reorganizer. Reads every open Beads task and analyzes along exactly four axes:
- **Duplicates** — same scope under different wording; keeps the better-scoped copy
- **Misplaced** — label/epic mismatch; verifies destination scope before moving
- **Priority inversions** — foundational/unblocking items buried under user-facing ones (ranks by unblock count, not visibility)
- **Cross-cutting gaps** — work referenced in ARCH docs or retros but not tracked

Presents a structured diff first and never writes until the CTO says `approve`. Self-critique pass covers false duplicates, priority-by-visibility, orphaning, and missing-evidence gaps. Caps the plan at 30 actions per invocation; backlogs > 200 items require a label filter.

**2. New skill `skills/done-blocked/SKILL.md`** — reporting contract. Terminal agent verdicts must be exactly one of:
- `DONE: <summary>` + `artifact` + `next`
- `BLOCKED: <obstacle>` + `tried` + `failed_because` + `need`

Hard rule: no third state, silence ≠ DONE, `failed_because` must be concrete (not "unclear"), `need` must name a specific unblock. Wired into all 7 agents (tech-lead, senior-dev, qa-engineer, security-officer, devops, l3-support, project-auditor) as a short "Reporting Contract" section at the end of each agent doc. Verdicts continue writing to `.great_cto/verdicts/*.log` — now with a defined shape so the digest can compute DONE:BLOCKED ratio per agent.

**3. File-layout invariant** added to `skills/great_cto/SKILL.md` (§ "File Layout Invariant") — distinguishes **agent-context** (curated markdown, committed, read on every turn) from **runtime-state** (side-effect logs, caches, gitignored). Decision heuristic: "would I want git blame on this line?" Yes → agent-context. No → runtime-state.

**Why this is the right ROI:**
- `/triage` replaces ad-hoc backlog grooming with a measurable, repeatable pattern; cold path so it doesn't cost tokens when unused
- DONE/BLOCKED is one paragraph per agent but makes the handoff pipeline machine-readable
- The invariant prevents future drift — new contributors won't accidentally commit `verdicts/*.log`

Files: `commands/triage.md` (new), `skills/done-blocked/SKILL.md` (new), `skills/great_cto/SKILL.md` (§ added), all 7 agent docs (+ skill ref + reporting contract section), `.claude-plugin/plugin.json` (CMD loop + version).

---

## v1.0.67 — 2026-04-19

### Changed — Coordinator + references split for `skills/great_cto/SKILL.md`

`skills/great_cto/SKILL.md` stays short and scannable; cold-path sections move to `references/` and are pulled only when the CTO says the triggering phrase.

**Extracted (cold path — loaded on demand):**
- `references/phases.md` — phase table (planning / implementation / review / release), switching logic, semantics. Triggered when CTO says *"move to X phase"*.
- `references/decision-log.md` — append logic, entry format, ADR-vs-Decision-Log routing. Triggered when CTO says *"log decision"* / *"we decided X"* / `decision:`.

**Kept inline (hot path — needed every CTO message):**
- Intent mapping, conventions, pipelines, CTO signals — all still in `SKILL.md`. Moving these to references would force a reference load on every turn, defeating the point.

**Why this split:** the Phases section (~30 lines) and Decision Log section (~40 lines) together accounted for ~70 lines of SKILL.md that were almost never needed in any given session. Extracting them trims the coordinator to the decisions Claude makes on every message, without losing any content — the references are one `Read` away when the triggering phrase fires.

Files: `skills/great_cto/SKILL.md` (sections replaced with link stubs), `skills/great_cto/references/phases.md` (new), `skills/great_cto/references/decision-log.md` (new).

---

## v1.0.66 — 2026-04-19

### Added — Skeptical-triage skill + `/review --deep` flag

The 3-round + arbiter pattern from v1.0.65 is now a reusable skill, available to any agent that needs to filter false positives before a gate decision.

**New skill:** `skills/skeptical-triage/SKILL.md` — the canonical definition of the pattern (Round 1 Reachability → Round 2 Verify Defenses → Round 3 Missed Angles → Arbiter + crux). Hard rules, confidence scoring, severity demotion table, and JSONL log schema all live in one place.

**New flag:** `/review --deep` — triage P0/P1 findings from **all** 12 angles (not just security/reliability 2/4/7/9). Use on high-stakes PRs or release candidates where the cost of a false-positive gate:code block is high. Default behavior unchanged.

**Wired into:**
- `commands/review.md` — now references the skill instead of duplicating rules. `--deep` expands triage scope.
- `agents/security-officer.md` — references the skill for CSO audit findings.
- `agents/qa-engineer.md` — can apply triage to flaky regression verdicts (real regression vs. test pollution).
- `agents/tech-lead.md` — can apply triage to contested ADR trade-offs.

**Log schema** (`.great_cto/triage-log.jsonl`, append-only):
```json
{"timestamp": "...", "caller": "review|security-officer|qa-engineer|tech-lead",
 "finding_id": "...", "original_severity": "P0", "rounds": [...],
 "arbiter": {"verdict": "VALID", "crux": "..."}, "confidence": 0.67,
 "final_severity": "P0"}
```

Use this to measure whether triage earns its keep: `jq 'select(.arbiter.verdict=="INVALID")' .great_cto/triage-log.jsonl | wc -l` gives the FP filter rate. If <10% — triage is filtering noise that wasn't there (tighten original prompts). If >40% — original angle rules are too trigger-happy.

**Why a skill instead of inline text:** four callers now need the same pattern. DRY. Single place to update rules, single place to measure effectiveness, single schema for the triage log.

Files: `skills/skeptical-triage/SKILL.md` (new), `commands/review.md`, `agents/security-officer.md`, `agents/qa-engineer.md`, `agents/tech-lead.md`.

---

## v1.0.65 — 2026-04-19

### Added — Skeptical triage for P0/P1 security findings

`/review` now runs a 3-round self-challenge + arbiter pass over P0/P1 findings from Angles 2 (Security), 4 (SQL Safety), 7 (Data Privacy), 9 (Concurrency) before creating `gate:code`. `security-officer` applies the same pattern to CSO audit findings before blocking `gate:ship`.

**How it works:**

1. **Round 1 — Reachability:** can an attacker actually reach this code with untrusted input?
2. **Round 2 — Verify defenses:** every cited defense must be grep-confirmed. Constant names are not verified bounds — resolved numeric values are.
3. **Round 3 — Missed angles:** error paths, integer edges, race windows — what did prior rounds not consider?
4. **Arbiter:** final VALID / INVALID + one-sentence `crux` (the single key fact the verdict turns on).

**Confidence** = `valid_rounds / 3`. Findings:
- `INVALID` → filtered from gate tally (recorded as `[FILTERED]` for audit)
- `VALID` + confidence < 50% → demoted P0→P1, P1→P2
- `VALID` + confidence ≥ 50% → keep severity

**Hard rules:**
- *Absence of defense → VALID, not UNCERTAIN* (don't hide behind "probably handled elsewhere")
- *Code quality issue ≠ security vulnerability* (data races on diagnostic state, NULL checks on internal-only APIs → INVALID)
- *Do not contradict your own conclusion in the same response*

**Hard findings skip triage** (always P0): secrets in source/git history, confirmed CVEs with exploit in installed version.

**Why:** single-pass 12-angle review produces ~30-50% false positives on P0/P1 security findings. Triage filters those before they turn into `gate:code` blocks that CTO has to manually override. Net cost: ~4 extra LLM turns per triaged finding; net savings: less CTO context-switching on noise.

Output example:
```
🔥 100% [VVV→V] auth.c:142 — stack overflow in parse_header
     CRUX: len comes from wire, memcpy into 64-byte buf, no bound check
🤔  33% [IIV→I] session.c:88  — (FILTERED — arbiter INVALID)
     CRUX: lookup_session only called from trusted internal path
```

Files: `commands/review.md`, `agents/security-officer.md`.

---

## v1.0.64 — 2026-04-18

### Added — Traceability graph via bd labels

Requirements → Implementation → Tests now form a queryable graph using Beads labels and deps — no new storage, no extra MCP servers.

**How it's built:**
- `tech-lead` creates one bd task per REQ-N after writing the Requirements Checklist, with labels `req` + `feature-<slug>`
- `senior-dev` wires `bd dep IMPL REQ` when claiming the impl task, and lists linked REQs in the PR body (`## Implements REQs`)
- `qa-engineer` creates a TEST task per COVERED REQ and wires `bd dep TEST IMPL`, closing immediately with the evidence reference

**Query it:**
```bash
/review trace R-042              # show tree rooted at REQ R-042
/review trace feature-checkout   # show full feature tree (REQ → IMPL → TEST, coverage)
/review trace I-087              # upstream (what I-087 depends on) + downstream
```

Answers questions like _"if I change R-042, what breaks?"_ via `bd deps R-042 --reverse`.

**Graceful degradation:** if `bd` is unavailable, the ARCH-*.md Requirements Checklist remains the fallback trace. The QA report's inline REQ → Evidence lines continue working.

Our version piggybacks on existing `bd` primitives instead of building a separate store.

Files: `agents/tech-lead.md`, `agents/senior-dev.md`, `agents/qa-engineer.md`, `commands/review.md`. Patch 3/3 of phases-traceability-decisions plan — completes the trio.

---

## v1.0.63 — 2026-04-18

### Added — Phase-filtered SessionStart

`.great_cto/PROJECT.md` now supports a `phase:` field that tells the SessionStart hook which context to load. Four phases — `planning`, `implementation` (default), `review`, `release` — each loads a different slice of context, saving tokens and reducing noise.

**Loaded per phase:**

| Phase | Loaded | Skipped |
|---|---|---|
| `planning` | PROJECT.md, brain.md, digest-latest | CODEBASE, HANDOFF, QA/CSO, perf |
| `implementation` | PROJECT.md, brain.md, CODEBASE, HANDOFF | digest, QA/CSO, perf |
| `review` | PROJECT.md, HANDOFF, latest QA, latest CSO | brain, CODEBASE, digest |
| `release` | PROJECT.md, HANDOFF, perf-baseline tail | brain, CODEBASE, QA/CSO |

**Switch in chat:** "move to review phase" / "planning phase" / "release phase" — orchestrator updates `phase:` in PROJECT.md. Pipeline rules (agents, gates) are unaffected — phase only controls hook context.

**Backward compatible:** missing `phase:` field falls back to `implementation`. Tested with 4-phase fixture matrix.

Files: `.claude-plugin/plugin.json`, `commands/start.md`, `skills/great_cto/SKILL.md`, `packages/cli/src/bootstrap.ts`. Patch 2/3 of phases-traceability-decisions plan.

---

## v1.0.62 — 2026-04-18

### Added — Decision Log

Non-architectural decisions (process changes, vendor picks, waivers, reversible calls) now have a first-class artifact: `docs/decisions/DECISION-LOG.md`. Complements existing ADR files in the same directory — ADRs stay for architecture trade-offs, the Decision Log captures everything else that used to be buried in Slack or `brain.md`.

**Trigger:** Say "log decision", "we decided X", or prefix a message with "decision:" in chat. The orchestrator appends a sequential `D-NNNN` entry with context, decision, alternatives, reversibility, and owner.

**Surfaced:** Last 3 entries shown in `/inbox` under a new `RECENT DECISIONS` section (only when the log has entries).

**Seeded:** `/start` scaffolds an empty `DECISION-LOG.md` alongside `brain.md` seeding.

Files: `commands/start.md`, `commands/inbox.md`, `skills/great_cto/SKILL.md`, `.claude-plugin/plugin.json`. ~35 LOC added.

---

## v1.0.61 — 2026-04-17

### Added — `npx great-cto init` one-command installer

Install friction reduced from 5 manual steps to 1 command. New `great-cto` npm package in `packages/cli/` (separate from plugin, published to npm).

```bash
npx great-cto init
```

**What it does:**
1. Scans the current directory — `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Chart.yaml`, `*.tf`, `hardhat.config.*`, `platformio.ini`, and more
2. Picks the matching archetype out of 11 (web-service, mobile-app, ai-system, commerce, web3, data-platform, infra, library, iot-embedded, regulated, greenfield)
3. Clones the latest plugin tag into `~/.claude/plugins/cache/local/great_cto/<version>/`
4. **Atomically** merges `enabledPlugins: { "great_cto@local": true }` into `~/.claude/settings.json` — timestamped backup, other keys preserved
5. Writes `.great_cto/PROJECT.md` pre-filled with archetype, stack, suggested compliance frameworks (GDPR, PCI-DSS, EU AI Act, etc.)

**Flags:**
- `--dry-run` — show what would happen, no changes
- `--force` — reinstall even if present
- `--archetype NAME` — override auto-detected archetype
- `--version-tag VER` — pin to a specific plugin version
- `-y, --yes` — non-interactive

**Detection coverage:** 50+ framework / library signals across TypeScript, Python, Go, Rust, Java/Kotlin, Swift, Solidity, and infrastructure files. Pure Node ≥22 with native TypeScript — zero runtime dependencies, MIT, lives under `packages/cli/`.

**README reorg:** `npx great-cto init` is now the primary install path on the README front page. Manual git-clone install demoted to a collapsible `<details>` block for advanced users.

---

## v1.0.60 — 2026-04-17

### Fixed — audit-driven corrections

Post-release audit of v1.0.59 surfaced inconsistencies between README claims and actual hook/frontmatter behavior. This release fixes all P0 findings.

**Fix #1 — `brain.md` now injected into subagents (was docs-only before)**
The README has always promised: *"SessionStart injects brain.md into every agent."* Reality was that SubagentStart only cat'd `PROJECT.md | head -15`. Agents started via Task/Agent tool never received the compiled knowledge base.

Updated SubagentStart hook now injects three blocks:
- `PROJECT.md` (first 15 lines) — unchanged
- `brain.md` Current Synthesis section (or first 30 lines) — **new**
- `HANDOFF.md` (first 20 lines) — **new** — previous session state carries forward

This closes the biggest behavioral gap in the plugin: *"agents that get smarter over time"* now actually works end-to-end.

**Fix #2 — `qa-engineer` skills declaration**
`agents/qa-engineer.md` calls `bd` (Beads CLI) 5 times in its body but was missing `skills: [beads]` in frontmatter — the only agent without it. Added. Prevents silent skill-load failures when qa-engineer runs standalone.

**Fix #3 — `tech-lead` model pinned**
`model: opus` (alias) → `model: claude-opus-4-7` (pinned). All other agents already pin API IDs. Now the convention is consistent across all 7 agents: pinned IDs, explicit at release time, guaranteed reproducibility.

**Fix #4 — stray test artifact removed from repo root**
Moved `QA-TEST-REPORT-stack-migration.md` (April 7 test run) from root to `docs/qa-reports/`.

**Fix #5 — README links demo/ and docs/eval/**
The `demo/` directory (saas-api, smart-contract, trading-bot) and `docs/eval/` (5 pipeline evals) existed in the repo but were never linked from README. Users couldn't find them. Added to Links section.

---

## v1.0.59 — 2026-04-16

### Changed — Opus 4.7 advisor upgrade

Anthropic released [Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7) on 2026-04-16 with +13% on SWE-bench and 3x more production tasks resolved on Rakuten-SWE-Bench vs Opus 4.6.

**Advisor model bumped `claude-opus-4-6` → `claude-opus-4-7`** in:
- `agents/senior-dev.md` — advisor for architectural trade-offs during TDD
- `agents/security-officer.md` — advisor for compliance + threat modeling
- `commands/review.md` — advisor for 12-angle code review (concurrency, LLM trust)

**tech-lead** uses `model: opus` alias — auto-resolves to Opus 4.7 with no change needed.

**Sonnet 4.6 + Haiku 4.5** unchanged (no new versions released).

**README updated**: agent table, /review mention, "Built with" list.

**No cost change** — Opus 4.7 is priced identically to 4.6 ($5 in / $25 out per MTok).

---

## v1.0.58 — 2026-04-16

### Added — CODEBASE.md: zero-dependency codebase map for existing repos

Inspired by graphify (knowledge graph tool), implemented with pure bash — no external dependencies.

**Codebase map generation in `tech-lead`** (`agents/tech-lead.md`):
- Activates only when `greenfield: false`
- Generated once, cached at `.great_cto/CODEBASE.md` — subsequent agents read the cache
- Generated with a single bash block, no pip/npm/cargo install required
- **5 sections:**
  1. **Entry points** — main.ts / app.py / cmd/main.go etc.
  2. **Module structure** — file count per directory (community detection by density)
  3. **God nodes** — most-imported modules across TS/JS/Python/Go (highest coupling = change carefully)
  4. **Public API surface** — exported functions, classes, interfaces (TS)
  5. **Routes / endpoints** — all HTTP handlers detected by pattern matching
  6. **Data models** — schema.prisma, models.py, .sql files (first 50 lines)
- ~30x token reduction for codebase orientation vs reading raw files

**`senior-dev` reads CODEBASE.md** before implementation (`agents/senior-dev.md`):
- Step 4 "Read context" now starts with `cat .great_cto/CODEBASE.md | head -40`
- God nodes flagged: highest-coupling modules require more careful changes

**SessionStart injects CODEBASE.md** (`.claude-plugin/plugin.json`):
- `head -20 .great_cto/CODEBASE.md` shown alongside PROJECT.md + brain.md at session start
- Every session starts with codebase orientation for existing repos

**Why vs graphify**: graphify gives 71.5x reduction with AST + embeddings but requires `pip install`. This gives ~30x with zero dependencies — works immediately on any project.

---

## v1.0.57 — 2026-04-16

### Added — Design System audit as Angle 12 in `/review`

Based on analysis of `material-3-skill` article (Habr #1023084).

**Angle 12 — Design System Reviewer** (`commands/review.md`):
- Activates only for `mobile-app` and `web-service` archetypes. Skipped for all others.
- Auto-detects design system from codebase: `material3`, `tailwind`, `swiftui`, `rn-custom`
- **8 check categories** with matching token vocabulary per system:
  - **Hardcoded colors** — hex/raw color values instead of design system tokens (breaks dark mode + theming)
  - **Hardcoded typography** — literal font sizes instead of type scale tokens
  - **Hardcoded spacing** — magic px/dp values instead of spacing scale
  - **Wrong components** — raw primitives when a design system component exists
  - **Accessibility (P0)** — missing `contentDescription`/`aria-label`, touch targets < 48dp/44pt, color-only information
  - **Elevation/shadow** — raw shadow values instead of design system elevation tokens
  - **Dark mode safety** — colors that break in dark mode
  - **Motion** — hardcoded animation durations instead of motion tokens
- P0 = accessibility violation blocking users, P1 = hardcoded value breaking theming/dark mode, P2 = inconsistency
- Verdict log now includes `archetype=` field
- Summary updated: 11 angles → 12 angles

**Why**: Material Design 3 article showed that design-system compliance is automatable the same way SQL safety is — specific patterns, specific fixes, no subjectivity needed.

---

## v1.0.56 — 2026-04-15

### Added — GBrain-inspired compiled truth system (brain.md)

Based on analysis of GBrain Skillpack (garrytan/gbrain).

**1. brain.md initialized on `/start`** (`commands/start.md`):
- Every new project seeds `.great_cto/brain.md` with structured template
- Sections: Current Synthesis (architecture patterns, failures, tech debt, team patterns) + Evidence Timeline
- Created once; never overwritten — subsequent runs are no-ops

**2. Brain-first lookup in `tech-lead`** (`agents/tech-lead.md`):
- Step 1 reads `.great_cto/brain.md` before designing architecture
- Extracts: patterns in use, known failures to avoid, tech debt context, team patterns
- First-feature projects get "NO_BRAIN" signal and skip lookup

**3. Brain write after ARCH doc** (`agents/tech-lead.md`):
- Appends to Evidence Timeline after each architecture decision
- Records: date, feature name, archetype, pipeline size, ADR count, key decisions
- Evidence is append-only; synthesis is recomputed by /digest dream cycle

**4. Dream Cycle in `/digest`** (`commands/digest.md`):
- Creates brain.md if missing (digest-only projects without /start)
- Appends to Evidence Timeline: velocity, postmortem count, security blocks, retro signals, P2 count
- Updates Current Synthesis sections when signals cross thresholds
- Uses advisor (Sonnet 4.6, max 1) for prose synthesis

**5. SessionStart injects brain.md** (`.claude-plugin/plugin.json`):
- `head -30 .great_cto/brain.md` injected into every session after PROJECT.md
- Agents start each session aware of accumulated project knowledge

**Why**: Each session was starting cold — no memory of past architectural decisions, known failures, or team patterns. Agents repeated past mistakes. Brain-first lookup + dream cycle creates a living knowledge base that improves with each feature shipped.

---

## v1.0.55 — 2026-04-15

### Added — Pipeline Triad improvements

**1. Discovery guard in `/start`** (`commands/start.md`):
- Detects vague/research/MVP-without-requirements descriptions before type detection
- Signals: "explore", "figure out", "not sure", "validate idea", "PoC", "experiment", etc.
- Shows warning with alternatives: discuss first / /audit / "I know what to build"
- Does NOT trigger for "prototype JWT auth" or "MVP for SaaS dashboard" (clear deliverables)

**2. Cost estimate in `tech-lead` Checkpoint A** (`agents/tech-lead.md`):
- Shows token/cost/time estimate before CTO approves architecture
- Table: nano ~$0.10 / small ~$1 / medium ~$4-6 / large ~$10-14 / enterprise ~$20-30
- Adds ~20% for MANDATORY security gate archetypes
- Notes advisor (Opus) call surcharge when applicable

**3. Eval Harness** (`docs/eval/`):
- 5 canonical test cases covering key pipeline behaviors
- EVAL-001: CRUD endpoint (baseline, web-service small)
- EVAL-002: JWT auth service (commerce mandatory security gate)
- EVAL-003: Discovery guard triggers correctly (positive + negative cases)
- EVAL-004: Hotfix nano — senior-dev only, no ARCH doc
- EVAL-005: Security officer blocks SQL injection, approves after fix

**4. `/audit eval` action** (`commands/audit.md`):
- `/audit eval` runs all EVAL-*.md assertions
- Reports PASS / FAIL / WARN per case
- Shows score: N/5 passing
- FAIL cases show specific missing artifact + remediation hint

**Why**: Pipeline Triad article identified that pipelines fail when fed discovery tasks.
Cost visibility before gate:arch prevents surprise spend. Eval harness catches
agent regressions after prompt changes.

---

## v1.0.54 — 2026-04-15

### Added — Advisor Tool, Memory Tool, Automatic Caching

Based on analysis of Anthropic API changelog (April 9 + February 19, 2026).

**#1 Advisor Tool (`advisor_20260301`) — public beta since April 9, 2026:**

Executor model calls advisor mid-generation when uncertain. Beta header: `advisor-tool-2026-03-01`.

| Agent / Command | Executor | Advisor | max_uses | When advisor activates |
|----------------|----------|---------|---------|----------------------|
| `qa-engineer` | haiku | sonnet | 2 | edge case test coverage decisions |
| `security-officer` | sonnet | opus | 2 | compliance edge cases (regulated/web3) |
| `senior-dev` | sonnet | opus | 1 | architectural trade-offs not in ARCH doc |
| `devops` | haiku | sonnet | 1 | deployment strategy questions |
| `/review` | sonnet | opus | 2 | subtle concurrency / LLM trust issues |
| `/digest` | haiku | sonnet | 1 | RECOMMENDATION quality |

`tech-lead` already uses Opus — no advisor needed.

**#2 Memory Tool (`memory_20250929`) — GA since February 17, 2026:**

Intra-session memory for architectural context propagation:
- `tech-lead` writes key decisions to memory after ARCH doc (pattern, stack, constraints, rejected alternatives)
- `senior-dev` reads tech-lead memory before implementation — no need to re-derive from full ARCH doc
- `qa-engineer` and `security-officer` get memory access for cross-agent context

**#3 Automatic Caching — GA since February 19, 2026:**

Reordered SessionStart hook output: stable content first → higher cache hit rate.
- Was: PREFERENCES → PROJECT → LOCAL → HANDOFF → STATUS
- Now: PREFERENCES → LOCAL → PROJECT → HANDOFF → STATUS
- LOCAL (rarely changes) now before PROJECT (changes per feature)

**#4 Haiku-3 deprecation check — CLEAN:**

No explicit `claude-3-haiku` IDs found in agents or commands. All aliases (`haiku`, `sonnet`, `opus`) resolve to 4.5/4.6 automatically. No action needed.

---

## v1.0.53 — 2026-04-14

### Added — `/release` command for frontend and mobile releases

**`commands/release.md`** — 4 actions:
- `notes [version]` — writes App Store (4000 chars), Google Play (500 chars), in-app modal text. Filters out internal/infra commits automatically.
- `changelog [from..to]` — translates git commits → user-facing `CHANGELOG-USER.md` (separate from technical CHANGELOG.md). Groups related commits, omits internal changes.
- `docs` — flags stale help center articles, landing page sections, and guides based on new features. Does not auto-edit — flags only.
- `sync` — checks version consistency across package.json, build.gradle, Info.plist, PROJECT.md + verifies all release artifacts exist.

Archetype-aware: proceeds for `mobile-app`, `web-service`, `commerce`, `ai-system`. Warns for `library`, `infra`, `data-platform`.

**Why**: devops agent writes technical CHANGELOG.md. Nobody writes the App Store notes, user changelog, or checks which help articles are stale. This does that.

---

## v1.0.52 — 2026-04-14

### Changed — Reduced from 13 commands to 5

**Deleted** (5 commands): `/status`, `/capture`, `/revisit`, `/board-report`, `/update`
- `/status` duplicated `/inbox` (>60% overlap)
- `/capture`, `/revisit` — rarely used, replaceable via chat
- `/board-report` → merged into `/digest` as flag: `/digest Q2 board`
- `/update` → SessionStart hook already handles file sync

**Demoted to extended** (still callable, not advertised): `/digest`, `/ownership`, `/oncall`

**Modified**:
- `commands/digest.md` — added `board` flag: `/digest Q2 board` generates board-report and saves to `docs/board-reports/`
- `commands/rfc.md` — added team-size guard: shows warning if team-size < 10
- `commands/start.md` — confirmation hint updated (no more /ownership and /oncall references)
- `plugin.json` — CMD loop reduced from 13 to 8 commands; version 1.0.51 → 1.0.52
- `README.md` — 5-command structure with extended section

**Why**: Solo founders and small teams shouldn't need to learn 13 commands. The 5 primary commands cover 95% of daily use. Everything else is either automatic or accessible when you need it.

---

## v1.0.51 — 2026-04-14

### Changed — Focused positioning: solo founders and teams up to 50 engineers

**README**:
- Tagline: "Replace your engineering bottleneck" → "The engineering process for solo founders and teams up to 50 engineers"
- Why this matters: removed corporate tone → concrete pain of solo/small team
- Use Cases table: "20-200 engineers" → "10-50 engineers", added solo founder row
- Team commands section: "20-200" → "10-50"
- Built with: "200-person" → "50-engineer"

**plugin.json description**: updated to match new positioning
- Was: "Automated SDLC framework for CTOs. One account = one project..."
- Now: "Engineering process for solo founders and teams up to 50 engineers. Agents do architecture, code review, QA, and security. You make two decisions per feature."

**commands/start.md**: confirmation message shows team setup hint when team-size ≥ 5

**Why**: 200-person teams have Jira, Engineering Managers, platform teams — great_cto can't compete there. The real value is 5-50 engineers who need process without overhead.

---

## v1.0.50 — 2026-04-14

### Fixed — 5 integration gaps

**`/digest` + `/inbox` + `/status`** → Team section:
- Shows on-call person, RFC overdue count, ownership gaps
- Hidden when team commands not configured (no noise for solo projects)
- RECOMMENDATION examples extended with RFC/oncall/ownership signals

**`l3-support`** → reads OWNERSHIP.md for P0 escalation:
- Finds affected service owner from OWNERSHIP.md before escalating
- Gets current on-call from oncall-schedule.md (fallback: PROJECT.md)
- Escalation path: on-call → team lead (from OWNERSHIP) → CTO
- Added `approval-level` read: `auto` → skip postmortem

**`/board-report`** → reuses `digest-latest.md` if <7 days old:
- Extracts COMMITS, DEPLOY_COUNT, OPEN_P0 from existing digest
- Falls back to raw data collection only if digest is stale

**`/start`** → team-size aware initialization:
- `team-size:` field added to PROJECT.md template
- If team-size ≥ 5 and no OWNERSHIP.md exists → auto-scaffolds ownership table from detected service roots
- Tells CTO: "OWNERSHIP.md scaffolded → fill in team details"

**README demo** → two scenarios (solo + growing team):
- Solo: feature pipeline with 11-angle review + two approvals
- Team 20+: /rfc cross-team decision → /oncall who → /board-report

---


## v1.0.49 — 2026-04-14

### Added — 4 commands for teams of 20-200

**`/ownership`** — service ownership matrix:
- `/ownership map` — auto-detect from git history + package.json/go.mod/Cargo.toml; proposes team→service→TL table
- `/ownership show` — current ownership table
- `/ownership set <path> <team>` — update a single entry
- `/ownership verify` — find unowned paths and stale owners (no commits in 90+ days)
- Generates CODEOWNERS from the table
- Read by: oncall (who is on-call per service), security-officer (who to escalate P0 to), rfc (affected teams)

**`/oncall`** — on-call rotations:
- `/oncall who` — who is on-call now, time remaining, contacts
- `/oncall schedule <team> <members>` — configure rotation (weekly/biweekly), generates 8-week schedule
- `/oncall handoff` — auto-generated shift handoff note: incidents during shift, open P0/P1, fragile areas, performance trend
- `/oncall escalate <service>` — escalation path for a specific service
- Reads OWNERSHIP.md → knows team and Slack channel per service

**`/rfc`** — RFC process for cross-team decisions:
- `/rfc new "title"` — creates RFC-NNN with template (problem, proposal, alternatives, impact, open questions)
- `/rfc list` — all open RFCs with deadlines; ⚠ flag for overdue
- `/rfc show <id>` — full RFC text
- `/rfc comment <id> "text"` — add a comment to an RFC
- `/rfc close <id> accept|reject "reason"` — close RFC; on accept → auto-creates ADR
- Statuses: DRAFT → REVIEW → ACCEPTED / REJECTED / WITHDRAWN
- Review deadline: 5 business days from creation

**`/board-report`** — quarterly report for CEO/investors:
- Reads: git history, DORA metrics, audit reports, verdict logs, open gates, RFC activity, compliance status
- Translates technical metrics into business language (no jargon)
- Sections: Executive Summary (3 bullets), Delivery, Reliability, Security & Compliance, Team, Risks (table), Investments, Next Quarter Focus
- Arguments: `/board-report` (current quarter) / `/board-report Q1` / `/board-report 30` (last N days)
- Saves to `docs/board-reports/BOARD-<YEAR>-<QN>.md`

### Impact
- 13 commands (was 9) — full coverage for teams of 20-200
- New artifacts: `docs/rfcs/`, `docs/board-reports/`, `docs/handoffs/`, `.great_cto/OWNERSHIP.md`, `.great_cto/oncall-schedule.md`, `CODEOWNERS`
- 0 changes to existing agents — integration via shared file reads

---

## v1.0.48 — 2026-04-14

### Added — Weekly automation + cleaner session status

**Weekly scheduled tasks** (set up automatically by `/start`):
- `/digest` — every Monday at 9:00 (DORA metrics for the week → `.great_cto/digest-latest.md`)
- `/audit` — every Sunday at 23:00 (dependency scan + secrets scan → `docs/audits/AUDIT-AUTO-*.md`)
- Created via `mcp__scheduled-tasks__create_scheduled_task` (Claude Code native scheduling)
- If tool unavailable — `/start` skips silently, outputs a reminder

**SessionStart: `=== STATUS ===` block** — at the end of each session start:
- `branch | gates=N | tasks=N | last_agent=<name>`
- If open gates exist → `→ run /inbox to see pending decisions`
- Top-5 lines of the latest `/digest` (if `.great_cto/digest-latest.md` exists)

**README** — updated for v1.0.48:
- Commands: `/review` now 11-angle (was 3)
- New "Automatic" section — what happens without commands
- "Approval Levels" section — auto/gates-only/strict/expert/step-by-step table
- Proof Loop, User Spec → Tech Spec, HANDOFF.md — mentioned in agents section

---

## v1.0.47 — 2026-04-14

### Changed — Auto-handoff replaces /handoff command

**Auto-handoff via PreCompact hook** — HANDOFF.md now written automatically:
- `PreCompact` hook extended: before context compaction, writes `.great_cto/HANDOFF.md` with a state snapshot (git, open gates, open tasks, last verdict, latest docs)
- `SessionStart` hook extended: on new session start, reads `HANDOFF.md` and shows it to CTO in `=== HANDOFF ===` block
- `/handoff` command removed — no longer needed, everything happens automatically

**Before**: CTO had to manually run `/handoff` before closing a session
**After**: PreCompact fires automatically on context compaction → next session sees the state without any CTO action

---

## v1.0.46 — 2026-04-13

### Added — 5 features from community research

**Proof Loop** — agents verify their own output before claiming done:
- `senior-dev`: re-checks every REQ-* item from ARCH doc before closing task; re-runs tests; max 2 self-fix attempts before escalating
- `qa-engineer`: new Step 3d verifies all QA plan items were actually executed before writing PASS
- `tech-lead`: new Step 5b checks 9 ARCH doc quality rules before creating gate:arch
- `security-officer`: new Step 5c verifies all mandatory security checks were run before verdict

**Session Handoff** (`/handoff` command) — structured context transfer between sessions:
- Captures: pipeline stage, git state, open gates, open tasks, latest docs, recent ADRs
- Writes `.great_cto/HANDOFF.md` with "resume from here" instructions
- Accepts optional CTO note: `/handoff "waiting for legal approval on PCI scope"`
- Next session starts: read HANDOFF.md → `/inbox` → continue

**Validator Auto-retry 3x** — qa-engineer and security-officer retry on soft failures:
- Soft failures (network timeout, missing optional tool, flaky test): retry up to 3x with 2-3s delay
- Hard failures (logic assertion, compile error, confirmed CVE): write FAIL immediately
- Flaky test protocol: PASS with P2 note if ≥1/3 runs pass; note `Reliability: N/3 runs` in report
- Security scanner unavailable after 3 attempts: P2 note "manual review required" (not a blocker)

**User Spec → Tech Spec separation** (tech-lead, `expert`/`step-by-step` only):
- Produces `docs/specs/USER-SPEC-<feature>.md` first (business language: what, who, why, success criteria)
- CTO approves USER-SPEC before ARCH doc is written
- ARCH doc links back to USER-SPEC; Requirements Checklist maps each USC to a REQ
- Skipped for `auto`/`gates-only`/`strict` (no overhead for standard workflow)

**11-angle code review** (`/review`):
- Was: 3 angles (performance, security, readability)
- Now: 11 angles — adds SQL safety, LLM trust boundaries (ai-system only), conditional side effects, data privacy, error handling, concurrency, dependency freshness, API contracts
- Angle 5 (LLM trust) auto-skips if `archetype ≠ ai-system`
- Summary now shows all 11 reviewers with individual P0/P1/P2 counts

### Fixed
- `plugin.json` SessionStart: removed stale `PIPELINES.md` and `notify.sh` copy (both deleted in v1.0.45)
- `plugin.json` SessionStart: added `handoff` to command copy list
- `plugin.json` PermissionDenied hook: removed Telegram call, now logs to `.great_cto/permission-denied.log`
- `/review` setup: reads `approval-level` (was `review_mode`, merged in v1.0.45)

---

## v1.0.45 — 2026-04-14

### Changed — Pure reduction: -1000 lines, 3 knobs → 1

**Deleted PIPELINES.md** (was 892 lines):
- Type Detection Keywords → moved to TYPE_MAP.md
- QA/Deploy/Threshold/Gate tables → already in ARCHETYPES.md (redundant since v1.0.37)
- Pipeline Size Selector → replaced by `approval-level`
- Special Rules + Conflict Matrix → simplified to archetype-based in SKILL.md (~100→15 lines)
- All agent/command `PIPELINES_MD` references → replaced with `ARCHETYPES_MD`

**Merged 3 knobs into 1 `approval-level`** (was: `project_size` + `interaction_mode` + `review_mode`):
- `auto` — 0 gates, 0 checkpoints (hotfix)
- `gates-only` — gate:arch + gate:ship (default)
- `strict` — + gate:code (code review required)
- `expert` — all gates + 2 checkpoints per agent (deep review)
- `step-by-step` — every substep (learning)
- Default changed from `verbose` (35 approvals/day) to `gates-only` (2 approvals/day)

**Removed unused PROJECT.md fields**:
- `availability-sla` — never read by any agent
- `architecture-framework` — niche, CTO writes in ARCH doc if needed
- `findings-refs` — orphaned by v1.0.44 `/audit --refresh` removal
- `audit-sha` → moved to `.great_cto/audit-state.json` (internal, not user-facing)

**Honest README**:
- "automates SDLC" → "AI-assisted SDLC orchestration. Agents diagnose, plan, and review. You decide and deploy."
- Removed PIPELINES.md from Links section

### Impact
- ~1000 lines deleted (30% of codebase)
- 1 PROJECT.md field to understand (`approval-level`) instead of 3 (`project_size` + `interaction_mode` + `review_mode`)
- Adding a new type: still 1 row in TYPE_MAP.md — nothing else
- Source of truth: ARCHETYPES.md + TYPE_MAP.md + domain packs. No legacy shadow document.

---

## v1.0.44 — 2026-04-13

### Removed — `/audit --refresh` mode

**Why**: v1.0.43 parallelization + CVE cache made full `/audit` fast (~1-1.5min). Separate refresh mode duplicates logic with marginal speedup. Simpler to just re-run `/audit`.

- Removed `--refresh` flag from `/audit` command
- Removed Mode Detection section from `project-auditor.md`
- Removed Phase 10 (Refresh Mode) from `project-auditor.md` (~80 lines)
- `security-officer` step 1c stale audit message now suggests `/audit` (not `--refresh`)

### Preserved
- `audit-sha:` field in PROJECT.md — still written by `/audit`, still read by security-officer for stale detection
- `findings-refs:` list — still useful for traceability (bd:ID → file:line)
- CVE cache 24h — makes re-running `/audit` nearly as fast as refresh was

### Impact
- Fewer commands to learn (one audit command, not two modes)
- ~80 lines less code to maintain in project-auditor.md
- Same speed in practice (CVE cache makes 2nd audit fast anyway)

---

## v1.0.43 — 2026-04-13

### Changed — Performance (parallelization + caching + lazy loading)

**Parallel execution:**
- `project-auditor`: Phases 1-4 (stack, CVE, age, architecture debt) now run in parallel via 4 Agent tool sub-agents — **~3-4x faster `/audit`**
- `security-officer`: compliance checklists parallelized when ≥2 values — one sub-agent per checklist (e.g. `[iso27001, sox, pci-dss]` runs 3 checklists in parallel) — **~2-3x faster for regulated projects**
- `qa-engineer`: test execution split into Group A (parallel — unit, perf, security, rollback) + Group B (sequential — integration, E2E with DB) — **~1.5-2x faster for medium+ projects**

**Lazy pack loading:**
- `qa-engineer` + `security-officer`: packs loaded only when a specific `qa-extras` or `compliance` value needs them — not eagerly
- No compliance values → skip pack load entirely (saves ~5-10k tokens per session)

**Caching** (new `.great_cto/cache/` directory, gitignored):
- CVE scan results cached for 24h (invalidated when `package-lock.json`, `Cargo.lock`, `poetry.lock`, `go.sum` change)
- Stack detection cached for 24h (invalidated when manifest files change)
- `/digest` output cached for 1h (digest-based on stable past data)

**Skip redundant checks:**
- `/audit --refresh`: already skips Phases 1-6 (no full scan), only runs Phase 10 refresh
- `/audit` type drift check: skipped if PROJECT.md < 7 days old (`SKIP_DRIFT=true`)

**Session init:**
- SKILL.md: auto-creates `.great_cto/cache/` + adds to `.gitignore` on first session

### Impact
- `/audit` on medium project: ~5min → ~1-1.5min
- `/audit --refresh`: already fast, unchanged
- `/digest` second run in hour: instant (cache hit)
- Security audit with 3 compliance frameworks: ~5min → ~2min
- QA for medium project: ~3min → ~1.5min

### Safety
- Parallelization only applied to read-only phases / independent tasks
- Cache invalidation automatic on manifest/lock file changes
- Fallback to sequential if Agent tool unavailable (no regression)

---

## v1.0.42 — 2026-04-13

### Added — Interactive checkpoints per agent (human-in-the-loop)

**Problem (from user feedback)**: agents run autonomously, CTO sees result only in `/inbox`. If agent errs on step 3, 4-5 steps are wasted before catch. No way to intervene mid-stream.

**Solution**: each agent pauses at **2 checkpoints** — plan (before action) + result (after action). CTO approves or comments. Comments → agent revises → re-checkpoint.

- **New field in PROJECT.md**: `interaction_mode: quiet | normal | verbose | step-by-step`
  - `quiet` = 0 checkpoints (autonomous, nano/hotfix)
  - `normal` = original gate:arch + gate:ship only
  - `verbose` = **default** — 2 per agent (plan + result)
  - `step-by-step` = checkpoint on every major substep

- **SKILL.md § Interaction Mode**: standard checkpoint pattern. Three options at each checkpoint: `[enter] approve`, `<text> comment to revise`, `cancel`. Comments trigger revision loop (max 3 rounds per checkpoint).

- **Agent checkpoints** added:
  - `tech-lead`: (A) before ARCH write — show options + trade-offs + cost; (B) after ARCH + ADR + Beads tasks — show summary
  - `senior-dev`: (A) before implementation — show plan + TDD cases; (B) after PR — show diff summary
  - `qa-engineer`: (A) before tests — show QA plan + tools + thresholds; (B) after report — show PASS/FAIL + bugs
  - `security-officer`: (A) before audit — show compliance scope + targets; (B) after CSO report — show APPROVED/BLOCKED + findings
  - `devops`: (A) before staging — show deploy plan; (B) before prod — show staging results; (C) after prod — show canary metrics

- **Safety mandates**: devops B+C checkpoints + security-officer (for MANDATORY archetypes) are always shown regardless of mode. Production deploys always require human approval.

### Impact
- Errors caught early: tech-lead wrong approach → caught at Checkpoint A, not after 5 agent runs
- Natural revision loop: "use sessions instead" → tech-lead re-plans → re-checkpoint
- Trade-off: +10 approvals/day in verbose mode. Switch to `normal` for routine work.

---

## v1.0.41 — 2026-04-13

### Added — `/audit --refresh` mode + stale findings detection

**Problem (from real user feedback)**: `/audit` finds P0 bugs → user commits fixes → PROJECT.md still shows `P0:2`. Next `/start` for mandatory archetype → security-officer blocks pipeline on stale findings.

**Solution**: audit writes commit SHA + Beads task refs per finding. `/audit --refresh` re-verifies only known findings against current code. Security-officer detects staleness and suggests refresh.

- **`project-auditor`**: Phase 7 now writes `audit-sha: <HEAD>` and `findings-refs:` list in PROJECT.md. Each entry links Beads task to file:line.
- **`project-auditor`**: Phase 10 added — Refresh Mode. Parses `findings-refs:`, checks each against current code per finding type (secrets, CVE, unpinned-dep, SQL-injection, god-file, missing-test). Closes Beads tasks verified fixed. Updates PROJECT.md counters.
- **`/audit --refresh`**: new mode flag. Skips full scan when no new audit needed. Falls back to full audit if no prior `audit-sha:` in PROJECT.md.
- **`security-officer`**: step 1c checks if PROJECT.md `audit-sha` ≠ current HEAD AND P0 > 0 → notes in CSO report + suggests `/audit --refresh`. Does NOT auto-close findings.

### Impact
- After commits that fix audit findings: `/audit --refresh` takes seconds (not minutes), closes fixed findings, updates counters
- Pipeline no longer blocks on stale findings once refresh run
- Audit gets better with use: each full audit → commit fixes → refresh → lean finding list

### Safety
- Refresh never auto-closes findings in Beads — only after pattern verification
- >30 commits since last audit OR lock-file changes → refresh suggests full re-audit instead

---

## v1.0.40 — 2026-04-10

### Fixed — 16 audit findings (2 P0, 4 P1, 10 P2)

**P0 (broken):**
- README: pack entry counts corrected (ai-pack: 16→20, web3-pack: 12→17, data-pack: 11→14)
- `/audit`: "57 types" → "73 types in TYPE_MAP.md"

**P1 (inconsistencies):**
- README: added `RELEASE-*.md` to artifact list
- ARCHETYPES.md: renamed "Compliance Parameter Values" → "Parameter Values" (togaf is architecture, not compliance)
- TYPE_MAP.md: split `Default params` and `Overrides` into separate columns (security-gate, min-size no longer mixed with compliance)
- ARCHETYPES.md: added single source of truth for MANDATORY security gate archetypes (`ai-system`, `commerce`, `web3`, `iot-embedded`, `regulated`)

**P2 (improvements):**
- qa-engineer + security-officer: pack loading path fallback (`find . .great_cto` if `~/.claude` path fails)
- `/start`: nano + MANDATORY type conflict → auto-upgrade to `medium` with warning
- `/start`: nano size definition now includes `<500 LOC` upper bound
- tech-lead: enforces `min-size:` from TYPE_MAP.md Overrides column; warns if upgrading
- `/start`: documented pack auto-detection for all 10 archetypes (5 get packs, 5 default to none)
- `/start`: override loop guard — max 2 rounds, then asks for explicit archetype
- README: added "Packs auto-load by archetype. Override in PROJECT.md" note
- SKILL.md: added `/digest`, `/review`, `/status` to intent mapping table
- SKILL.md: improved Beads unavailable message with fallback explanation + install link
- `/start`: consolidated file reading pattern (PIPELINES→keywords, TYPE_MAP→archetype, ARCHETYPES→rules)

---

## v1.0.39 — 2026-04-10

### Changed — Agent Simplification (Phase 3 of 3)

Replaced type-specific conditionals in agents with archetype-based logic:

- **`security-officer`**: Step 5 (compliance) rewritten — was 50+ lines of inline checklists (ISO 27001 Annex A, SOX ITGC, SOC2, HIPAA, GDPR, type-specific examples). Now: iterate `compliance:` params → delegate to domain pack checklists. Universal PII checks retained inline. ~50 lines removed.
- **`qa-engineer`**: Step 1 rewritten — was type-merge algorithm reading PIPELINES.md per-type QA strategies. Now: read ARCHETYPES.md for base QA strategy → extend with pack-defined `qa-extras` → apply `compliance:` QA checks. Threshold override from `performance-sla:` param.
- **`senior-dev`**: Step 5 (TDD) simplified — was 5 type-specific overrides (infra-iac, db-migration, data-visualization, llm-ops, data-warehouse). Now: 3 archetype-based branches (infra → Terratest, data-platform → dbt, ai-system → evals-first, all others → standard TDD).
- **`devops`**: Step 5 (staging deploy) simplified — was 4 type-category branches. Now: 8 archetype-based branches matching ARCHETYPES.md deploy method table.

### Impact — Before vs After

| Metric | Before (v1.0.36) | After (v1.0.39) |
|--------|------------------|------------------|
| PIPELINES.md | 800+ lines, sole source of truth | Legacy reference — ARCHETYPES.md (120 lines) is primary |
| security-officer compliance | 50+ lines inline, type-specific | 15 lines: loop over params → delegate to pack |
| qa-engineer strategy | Type-merge algorithm + PIPELINES.md lookup | Archetype base + pack extras |
| senior-dev TDD | 5 type-specific if-else | 3 archetype branches |
| devops deploy | 4 type-category branches | 8 archetype branches (matches ARCHETYPES.md) |
| Adding a new type | Edit 7 tables in PIPELINES.md + touch 4 agents | Add 1 row to TYPE_MAP.md (archetype + params) |

---

## v1.0.38 — 2026-04-10

### Added — Domain Packs (Phase 2 of 3)

4 domain packs extract type-specific depth from PIPELINES.md into standalone files:

- **`packs/ai-pack.md`** — 16 qa-extras definitions: `wer`, `ttfb`, `barge-in`, `dtmf-fallback`, `concurrent-calls`, `retrieval-quality`, `prompt-regression`, `cost-cap`, `per-modality-accuracy`, `hallucination`, `cross-modal`, `tool-injection`, `schema-enforcement`, `bias-audit`, `model-card`, `drift-monitoring`, `data-poisoning`. Compliance extras: `eu-ai-act`, `tcpa`, `gdpr-biometric`.
- **`packs/web3-pack.md`** — 12 qa-extras: `formal-verification`, `flash-loan-sim`, `economic-attack-sim`, `kill-switch`, `slither-audit`, `echidna-fuzz`, `reentrancy-guard`, `gas-optimization`, `key-ceremony`, `sanctions-screening`, `kyc-aml`, `order-matching`, `circuit-breaker`. Compliance: `fatf`, `ccss`, `ofac`, `kyc-aml-regs`.
- **`packs/enterprise-pack.md`** — 6 deep compliance checklists: `21cfr11` (IQ/OQ/PQ + ALCOA+ + e-signatures), `nis2` (10 Article 21 measures + Article 23 reporting), `dora` (ICT risk + third-party register + TLPT), `tisax` (VDA ISA + AL1/2/3 + OEM-specific), `iso27001` (93 Annex A controls + SoA + risk assessment), `sox` (ITGC: change management, logical access, computer ops, SoD).
- **`packs/data-pack.md`** — 11 qa-extras: `data-lineage`, `pii-classification`, `schema-diff`, `point-in-time`, `online-offline-consistency`, `freshness-sla`, `snapshot-regression`, `backtest-validation`, `rollback-dry-run`, `dbt-test`, `contract-validation`. Compliance: `data-lineage-compliance`, `retention-policy`, `data-residency`.

**Pack loading**:
- `/start` auto-detects packs from archetype: `ai-system` → `[ai-pack]`, `web3` → `[web3-pack]`, `regulated` → `[enterprise-pack]`, `data-platform` → `[data-pack]`
- `qa-engineer` reads pack files at runtime for qa-extras definitions (what/tool/threshold/edge inputs)
- `security-officer` reads pack files for deep compliance checklists (replaces inline checklists when pack is more detailed)

### Impact
- Each pack is self-contained: can be understood without reading PIPELINES.md
- Packs are additive: CTO adds `packs: [ai-pack, enterprise-pack]` for an AI system in a regulated industry
- Next: v1.0.39 = agent simplification (remove type-specific conditionals from agent files)

---

## v1.0.37 — 2026-04-10

### Added — Archetype-based pipeline architecture (Phase 1 of 3)

**Problem**: 75 specific types × 5 sizes × compliance frameworks = combinatorial explosion. PIPELINES.md at 800+ lines, each agent full of type-specific conditionals. 80% of users use ~10 types.

**Solution**: 10 archetypes + parameter-driven customization. Specific types become aliases.

- **`ARCHETYPES.md`** (NEW) — 10 archetype definitions with base rules:
  - `web-service`, `mobile-app`, `ai-system`, `data-platform`, `infra`, `library`, `commerce`, `web3`, `iot-embedded`, `regulated`
  - Each archetype: QA strategy, deploy method, thresholds, security gate default, gates-by-size matrix
  - Compliance driven by `compliance: [values]` parameter (13 values: gdpr, pci-dss, sox, iso27001, dora, nis2, 21cfr11, tisax, etc.)
  - `qa-extras: [values]` extends base QA (from domain packs in v1.0.38)
  - Parameter resolution order: archetype base → size adjustment → compliance → qa-extras → explicit overrides → domain pack

- **`TYPE_MAP.md`** (NEW) — 75 specific types → archetype + default params:
  - `voice-agent` → `ai-system` + compliance: [tcpa, gdpr-biometric] + qa-extras: [wer, ttfb, barge-in]
  - `payment-service` → `commerce` + compliance: [pci-dss, sox] + min-size: enterprise
  - `rest-api` → `web-service` + compliance: [owasp-api]
  - Unmapped types default to `web-service` with warning

- **`/start`** — now resolves type → archetype before writing PROJECT.md:
  - PROJECT.md gets `archetype:` field + `compliance:` + `qa-extras:` + `security-gate:` params
  - Confirmation shows archetype + pipeline: `ai-system (from voice-agent) | medium | 5 agents [~45min]`

- **`tech-lead`** — reads `archetype:` + params from PROJECT.md; uses ARCHETYPES.md for QA strategy and deploy constraints
- **`qa-engineer`** — reads `archetype:` for base QA plan, `qa-extras:` for additional checks, `compliance:` for compliance QA
- **`security-officer`** — reads `compliance:` param list; each value maps to a checklist; backwards compat with PIPELINES.md type-specific rules
- **`devops`** — reads `archetype:` for deploy method from ARCHETYPES.md

### Migration
- Backwards compatible: agents read `archetype:` first, fall back to `primary:` type + PIPELINES.md
- Existing PROJECT.md files work as-is (no archetype → agents use type-based logic)
- PIPELINES.md retained as legacy reference — domain-specific depth still available
- Next: v1.0.38 = domain packs, v1.0.39 = agent simplification

---

## v1.0.36 — 2026-04-10

### Added — Smart /start onboarding
- **`/start` Step 2b** — auto-detects `project_size` and `greenfield` from description + repo state:
  - Size inferred from description signals ("fix" → nano, "add feature" → small, "build service" → medium, etc.)
  - Regulated types → always `enterprise` override
  - Greenfield: checks `src_files > 10` in repo + description signals ("existing", "our codebase")
- **`/start` confirmation** — shows detected type + size + pipeline as one-liner before starting:
  ```
  Detected: type=rest-api | size=small | 3 agents
  Pipeline: tech-lead → senior-dev → qa [~20min]
  ```
- **`/start` override replies** — CTO can correct before PROJECT.md is written:
  - "go" / "yes" → proceed
  - "existing" → sets `greenfield: false`
  - "make it large" → upgrades size
  - "nano" → downgrades to nano
- **PROJECT.md** — now includes `project_size:` and `greenfield:` fields from setup
- **`tech-lead`** — reads `greenfield: false` → scans existing entry points, API contracts, schema before designing architecture (additive design, not redesign)
- Only asks ONE question if greenfield is ambiguous — never asks type/size/team directly

---

## v1.0.35 — 2026-04-10

### Added — Adaptive Pipeline Sizing
- **`project_size` field** in PROJECT.md: `nano | small | medium | large | enterprise`
- **PIPELINES.md** — new `## Pipeline Size Selector` section:
  - Size determination rules (file count + type signals)
  - Type overrides: regulated types always → `enterprise`; MANDATORY security gate types → min `medium`
  - Required-agents matrix: which agents run at each size
  - Lightweight QA mode for `small` (unit tests only, no load test, no rollback dry-run)
  - Direct deploy for `nano` (no QA agent, no security-officer, no devops agent)
- **`tech-lead`**: determines `project_size` as step 2, writes to PROJECT.md; nano → skips ARCH doc + gate entirely
- **`senior-dev`**: reads `project_size`; nano → skips gate:arch check, deploys directly after merge
- **`qa-engineer`**: reads `project_size`; nano → exits immediately; small → lightweight mode (no perf baseline, no rollback dry-run, abbreviated report)
- **`security-officer`**: reads `project_size` + checks MANDATORY type list; nano/small non-MANDATORY → exits immediately
- **`devops`**: CSO report required only for medium/large/enterprise OR small + MANDATORY type; nano bypasses devops entirely
- **`l3-support`**: reads `project_size`; nano/small → exits; medium → 15min window; large → 30min; enterprise → 60min+

### Impact
- `rest-api` + nano (single-function fix) → 1 agent, ~5min
- `rest-api` + small (new endpoint) → 3 agents (tech-lead + senior-dev + qa), ~20min
- `payment-service` any size → always full 7-agent pipeline (MANDATORY override)
- `saas-platform` + large → full pipeline, canary deploy, 30min L3 window

---

## v1.0.34 — 2026-04-10

### Added — 3 new project types (top trending 2026)
- **`voice-agent`** — VAPI / ElevenLabs / Retell AI / telephony AI
  - QA: WER ≤5%, TTFB ≤300ms, turn latency ≤800ms, barge-in ≥95%, 2× load test
  - Deploy: canary by call % (1%→5%→20%→100%), webhook swap rollback
  - Compliance: TCPA (US consent), GDPR Art.9 (voice as biometric), per-jurisdiction recording notice, CASL
  - Gate Prerequisites: voice quality test results + TCPA consent evidence + GDPR DPIA (if biometric use)
- **`edge-app`** — Cloudflare Workers / Deno Deploy / Vercel Edge / Fastly Compute
  - QA: cold start ≤50ms p95, bundle ≤1MB, 0 Node.js API violations, global p95 ≤100ms from ≥5 regions
  - Deploy: atomic global CDN deploy → multi-region smoke test, CDN version rollback
  - Compliance: OWASP API Top 10 at edge + CSP enforcement + credential-in-worker audit
  - Gate Prerequisites: bundle size report + multi-region latency results + Node.js API surface audit
- **`multimodal-app`** — GPT-4o / Claude vision / Gemini apps (text + image + audio)
  - QA: per-modality accuracy vs baseline, hallucination ≤2%, latency per modality (text ≤2s, vision ≤5s, audio ≤3s)
  - Deploy: shadow mode → A/B per modality → full traffic, per-model feature flags rollback
  - Compliance: EU AI Act Annex III high-risk check, model card (all modalities), GDPR Art.22 (no purely automated decisions), child safety audit
  - Gate Prerequisites: per-modality eval results + EU AI Act classification doc + model card + data subject rights procedure
  - `multimodal-app` added to MANDATORY security gate list
- All 3 types fully covered in: Type Detection Keywords, QA Strategy, Deploy Method, Threshold Cross-Reference, Gate Prerequisites, MANDATORY compliance check

---

## v1.0.33 — 2026-04-10

### Added
- PIPELINES.md: 5 new project types — `critical-infrastructure`, `financial-services`, `gxp-system`, `iso27001-scope`, `automotive-supplier`
- PIPELINES.md: NIS2 Article 21, DORA (EU 2022/2554), 21 CFR Part 11, ISO 27001:2022, TISAX VDA ISA compliance entries in all relevant tables (QA Strategy, Deploy Method, MANDATORY security gate, compliance check, Gate Prerequisites)
- PIPELINES.md: SOX ITGC entries for `payment-service`, `data-warehouse`, `saas-platform`
- `security-officer`: ISO 27001:2022 Annex A checklist (all 93 controls, SoA ≥90% required) — triggered by `compliance: iso27001` or type `iso27001-scope`
- `security-officer`: SOX ITGC checklist (Change Management, Logical Access, Computer Operations, Segregation of Duties) — triggered by `sox: true` or types `payment-service`, `data-warehouse`, `saas-platform`; any ITGC failure → P0
- `tech-lead`: Well-Architected Assessment section in ARCH doc (6 pillars, 1-3 score) — triggered by `cloud: aws|gcp|azure` in PROJECT.md; score=1 pillar → Beads task auto-created
- `tech-lead`: TOGAF ADM Phase mapping section in ARCH doc — triggered by `architecture-framework: togaf` in PROJECT.md
- `/digest`: DORA Metrics section — Deployment Frequency, Lead Time for Changes, MTTR, Change Failure Rate; computed from perf-baseline.log + git timestamps + postmortems; DORA band label (elite/high/medium/low) per metric

---

## v1.0.32 — 2026-04-10

### Added
- `/review` command — 3-angle GATE:CODE (Performance / Security / Readability reviewers); creates or closes `gate:code`; verdict logged to `.great_cto/verdicts/code-review.log`
- `/status` command — pipeline dashboard: current stage, open gates + age, per-agent verdicts, last deploy, open P0/P1 bugs, active L3 monitoring
- `l3-support`: retrospective entry appended to `.great_cto/retrospectives/RETRO-YYYY-MM.md` after every postmortem — feeds tech-lead's pattern reader on next feature

### Fixed
- `security-officer`: now reads PIPELINES.md `MANDATORY compliance check` for the project type and runs type-specific checklists (was running generic GDPR/SOC2/HIPAA for all types)
- `security-officer`: Telegram notify after APPROVED/BLOCKED decision
- `/digest`: Linux-compatible date arithmetic (python3 fallback → macOS → Linux); perf-baseline format updated to `p95:Nms` (matches v1.0.30 devops format); added GATES section + AGENT VERDICTS section
- `devops`: CHANGELOG entry now uses `printf` instead of `echo "\n"` (portable across bash/sh/zsh)
- `project-auditor`: explicit PROJECT.md format template when creating on first audit
- `senior-dev`: hints CTO to run `/review` after PR when `review_mode: strict`
- `tech-lead`: DECISIONS.md auto-updated immediately after writing each ADR (no longer requires manual step)
- `/revisit`: DECISIONS.md index auto-updated when superseding an ADR
- `plugin.json`: SessionStart now copies `review.md` and `status.md` to `~/.claude/commands/`

---

## v1.0.31 — 2026-04-09

### Improved — PIPELINES.md v1.8 → v2.0 (51→95+ quality score)

**Phase 1 — Gate Prerequisites (highest impact):**
- Added 22 missing gate prerequisite rows: `monorepo`, `k8s-operator`, `desktop-app`, `browser-extension`, `vscode-extension`, `electron-app`, `realtime-system`, `messaging-queue`, `video-streaming`, `cms-headless`, `search-service`, `cli-tool`, `compiler-lang`, `wordpress-plugin`, `data-warehouse`, `internal-tool`, `data-pipeline`, `data-visualization`, `platform-engineering`, `chrome-extension-mv3`, `ai-agent-framework`, `llm-ops`
- All 65 types now have gate prerequisites — CI enforcement possible without guessing

**Phase 2 — Numeric defaults for vague thresholds:**
- `computer-vision`: mAP ≥0.50 default (was "task-specific"); override with `qa-mAP-threshold:` in PROJECT.md
- `time-series-forecasting`: MAPE ≤20% default (was "task threshold"); override with `qa-MAPE-threshold:`
- `video-streaming`: 10 Mbps bitrate baseline; override with `qa-bitrate-baseline:`
- New section: "QA Threshold Overrides via PROJECT.md" — documents 5 override keys for qa-engineer and devops

**Phase 3 — Rollback-deploy pair hardening:**
- `rag-system` deploy: prerequisite to snapshot index before reindex
- `static-site` deploy: record deploy ID to `.great_cto/static-deploy.log` for rollback
- `video-streaming` deploy: export CDN origin config before deploy
- `ai-agent` deploy: prerequisite for bias/fairness audit artifacts when `ai-bias-risk: true`
- `infra-iac` deploy: warning about dependent stack cascade risk

**Phase 4 — Geographic compliance gaps:**
- `web-fullstack`: added CCPA (CA/US), LGPD (BR), APPI (JP), PDPA (SG/TH) per-region triggers
- `notification-service`: added CASL (Canadian recipients — express consent, 10-day unsubscribe SLA)
- `ai-agent`, `llm-ops`: added EU AI Act Annex III + China CAC algorithm registration
- `rag-system`: added EU AI Act Annex III high-risk check
- `data-warehouse`: GDPR → GDPR/CCPA/LGPD right-to-erasure
- `bridge-protocol`: added CFTC compliance check for US commodity derivatives
- `infra-iac`: CIS Benchmarks versioned → CIS Benchmarks v8 (2024)
- `web-fullstack`: OWASP Top 10 versioned → OWASP Top 10 2021

**Phase 5 — Threshold alignment across QA Strategy ↔ Threshold Cross-Reference ↔ Gate Prerequisites:**
- `rest-api`: Threshold Cross-Reference now includes IDOR findings + rate limit (were in QA Strategy but not cross-reference)
- `graphql-api`: Threshold Cross-Reference now includes max_depth ≤10, max_complexity ≤1000, injection + IDOR findings
- `payment-service`: Threshold Cross-Reference now includes TLS 1.2+, MFA, availability ≥99.9%
- Gate Prerequisites for `rest-api` + `graphql-api`: extended to include security test evidence

**Phase 6 — Housekeeping:**
- Removed duplicate `auth-service` row in Multi-Region Deploy Strategy
- PIPELINES.md version bumped from 1.8 to 2.0

---

## v1.0.30 — 2026-04-10

### Fixed — 15 issues from quality audit (58→75+ score)

**Critical — Gate state machine:**
- `qa-engineer`: creates `gate:ship` explicitly on PASS (was never created, security-officer had no gate to close)
- `security-officer`: finds and closes `gate:ship` by label lookup (was closing a hardcoded ID)
- `senior-dev`: verifies `gate:arch` is closed before claiming any task (was able to start without architecture approval)
- `devops`: verifies QA report exists AND result=PASS AND CSO result=APPROVED before deploying (was only checking gate:ship status)

**High — Reliability:**
- `notify.sh`: retry up to 3× with exponential backoff; 4096-char message truncation; never blocks pipeline
- `perf-baseline.log`: consistent format `p95:<val>ms error_rate:<val>% ts:<ISO> feature:<name>` written by devops, read consistently by qa-engineer
- `devops`: smoke test success criteria now numerical (all 5 return 2xx, error rate <0.5%, p95 within 20% of baseline)
- `devops`: baseline NOT written on rolled-back deploys (was corrupting baseline)
- `l3-support`: escalation SLA with exact time windows (T+15 L2, T+30 L3+Telegram, T+60 major incident)

**Medium — Consistency:**
- `tech-lead`: reads `review_mode` from PROJECT.md and applies strict/auto gate logic
- `tech-lead` + `qa-engineer` + `security-officer`: write agent verdict logs to `.great_cto/verdicts/` for postmortem traceability
- `devops`: triggers l3-support monitoring task after every deploy (30min standard, 72h regulated types)
- `inbox`: gate approval now explicit — confirms what happens next after CTO approves/rejects
- `inbox`: "clear" state shows backlog count + PR count (was just "clear")
- `plugin.json`: PermissionDenied hook sends Telegram alert when Bash/Write blocked (was log-only)

---

## v1.0.29 — 2026-04-09

### Fixed — Plugin file sync reliability

- **Root cause:** SessionStart hook used `$(dirname "$0")` to find plugin dir — `$0` in hook context is the shell binary, not a plugin path. Commands were never copied for users.
- **Fix:** Hook now uses `ls -d ~/.claude/plugins/cache/local/great_cto/*/` + `sort -V | tail -1` to find the highest installed version automatically.
- `/update` Phase 0 added: re-syncs all plugin files (commands, agents, skills, notify.sh) on every `/update` run — recovery mechanism for any future drift.

---

## v1.0.28 — 2026-04-09

### Added — Telegram notifications for CTO gates and incidents

- `skills/great_cto/notify.sh` — curl-based Telegram helper; silent no-op if unconfigured (never blocks pipeline)
- First-run Telegram setup in `/start` — asks CTO once for bot token + chat ID, stores in `~/.great_cto/preferences.md`
- `tech-lead`: notifies CTO on `gate:arch` creation (architecture review pending)
- `devops`: notifies CTO on deploy complete (method, error rate, p95)
- `l3-support`: notifies CTO on P0 incident (description + ETA)
- `plugin.json` SessionStart hook: auto-copies and `chmod +x` `notify.sh` on session start

---

## v1.0.27 — 2026-04-09

### Added — 45 gaps applied across remaining 43 project types (PIPELINES.md v1.7 → v1.8)

**Web/Frontend + API:**
- `web-fullstack`, `spa-frontend`, `ssr-app`: OWASP ZAP scan (A03/A05/A06/A09) + CSP audit + SBOM (CycloneDX) + Core Web Vitals (LCP <2.5s, INP <200ms)
- `web-fullstack`, `spa-frontend`: GDPR cookie consent + tracking opt-out test
- `web-fullstack`: Keyboard navigation + contrast ratio ≥4.5:1 (WCAG 2.1 AA)
- `rest-api`, `graphql-api`, `bff`: OWASP API Top 10 scan (API1 IDOR, API3 field-level auth, API4 rate limiting, API8 misconfiguration)
- Added to MANDATORY compliance: `web-fullstack`, `spa-frontend`, `ssr-app`, `rest-api`, `graphql-api`, `bff`

**Mobile + Desktop + Extensions:**
- `mobile`: OWASP MASVS v2 (certificate pinning + local storage encryption + jailbreak detection) + privacy manifest (iOS) + ATT compliance + data safety form (Android, target API ≥34) + touch target audit (WCAG 2.1 mobile)
- `electron-app`: Electron Security Checklist (nodeIntegration=false, contextIsolation=true, sandbox=true, webviewTag=false, CSP no eval)
- `library-sdk`: Artifact signing (cosign/GPG) + SBOM + vulnerability disclosure policy + reproducible build test (OpenSSF/SLSA)
- Added to MANDATORY compliance: `mobile`, `electron-app`, `library-sdk`

**Data + Infrastructure + DevOps:**
- `infra-iac`: Checkov/tfsec + CIS benchmark compliance (K8s/AWS/GCP) + container image scan (Trivy)
- `k8s-operator`: CIS K8s 1.8 (pod security + network policies + non-root runtime) + container image scan
- `devops-tool`: SLSA provenance + artifact signing (cosign) + container image scan
- `data-warehouse`, `data-pipeline`: Data lineage tracking (OpenLineage/Marquez) + GDPR right-to-erasure verification
- Added to MANDATORY compliance: `infra-iac`, `k8s-operator`, `data-warehouse`
- **New Special Rules**: Container image scanning (Trivy, 0 critical CVEs) + SLSA provenance levels

**Realtime + Content + Special:**
- `embedded-iot`: ETSI EN 303 645 checklist (no default credentials + credential storage + attack surface + OTA signing)
- `video-streaming`: WebRTC security (DTLS-SRTP + ICE mDNS + TURN auth) per RFC 8826/8827
- `notification-service`: GDPR consent management + suppression list + DPIA
- `internal-tool`: Privilege escalation test (unauthorized role transitions + cross-tenant access + permission boundaries)
- `mcp-server`: Per-caller rate limiting + sandbox isolation verification
- `game`: Accessibility audit (colorblind mode + subtitles + remappable controls, WCAG 2.1)
- Added to MANDATORY compliance: `embedded-iot`, `video-streaming`, `notification-service`, `mcp-server`

---

## v1.0.26 — 2026-04-09

### Added — 15 industry standard gaps applied (PIPELINES.md v1.6 → v1.7)

Research against CCSS, FATF, SWC Registry, MiCA, EU AI Act, NIST AI RMF, OWASP LLM Top 10, ISO 42001, PCI-DSS v4.0, OWASP WSTG, OWASP SAMM, DORA, SOC2 Type II, NIST SP 800-218.

**Crypto domain (CCSS / FATF / SWC / MiCA):**
- **SWC Registry checklist** added to `smart-contract` QA strategy, compliance check, and Gate Prerequisites (SWC-103,104,107,110,113,115,116,124,125 — reentrancy, tx.origin, floating pragma, etc.)
- **Flash loan + MEV/sandwich attack testing** added to `defi-protocol` QA strategy and Gate Prerequisites
- **CCSS Level classification** (Level 1/2/3 per component) added to `custody-wallet` compliance check and Gate Prerequisites
- **Sanctions screening** (OFAC/EU/UNSC, ≤24h update SLA) added to `custody-wallet` and `cex-exchange` compliance check and Gate Prerequisites
- **Fair order allocation + circuit breaker + PEP screening + 5-year data retention** added to `cex-exchange`
- **Backup/recovery SLA, key rotation, HSM vendor risk assessment** added to `custody-wallet`

**AI/ML domain (EU AI Act / NIST RMF / OWASP LLM Top 10 / ISO 42001):**
- **Risk Assessment document** (RISK-ASSESSMENT-*.md) mandatory before deploy for: `ml-training`, `ml-serving`, `ai-agent`, `rag-system`, `anomaly-detection`
- **Model Card** (MODEL-CARD-*.md: model details, intended use, training data, quantitative analysis, ethical considerations) mandatory for all AI/ML types
- **Bias/fairness audit** (disparate impact ≥0.8 per protected group) made mandatory (not conditional) for `ml-training`, `ml-serving`, `ai-agent`, `rag-system`, `computer-vision`
- **Training data poisoning check + data lineage audit** added to `ml-training`
- **Supply chain audit** (base model/embedding model provenance) added to `ai-agent`, `ml-serving`, `rag-system`
- **PII output detection** added to `ai-agent` and `rag-system` QA strategy
- **Production Monitoring SLA** — new section with 12 alert thresholds + incident runbook for AI/ML and financial types

**Payments domain (PCI-DSS v4.0 / OWASP WSTG / DORA / SOC2):**
- **API security test** (OWASP WSTG payment flows) added to `payment-service` QA strategy and Gate Prerequisites — mandatory per PCI-DSS v4.0
- **TLS 1.3 cipher audit** added to `payment-service` and `auth-service`
- **SBOM** (CycloneDX) added to `payment-service`, `auth-service`, `saas-platform`, `e-commerce`
- **STRIDE threat model** mandatory artifact added to `payment-service`, `auth-service`, `saas-platform`, `e-commerce`
- **Penetration test frequency** added to Special Rules: annual external + 6-month internal for all regulated types
- **Incident response drill** extended from `custody-wallet` to: `payment-service`, `auth-service`, `saas-platform`, `e-commerce`, `cex-exchange`
- **RTO/RPO validation** (RTO ≤4h, RPO ≤1h) added to `payment-service` and `saas-platform`
- **Availability SLA verification** (≥99.9% for payment/auth, ≥99.5% for SaaS) added to thresholds
- **Business logic attack tests** (race conditions, transaction replay, IDOR payment records) added to `payment-service`

---

## v1.0.25 — 2026-04-09

### Fixed — 16 issues from full pipeline test (all 65 types) — PIPELINES.md v1.5 → v1.6

#### P0 — Critical (13 types missing Gate Prerequisites)
- **Added to MANDATORY Gate Prerequisites**: `rest-api`, `graphql-api`, `grpc-service`, `serverless`, `microservices`, `web-fullstack`, `spa-frontend`, `ssr-app`, `static-site`, `docs-site`, `bff` — all 11 web/API/frontend types now have explicit artifact requirements before gate:ship
- **`feature-flags-service`**: Added to MANDATORY Gate Prerequisites (flag evaluation correctness report + p99 bench + state snapshot before deploy)
- **Regulated Stack Migration**: `custody-wallet`, `cex-exchange`, `bridge-protocol` now automatically inherit REGULATED_MIGRATION rules when migrating infrastructure — even without explicit `compliance:` field

#### P1 — High (QA gaps and missing coverage)
- **Added to MANDATORY Gate Prerequisites**: `mobile` (device farm results), `embedded-iot` (OTA rollback + power budget + QEMU), `hardware-driver` (syzkaller + valgrind), `game` (FPS profiling + play session)
- **QA Environment Requirements**: Added `trading-bot` (48h paper-trade simulation), `bridge-protocol` (formal verification toolchain), `custody-wallet` (staging HSM provisioning)
- **No Browser QA list**: Added `infra-iac` (plan + policy validation, not browser-testable)
- **Conflict Matrix**: Added 9 new pairs for crypto/AI composite types (`cex-exchange+payment-service`, `trading-bot+cex-exchange`, `bridge-protocol+infra-iac`, `custody-wallet+cex-exchange`, `computer-vision+web-fullstack`, `anomaly-detection+payment-service`, and 3 more)
- **Multi-region**: Added `custody-wallet` (primary-only, per-region key ceremony), `cex-exchange` (primary order book, standby reads-only), `bridge-protocol` (per-region relayers, globally distributed guardian HSMs)

#### P2 — Clarity
- **No classical TDD list**: Added `k8s-operator`, `devops-tool`, `monorepo` with explanations
- **`library-sdk` semver rule**: tech-lead must classify `patch|minor|major` in ARCH doc; major = migration guide required before publish
- **`smart-contract` Gate Prerequisites**: now explicitly states "0 Echidna violations, 0 Slither critical/high"
- **Threshold Cross-Reference**: `custody-wallet` and `bridge-protocol` thresholds now include travel rule (FATF) and economic attack simulation in staging validation method

---

## v1.0.24 — 2026-04-09

### Added — 5 AI/ML/DS project types (60 → 65)

- **`computer-vision`** — image classification, object detection, segmentation (YOLO, Detectron2, OpenCV). QA: mAP + IoU on holdout, latency on target hardware, ONNX/TFLite/CoreML export correctness, edge device smoke. Deploy: model registry → export → OTA (edge) or container (cloud). Rollback: previous model version.
- **`recommendation-engine`** — collaborative filtering, matrix factorization, two-tower models. QA: NDCG@K + coverage + novelty + cold start test + A/B infrastructure validation + popularity bias audit. Deploy: shadow mode → A/B (5%→20%→50%) → full traffic. Rollback: instant traffic shift to previous model.
- **`feature-store`** — Feast, Tecton, Hopsworks, point-in-time features. QA: point-in-time correctness (no future data leakage) + online/offline consistency + feature drift detection + backfill validation. Deploy: backfill → consistency validation → enable for new training runs. Rollback: disable feature in registry.
- **`time-series-forecasting`** — Prophet, N-BEATS, TFT, demand forecasting. QA: walk-forward backtesting (out-of-sample) + MAPE/RMSE/SMAPE + seasonal validation + data leakage check. Deploy: backtest → shadow scoring → gradual replacement. Rollback: restore previous model, check downstream pipelines.
- **`anomaly-detection`** — fraud detection, log anomaly, AIOps, isolation forest. QA: precision/recall on labeled dataset + FPR on normal traffic + threshold sensitivity + latency under load. Deploy: shadow (alert only) → dry-run (log, no action) → full enforcement. Rollback: disable enforcement, revert threshold config.

### Fixed — 10 P0 bugs in crypto types (from test results)

- **`custody-wallet`**: added withdrawal limit enforcement test, signing audit trail verification, incident response drill (key compromise scenario), cold wallet re-entry recovery test to QA strategy and Gate Prerequisites
- **`bridge-protocol`**: added Echidna fuzz (≥10k runs) + Slither (inherited from smart-contract), formal verification artifact (light client finality proof), validator collusion simulation; light client finality test added to Gate Prerequisites
- **`cex-exchange`**: p99 threshold corrected from <10ms → <50ms @5k orders/sec; added fee calculation audit, margin/liquidation engine test (for futures), open orders handling on rollback, race conditions and partial fill test cases

---

## v1.0.23 — 2026-04-09

### Added
- **3 new crypto project types** in `PIPELINES.md` (57 → 60 types, version 1.3 → 1.4):
  - `custody-wallet` — MPC/HSM key management, cold/hot wallet, Fireblocks-style. QA: key ceremony test + MPC threshold signing + cold-to-hot sweep + pen test. MANDATORY security gate. Rollback: freeze hot wallet instantly.
  - `bridge-protocol` — cross-chain lock-and-mint, relayers, light clients. QA: replay attack test + unauthorized mint test + economic attack simulation + TVL cap verification. MANDATORY security gate + formal verification required.
  - `cex-exchange` — spot/futures trading platform, order book. QA: order matching correctness + cross-account isolation + KYC/AML + regulatory reporting. MANDATORY security gate. Rollback: maintenance mode in <30s.
- All 3 types added to: Type Detection, QA Strategy, Deploy Method, Special Rules, Threshold Cross-Reference, MANDATORY Gate Prerequisites

---

## v1.0.22 — 2026-04-09

### Added
- **WebFetch** added to: `tech-lead`, `senior-dev`, `qa-engineer`, `security-officer`, `project-auditor`
- **WebSearch** added to: `tech-lead`, `security-officer`, `l3-support`, `project-auditor`
- **Write + Edit** added to `devops` — agent now writes CHANGELOG.md, RELEASE-*.md, STAKEHOLDER-*.md directly
- **Tool Usage sections** in all agent prompts — explicit instructions on when and why to use each web tool

### Fixed
- `tech-lead` WebSearch instruction now covers library comparison use case (e.g. `fastify-rate-limit` vs `@fastify/rate-limit`)
- `senior-dev` retains `disallowedTools: WebSearch` — WebFetch only (targeted docs, not general browsing)

---

## v1.0.21 — 2026-04-09

### Added
- **Regulated Stack Migration pipeline** in `PIPELINES.md`
  - Auto-detection via `compliance:` field or fintech/banking keywords
  - EOL Runtime Reference table: PHP 7.3/7.4, Node 10/12, Python 2.7, Angular 12, Ruby 2.x
  - 9 additional QA tests: CVE audit (old+new), data integrity checksums, PCI regression, TLS cipher audit, cryptography regression, audit log continuity, session continuity, third-party integration matrix
  - GATE:ARCH additions: strangler fig plan, maintenance window, rollback SLA, compliance risk statement
  - GATE:SHIP additions: 6 compliance artifact checks — all must be ✓ before deploy
  - Stricter canary abort threshold: 0.5% error rate (vs standard 1%)
  - OLD stack stays live 30 days after 100% cutover
  - Post-deploy L3 window extended to 72h (vs standard 30 min)
  - 7 artifact naming conventions documented

---

## v1.0.20 — 2026-04-09

### Changed
- **`/start`** — now new projects only. Guard added: if PROJECT.md exists → redirects CTO to existing pipeline. If no description → asks one question before proceeding.
- **`/audit`** — new command for existing repos. Spawns `great_cto-project-auditor` with structured task: stack detection → type classification → gap analysis → Beads tasks → PROJECT.md.

### Fixed
- `SessionStart` hook now installs `audit.md` to `~/.claude/commands/`
- SKILL.md intent mapping: `"audit"` now routes to `/audit` command

---

## v1.0.19 — 2026-04-09

### Added
- **Canary deploy by default** for all web/API types in `devops` agent
  - Types: `rest-api`, `web-fullstack`, `saas-platform`, `graphql-api`, `grpc-service`, `microservices`, `realtime-system`, `notification-service`, `auth-service`, `payment-service`, `e-commerce`
  - Rollout: 5% → 5 min hold → 20% → 5 min hold → 100%
  - Abort: error rate >1% OR p99 +50% vs baseline → auto-rollback + P0 Beads task
  - Direct deploy (no canary): library/IaC/embedded types
  - Proxy swap (manual CTO confirmation): `smart-contract`, `defi-protocol`
- **Post-Deploy L3 Observability Window** — Step 4b in full pipeline
  - `great_cto-l3-support` spawned after every production deploy
  - 30 min monitoring window
  - Reports `Post-deploy: OK` if clean, or triggers P1+ triage immediately

---

## v1.0.18 — 2026-04-09

### Added
- **`review_mode: strict | auto`** in PROJECT.md
  - `strict` — adds GATE:CODE checkpoint after code review, before QA
  - `auto` — skips GATE:CODE (default)
- **GATE:CODE** — shows CTO PR link, bug counts by severity, top 3 reviewer findings
- Intent mapping: "strict mode" / "auto mode" phrases update PROJECT.md automatically

---

## v1.0.17 — 2026-04-08

### Fixed
- `PreToolUse` Bash hook: hardened regex with POSIX anchors, empty input guard, added `rm -r/` and `git push -f` patterns
- `UserPromptSubmit` hook: replaced shell string interpolation with `python3 subprocess` JSON construction (prevents injection)
- `PostToolUse` hook: switched to `printf` for atomic log writes, removed unnecessary `path` fallback
- `senior-dev` timeout: 600s → 900s (was less than 50 turns × ~15s avg)

---

## v1.0.16 — 2026-04-08

### Added
- **4 new hooks** in `plugin.json`:
  - `PreToolUse(Bash)` — safety guard: blocks `rm -rf`, `git push --force`, `DROP TABLE`, `curl | python/bash`, `mkfs`, `dd`
  - `PostToolUse(Write|Edit)` — audit log: every file write logged to `.great_cto/agent-writes.log`
  - `UserPromptSubmit` — dynamic session title from PROJECT.md (`project (type)`)
  - `PermissionDenied` — logs denied tools to `.great_cto/permission-denied.log`
- **`disable-model-invocation: true`** on `digest`, `capture`, `revisit` commands (shell-only, no LLM cost)
- **Agent timeouts**: `tech-lead` 1200s, `senior-dev` 900s, `devops` 900s, `qa-engineer` 600s, `security-officer` 600s, `l3-support` 600s, `project-auditor` 1800s
- **`tech-lead` Bash patterns** expanded: added `source`, `awk`, `xargs`, `sort`, `tail`, `head`, `echo`, `export`, `mkdir`, `grep`, `wc`, `date`, `printf`
- `SessionStart` hook now installs: `digest`, `capture`, `revisit` commands + copies `SKILL.md` to `.great_cto/`
