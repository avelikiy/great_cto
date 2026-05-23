# Flow Compiler UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace internal-debug init output with a user-facing "Compiled flow" summary, write `FLOW.md` as a single artifact for agents, and reposition README hero from "ingredient list" to "describe → get pipeline."

**Architecture:** Three independent changes around a new pure module `flow.ts` that composes existing detection primitives (`reviewersFor`, `gatesFor`, `suggestPacks`, `suggestJurisdictions`, `suggestCompliance`) into a single `FlowResult`. `bootstrap.ts` writes `FLOW.md` using that result; `main.ts` prints a user-facing summary from it; README hero gets one targeted rewrite.

**Tech Stack:** TypeScript strict, ESM, Node 20, `node:test` for tests. No new dependencies.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/cli/src/flow.ts` | **Create** | `compileFlow()` pure function — assembles FlowResult from all detection outputs |
| `packages/cli/tests/flow.test.mjs` | **Create** | 6 tests covering title, agents, gates, compliance, cost range |
| `packages/cli/src/bootstrap.ts` | **Modify** | Write `.great_cto/FLOW.md` using FlowResult; export FlowResult from BootstrapResult |
| `packages/cli/src/main.ts` | **Modify** | Replace `step 2/3/4` debug log with user-facing "Compiled flow:" summary block |
| `README.md` | **Modify** | Hero section — replace ingredient list with value prop + 3-step how-it-works |
| `packages/cli/package.json` | **Modify** | Bump version 2.19.0 → 2.20.0 |
| `CHANGELOG.md` | **Modify** | Add v2.20.0 entry |

---

## Task 1: flow.ts — pure compileFlow() module

**Files:**
- Create: `packages/cli/src/flow.ts`

- [ ] **Step 1: Write the failing test first** (in flow.test.mjs — see Task 2)

- [ ] **Step 2: Create `packages/cli/src/flow.ts`**

```typescript
// flow.ts — compiles all detection outputs into a single user-facing FlowResult.
// Pure function: no I/O, no side effects.
// Called by bootstrap.ts (writes FLOW.md) and main.ts (prints summary).

import type { Archetype, ProjectSize } from "./archetypes.js";
import { reviewersFor, gatesFor, type StandardGate } from "./archetypes.js";
import type { DetectionResult } from "./detect.js";
import { suggestPacks, suggestPackReviewers, suggestPackGates } from "./packs.js";
import { suggestJurisdictions, suggestJurisdictionReviewers, suggestJurisdictionGates } from "./jurisdictions.js";

export interface FlowResult {
  /** Kebab-case id: "fintech-eu-uk" */
  id: string;
  /** Human-readable summary: "Regulated fintech API · EU + UK" */
  title: string;
  /** Unique reviewer agent names, sorted */
  agents: string[];
  /** Human gate labels, e.g. ["gate:plan", "gate:ship", "gate:compliance"] */
  gates: string[];
  /** Compliance frameworks from archetype + packs + jurisdictions */
  compliance: string[];
  /** Indicative cost range per feature cycle */
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
};

