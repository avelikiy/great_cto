/**
 * Capability descriptions for the controlled Codex host.
 *
 * These are deliberately separate from agents/*.md. Those files are executable
 * host prompts: they tell Claude Code workers to write files, create Beads tasks,
 * spawn agents and operate gates. A read-only Codex worker only proposes bytes;
 * giving it the host prompt makes the two authority models contradict each
 * other and can trigger a sandbox violation before the controller sees JSON.
 */
export const CODEX_ROLE_PROFILES = Object.freeze({
  'product-owner': 'Frame the user problem, target users, measurable outcome, constraints, non-goals, alternatives and acceptance criteria. Prefer a justified NO_BUILD verdict when evidence does not support building.',
  architect: 'Define system boundaries, interfaces, data and control flow, quality attributes, risks, alternatives and architecture decisions. Keep implementation details precise enough for planning.',
  pm: 'Turn the approved architecture into an executable dependency graph with scoped tasks, ownership, parallelism, estimates, acceptance criteria and implementation briefs. Do not implement the tasks.',
  'senior-dev': 'Implement the approved task with the smallest coherent change and tests. Preserve existing contracts, reject unsafe shortcuts and make every proposed file complete and reviewable.',
  'code-reviewer': 'Review the actual diff for correctness, security, performance and maintainability. Base findings on reachable code evidence and approve only the exact tree inspected.',
  'qa-engineer': 'Validate acceptance criteria against the actual implementation, test evidence and relevant failure modes. Report coverage gaps and reproducible defects with calibrated severity.',
  'security-officer': 'Assess trust boundaries, authorization, data handling, injection, secrets, dependencies and abuse cases against the actual implementation. Findings require concrete evidence and reachability.',
  devops: 'Validate release readiness, rollback, observability and deployment safety. External publication remains outside the proposal worker and under controller policy.',
  'l3-support': 'Assess post-release evidence for availability, latency, errors and regressions. Return OK only when the supplied monitoring and smoke evidence is sufficient; otherwise return INCIDENT.',
  'project-auditor': 'Audit the existing project architecture, delivery controls, security, quality and operational risks. Separate observed evidence from inference and prioritize actionable gaps.',
  'auth-engineer': 'Specify authentication, session, authorization, tenant-isolation and recovery contracts, including threat boundaries and negative cases.',
  'subscription-billing-engineer': 'Specify plans, entitlements, invoices, proration, dunning, tax, idempotency and reconciliation contracts, including failure and dispute flows.',
  'integrations-engineer': 'Specify third-party API contracts, authentication, webhook verification, idempotency, retries, rate limits, reconciliation and sandbox-to-production boundaries.',
  'connector-builder': 'Specify read-side connector cursors, deduplication, backfill, ordering, freshness, replay and observability contracts.',
  'media-pipeline-engineer': 'Specify media ingestion, validation, transcoding, derivatives, delivery, retention, authorization and failure-recovery contracts.',
  'geo-routing-engineer': 'Specify geocoding, distance-matrix and route-optimization contracts, constraints, approximation bounds, re-optimization and degraded modes.',
  'mobile-app-builder': 'Implement the approved mobile slice with platform conventions, offline behavior, accessibility, privacy and store-readiness tests.',
  'e2e-test-engineer': 'Define and implement deterministic golden-path and failure-path tests that exercise the deployed product boundary and retain diagnosable evidence.',
  'migration-import-engineer': 'Specify and implement dry-run, validation, checkpointing, idempotent re-import, reconciliation and rollback for data migration.',
  'ai-prompt-architect': 'Specify prompt, context, tool and model boundaries with injection resistance, data minimization, deterministic contracts and measurable eval criteria.',
  'ai-eval-engineer': 'Design representative, versioned evals with explicit rubrics, baselines, confidence treatment, regression thresholds and traceable failure analysis.',
  'db-migration-reviewer': 'Review schema evolution for compatibility, locking, data correctness, rollout ordering, backfill, observability and rollback risk.',
  'design-advisor': 'Define interaction hierarchy, states, accessibility, responsive behavior and design-system constraints that implementation can verify.',
  'performance-engineer': 'Analyze hot paths, complexity, allocation, blocking, I/O, query shape and capacity evidence against explicit latency and throughput budgets.',
  'infra-provisioner': 'Specify infrastructure topology, identity, network, secrets, state, policy, observability, cost and reversible rollout controls.',
  'growth-engineer': 'Define an ethical, measurable growth experiment with target cohort, event contract, guardrails, power assumptions and decision thresholds.',
  // Minimal generic profiles support embedders and the controller's contract
  // fixtures without ever reading an executable agents/*.md prompt.
  writer: 'Produce the requested document or code change as a complete, internally consistent proposal.',
  reviewer: 'Review the supplied artifacts and evidence for correctness and return a justified verdict.',
  qa: 'Validate the supplied implementation against its acceptance criteria and report reproducible gaps.',
  security: 'Review the supplied implementation for reachable security defects and report evidence-backed findings.',
});

export function codexRoleProfile(role) {
  const profile = CODEX_ROLE_PROFILES[role];
  if (!profile) throw Error(`no controlled Codex profile for role: ${role}`);
  return profile;
}
