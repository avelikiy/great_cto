#!/usr/bin/env node
/**
 * Seed /tmp/great_cto-demo with WOW-grade data for the landing video.
 *
 * Targets across all 7 tabs:
 *   Inbox     — 6 in-progress + 3 blocked + 3 gate-pending decisions
 *   Kanban    — 35 tasks across all 5 columns (mix of statuses)
 *   Metrics   — $87 LLM · $1,560 saved · 18× cheaper · 14-day burn chart
 *   Memory    — 5 lessons · 7 ADRs · 4 global patterns · weekly digest
 *   Share     — pre-generated share URL with 22 shipped
 *   Logs      — 120+ verdicts across 12 agents (APPROVED/BLOCKED/FAIL mix)
 *   Agents    — 12 agents with real activity counts
 *
 * Idempotent: blows away the dir, recreates from scratch.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = "/tmp/great_cto-demo";
const HOME = process.env.HOME;
const GREAT_CTO = join(HOME, ".great_cto");

console.log(`[seed-demo] resetting ${ROOT}`);
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(ROOT, ".great_cto", "plans"), { recursive: true });
mkdirSync(join(ROOT, ".great_cto", "verdicts"), { recursive: true });
mkdirSync(join(GREAT_CTO, "global-patterns"), { recursive: true });
mkdirSync(join(GREAT_CTO, "verdicts"), { recursive: true });

// ─── PROJECT.md ─────────────────────────────────────────────────────────
writeFileSync(join(ROOT, ".great_cto", "PROJECT.md"), `# great_cto-demo

- archetype: web-service
- compliance: gdpr, pci-dss
- size: small
- monthly-budget: $500
- llm-rate: $5/hr
- human-rate: $150/hr
- created: 2026-05-01
- phase: implementation
- owners: solo-cto
`);

// ─── 15 PLAN docs ──────────────────────────────────────────────────────
const plans = [
  { id: "PLAN-auth-refresh.md",        llm: 12.40, human: 160, desc: "OAuth2 token refresh", status: "shipped" },
  { id: "PLAN-replica-failover.md",    llm:  9.80, human: 130, desc: "PostgreSQL replica failover", status: "shipped" },
  { id: "PLAN-webhook-sig.md",         llm: 10.20, human: 140, desc: "Stripe webhook signature check", status: "shipped" },
  { id: "PLAN-ci-pr.md",               llm:  8.60, human: 110, desc: "CI runs on every PR", status: "shipped" },
  { id: "PLAN-rate-limit.md",          llm:  9.00, human: 120, desc: "Rate limiting tier", status: "shipped" },
  { id: "PLAN-sso-saml.md",            llm:  6.20, human: 180, desc: "SSO SAML for enterprise", status: "shipped" },
  { id: "PLAN-audit-log.md",           llm:  4.80, human: 100, desc: "Immutable audit log", status: "shipped" },
  { id: "PLAN-2fa-totp.md",            llm:  5.40, human: 90,  desc: "2FA TOTP enrollment", status: "shipped" },
  { id: "PLAN-pii-redact.md",          llm:  7.20, human: 140, desc: "PII redaction pipeline", status: "shipped" },
  { id: "PLAN-cdn-purge.md",           llm:  3.20, human: 60,  desc: "CDN cache purge webhook", status: "shipped" },
  { id: "PLAN-bg-jobs.md",             llm:  5.80, human: 110, desc: "Background job queue", status: "in_progress" },
  { id: "PLAN-search-elastic.md",      llm:  4.40, human: 180, desc: "Elasticsearch full-text search", status: "in_progress" },
  { id: "PLAN-graphql-gw.md",          llm:  3.80, human: 200, desc: "GraphQL gateway", status: "in_progress" },
  { id: "PLAN-mobile-push.md",         llm:  2.60, human: 90,  desc: "Mobile push notifications", status: "planned" },
  { id: "PLAN-analytics-warehouse.md", llm:  4.20, human: 220, desc: "Analytics warehouse + dbt", status: "planned" },
];
for (const p of plans) {
  writeFileSync(join(ROOT, ".great_cto", "plans", p.id), `# ${p.desc}

## Cost
- LLM: $${p.llm.toFixed(2)}
- Human (est): $${p.human}
- Status: ${p.status}

## Notes
Cost tracked across architect → senior-dev → qa-engineer → security-officer.
`);
}
const llmTotal = plans.reduce((s, p) => s + p.llm, 0);
const humanTotal = plans.reduce((s, p) => s + p.human, 0);
console.log(`[seed-demo] plans: LLM=$${llmTotal.toFixed(2)} human=$${humanTotal} ratio=${(humanTotal/llmTotal).toFixed(1)}×`);

// ─── 35 bd tasks with mixed statuses ─────────────────────────────────────
// status options: open (backlog), in_progress, blocked, done (closed)
const TASKS = [
  // ─── DONE (22) — recent shipped wins
  { title: "Stripe webhook signature check",          labels: ["security"],     pri: 1, agent: "senior-dev",      days_ago: 1, dur_h: 3, status: "done" },
  { title: "Security audit auth surface",             labels: ["security"],     pri: 1, agent: "security-officer", days_ago: 2, dur_h: 4, status: "done" },
  { title: "PostgreSQL replica failover",             labels: ["infra"],        pri: 1, agent: "senior-dev",      days_ago: 1, dur_h: 5, status: "done" },
  { title: "Database connection pool tuning",         labels: ["infra"],        pri: 2, agent: "senior-dev",      days_ago: 2, dur_h: 2, status: "done" },
  { title: "S3 lifecycle policies",                   labels: ["infra"],        pri: 2, agent: "senior-dev",      days_ago: 3, dur_h: 2, status: "done" },
  { title: "CI runs on every PR",                     labels: ["infra"],        pri: 2, agent: "devops",          days_ago: 4, dur_h: 3, status: "done" },
  { title: "OAuth2 token refresh",                    labels: ["feature"],      pri: 1, agent: "senior-dev",      days_ago: 1, dur_h: 4, status: "done" },
  { title: "User profile API endpoint",               labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 2, dur_h: 3, status: "done" },
  { title: "Rate limiting tier",                      labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 3, dur_h: 4, status: "done" },
  { title: "Pagination on list endpoints",            labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 3, dur_h: 2, status: "done" },
  { title: "Email notification preferences",          labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 4, dur_h: 3, status: "done" },
  { title: "Audit log retention policy",              labels: ["compliance"],   pri: 2, agent: "senior-dev",      days_ago: 5, dur_h: 4, status: "done" },
  { title: "Healthcheck endpoint hardening",          labels: ["security"],     pri: 2, agent: "senior-dev",      days_ago: 5, dur_h: 2, status: "done" },
  { title: "API versioning strategy",                 labels: ["arch"],         pri: 2, agent: "architect",       days_ago: 6, dur_h: 3, status: "done" },
  { title: "SSO SAML for enterprise",                 labels: ["feature"],      pri: 1, agent: "senior-dev",      days_ago: 7, dur_h: 6, status: "done" },
  { title: "Immutable audit log",                     labels: ["compliance"],   pri: 1, agent: "senior-dev",      days_ago: 8, dur_h: 5, status: "done" },
  { title: "2FA TOTP enrollment",                     labels: ["security"],     pri: 1, agent: "senior-dev",      days_ago: 8, dur_h: 4, status: "done" },
  { title: "PII redaction pipeline",                  labels: ["compliance"],   pri: 1, agent: "senior-dev",      days_ago: 9, dur_h: 5, status: "done" },
  { title: "CDN cache purge webhook",                 labels: ["infra"],        pri: 2, agent: "devops",          days_ago: 10, dur_h: 2, status: "done" },
  { title: "DB migration rollback safety net",        labels: ["infra"],        pri: 1, agent: "db-migration-reviewer", days_ago: 11, dur_h: 3, status: "done" },
  { title: "Idempotency keys on POST endpoints",      labels: ["feature"],      pri: 1, agent: "senior-dev",      days_ago: 12, dur_h: 4, status: "done" },
  { title: "GDPR right-to-erasure flow",              labels: ["compliance"],   pri: 1, agent: "senior-dev",      days_ago: 13, dur_h: 5, status: "done" },

  // ─── IN PROGRESS (6) — current sprint
  { title: "Background job queue (Sidekiq → BullMQ)", labels: ["infra"],        pri: 1, agent: "senior-dev",      days_ago: 0, dur_h: 6, status: "in_progress" },
  { title: "Elasticsearch full-text search",          labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 0, dur_h: 8, status: "in_progress" },
  { title: "GraphQL gateway",                         labels: ["feature"],      pri: 2, agent: "architect",       days_ago: 0, dur_h: 12, status: "in_progress" },
  { title: "p99 latency budget for /checkout",        labels: ["perf"],         pri: 1, agent: "performance-engineer", days_ago: 0, dur_h: 3, status: "in_progress" },
  { title: "Threat model: payment webhook surface",   labels: ["security"],     pri: 1, agent: "ai-security-reviewer", days_ago: 0, dur_h: 2, status: "in_progress" },
  { title: "Eval suite for prompt regressions",       labels: ["ai"],           pri: 2, agent: "ai-eval-engineer", days_ago: 0, dur_h: 4, status: "in_progress" },

  // ─── BLOCKED (3) — needs attention (creates P0 buzz)
  { title: "PCI-DSS SAQ-A scope reduction",           labels: ["compliance"],   pri: 1, agent: "pci-reviewer",    days_ago: 2, dur_h: 6, status: "blocked" },
  { title: "Multi-tenant row-level security",        labels: ["security"],     pri: 1, agent: "enterprise-saas-reviewer", days_ago: 3, dur_h: 8, status: "blocked" },
  { title: "Vendor SLA breach: $$$ payment provider", labels: ["infra"],        pri: 1, agent: "l3-support",      days_ago: 1, dur_h: 2, status: "blocked" },

  // ─── BACKLOG (4) — next up
  { title: "Mobile push notifications (APNs + FCM)",  labels: ["feature"],      pri: 2, agent: "senior-dev",      days_ago: 0, dur_h: 5, status: "open" },
  { title: "Analytics warehouse (BigQuery + dbt)",    labels: ["data"],         pri: 2, agent: "data-platform-reviewer", days_ago: 0, dur_h: 10, status: "open" },
  { title: "Feature-flag rollout system",             labels: ["infra"],        pri: 2, agent: "senior-dev",      days_ago: 0, dur_h: 4, status: "open" },
  { title: "Cost dashboard for non-eng stakeholders", labels: ["product"],      pri: 3, agent: "pm",              days_ago: 0, dur_h: 3, status: "open" },
];

console.log("[seed-demo] bd init");
execSync(`cd ${ROOT} && bd init --prefix demo 2>&1 | tail -2`, { stdio: "inherit" });

for (let i = 0; i < TASKS.length; i++) {
  const t = TASKS[i];
  const labels = t.labels.join(",");
  const titleSafe = t.title.replace(/"/g, '\\"');
  console.log(`[seed-demo] ${i + 1}/${TASKS.length} [${t.status}] ${t.title}`);
  execSync(
    `cd ${ROOT} && bd create "${titleSafe}" --priority ${t.pri} --labels "${labels}" --assignee ${t.agent} --estimate ${t.dur_h * 60} 2>&1 | tail -1`,
    { stdio: "pipe" }
  );
}

// Get all created issues
const listJson = execSync(`cd ${ROOT} && bd list --json --all`, { encoding: "utf8" });
const issues = JSON.parse(listJson);
console.log(`[seed-demo] created ${issues.length} issues`);

// Update statuses (bd creates as "open" by default)
for (let i = 0; i < issues.length; i++) {
  const issue = issues[i];
  const meta = TASKS[i];
  if (meta.status === "done") {
    execSync(`cd ${ROOT} && bd close ${issue.id} 2>&1 | tail -1`, { stdio: "pipe" });
  } else if (meta.status !== "open") {
    execSync(`cd ${ROOT} && bd update ${issue.id} --status ${meta.status} 2>&1 | tail -1`, { stdio: "pipe" });
  }
}

const tasksByStatus = TASKS.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
console.log(`[seed-demo] status breakdown:`, tasksByStatus);

// ─── verdicts log (120+ entries across 12 agents) ────────────────────────
const AGENTS = [
  "senior-dev", "architect", "qa-engineer", "security-officer",
  "devops", "code-reviewer", "pm", "ai-eval-engineer",
  "ai-prompt-architect", "performance-engineer", "db-migration-reviewer",
  "ai-security-reviewer", "l3-support", "pci-reviewer",
  "enterprise-saas-reviewer", "data-platform-reviewer", "continuous-learner",
];

function randomCost(min = 0.30, max = 4.50) {
  return (min + Math.random() * (max - min)).toFixed(2);
}

const verdictLines = [];

// Per-task ship verdicts for done tasks
TASKS.filter(t => t.status === "done").forEach((t, idx) => {
  const id = issues[idx].id;
  const ts = new Date(Date.now() - t.days_ago * 86400_000 + idx * 3600_000).toISOString();
  const cost = randomCost(0.8, 2.8);
  verdictLines.push(`${ts} | ${t.agent} | APPROVED | shipped ${id} ${t.title} cost=$${cost}`);
});

// QA verdicts — mix of pass + fail
const qaMix = [
  ["PASS", "smoke test 12 endpoints"],
  ["PASS", "webhook signature validation"],
  ["PASS", "replica failover drill"],
  ["PASS", "rate-limit edge cases"],
  ["PASS", "OAuth2 happy path"],
  ["PASS", "SSO SAML end-to-end"],
  ["PASS", "2FA enrollment + recovery"],
  ["PASS", "PII redaction across 8 fields"],
  ["FAIL", "pagination cursor edge bug=PAG-3"],
  ["PASS", "GDPR right-to-erasure flow"],
  ["FAIL", "idempotency key collision bug=IDM-7"],
  ["PASS", "audit log immutability check"],
];
qaMix.forEach((q, i) => {
  const ts = new Date(Date.now() - (i + 1) * 43200_000).toISOString();
  verdictLines.push(`${ts} | qa-engineer | ${q[0]} | ${q[1]} cost=$${randomCost(0.4, 1.2)}`);
});

// Security verdicts
const secMix = [
  ["APPROVED", "gate:ship auth surface OWASP-A1 clean"],
  ["APPROVED", "gate:ship PCI-DSS SAQ-A scope confirmed"],
  ["BLOCKED",  "gate:ship raw SQL in payment path — fix required"],
  ["APPROVED", "gate:ship CSP nonce-based, no inline scripts"],
  ["APPROVED", "gate:ship webhook signature constant-time compare"],
  ["BLOCKED",  "gate:ship secret in git history — rewrite + rotate"],
  ["APPROVED", "gate:ship 2FA backup codes encrypted at rest"],
  ["APPROVED", "gate:ship CORS allow-list explicit, no wildcards"],
];
secMix.forEach((s, i) => {
  const ts = new Date(Date.now() - (i + 1) * 64800_000).toISOString();
  verdictLines.push(`${ts} | security-officer | ${s[0]} | ${s[1]} cost=$${randomCost(0.6, 2.0)}`);
});

// Performance verdicts
const perfMix = [
  ["APPROVED", "p99 /checkout=180ms budget=250ms"],
  ["APPROVED", "p99 /search=320ms budget=400ms"],
  ["BLOCKED",  "p99 /profile=720ms exceeded 500ms budget"],
  ["APPROVED", "load test 1k req/s sustained 5min"],
];
perfMix.forEach((p, i) => {
  const ts = new Date(Date.now() - (i + 1) * 86400_000 - 3600_000).toISOString();
  verdictLines.push(`${ts} | performance-engineer | ${p[0]} | ${p[1]} cost=$${randomCost(0.5, 1.8)}`);
});

// Architect verdicts
const archMix = [
  ["APPROVED", "ARCH-graphql-gateway scale=standard"],
  ["APPROVED", "ARCH-bg-jobs queue=BullMQ Redis"],
  ["APPROVED", "ARCH-search-elastic 3-node cluster"],
  ["APPROVED", "ARCH-sso-saml IdP=Okta+Azure"],
];
archMix.forEach((a, i) => {
  const ts = new Date(Date.now() - (i + 1) * 86400_000 - 7200_000).toISOString();
  verdictLines.push(`${ts} | architect | ${a[0]} | ${a[1]} cost=$${randomCost(0.8, 3.2)}`);
});

// Code-reviewer pass-through (12-angle reviews)
for (let i = 0; i < 18; i++) {
  const agentName = ["code-reviewer", "ai-security-reviewer", "db-migration-reviewer"][i % 3];
  const ts = new Date(Date.now() - i * 43200_000).toISOString();
  const findings = ["P0:0 P1:1 P2:3", "P0:0 P1:0 P2:5", "P0:0 P1:2 P2:1", "P0:1 P1:3 P2:2"][i % 4];
  const verdict = findings.startsWith("P0:1") ? "BLOCKED" : "APPROVED";
  verdictLines.push(`${ts} | ${agentName} | ${verdict} | review pass ${findings} cost=$${randomCost(0.3, 1.5)}`);
}

// Continuous-learner
const learnMix = [
  "extracted 3 patterns: idempotency, webhook-sig, audit-immutability",
  "promoted webhook-sig to global (hits=3)",
  "promoted idempotency to global (hits=4)",
];
learnMix.forEach((m, i) => {
  const ts = new Date(Date.now() - (i + 1) * 86400_000 * 2).toISOString();
  verdictLines.push(`${ts} | continuous-learner | APPROVED | ${m} cost=$${randomCost(0.2, 0.8)}`);
});

// Sort by timestamp DESC for natural log feel
verdictLines.sort().reverse();

writeFileSync(join(ROOT, ".great_cto", "verdicts.log"), verdictLines.join("\n") + "\n");
// Also copy to global (board reads from ~/.great_cto/verdicts/ too)
writeFileSync(join(GREAT_CTO, "verdicts", "great_cto-demo.log"), verdictLines.join("\n") + "\n");
console.log(`[seed-demo] wrote ${verdictLines.length} verdicts`);

// ─── lessons.md (project) ────────────────────────────────────────────────
writeFileSync(join(ROOT, ".great_cto", "lessons.md"), `# Lessons — great_cto-demo

## L-001 — Stripe webhook signature timing-safe compare
- date: 2026-05-08
- severity: high
- pattern: webhook-sig-validation
- detail: First implementation used plain string equality, vulnerable to timing attacks. Replaced with \`crypto.timingSafeEqual\` after security-officer flagged at gate:ship.

## L-002 — Idempotency keys MUST be in DB, not in-memory
- date: 2026-05-09
- severity: critical
- pattern: idempotency-storage
- detail: Initial implementation cached keys in-memory. Lost on pod restart → duplicate charges. Now uses Postgres unique index on (key, user_id).

## L-003 — Replica failover needs explicit promotion lag
- date: 2026-05-11
- severity: high
- pattern: db-failover-lag
- detail: Auto-failover triggered during 200ms primary blip. Cost = 12s of read inconsistency. Added 30s minimum lag before promotion.

## L-004 — PII redaction must run BEFORE log shipping
- date: 2026-05-13
- severity: critical
- pattern: pii-redaction-order
- detail: Redaction was a Loki processor — too late, raw PII hit S3 backup. Moved to application-level middleware before any sink.

## L-005 — 2FA backup codes need rate-limit + lockout
- date: 2026-05-14
- severity: high
- pattern: 2fa-backup-codes
- detail: 10-digit backup codes brute-forceable in 17 hours. Added: 5 attempts/hour per user, lockout escalates to email+SMS.
`);

// ─── decisions.md (global ADR log) ───────────────────────────────────────
const decisionsBody = `# Decisions — cross-project ADR log

## D-024 — Use BullMQ over Sidekiq for background jobs
- date: 2026-05-15
- project: great_cto-demo
- gate: architect
- reasoning: Node-native (no Ruby runtime), built-in dashboard, better retry semantics. Sidekiq Pro license cost vs BullMQ free + Redis Streams support.
- approved-by: solo-cto

## D-023 — Postgres-only — no separate cache tier
- date: 2026-05-13
- project: great_cto-demo
- gate: architect
- reasoning: 5k MAU. Postgres B-tree on hot queries already <5ms. Redis adds ops surface for negligible gain at our scale.

## D-022 — SAML over OIDC for enterprise SSO
- date: 2026-05-10
- project: great_cto-demo
- gate: architect
- reasoning: 80% of enterprise prospects on Okta/Azure AD already deploy SAML for everything. OIDC adoption uneven at the enterprise tier.

## D-021 — Scope reduction to PCI SAQ-A (vs SAQ-D)
- date: 2026-05-09
- project: great_cto-demo
- gate: pci-reviewer
- reasoning: Stripe Elements hosted fields → card data never touches our infra → SAQ-A applies. Annual compliance work: 4 hours vs 40+ hours.

## D-020 — Immutable audit log via append-only S3 + Object Lock
- date: 2026-05-08
- project: great_cto-demo
- gate: security-officer
- reasoning: GDPR + PCI both require tamper-evident logs. S3 Object Lock (compliance mode) gives WORM at $0.023/GB. Alternative (separate ledger DB) was 8× cost.

## D-019 — Reject CSP report-uri (use report-to)
- date: 2026-05-06
- project: great_cto-demo
- gate: security-officer
- reasoning: report-uri deprecated; report-to has Network Error Logging integration. Single endpoint receives CSP + COEP + CORP violations.

## D-018 — TDD enforced at PR level via gate:ship
- date: 2026-05-04
- project: great_cto-demo
- gate: qa-engineer
- reasoning: 4 production bugs in last sprint were "we'll add tests later." gate:ship now requires test coverage delta ≥0 for PR to merge.
`;
writeFileSync(join(GREAT_CTO, "decisions.md"), decisionsBody);

// ─── brain.md (project patterns + retros) ────────────────────────────────
writeFileSync(join(ROOT, ".great_cto", "brain.md"), `# brain — great_cto-demo

## Patterns in use
- webhook-sig-validation (3 hits)
- idempotency-keys (4 hits, promoted to global)
- pii-redaction-middleware (2 hits)
- replica-failover-lag (1 hit)
- 2fa-backup-rate-limit (1 hit)

## What worked
- Architect → senior-dev handoff via ARCH-*.md cut planning time by 60%
- 12-angle review caught 11 P1/P2 issues that would have shipped
- gate:ship blocks reduced 2am incidents from 4/mo → 0 in last 3 weeks

## What failed
- Initial Sidekiq deploy: lost jobs during pod recycling (no graceful shutdown)
- First webhook sig impl: timing attack via string comparison
- PII redaction at log-shipper layer: raw PII still hit S3 backup

## Team patterns
- Two decisions per feature (arch + ship) — no more, no less
- Postmortems write themselves via verdicts.log
- Memory queried BEFORE writing new code
`);

// ─── global-patterns ─────────────────────────────────────────────────────
const patterns = [
  {
    slug: "webhook-sig-validation",
    body: `---
slug: webhook-sig-validation
status: active
hits: 3
applies_to: web-service, fintech, marketplace
symptom: webhook endpoints accepting unsigned or weakly-signed payloads
detection_order:
  - grep for crypto.createHmac without timingSafeEqual
  - grep for == on signature compare
---

# webhook-sig-validation

Always use \`crypto.timingSafeEqual\` for signature comparison.
Cache the signing secret; rotate quarterly.
Reject if timestamp older than 5 min (replay protection).
`,
  },
  {
    slug: "idempotency-keys",
    body: `---
slug: idempotency-keys
status: active
hits: 4
applies_to: web-service, fintech, commerce, marketplace
symptom: duplicate side-effects on retry (double-charge, double-email, double-job)
detection_order:
  - grep for POST endpoints touching money/email/jobs without idempotency key
  - check key storage: in-memory loses on restart
---

# idempotency-keys

Storage: Postgres unique index on (key, user_id, endpoint).
TTL: 24h via partial index + nightly cleanup.
Response: cached for 7d so client retries get same body.
`,
  },
  {
    slug: "pii-redaction-middleware",
    body: `---
slug: pii-redaction-middleware
status: active
hits: 2
applies_to: web-service, healthcare, regulated
symptom: raw PII in logs / metrics / error reporters / backups
detection_order:
  - check redaction layer position (must be BEFORE any sink)
  - search log volumes for email/phone/SSN regex hits
---

# pii-redaction-middleware

Redact at application middleware level — NOT at log shipper.
Otherwise: raw PII hits buffers, files, S3, backups, vendor uploads.
Centralised regex registry; covers email, phone (E.164), SSN, IBAN, CC PAN.
`,
  },
  {
    slug: "replica-failover-lag",
    body: `---
slug: replica-failover-lag
status: active
hits: 1
applies_to: web-service, data-platform
symptom: auto-failover triggers on transient blips → read inconsistency
detection_order:
  - check failover trigger threshold (must be ≥30s)
  - check promotion ack vs replica lag
---

# replica-failover-lag

Minimum 30s primary-unreachable threshold before promotion.
Require replica lag <5s before promote — otherwise lose committed writes.
Always require operator ack for cross-region failover.
`,
  },
];
for (const p of patterns) {
  writeFileSync(join(GREAT_CTO, "global-patterns", `GP-${p.slug}.md`), p.body);
}

// ─── digest-latest.md ────────────────────────────────────────────────────
writeFileSync(join(GREAT_CTO, "digest-latest.md"), `# Digest — week of 2026-05-09 to 2026-05-16

## Highlights
- ✓ 22 features shipped across 6 categories
- ✓ $87 LLM spend (~$1,560 human-equivalent — 18× cheaper)
- ✓ 0 P0 incidents (down from 2/wk baseline)
- ⚠ 3 P1 blocked items need attention

## Top wins
- Webhook signature validation — caught timing attack pre-merge
- PCI SAQ-A scope reduction — annual compliance: 40h → 4h
- Idempotency keys promoted to global pattern (4 hits)

## What's blocked
- PCI-DSS SAQ-A scope reduction — needs Stripe Elements migration first
- Multi-tenant RLS — schema migration coordination across 3 services
- Vendor SLA breach — payment provider 503s spiking, mitigation underway

## Next week
- Background job migration (BullMQ) — 60% done
- Elasticsearch search — phase 1 (index ingest) done
- GraphQL gateway — architect approved, senior-dev claims today
`);

// ─── share-token (pre-generate for demo) ────────────────────────────────
const shareToken = "WEEs-_HlAClzBJUD";
mkdirSync(join(ROOT, ".great_cto", "share"), { recursive: true });
writeFileSync(join(ROOT, ".great_cto", "share", "token.json"), JSON.stringify({
  token: shareToken,
  created_at: new Date().toISOString(),
  url: `https://greatcto.systems/r/${shareToken}`,
  expires_at: null,
}, null, 2));

// ─── Register project in board ──────────────────────────────────────────
const projectsPath = join(GREAT_CTO, "projects.json");
let projectsJson;
try {
  projectsJson = JSON.parse(readFileSync(projectsPath, "utf8"));
} catch {
  projectsJson = { projects: [] };
}
const existing = projectsJson.projects.find(p => p.slug === "great_cto-demo");
const entry = {
  slug: "great_cto-demo",
  archetype: "web-service",
  description: "Demo project for landing video",
  path: ROOT,
  added_at: new Date().toISOString(),
};
if (existing) Object.assign(existing, entry);
else projectsJson.projects.push(entry);
writeFileSync(projectsPath, JSON.stringify(projectsJson, null, 2));

console.log("[seed-demo] ✓ done");
console.log(`  path:          ${ROOT}`);
console.log(`  tasks:         ${TASKS.length} (done=${tasksByStatus.done||0} wip=${tasksByStatus.in_progress||0} blocked=${tasksByStatus.blocked||0} backlog=${tasksByStatus.open||0})`);
console.log(`  plans:         ${plans.length}  LLM=$${llmTotal.toFixed(2)} human=$${humanTotal} ratio=${(humanTotal/llmTotal).toFixed(0)}×`);
console.log(`  verdicts:      ${verdictLines.length} across ${new Set(verdictLines.map(l => l.split('|')[1].trim())).size} agents`);
console.log(`  lessons:       5`);
console.log(`  decisions:     7 (global)`);
console.log(`  patterns:      ${patterns.length} (global)`);
console.log(`  share token:   ${shareToken}`);
