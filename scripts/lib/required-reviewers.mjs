/**
 * required-reviewers — which domain reviewers a project must have run, read from its
 * `.great_cto/PROJECT.md`.
 *
 * The product says it wires the right reviewers for a project's archetype and
 * compliance. Against this machine's session logs (30.06–21.09) and 22 registered
 * projects, it did not: pci-reviewer was needed by 7 projects and dispatched once;
 * enterprise-saas, us-privacy and voice-ai reviewers were needed by 3–5 and never ran.
 * Nothing required them — `pipeline-state` made only QA and security mandatory, and
 * the auto-attach hook matched file paths, never the archetype.
 *
 * The registry below is the CLI's (packages/cli/src/archetypes.ts REVIEWERS_BY_ARCHETYPE,
 * packs.ts PACK_REVIEWERS), which plugin scripts cannot import from TypeScript;
 * tests/lib/required-reviewers.test.mjs fails when the two drift.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const REVIEWERS_BY_ARCHETYPE = {
  "web-service": ["security-officer"],
  "mobile-app": ["mobile-store-reviewer", "security-officer"],
  "ai-system": ["ai-security-reviewer", "ai-prompt-architect", "ai-eval-engineer"],
  "agent-product": ["ai-security-reviewer", "ai-prompt-architect", "ai-eval-engineer"],
  "mlops": ["mlops-reviewer", "ai-security-reviewer"],
  "data-platform": ["data-platform-reviewer"],
  "streaming": ["streaming-reviewer"],
  "infra": ["infra-reviewer"],
  "library": ["library-reviewer"],
  "cli-tool": ["cli-reviewer"],
  "commerce": ["pci-reviewer", "security-officer"],
  "marketplace": ["marketplace-reviewer", "pci-reviewer"],
  "fintech": ["pci-reviewer", "regulated-reviewer"],
  "healthcare": ["healthcare-reviewer", "security-officer"],
  "web3": ["oracle-reviewer"],
  "iot-embedded": ["firmware-reviewer"],
  "regulated": ["regulated-reviewer"],
  "devtools": ["devtools-reviewer"],
  "browser-extension": ["web-store-reviewer"],
  "game": ["game-reviewer"],
  "cms": ["cms-reviewer"],
  "enterprise-saas": ["enterprise-saas-reviewer"],
  "edtech": ["edtech-reviewer"],
  "gov-public": ["gov-reviewer", "security-officer"],
  "insurance": ["insurance-reviewer", "regulated-reviewer"],
  "legal": ["legal-reviewer", "security-officer"],
  "defense-govcon": ["cmmc-reviewer", "gov-reviewer", "security-officer"],
  "vertical-saas": ["security-officer"],
  "booking": ["pci-reviewer", "security-officer"],
  "crm": ["security-officer"],
  "dashboard": ["security-officer"],
  "content-platform": ["pci-reviewer", "security-officer"],
  "marketplace-lite": ["pci-reviewer", "security-officer"],
  "greenfield": [],
};

export const PACK_REVIEWERS = {
  "voice-pack": [
    "voice-ai-reviewer"
  ],
  "hr-ai-pack": [
    "hr-ai-reviewer"
  ],
  "api-platform-pack": [
    "api-platform-reviewer"
  ],
  "adtech-privacy-pack": [
    "adtech-privacy-reviewer",
    "us-privacy-reviewer"
  ],
  "us-ai-pack": [
    "us-ai-reviewer"
  ]
};

/** A compliance token in PROJECT.md → the reviewer that owns it. Matched as whole tokens. */
export const COMPLIANCE_REVIEWERS = [
  { token: /\bpci(?:-dss)?\b/i, reviewer: 'pci-reviewer' },
  { token: /\bhipaa\b/i, reviewer: 'healthcare-reviewer' },
  { token: /\btcpa\b/i, reviewer: 'voice-ai-reviewer' },
  { token: /\bgdpr\b/i, reviewer: 'gdpr-reviewer' },
  { token: /\b(?:ccpa|cpra|us-privacy)\b/i, reviewer: 'us-privacy-reviewer' },
  { token: /\bdpdpa\b/i, reviewer: 'dpdpa-reviewer' },
  { token: /\bcmmc\b/i, reviewer: 'cmmc-reviewer' },
];

// QA and security are already mandatory for every build (pipeline-state MANDATORY);
// this module is about the domain reviewers the project's own declaration implies.
const ALWAYS_MANDATORY = new Set(['security-officer', 'qa-engineer']);

const field = (text, key) => {
  const m = String(text).match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const listOf = (v) => (v ? v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : []);

/**
 * @param {string} projectMd  the text of .great_cto/PROJECT.md
 * @returns {{agent:string, why:string}[]}  each required reviewer once, with every reason
 */
export function requiredReviewers(projectMd) {
  const out = new Map();
  const add = (agent, why) => {
    if (ALWAYS_MANDATORY.has(agent)) return;
    const prev = out.get(agent);
    out.set(agent, prev ? `${prev}; ${why}` : why);
  };
  // `primary:` is sometimes a display label (`developer-tools`) beside a registry key in
  // `archetype:` (`devtools`); the first value the registry knows decides.
  const archetypeName = ['primary', 'archetype']
    .map((k) => (field(projectMd, k) || '').split(/\s|#/)[0])
    .find((v) => v && REVIEWERS_BY_ARCHETYPE[v]) || null;
  for (const r of REVIEWERS_BY_ARCHETYPE[archetypeName] || []) add(r, `archetype ${archetypeName}`);
  for (const p of listOf(field(projectMd, 'packs'))) for (const r of PACK_REVIEWERS[p] || []) add(r, `pack ${p}`);
  const compliance = field(projectMd, 'compliance') || '';
  for (const { token, reviewer } of COMPLIANCE_REVIEWERS) {
    const m = compliance.match(token);
    if (m) add(reviewer, `compliance ${m[0]}`);
  }
  return [...out].map(([agent, why]) => ({ agent, why }));
}

/**
 * Required reviewers for a project directory, each with whether a verdict exists.
 * A verdict is a non-empty line in .great_cto/verdicts/<agent>.log — evidence the
 * reviewer ran for this project, not for which feature.
 * @returns {{state:'read'|'no-project', reviewers:{agent:string, why:string, verdict:boolean}[]}}
 */
export function reviewerStatus(projectDir) {
  const pm = join(projectDir, '.great_cto', 'PROJECT.md');
  if (!existsSync(pm)) return { state: 'no-project', reviewers: [] };
  const reviewers = requiredReviewers(readFileSync(pm, 'utf8')).map((r) => {
    let verdict = false;
    try { verdict = /\S/.test(readFileSync(join(projectDir, '.great_cto', 'verdicts', `${r.agent}.log`), 'utf8')); } catch { /* no log: never ran here */ }
    return { ...r, verdict };
  });
  return { state: 'read', reviewers };
}
