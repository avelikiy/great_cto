# PLAN — Autopilot production depth (rcm as the reference vertical)

Status: in progress · Created 2026-06-08

Turn the "19 flows + console" demo into one **really operated** service. Reference vertical: **rcm**.
Tier-1 production gaps, in priority. Items marked ✅ are fully buildable + testable here; ⚙️ need an
external provider/IdP, so we build the *framework* + the credential seam, not fake creds.

## Tier 1 — production gaps

1. **Auto case-ingestion (webhooks)** ✅ — `/api/autopilot/ingest` (HMAC-secured) starts a run from a
   source-system payload (EHR webhook, X12 278, bank feed, email intake). Turns the console from a
   manual demo into a real pipeline: cases arrive automatically.
2. **Compliance hardening** ✅:
   - **Tamper-evident audit** — hash-chain every audit entry (`prevHash`→`hash`); `verifyAudit()`
     detects any edit. The audit becomes evidence, not just a log.
   - **Encryption at-rest** — run files AES-256-GCM encrypted when `GREAT_CTO_ENCRYPT_KEY` is set
     (PHI/PII never in plaintext); transparent decrypt on read.
   - **Retention** — purge/seal runs past the vertical's retention window.
   - **Regulator-format export** — emit the actual artifact (837 / SAR / determination), not raw JSON.
3. **Real write-connectors (sandbox)** ⚙️ — the adapters already POST when env creds are set. Add the
   real *submission framework*: a **receipt** (provider id · status · attempts) on the write step +
   **retry-with-backoff** when a provider URL is configured. Submits for real the moment creds land.
4. **Operator identity** ⚙️ — invite acceptance captures a **license attestation**; every signature
   records the signer's attested license + a step-up. A real identity seam for OIDC/SSO later.

## Tier 2 — quality & trust
5. Calibrated confidence + closed-loop learning (reject/override/QA → agent). 6. Eval rigor (×3
median CI gate + bigger golden sets). 7. SLA auto-escalation (act on the deadline). 8. Sequential
review pipelines (intake→QC→review→submit).

## Tier 3 — ops
9. Cost/latency budgets + alerts · 10. retry/dead-letter · 11. billing/metering · 12. connector-health.

## This PR — Wave F (the buildable Tier-1 slice)
- Webhook ingestion (`/api/autopilot/ingest`, HMAC).
- Tamper-evident audit hash-chain + `verifyAudit` + a verify endpoint.
- Encryption at-rest (AES-256-GCM, key from env, transparent).
- Submission receipt + retry-with-backoff on the post-gate write.
- License attestation captured on the invite + recorded on every signature.
- Retention purge helper + a regulator-format export endpoint.

## Acceptance
- A case POSTed to `/ingest` (valid HMAC) starts a run that appears in the inbox; a bad signature is
  rejected.
- Editing a persisted audit entry is detected by `verifyAudit`.
- With `GREAT_CTO_ENCRYPT_KEY` set, run files on disk are ciphertext; the API still reads them.
- The write step carries a submission receipt; a failing provider is retried then dead-lettered.
- Every signature records the signer's attested license. Lib tests green; admin-board test green.
