# Brief №7 — Project & retainer profitability dashboard (catalog №8, A4 Dashboard)

> Frozen 2026-07-10 · Feed to `/start` verbatim · Do not edit after the batch starts.

A profitability dashboard for a 20-person consulting agency that runs both fixed-fee
projects and monthly retainers. It ingests time entries via CSV import (from the
agency's existing tracker), plus project budgets and retainer amounts entered by
PMs, and computes effective hourly rate, budget burn, and margin per project and per
client. Alerts fire when a project crosses 80% of budget or a retainer's logged
hours exceed its monthly allocation, so PMs hear about overruns before the client
does. Partners get a monthly margin summary by client; PMs see burn live on their
own projects only. No integrations beyond CSV import and email alerts.