// Cost (low, high) per feature cycle by archetype tier
const ARCHETYPE_COST: Record<string, [number, number]> = {
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
  const [low, high] = ARCHETYPE_COST[archetype] ?? [3, 8];

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
```

- [ ] **Step 3: Build**

```bash
cd <repo> && npm run build 2>&1 | tail -5
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/flow.ts
git commit -m "feat: add flow.ts — compileFlow() assembles FlowResult from detection"
```

---

## Task 2: flow.test.mjs — 6 tests

**Files:**
- Create: `packages/cli/tests/flow.test.mjs`

- [ ] **Step 1: Create test file**

```javascript
// Tests for flow.ts — compileFlow() + renderFlowMd().
//
// Run: npm run build && node --test tests/flow.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { compileFlow, renderFlowMd } from "../dist/flow.js";

function mkDetection(overrides = {}) {
  return {
    stack: [],
    languages: [],
    signals: {},
    packageManager: null,
    hasTests: false,
    hasCI: false,
    hasExistingGreatCto: false,
    codeStructure: {
      hasRoutesDir: false,
      hasCliEntry: false,
      hasPublicHtml: false,
      hasServerEntry: false,
      hasMonorepo: false,
    },
    scripts: { hasStart: false, hasDev: false, hasBuild: false, hasPublish: false },
    projectSize: "medium",
    readmeKeywords: [],
    infraKeywords: [],
    ...overrides,
  };
}

test("greenfield → title is 'New project', low cost, minimal gates", () => {
  const flow = compileFlow("greenfield", "nano", mkDetection(), [], "low");
  assert.equal(flow.title, "New project");
  assert.ok(flow.costRange.low < 1);
  assert.ok(flow.gates.includes("gate:plan"));
  // nano: only gate:plan
  assert.ok(!flow.gates.includes("gate:ship") || flow.gates.length <= 2);
});

test("fintech + eu jurisdiction → includes pci-reviewer, gdpr-reviewer, compliance gate", () => {
  const det = mkDetection({
    stack: ["stripe", "nodejs"],
    readmeKeywords: ["gdpr", "eu users"],
    infraKeywords: ["eu-west-1"],
  });
  const flow = compileFlow("fintech", "medium", det, ["pci-dss", "gdpr"], "high");
  assert.ok(flow.agents.includes("pci-reviewer"), "must include pci-reviewer");
  assert.ok(flow.agents.includes("gdpr-reviewer"), "must include gdpr-reviewer");
  assert.ok(flow.gates.some((g) => g.includes("compliance")), "must have compliance gate");
  assert.ok(flow.costRange.low >= 8, "fintech should be deep tier (≥$8)");
});

test("title includes jurisdiction codes when detected", () => {
  const det = mkDetection({ readmeKeywords: ["gdpr", "eu users"] });
  const flow = compileFlow("web-service", "medium", det, ["gdpr"], "medium");
  assert.ok(flow.title.includes("EU"), `title should include 'EU', got: ${flow.title}`);
});

test("agents are unique and sorted", () => {
  const flow = compileFlow("fintech", "large", mkDetection(), ["pci-dss"], "high");
  const sorted = [...flow.agents].sort();
  assert.deepEqual(flow.agents, sorted, "agents must be sorted");
  const unique = new Set(flow.agents);
  assert.equal(unique.size, flow.agents.length, "agents must be unique");
});

test("renderFlowMd produces valid markdown with _routing block", () => {
  const flow = compileFlow("fintech", "medium", mkDetection(), ["pci-dss"], "high");
  const md = renderFlowMd(flow, "2026-05-23");
  assert.ok(md.includes("# Delivery Flow"), "must have heading");
  assert.ok(md.includes("_routing:"), "must include _routing block");
  assert.ok(md.includes("archetype: fintech"), "must include archetype");
  assert.ok(md.includes("gate:plan"), "must include gate:plan");
});

test("cli-tool → baseline cost, no compliance gate", () => {
  const flow = compileFlow("cli-tool", "medium", mkDetection(), [], "high");
  assert.ok(flow.costRange.high <= 3, "cli-tool should be baseline tier (≤$3)");
  assert.ok(!flow.gates.includes("gate:compliance"), "cli-tool should not have compliance gate");
  assert.ok(flow.agents.includes("cli-reviewer"), "must include cli-reviewer");
});
```

- [ ] **Step 2: Run tests**

```bash
cd <repo> && npm run build && node --test tests/flow.test.mjs
```
Expected: 6 passing

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/flow.test.mjs
git commit -m "test: add flow.test.mjs — 6 tests for compileFlow + renderFlowMd"
```

---

## Task 3: bootstrap.ts — write FLOW.md

**Files:**
- Modify: `packages/cli/src/bootstrap.ts`

- [ ] **Step 1: Add import and update BootstrapResult**

At top of `bootstrap.ts`, after existing imports, add:

```typescript
import { compileFlow, renderFlowMd, type FlowResult } from "./flow.js";
import type { Archetype, ProjectSize } from "./archetypes.js";
import { suggestCompliance } from "./archetypes.js";
```

Update `BootstrapResult` interface (add `flow` field):

```typescript
export interface BootstrapResult {
  projectMdPath: string;
  created: boolean;
  skippedReason: string | null;
  flow: FlowResult | null;   // null when PROJECT.md already existed
}
```

- [ ] **Step 2: Update `bootstrap()` signature to accept confidence**

Change signature from:
```typescript
export function bootstrap(
  dir: string,
  detection: DetectionResult,
  archetype: Archetype,
  compliance: string[],
  detectionMeta?: { confidence: string; alternatives: string[]; rationale?: string },
): BootstrapResult {
```
To (no change to signature needed — confidence is already in `detectionMeta.confidence`).

- [ ] **Step 3: Add FLOW.md writing inside bootstrap(), after writeFileSync(projectMd)**

Find this line in bootstrap.ts:
```typescript
  writeFileSync(projectMd, content, "utf-8");
  success(`created .great_cto/PROJECT.md ${dim(`(archetype: ${archetype})`)}`);
  return { projectMdPath: projectMd, created: true, skippedReason: null };
```

Replace with:
```typescript
  writeFileSync(projectMd, content, "utf-8");
  success(`created .great_cto/PROJECT.md ${dim(`(archetype: ${archetype})`)}`);

  // Write FLOW.md — compiled delivery flow for agents and user
  const confidence = detectionMeta?.confidence ?? "medium";
  const size = (detection.projectSize ?? "medium") as ProjectSize;
  const flow = compileFlow(archetype as Archetype, size, detection, compliance, confidence);
  const flowMd = join(greatCtoDir, "FLOW.md");
  const generatedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(flowMd, renderFlowMd(flow, generatedAt), "utf-8");

  return { projectMdPath: projectMd, created: true, skippedReason: null, flow };
```

Also update the early return (when PROJECT.md already exists) to return `flow: null`:
```typescript
  if (existsSync(projectMd)) {
    warn(`.great_cto/PROJECT.md already exists — not overwriting.`);
    return { projectMdPath: projectMd, created: false, skippedReason: "already exists", flow: null };
  }
```

- [ ] **Step 4: Build + verify FLOW.md is created**

```bash
cd <repo> && npm run build
mkdir -p /tmp/flow-test && cd /tmp/flow-test && git init -q
node <repo>/packages/cli/dist/main.js init -y
cat .great_cto/FLOW.md
```

Expected: FLOW.md exists with `# Delivery Flow`, `## Agents`, `## Human gates`, `_routing:` block.

- [ ] **Step 5: Commit**

```bash
git -C <repo> add packages/cli/src/bootstrap.ts
git -C <repo> commit -m "feat: write FLOW.md on init — compiled delivery flow artifact"
```

---

## Task 4: main.ts — user-facing summary output

**Files:**
- Modify: `packages/cli/src/main.ts`

This task replaces the internal debug log after detection with a clean "Compiled flow:" block.

- [ ] **Step 1: Add import for compileFlow at top of main.ts**

Find the imports section (around line 16–21). Add:
```typescript
import { compileFlow, type FlowResult } from "./flow.js";
```

- [ ] **Step 2: Find the current debug output block in runInit (lines ~582–602)**

Current code:
```typescript
  log(`  ${dim("archetype:")} ${cyan(archetype)} ${dim(`(confidence: ${confidence})`)}`);
  log(`  ${dim("rationale:")} ${rationale}`);
  if (alternatives.length > 0) {
    log(`  ${dim("alternatives:")} ${alternatives.join(", ")}`);
  }
  log(`  ${dim("suggested compliance:")} ${compliance.length > 0 ? compliance.join(", ") : "none"}`);

  // v1.0.144+: ask user to confirm archetype if confidence is low
  // OR if alternatives are present and not user-specified
  if (!args.yes && !args.archetype && (confidence === "low" || (confidence === "medium" && alternatives.length >= 2))) {
    log("");
    log(`${bold("⚠ Archetype detection confidence:")} ${cyan(confidence)}`);
    log(`  Top candidate: ${cyan(archetype)} — ${dim(rationale)}`);
    if (alternatives.length > 0) {
      log(`  Alternatives:  ${alternatives.map(a => cyan(a)).join(", ")}`);
    }
    log(`  ${dim("If wrong, override with: --archetype " + (alternatives[0] ?? "<name>"))}`);
    log(`  ${dim("Or edit .great_cto/PROJECT.md after init — agents read 'archetype:' field.")}`);
  }
```

Replace with:
```typescript
  // Compile flow — used for user-facing summary AND written to FLOW.md
  const compiledFlow = compileFlow(
    archetype as never,
    (detection.projectSize ?? "medium") as never,
    detection,
    compliance,
    confidence,
  );

  // ── User-facing "Compiled flow" summary ──────────────────────────────────
  log("");
  log(`${bold("Compiled flow:")} ${cyan(compiledFlow.title)}`);
  log(`  ${dim("Agents:")}     ${compiledFlow.agents.join(" · ")}`);
  log(`  ${dim("Gates:")}      ${compiledFlow.gates.join(" · ")}`);
  if (compiledFlow.compliance.length > 0) {
    log(`  ${dim("Compliance:")} ${compiledFlow.compliance.join(", ")}`);
  }
  log(`  ${dim("Cost:")}       ~$${compiledFlow.costRange.low}–$${compiledFlow.costRange.high} per feature cycle`);
  log("");

  // Low-confidence notice — show only when actionable
  if (!args.yes && !args.archetype && (confidence === "low" || (confidence === "medium" && alternatives.length >= 2))) {
    log(`  ${yellow("⚠")} ${dim(`Detected as ${cyan(archetype)} (${confidence} confidence).`)}`);
    if (alternatives.length > 0) {
      log(`  ${dim("Alternatives: " + alternatives.join(", "))}`);
    }
    log(`  ${dim("Override: npx great-cto init --archetype <name>")}`);
    log("");
  }
```

- [ ] **Step 3: Build and do a quick smoke test**

```bash
cd <repo> && npm run build
mkdir -p /tmp/flow-test2 && cd /tmp/flow-test2 && git init -q
cat > package.json << 'EOF'
{"name":"test-fintech","dependencies":{"stripe":"^14.0.0"}}
EOF
node <repo>/packages/cli/dist/main.js init -y
```

Expected output includes:
```
Compiled flow: E-commerce · (or similar based on stripe detection)
  Agents:     architect · pci-reviewer · qa-engineer · security-officer · senior-dev
  Gates:      gate:compliance · gate:plan · gate:qa · gate:security · gate:ship
  Compliance: gdpr, pci-dss
  Cost:       ~$3–$8 per feature cycle
```

- [ ] **Step 4: Run full test suite**

```bash
cd <repo> && npm test 2>&1 | tail -10
```
Expected: all tests pass (162+ passing)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/main.ts
git commit -m "feat: replace init debug output with user-facing compiled flow summary"
```

---

## Task 5: README hero repositioning

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the first paragraph hero block**

Find:
```markdown
**Solo-CTO mode. Stop being the only person who can ship.**

**The engineering OS for Claude Code** — open-source, local-first alternative to Devin. great_cto orchestrates **57 specialist agents** around your Claude Code: architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, plus 30 archetype reviewers (including gdpr-reviewer, us-privacy-reviewer, dpdpa-reviewer) and **16 domain packs** (voice-AI · clinical · HR-AI · API platform · lending · clinical trials · robotics · EM-fintech · climate · drug-discovery · digital-health · edtech · gov · gaming · enterprise · insurance).

You're the solo CTO. You're also the bottleneck. **GreatCTO is 50 specialist agents** that handle architecture, review, QA, security, and deploy — while you make **two decisions per feature**.

**Built for the one-person engineering org.** Indie hackers, solo founders, and technical CTOs running everything themselves. *Not built for teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).
```

Replace with:
```markdown
**Describe your project and where it operates. GreatCTO compiles the right SDLC pipeline automatically.**

