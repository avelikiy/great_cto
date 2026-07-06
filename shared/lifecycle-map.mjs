// lifecycle-map.mjs — single source of truth mapping every agent to a
// team-role group, after Boris Cherny's (Anthropic, Claude Code) "5 roles of
// the IT team of the future": Prototyper / Builder / Sweeper / Grower /
// Maintainer.
//
// Cherny's model describes what HUMANS do across a product's lifecycle. It is a
// LENS over great_cto's agents, NOT a merge — agents stay narrowly scoped
// (focused prompt + right model tier + gates). This file only GROUPS them.
//
// Cherny's 5 cover the build happy-path. great_cto adds the two axes he omits:
//   - "reviewers"     — the compliance/security SAFETY axis (the one he most
//                       notably leaves out: you can't generalist your way
//                       through a HIPAA/PCI/SOX audit).
//   - "orchestration" — who coordinates the generalist fleet and learns from it.
//
// Do NOT confuse "role" (this file) with "archetype" (product type:
// healthcare/fintech/dashboard) or "pack" (domain bundle). Those words are
// already taken elsewhere in great_cto; roles are a distinct facet.
//
// Zero-dep. Consumed by scripts/gen-agents-page.mjs (and available to the board).

/** Ordered role catalog: key → display metadata. Order = product lifecycle. */
export const ROLES = {
  prototyper: {
    label: 'Prototyper',
    tagline: 'Idea → working prototype',
    blurb: 'Frames the problem and turns a raw idea into a validated brief, an architecture, and a design — the WHAT and the HOW before a line ships.',
    cherny: true,
  },
  builder: {
    label: 'Builder',
    tagline: 'Prototype → production product',
    blurb: 'Stands up the app and implements the real features, integrations, auth, billing, and data plumbing that make a prototype a product.',
    cherny: true,
  },
  sweeper: {
    label: 'Sweeper',
    tagline: 'Clean · simplify · verify',
    blurb: 'Reviews, tests, and tightens what Builder produced — correctness, quality, and the golden-path proof that it actually works.',
    cherny: true,
  },
  grower: {
    label: 'Grower',
    tagline: 'Scale to product-market fit',
    blurb: 'Takes a working product and grows it — performance under load, activation/retention loops, funnel instrumentation, and the experiments that find PMF.',
    cherny: true,
  },
  maintainer: {
    label: 'Maintainer',
    tagline: 'Keep it reliable',
    blurb: 'Ships, provisions, and keeps a mature system healthy — deploys, infra, incident response.',
    cherny: true,
  },
  // ── The two axes Cherny's model omits ──────────────────────────────────
  reviewers: {
    label: 'Reviewers & Safety',
    tagline: 'The axis Cherny leaves out',
    blurb: 'Pre-implementation compliance and security gates — HIPAA, PCI, SOX, GDPR, AI-governance and 30+ more. Generalists build fast; a specialist reviewer guards the risky parts. This is great_cto\'s moat and the thing Cherny\'s 5 roles don\'t cover.',
    cherny: false,
  },
  orchestration: {
    label: 'Orchestration & Meta',
    tagline: 'Coordinate the fleet, learn from it',
    blurb: 'Coordinates multi-stream work, decomposes plans, audits existing codebases, and crystallizes lessons back into the system.',
    cherny: false,
  },
};

/** Explicit agent → role. Anything not listed falls back to roleForAgent(). */
export const AGENT_ROLE = {
  // Prototyper
  'product-owner': 'prototyper',
  'architect': 'prototyper',
  'design-advisor': 'prototyper',
  'decision-scorer': 'prototyper',
  // Builder
  'app-scaffolder': 'builder',
  'senior-dev': 'builder',
  'auth-engineer': 'builder',
  'integrations-engineer': 'builder',
  'connector-builder': 'builder',
  'subscription-billing-engineer': 'builder',
  'media-pipeline-engineer': 'builder',
  'mobile-app-builder': 'builder',
  'geo-routing-engineer': 'builder',
  'migration-import-engineer': 'builder',
  'ai-prompt-architect': 'builder',
  'ai-eval-engineer': 'builder',
  // Sweeper  (code-reviewer is a QUALITY reviewer, not a compliance one)
  'code-reviewer': 'sweeper',
  'qa-engineer': 'sweeper',
  'e2e-test-engineer': 'sweeper',
  // Grower
  'performance-engineer': 'grower',
  'growth-engineer': 'grower',
  // Maintainer
  'l3-support': 'maintainer',
  'devops': 'maintainer',
  'infra-provisioner': 'maintainer',
  // Orchestration & Meta
  'coordinator': 'orchestration',
  'pm': 'orchestration',
  'project-auditor': 'orchestration',
  'knowledge-extractor': 'orchestration',
  'continuous-learner': 'orchestration',
  // security-officer + every *-reviewer resolve via roleForAgent() below.
};

/**
 * Resolve the role for an agent by name.
 * Rule: explicit map wins; else any `*-reviewer` (except code-reviewer, mapped
 * to sweeper above) and `security-officer` are the Reviewers & Safety axis.
 * Unknown non-reviewer agents return null so the generator can flag drift.
 */
export function roleForAgent(name) {
  if (AGENT_ROLE[name]) return AGENT_ROLE[name];
  if (name === 'security-officer' || name.endsWith('-reviewer')) return 'reviewers';
  return null;
}

/** Ordered list of role keys (lifecycle first, then the two extra axes). */
export const ROLE_ORDER = Object.keys(ROLES);
