// flow.ts — compiles all detection outputs into a single user-facing FlowResult.
// Pure function: no I/O, no side effects.
// Called by bootstrap.ts (writes FLOW.md) and main.ts (prints summary).

import type { Archetype, ProjectSize, StandardGate } from "./archetypes.js";
import { reviewersFor, gatesFor } from "./archetypes.js";
import type { DetectionResult } from "./detect.js";
import { suggestPackReviewers, suggestPackGates, suggestPacks } from "./packs.js";
import { suggestJurisdictions, suggestJurisdictionReviewers, suggestJurisdictionGates } from "./jurisdictions.js";

export interface FlowResult {
  /** Kebab-case id: "fintech-eu-uk" */
  id: string;
  /** Human-readable summary: "Fintech · EU + UK" */
  title: string;
  /** Unique reviewer agent names, sorted */
  agents: string[];
  /** Human gate labels, e.g. ["gate:plan", "gate:ship"] */
  gates: string[];
  /** Compliance frameworks from archetype + packs + jurisdictions */
  compliance: string[];
  /** Indicative cost range per feature cycle (USD) */
  costRange: { low: number; high: number };
  /** Internal routing data — for FLOW.md _routing block and /flow explain */
  routing: {
    archetype: string;
    packs: string[];
    jurisdictions: string[];
    confidence: string;
  };
}

// ── Human-readable titles ─────────────────────────────────────────────────

const ARCHETYPE_TITLE: Record<string, string> = {
  "fintech":           "Fintech",
  "healthcare":        "Healthcare",
  "enterprise-saas":   "Enterprise SaaS",
  "agent-product":     "AI agent",
  "ai-system":         "AI system",
  "mlops":             "MLOps pipeline",
  "commerce":          "E-commerce",
  "marketplace":       "Marketplace",
  "mobile-app":        "Mobile app",
  "web-service":       "Web service",
  "library":           "Library / SDK",
  "cli-tool":          "CLI tool",
  "data-platform":     "Data platform",
  "streaming":         "Streaming system",
  "infra":             "Infrastructure",
  "devtools":          "Developer tool",
  "browser-extension": "Browser extension",
  "game":              "Game",
  "web3":              "Web3 / DeFi",
  "iot-embedded":      "IoT / embedded",
  "cms":               "CMS",
  "edtech":            "EdTech",
  "gov-public":        "Government",
  "insurance":         "Insurance",
  "regulated":         "Regulated system",
  "greenfield":        "New project",
};

// Gate id (StandardGate) → user label
const GATE_LABEL: Record<StandardGate, string> = {
  "plan":             "gate:plan",
  "arch":             "gate:arch",
  "code":             "gate:code",
  "qa":               "gate:qa",
  "security":         "gate:security",
  "compliance":       "gate:compliance",
  "ship":             "gate:ship",
  "cost":             "gate:cost-forecast",
  "oracle-review":    "gate:oracle-review",
  "edtech-review":    "gate:edtech-review",
  "gov-review":       "gate:gov-review",
  "insurance-review": "gate:insurance-review",
  "cmmc-assessment":  "gate:cmmc-assessment",
};

// Cost (low, high) per feature cycle by archetype tier
const ARCHETYPE_COST: Record<string, readonly [number, number]> = {
  "fintech":           [8, 18],
  "healthcare":        [8, 18],
  "agent-product":     [8, 18],
  "mlops":             [8, 18],
  "marketplace":       [8, 18],
  "enterprise-saas":   [8, 18],
  "regulated":         [8, 18],
  "edtech":            [8, 18],
  "gov-public":        [8, 18],
  "insurance":         [8, 18],
  "web3":              [8, 18],
  "commerce":          [3, 8],
  "mobile-app":        [3, 8],
  "web-service":       [3, 8],
  "data-platform":     [3, 8],
  "streaming":         [3, 8],
  "devtools":          [3, 8],
  "browser-extension": [3, 8],
  "game":              [3, 8],
  "cms":               [3, 8],
  "ai-system":         [3, 8],
  "iot-embedded":      [3, 8],
  "infra":             [3, 8],
  "library":           [0.5, 3],
  "cli-tool":          [0.5, 3],
  "greenfield":        [0.5, 3],
};

/**
 * Archetypes that ship a user-facing interface and therefore get a
 * `design-advisor` stage (plan-altitude, before pm). Backend/infra/library/CLI
 * archetypes have no UI surface and skip it. design-advisor itself skips a
 * change classified T0 at runtime (see scripts/lib/change-tier.mjs).
 */
