# PLAN — Autopilot console UI/UX

Status: in progress · Created 2026-06-08

The console works but is a **single long vertical scroll** (Start · Analytics · QA · Team · Settings ·
Inbox · All runs). The operator's actual job — the **Inbox** — is buried below admin/analytics
sections, and the drawer is information-dense. Fix the information architecture + polish.

## Problems
1. **Wrong landing** — an operator lands on Analytics and scrolls past Start/QA to reach their queue.
   The primary surface (Inbox) should be first and default.
2. **No navigation** — everything is one scroll; no way to jump to "my work" or "all cases".
3. **Admin clutter mixed with operator work** — Start/Settings/Team/QA share the scroll with the
   queue even though they're role-gated.
4. **Dense drawer** — long, no sticky header, sections run together.
5. **Visual** — KPI tiles, cards, spacing, empty/loading states are functional but flat.

## Plan
1. **Tabbed app shell** — a top tab bar; sections become panels. Default tab = **Inbox** (the work).
   Tabs: **Inbox · Cases · Analytics · QA · Admin** (QA/Admin shown only to the right roles). The
   operator lands on their queue.
2. **Sticky header** — logo · Operate⇄Build · role/session · search · 🔔. Stays on scroll.
3. **Inbox-first** — the awaiting queue is the hero. "Start a run" moves under Admin (it's not an
   operator action). Filters sit above the queue.
4. **Drawer polish** — sticky title bar with close; clear section cards (criteria · steps · evidence ·
   determination · audit); action bar pinned at the bottom (Export · Replay · Verify).
5. **Visual pass** — compact KPI tiles with accent, card hover/press, better empty states, consistent
   spacing/typography, status colour system, mobile-friendly stacking.

## Acceptance
- Operator opens the console → lands on **Inbox** (their cases), not Analytics.
- Tabs switch instantly; QA/Admin tabs appear only for the right roles; Build hidden for operators.
- The drawer has a sticky header + a pinned action bar; sections are visually distinct.
- No functional regression (sign/escalate/bulk/filters/RBAC/criteria/evidence all work).
