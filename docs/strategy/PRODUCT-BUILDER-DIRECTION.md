# Product Builder direction (2026-06-19 pivot)

**Pivot (epic great_cto-9it):** from "AI business autopilots for regulated companies"
(per-transaction human gates, 28 regulated verticals) → **"AI copilot / Product
Builder"** — one human gate (the CTO, at the pipeline) and maximum automation. The
`operate` surface (operator console + autopilot runtime + vertical flows) is extracted
to a separate private repo (epic great_cto-2l4). great_cto = BUILD only.

## Industry selection criteria

1. **Software-native** — the product *is* software, buildable end-to-end by a pipeline.
2. **Automation-friendly** — no heavy per-feature compliance sign-off (we left regulated).
3. **Large US market** — sizeable SMB / mid-market spend.
4. **Reachable buyer** — a clear, underserved buyer with an acute pain.

**Deliberately excluded** (these go with `operate`): medical-coding/RCM, clinical/AI-
clinical, AML/BSA, tax, insurance, immigration, customs/freight-broker, lending,
defense/CMMC — the old regulated core.

## Top 10 industries → Top 40 products

Each product is software-native, buildable with high automation, low regulatory drag.

### 1. Home / Field Services (HVAC, plumbing, cleaning, landscaping)
1. Dispatch & scheduling app — jobs, techs, routes, live status
2. Instant quoting / estimate builder — photo or form → priced quote
3. Customer booking portal + automated reminders / confirmations
4. Post-job review & reputation autopilot — request, route, publish

### 2. Professional Services / Agencies (marketing, creative, consulting)
5. Proposal & SOW generator — scope → branded proposal + e-sign
6. Client portal — deliverables, approvals, status, billing
7. Time tracking + auto-invoicing — timers → invoices → reminders
8. Project & retainer profitability dashboard

### 3. Restaurants & Hospitality
9. Online ordering + menu manager (dine-in / pickup / delivery)
10. Reservation & waitlist app — SMS notify, table mgmt
11. Loyalty / rewards engine — points, offers, win-back
12. Staff shift scheduling + shift-swap

### 4. Retail & E-commerce (SMB)
13. Storefront builder — catalog, checkout, themes
14. Inventory + automated reorder / low-stock alerts
15. Dynamic pricing & promotions manager
16. Abandoned-cart + email/SMS marketing autopilot

### 5. Real Estate (residential proptech — NOT mortgage/title)
17. Listing builder + multi-portal syndication
18. Lead CRM + automated nurture sequences
19. Transaction-coordination checklist app (tasks, docs, deadlines)
20. Property management portal — rent, maintenance requests, tenants

### 6. Fitness & Wellness (studios, gyms, coaches)
21. Class booking + membership management app
22. Coaching program & content delivery (plans, habit tracking)
23. Member engagement / churn-prevention autopilot
24. On-demand video library / streaming platform

### 7. Marketing & Creator Economy
25. Content scheduler + multi-platform publisher
26. Cross-channel analytics dashboard
27. Creator monetization — paywall, memberships, tips
28. Brand-deal / sponsorship CRM + outreach

### 8. HR / Recruiting / Workforce (NOT payroll/benefits)
29. Applicant tracking system (ATS) — pipeline, scoring, scheduling
30. Onboarding workflow builder — tasks, docs, e-sign
31. Shift / workforce scheduling + availability
32. Employee engagement & pulse-survey tool

### 9. Construction / Contractors
33. Bid / estimate builder — takeoff → priced bid
34. Project management + daily logs / time on site
35. Subcontractor & vendor coordination portal
36. Field documentation — photos, punch lists, inspections

### 10. Logistics / Supply Chain (SMB — NOT customs)
37. Shipment tracking / visibility dashboard
38. Inventory & warehouse-lite management
39. Route optimization + dispatch
40. Supplier & purchase-order management

## Notes for the pipeline stage (great_cto-8c1)

Most of these collapse into a few reusable build archetypes — **CRUD-vertical-SaaS,
booking/scheduling, CRM+nurture, dashboard/analytics, marketplace-lite, content/media
platform**. The top-40 pipelines (1 CTO gate, max automation) should be parameterized
templates over these archetypes, not 40 bespoke pipelines.