export const UI_BEARING_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>([
  "web-service", "mobile-app", "commerce", "marketplace", "cms",
  "enterprise-saas", "edtech", "game", "browser-extension",
  "healthcare", "fintech", "insurance", "gov-public", "web3",
]);

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Compile all detection outputs into a single FlowResult.
 *
 * Pure function — no file I/O. Called by bootstrap.ts (FLOW.md) and
 * main.ts (summary output).
 */
export function compileFlow(
  archetype: Archetype,
  size: ProjectSize,
  detection: DetectionResult,
  compliance: string[],
  confidence: string,
): FlowResult {
  // ── Agents ──────────────────────────────────────────────────────────────
  const agentSet = new Set<string>(reviewersFor(archetype));
  for (const r of suggestPackReviewers(detection)) agentSet.add(r);
  for (const r of suggestJurisdictionReviewers(detection)) agentSet.add(r);
  // Always include base orchestration agents
  agentSet.add("architect");
  agentSet.add("senior-dev");
  agentSet.add("qa-engineer");
  // Design-advisor for UI-bearing archetypes (plan-altitude, before pm).
  if (UI_BEARING_ARCHETYPES.has(archetype)) agentSet.add("design-advisor");

  // ── Gates ────────────────────────────────────────────────────────────────
  const gateSet = new Set<string>(
    gatesFor(archetype, size).map((g) => GATE_LABEL[g] ?? `gate:${g}`)
  );
  for (const g of suggestPackGates(detection)) gateSet.add(g);
  for (const g of suggestJurisdictionGates(detection)) gateSet.add(g);

  // ── Packs + jurisdictions for routing block ──────────────────────────────
  const packs = suggestPacks(detection);
  const jurisdictions = suggestJurisdictions(detection);

  // ── Title ────────────────────────────────────────────────────────────────
  const productLabel = ARCHETYPE_TITLE[archetype] ?? archetype;
  const jCodes = jurisdictions
    .slice(0, 3)
    .map((j) => j.jurisdiction.toUpperCase())
    .join(" + ");
  const title = jCodes ? `${productLabel} · ${jCodes}` : productLabel;

  // ── ID ───────────────────────────────────────────────────────────────────
  const id = [archetype, ...jurisdictions.map((j) => j.jurisdiction)]
    .join("-")
    .toLowerCase();

  // ── Cost range ────────────────────────────────────────────────────────────
  const costEntry = ARCHETYPE_COST[archetype] ?? [3, 8] as const;
  const [low, high] = costEntry;

  return {
    id,
    title,
    agents: Array.from(agentSet).sort(),
    gates: Array.from(gateSet).sort(),
    compliance: [...new Set(compliance)].sort(),
    costRange: { low, high },
    routing: {
      archetype,
      packs: packs.map((p) => p.pack),
      jurisdictions: jurisdictions.map((j) => j.jurisdiction),
      confidence,
    },
  };
}

/**
 * Render FLOW.md content from a FlowResult.
 * Exported separately so bootstrap.ts can call it without depending on main.ts.
 */
export function renderFlowMd(flow: FlowResult, generatedAt: string): string {
  const agentLines = flow.agents.map((a) => `- ${a}`).join("\n");
  const gateLines = flow.gates.map((g) => `- ${g}`).join("\n");
  const complianceLines = flow.compliance.length > 0
    ? flow.compliance.map((c) => `- ${c}`).join("\n")
    : "- none";
  const packLines = flow.routing.packs.length > 0
    ? flow.routing.packs.join(", ")
    : "none";
  const jLines = flow.routing.jurisdictions.length > 0
    ? flow.routing.jurisdictions.join(", ")
    : "none";

  return `# Delivery Flow

> Auto-generated by \`great-cto init\` on ${generatedAt}.
> This file tells agents how to orchestrate your SDLC.
> Regenerates on \`npx great-cto init --force\`. Edit \`_routing:\` to tune.

## Detected

${flow.title}

## Agents

${agentLines}

## Human gates

${gateLines}

## Compliance

${complianceLines}

## Cost estimate

$${flow.costRange.low}–$${flow.costRange.high} per feature cycle

---

<!-- Internal routing — view with: great-cto flow explain -->
_routing:
  id: ${flow.id}
  archetype: ${flow.routing.archetype}
  packs: [${packLines}]
  jurisdictions: [${jLines}]
  confidence: ${flow.routing.confidence}
`;
}