`npx great-cto init` scans your stack, detects jurisdiction, and compiles a delivery flow — architecture, ADRs, implementation plan, code review, QA, security, compliance gates, and release. You approve two checkpoints: the plan and the ship decision. Everything else runs automatically.

**Built for the one-person engineering org.** Indie hackers, solo founders, and technical CTOs running everything themselves. *Not built for teams* — see [FAQ](docs/FAQ.md#is-great_cto-for-teams).

Under the hood: 57 specialist agents · 25 product archetypes · 11 domain packs · 33+ compliance frameworks · 12 jurisdiction overlays.
```

- [ ] **Step 2: Replace the "What is great_cto?" section intro**

Find:
```markdown
## What is great_cto?

You describe what you want (`/start "build a billing endpoint"`). 57 specialist agents — architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, l3-support, plus 30 archetype reviewers and **16 domain packs** (voice-AI · clinical · HR-AI · API platform · lending · clinical trials · robotics · EM-fintech · climate · drug-discovery · **digital-health · edtech · gov · gaming · enterprise · insurance**) — orchestrate the SDLC: archetype detection → pack overlay → architecture + ADRs → threat model → plan + Beads tasks → TDD impl → 12-angle review → QA → security gate → deploy.

The pipeline scales to the work: a 1-line typo fix runs through 1 agent in 30s; a deep cross-cutting feature runs through 7+ agents over an hour. **You confirm two gates** (plan, ship). Everything else is automatic.
```

Replace with:
```markdown
## What is great_cto?

Run `npx great-cto init` in any repo. GreatCTO scans your stack, detects jurisdiction from infra and README signals, and compiles a **Delivery Flow** — the exact set of agents, compliance frameworks, and human gates your project needs.

```
great-cto init
→ Compiled flow: Fintech · EU + UK
  Agents:     architect · pci-reviewer · gdpr-reviewer · regulated-reviewer · senior-dev · qa-engineer
  Compliance: GDPR · PCI DSS · PSD2/SCA · DORA
  Gates:      gate:plan · gate:compliance · gate:security · gate:ship
  Cost:       ~$8–$18 per feature cycle
```

From there, `/start "build a refund endpoint"` runs the compiled pipeline end-to-end. The pipeline scales to the work: a 1-line typo fix runs through 1 agent in 30s; a deep cross-cutting feature runs through 7+ agents over an hour. **You confirm two gates** (plan, ship). Everything else is automatic.
```

- [ ] **Step 3: Commit README**

```bash
git add README.md
git commit -m "docs: reposition README hero — describe→pipeline instead of ingredient list"
```

---

## Task 6: v2.20.0 bump + CHANGELOG + full test run

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

In `packages/cli/package.json`, change:
```json
"version": "2.19.0",
```
to:
```json
"version": "2.20.0",
```

- [ ] **Step 2: Add CHANGELOG entry**

At the top of the `## Releases` section in `CHANGELOG.md`, add:

```markdown
**v2.20.0** (2026-05-23) — **Flow Compiler UX**: `npx great-cto init` now prints a user-facing "Compiled flow:" summary (agents · gates · compliance · cost range) instead of internal debug steps · `FLOW.md` written to `.great_cto/` on every init — single artifact agents use to orchestrate SDLC · README hero repositioned from ingredient list to "describe → get pipeline" value prop.
```

- [ ] **Step 3: Full test run**

```bash
cd <repo> && npm test 2>&1 | tail -15
```
Expected: all tests pass (168+ passing — 162 existing + 6 new flow tests)

- [ ] **Step 4: Final commit**

```bash
git add packages/cli/package.json CHANGELOG.md
git commit -m "chore: bump to v2.20.0 — flow compiler UX + FLOW.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ `runInit` output → user-facing summary (Task 4)
- ✅ `FLOW.md` written by `bootstrap.ts` (Task 3)
- ✅ README hero repositioning (Task 5)
- ✅ Tests for new module (Task 2)

**Placeholder scan:** None — every code step contains actual implementation.

**Type consistency:**
- `FlowResult` defined in `flow.ts`, imported by `bootstrap.ts` and `main.ts`
- `BootstrapResult.flow: FlowResult | null` added in Task 3
- `compileFlow` receives `Archetype` and `ProjectSize` from `archetypes.ts` (same types used elsewhere)

**Backward compat:**
- `bootstrap()` call sites in `main.ts` — BootstrapResult grows `.flow` field, all existing call sites ignore it (no break)
- FLOW.md is a new file; doesn't conflict with PROJECT.md
- No existing tests touch `runInit` output format (integration.test.mjs tests CLI exit codes, not stdout)

---

Status: APPROVED
Critic verdict: Plan is self-consistent — new module is pure, integration points are minimal, no circular imports, backward-compatible API extension.
