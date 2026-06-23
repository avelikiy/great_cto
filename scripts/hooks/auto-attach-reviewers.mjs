#!/usr/bin/env node
/**
 * SessionStart hook — auto-attach reviewers.
 *
 * Scans git diff since the last session and emits a list of reviewers that
 * should be invoked for the changed files. Writes a short markdown block to
 * stdout that the SessionStart bash hook pipes into Claude's context.
 *
 * Why this exists
 * ---------------
 * In real sessions, users dispatch Agent calls with
 * `subagent_type: general-purpose` and never invoke the 24 specialist
 * reviewers — even when migrations / auth / payment code changed.
 * This hook makes the right reviewers visible at session start, so Claude
 * picks the matching `subagent_type` proactively without `/start`.
 *
 * Pattern-to-reviewer map below. Add patterns conservatively — over-firing
 * burns context. Default: emit only if diff > 0 files match a pattern.
 *
 * Exit codes: 0 always. Silent if no matches or no .great_cto dir.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const greatCtoDir = join(cwd, ".great_cto");

// Only run inside great_cto projects
if (!existsSync(greatCtoDir)) process.exit(0);

// Pattern → reviewer mapping. Ordered specific-first.
// Each pattern is matched against the changed-file paths via simple substring.
// `match` may be a function returning a count of matched files.
const RULES = [
  { reviewer: "db-migration-reviewer",   pattern: /(migrations\/|schema\.sql$|alembic\/|knex\/migrations|prisma\/migrations|\.room\.|Migration\d+\.kt$|Migration\d+\.swift$)/i },
  { reviewer: "pci-reviewer",            pattern: /(stripe|webhook.*sig|payment|refund|paypal|adyen|braintree|saq-a|pci-dss)/i },
  { reviewer: "security-officer",        pattern: /(auth\/|oauth|saml|jwt|password|login|session|csrf|cors\.|crypto\.|secret)/i },
  { reviewer: "ai-security-reviewer",    pattern: /(prompts?\/|system_prompt|tool_definitions|rag|embeddings?\/|jailbreak)/i },
  { reviewer: "ai-eval-engineer",        pattern: /(tests\/eval\/|EVAL-.*\.md$|golden_set|prompt_regression)/i },
  { reviewer: "mobile-store-reviewer",   pattern: /(play[_-]?store|app[_-]?store|fastlane|iap|in_app_purchase|store_listing|aab$|ipa$)/i },
  { reviewer: "api-platform-reviewer",   pattern: /(openapi\.|swagger|graphql\.schema|webhooks?\.|rfc7807|sunset_header)/i },
  { reviewer: "voice-ai-reviewer",       pattern: /(twilio|vonage|livekit|deepgram|elevenlabs|ivr|tcpa|stir.shaken)/i },
  { reviewer: "ai-clinical-reviewer",    pattern: /(samd|phi[._-]|hipaa|hl7|fhir|cdss|clinical_decision)/i },
  { reviewer: "fda-reviewer",            pattern: /(510k|de_novo|pma|gmlp|fda.submission)/i },
  { reviewer: "hr-ai-reviewer",          pattern: /(aedt|ny.?city.?ll.?144|resume_screen|hiring|interview_ai)/i },
  { reviewer: "edtech-reviewer",         pattern: /(coppa|ferpa|student[_-]?(data|pii)|sopipa)/i },
  { reviewer: "gov-reviewer",            pattern: /(fedramp|nist.?800.?53|cjis|fips.?140|fisma|ssp\.md|vpat)/i },
  { reviewer: "game-reviewer",           pattern: /(loot[_-]?box|esrb|pegi|iarc|gacha)/i },
  { reviewer: "enterprise-saas-reviewer",pattern: /(scim|tenant_id|row.?level.?security|sso\/|saml\/|sox.itgc)/i },
  { reviewer: "insurance-reviewer",      pattern: /(naic|solvency|ifrs.?17|acord|actuarial)/i },
  { reviewer: "infra-reviewer",          pattern: /(\.tf$|terraform\/|helm\/|kustomize\/|cdk\/|pulumi\/|\.bicep$)/i },
  { reviewer: "web-store-reviewer",      pattern: /(manifest\.json$|mv3|chrome_extension|firefox_addon)/i },
  { reviewer: "performance-engineer",    pattern: /(perf|p99|latency_budget|k6\/|locust\/|gatling\/|benchmark)/i },
  { reviewer: "library-reviewer",        pattern: /(package\.json|pyproject\.toml|Cargo\.toml).*(version|public.api)/i },
  { reviewer: "cli-reviewer",            pattern: /(bin\/|cli\/main|argv|exit.?code)/i },
];

// Files we deliberately ignore for reviewer routing — these are metadata,
// templates, or test fixtures whose path matches a pattern by accident but
// they're not actual product code that needs review.
const EXCLUDE = [
  /^tests\/fixtures\//,        // fixtures for our own tests
  /^docs\//,                   // analysis docs, ADRs, marketing
  /^commands\//,               // slash-command definitions
  /^agents\//,                 // agent prompt files (great_cto-repo only)
  /^skills\/great_cto\//,      // plugin skill files
  /^\.claude\//,               // claude config
  /\.md$/,                     // any markdown — docs talking about X ≠ doing X
  /^node_modules\//,
  /^\.git\//,
];

function shouldExclude(path) {
  return EXCLUDE.some(rx => rx.test(path));
}

// Get changed files since last session.
// Strategy: files touched in the last 7 days (broader than `since last commit`,
// captures uncommitted edits + recent work). Falls back to last 50 commits.
function getChangedFiles() {
  try {
    const sevenDaysAgo = `@{7.days.ago}`;
    // Files in last 7 days of commits
    const recent = execSync(
      `git log --since='${sevenDaysAgo}' --name-only --pretty=format: 2>/dev/null | sort -u`,
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).split("\n").filter(Boolean);
    // Plus currently uncommitted
    const uncommitted = execSync(`git status --porcelain 2>/dev/null`, {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }).split("\n").map(l => l.slice(3)).filter(Boolean);
    return [...new Set([...recent, ...uncommitted])];
  } catch {
    return [];
  }
}

// Read verdicts log to skip reviewers that have ALREADY run recently on these files.
// Conservative: dedupe by reviewer name + day. If a reviewer ran in the last 24h,
// don't re-flag it.
function recentlyInvokedReviewers() {
  try {
    const verdictDir = join(process.env.HOME || "~", ".great_cto", "verdicts");
    if (!existsSync(verdictDir)) return new Set();
    const day24Ago = Date.now() - 24 * 3600 * 1000;
    const seen = new Set();
    for (const f of readdirSync(verdictDir)) {
      const fp = join(verdictDir, f);
      try {
        const stat = statSync(fp);
        if (stat.mtimeMs < day24Ago) continue;
        const lines = readFileSync(fp, "utf8").split("\n").slice(-30);
        for (const line of lines) {
          const m = line.match(/\|\s*([\w-]+-reviewer|security-officer|qa-engineer|architect|pm|senior-dev|devops|l3-support|ai-eval-engineer|ai-prompt-architect)\s*\|/);
          if (m && line.includes(new Date(day24Ago).toISOString().slice(0, 10))) {
            seen.add(m[1]);
          }
        }
      } catch { /* skip unreadable */ }
    }
    return seen;
  } catch {
    return new Set();
  }
}

