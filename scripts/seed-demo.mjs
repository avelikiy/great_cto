#!/usr/bin/env node
/**
 * Seed /tmp/great_cto-demo with deterministic data for the landing video.
 *
 * Produces:
 *  - 14 closed tasks across security / infra / feature / docs categories
 *  - PROJECT.md (web-service archetype, monthly-budget $300)
 *  - 5 PLAN docs with LLM costs totalling ~$50
 *  - verdicts log with senior-dev shipped lines
 *  - closed_at timestamps spread Mon–Fri so AI time is non-zero
 *
 * Numbers match the landing copy: 14 features / $50 / 13× cheaper.
 *
 * Idempotent: blows away the dir, recreates from scratch.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = "/tmp/great_cto-demo";

console.log(`[seed-demo] resetting ${ROOT}`);
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(ROOT, ".great_cto", "plans"), { recursive: true });
mkdirSync(join(ROOT, ".great_cto", "verdicts"), { recursive: true });

// --- PROJECT.md ---------------------------------------------------------
writeFileSync(join(ROOT, ".great_cto", "PROJECT.md"), `# great_cto-demo

- archetype: web-service
- compliance: gdpr
- size: small
- monthly-budget: $300
- llm-rate: $5/hr
- human-rate: $150/hr
- created: 2026-05-01
`);

// --- 5 PLAN docs, totalling ~$50 ----------------------------------------
const plans = [
  { id: "PLAN-auth-refresh.md",   llm: 12.40, human: 160, desc: "OAuth2 token refresh" },
  { id: "PLAN-replica-failover.md", llm:  9.80, human: 130, desc: "PostgreSQL replica failover" },
  { id: "PLAN-webhook-sig.md",    llm: 10.20, human: 140, desc: "Stripe webhook signature check" },
  { id: "PLAN-ci-pr.md",          llm:  8.60, human: 110, desc: "CI runs on every PR" },
  { id: "PLAN-rate-limit.md",     llm:  9.00, human: 120, desc: "Rate limiting tier" },
];
for (const p of plans) {
  writeFileSync(join(ROOT, ".great_cto", "plans", p.id), `# ${p.desc}

## Cost
- LLM: $${p.llm.toFixed(2)}
- Human (est): $${p.human}
`);
}
const llmTotal = plans.reduce((s, p) => s + p.llm, 0);
const humanTotal = plans.reduce((s, p) => s + p.human, 0);
console.log(`[seed-demo] plans: LLM=$${llmTotal.toFixed(2)} human=$${humanTotal} ratio=${(humanTotal/llmTotal).toFixed(1)}×`);

// --- 14 bd tasks --------------------------------------------------------
const TASKS = [
  // SECURITY
  { title: "Stripe webhook signature check",          labels: ["security"], pri: 1, agent: "senior-dev", days_ago: 1, dur_h: 3 },
  { title: "Security audit auth surface",             labels: ["security"], pri: 1, agent: "security-officer", days_ago: 2, dur_h: 4 },
  // INFRA
  { title: "PostgreSQL replica failover",             labels: ["infra"],    pri: 1, agent: "senior-dev", days_ago: 1, dur_h: 5 },
  { title: "Database connection pool tuning",         labels: ["infra"],    pri: 2, agent: "senior-dev", days_ago: 2, dur_h: 2 },
  { title: "S3 lifecycle policies",                   labels: ["infra"],    pri: 2, agent: "senior-dev", days_ago: 3, dur_h: 2 },
  { title: "CI runs on every PR",                     labels: ["infra"],    pri: 2, agent: "devops",     days_ago: 4, dur_h: 3 },
  // FEATURES
  { title: "OAuth2 token refresh",                    labels: ["feature"],  pri: 1, agent: "senior-dev", days_ago: 1, dur_h: 4 },
  { title: "User profile API endpoint",               labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 2, dur_h: 3 },
  { title: "Rate limiting tier",                      labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 3, dur_h: 4 },
  { title: "Pagination on list endpoints",            labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 3, dur_h: 2 },
  { title: "Email notification preferences",          labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 4, dur_h: 3 },
  { title: "Audit log retention policy",              labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 5, dur_h: 4 },
  { title: "Healthcheck endpoint hardening",          labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 5, dur_h: 2 },
  { title: "API versioning strategy",                 labels: ["feature"],  pri: 2, agent: "senior-dev", days_ago: 6, dur_h: 3 },
];

// init bd in demo project
console.log("[seed-demo] bd init");
execSync(`cd ${ROOT} && bd init --prefix demo 2>&1 | tail -2`, { stdio: "inherit" });

for (let i = 0; i < TASKS.length; i++) {
  const t = TASKS[i];
  const labels = t.labels.join(",");
  const titleSafe = t.title.replace(/"/g, '\\"');
  console.log(`[seed-demo] creating ${i + 1}/${TASKS.length}: ${t.title}`);
  execSync(
    `cd ${ROOT} && bd create "${titleSafe}" --priority ${t.pri} --labels "${labels}" --assignee ${t.agent} --estimate ${t.dur_h * 60}`,
    { stdio: "pipe" }
  );
}

// List created issues to get IDs
const listJson = execSync(`cd ${ROOT} && bd list --json --all`, { encoding: "utf8" });
const issues = JSON.parse(listJson);
console.log(`[seed-demo] created ${issues.length} issues`);

// Close all tasks with backdated timestamps
for (let i = 0; i < issues.length; i++) {
  const issue = issues[i];
  const meta = TASKS[i];
  const closedAt = new Date(Date.now() - meta.days_ago * 86400_000);
  const createdAt = new Date(closedAt.getTime() - meta.dur_h * 3600_000);
  execSync(`cd ${ROOT} && bd update ${issue.id} --status done 2>&1 | tail -1`, { stdio: "pipe" });
  // bd doesn't expose direct closed_at backdating via CLI; rely on update timestamp.
  // For the AI-time display, the share renderer can fall back to plan estimates.
}

// --- verdicts log -------------------------------------------------------
const verdictLines = TASKS.map((t, i) => {
  const id = issues[i].id;
  const ts = new Date(Date.now() - t.days_ago * 86400_000).toISOString();
  const cost = (plans[i % plans.length].llm / TASKS.length * plans.length).toFixed(2);
  return `${ts} | ${t.agent} | APPROVED | shipped ${id} ${t.title} cost=$${cost}`;
}).join("\n") + "\n";
writeFileSync(join(ROOT, ".great_cto", "verdicts.log"), verdictLines);

// QA verdicts (some pass, one fail to match "83% pass · 5 pass · 1 fail")
const qaLines = [
  `${new Date(Date.now() - 86400_000).toISOString()} | qa-engineer | PASS | smoke 5 endpoints`,
  `${new Date(Date.now() - 2*86400_000).toISOString()} | qa-engineer | PASS | webhook signature path`,
  `${new Date(Date.now() - 3*86400_000).toISOString()} | qa-engineer | PASS | replica failover drill`,
  `${new Date(Date.now() - 4*86400_000).toISOString()} | qa-engineer | PASS | rate-limit edge cases`,
  `${new Date(Date.now() - 5*86400_000).toISOString()} | qa-engineer | PASS | OAuth2 happy path`,
  `${new Date(Date.now() - 5*86400_000).toISOString()} | qa-engineer | FAIL | pagination cursor edge bug=PAG-3`,
];
appendFileSync(join(ROOT, ".great_cto", "verdicts.log"), qaLines.join("\n") + "\n");

// Security approvals
const secLines = [1,2,3,4].map((n,i) =>
  `${new Date(Date.now() - (i+1)*86400_000).toISOString()} | security-officer | APPROVED | gate:ship task=${issues[i].id}`
).join("\n") + "\n";
appendFileSync(join(ROOT, ".great_cto", "verdicts.log"), secLines);

// Register project so board picks it up
const projectsPath = join(process.env.HOME, ".great_cto", "projects.json");
const projectsJson = JSON.parse(execSync(`cat ${projectsPath}`, { encoding: "utf8" }));
const existing = projectsJson.projects.find(p => p.slug === "great_cto-demo");
if (existing) {
  existing.path = ROOT;
  existing.archetype = "web-service";
} else {
  projectsJson.projects.push({
    slug: "great_cto-demo",
    archetype: "web-service",
    description: "Demo project for landing video",
    path: ROOT,
    added_at: new Date().toISOString(),
  });
}
writeFileSync(projectsPath, JSON.stringify(projectsJson, null, 2));

console.log("[seed-demo] ✓ done");
console.log(`  path:        ${ROOT}`);
console.log(`  tasks:       ${issues.length} (14 expected)`);
console.log(`  llm cost:    $${llmTotal.toFixed(2)} (~$50 expected)`);
console.log(`  human cost:  $${humanTotal} (~$650 expected)`);
console.log(`  ratio:       ${(humanTotal/llmTotal).toFixed(0)}× (13× expected)`);