function main() {
  const files = getChangedFiles();
  if (files.length === 0) process.exit(0);

  const recent = recentlyInvokedReviewers();
  const matches = new Map();  // reviewer → [matched files]

  // Filter out fixtures/docs/templates — they accidentally match patterns
  // but don't represent product code that needs review.
  const productFiles = files.filter(f => !shouldExclude(f));
  if (productFiles.length === 0) process.exit(0);

  for (const rule of RULES) {
    if (recent.has(rule.reviewer)) continue;
    const matchedFiles = productFiles.filter(f => rule.pattern.test(f));
    if (matchedFiles.length === 0) continue;
    matches.set(rule.reviewer, matchedFiles);
  }

  if (matches.size === 0) process.exit(0);

  // Cap output: emit at most 5 reviewers (most-matched first), summarize rest.
  const sorted = [...matches.entries()].sort((a, b) => b[1].length - a[1].length);
  const top = sorted.slice(0, 5);
  const overflow = sorted.slice(5);

  console.log("\n📋 REVIEWERS FLAGGED — match `subagent_type` to changed files");
  for (const [reviewer, mf] of top) {
    const preview = mf.slice(0, 2).join(", ");
    const extra = mf.length > 2 ? ` (+${mf.length - 2})` : "";
    console.log(`  • ${reviewer} — ${preview}${extra}`);
  }
  if (overflow.length > 0) {
    console.log(`  • +${overflow.length} more: ${overflow.map(([r]) => r).join(", ")}`);
  }
  console.log(`  Use: Agent({ subagent_type: "<reviewer>", description, prompt })`);
}

main();
