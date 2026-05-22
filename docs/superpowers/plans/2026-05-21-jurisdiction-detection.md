# Jurisdiction Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect project jurisdiction (EU, US, IN, BR, UK, AU, SG) from README + stack signals and map to applicable compliance frameworks, reviewer agents, and human gates — adding `jurisdiction:` as a third detection axis alongside `archetype:` and `packs:` in PROJECT.md.

**Architecture:** New `packages/cli/src/jurisdictions.ts` module mirrors the `packs.ts` pattern exactly: `JurisdictionCode` union type, `SIGNALS` record keyed by code, `COMPLIANCE_MAP` for reviewers/gates/laws, and exported `suggestJurisdictions(DetectionResult)`. `detect.ts` gets a new `mineJurisdictionKeywords()` helper that emits geo/legal terms into `DetectionResult.readmeKeywords`. `bootstrap.ts` auto-populates a `jurisdiction:` field in PROJECT.md from detected codes.

**Tech Stack:** TypeScript strict, Node 20 ESM, `node:test` + `node:assert` for tests, no new runtime deps.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/cli/src/jurisdictions.ts` | **Create** | JurisdictionCode type, SIGNALS, COMPLIANCE_MAP, suggestJurisdictions, listJurisdictions |
| `packages/cli/src/detect.ts` | **Modify** | Add geo keyword terms to mineReadmeKeywords packTerms array |
| `packages/cli/src/bootstrap.ts` | **Modify** | Add `jurisdiction:` field to PROJECT.md template |
| `packages/cli/tests/jurisdictions.test.mjs` | **Create** | Unit tests for jurisdiction detection |
| `agents/gdpr-reviewer.md` | **Create** | GDPR Art.5/6/9/25/32/35 + EU AI Act + NIS2 specialist |
| `agents/us-privacy-reviewer.md` | **Create** | CCPA/CPRA + US state privacy matrix specialist |
| `agents/dpdpa-reviewer.md` | **Create** | India DPDPA 2023 + IT Act + RBI specialist |
| `skills/great_cto/SKILL.md` | **Modify** | Add jurisdiction reviewer routing rows |
| `skills/great_cto/TYPE_MAP.md` | **Modify** | Add jurisdiction compliance rows |
| `packages/cli/package.json` | **Modify** | Bump version 2.14.0 → 2.15.0 |
| `README.md` | **Modify** | Document jurisdiction detection feature |
| `CHANGELOG.md` | **Modify** | Add v2.15.0 entry |

---

### Task 1: `jurisdictions.ts` — core module

**Files:**
- Create: `packages/cli/src/jurisdictions.ts`

- [ ] **Step 1: Write the failing test** (in next task — write the module first so tsc compiles)

- [ ] **Step 2: Create `packages/cli/src/jurisdictions.ts`**

```typescript
// Jurisdiction detection — auto-detect applicable compliance frameworks
// from project geography signals (README keywords, infra region hints).
//
// Three-axis detection model:
//   archetype  → what you build  (ai-system, healthcare, fintech…)
//   pack       → what you use    (digital-health-pack, lending-pack…)
//   jurisdiction → where you operate  (eu, us-ca, in, br, uk, au, sg)
//
// Jurisdiction overlays add specialist reviewer agents and human gates
// ON TOP OF archetype + pack pipelines.

import type { DetectionResult } from "./detect.js";

export type JurisdictionCode =
  | "eu"       // GDPR · EU AI Act · NIS2
  | "us"       // FTC Act · state privacy matrix
  | "us-ca"    // CCPA / CPRA (California)
  | "uk"       // UK GDPR · DPA 2018 · FCA
  | "in"       // DPDPA 2023 · IT Act · RBI
  | "br"       // LGPD
  | "au"       // Privacy Act 1988 · CDR
  | "sg";      // PDPA · MAS

export interface JurisdictionMatch {
  jurisdiction: JurisdictionCode;
  reviewers: string[];    // agent names invoked
  signals: string[];      // matched keywords/tokens (capped to 8)
  humanGates: string[];   // gate ids this jurisdiction introduces
  laws: string[];         // primary compliance frameworks
}

// ── Compliance map ────────────────────────────────────────────────────────

const JURISDICTION_REVIEWERS: Record<JurisdictionCode, string[]> = {
  "eu":    ["gdpr-reviewer"],
  "us":    ["us-privacy-reviewer"],
  "us-ca": ["us-privacy-reviewer"],
  "uk":    ["gdpr-reviewer"],          // UK GDPR closely mirrors EU GDPR
  "in":    ["dpdpa-reviewer"],
  "br":    ["gdpr-reviewer"],          // LGPD mirrors GDPR — same reviewer covers
  "au":    ["us-privacy-reviewer"],    // Privacy Act 1988 — covered by privacy reviewer
  "sg":    ["us-privacy-reviewer"],    // PDPA — covered by privacy reviewer
};

const JURISDICTION_GATES: Record<JurisdictionCode, string[]> = {
  "eu":    ["gate:gdpr-dpia", "gate:eu-ai-act-classification"],
  "us":    ["gate:us-state-privacy-matrix"],
  "us-ca": ["gate:ccpa-dsrp", "gate:us-state-privacy-matrix"],
  "uk":    ["gate:uk-gdpr-dpia"],
  "in":    ["gate:dpdpa-consent-framework"],
  "br":    ["gate:lgpd-dpia"],
  "au":    ["gate:au-privacy-act-assessment"],
  "sg":    ["gate:pdpa-dpo"],
};

const JURISDICTION_LAWS: Record<JurisdictionCode, string[]> = {
  "eu":    ["GDPR (EU) 2016/679", "EU AI Act 2024/1689", "NIS2 Directive 2022/2555", "ePrivacy Directive"],
  "us":    ["FTC Act § 5", "COPPA (if under-13)", "US state privacy laws (VA CDPA · TX TDPSA · FL FDBR · CO CPA · CT CTDPA)"],
  "us-ca": ["CCPA / CPRA", "California AG enforcement", "CPPA rulemaking"],
  "uk":    ["UK GDPR", "DPA 2018", "ICO guidance", "FCA Consumer Duty (if fintech)"],
  "in":    ["DPDPA 2023 (Digital Personal Data Protection Act)", "IT Act 2000 § 43A", "SPDI Rules 2011", "RBI data localisation (if fintech)"],
  "br":    ["LGPD (Lei 13.709/2018)", "ANPD resolutions", "Marco Civil da Internet"],
  "au":    ["Privacy Act 1988 (Cth)", "Australian Privacy Principles (APPs)", "CDR (if fintech)", "OAIC enforcement"],
  "sg":    ["PDPA 2012 (amended 2021)", "MAS TRM Guidelines (if fintech)", "PDPC Advisory Guidelines"],
};

// ── Signal dictionary ─────────────────────────────────────────────────────

export const JURISDICTION_SIGNALS: Record<
  JurisdictionCode,
  { keywords: string[] }
> = {
  "eu": {
    keywords: [
      // Legal / regulatory terms
      "gdpr", "dsgvo", "rgpd", "data protection officer", "dpo",
      "right to erasure", "right to be forgotten", "data subject request",
      "article 6", "article 9", "legitimate interest", "lawful basis",
      "privacy by design", "privacy notice", "cookie consent",
      "eu ai act", "eu users", "eu customers", "european union",
      "eu data residency", "eu-west", "eu-central",
      // NIS2 / DORA
      "nis2", "dora ict risk", "dora compliance",
      // Locales / markets
      "german users", "french users", "dutch users", "austrian",
      "italian users", "spanish users", "polish users",
    ],
  },
  "us": {
    keywords: [
      "ftc", "ftc act", "us users", "us customers", "united states",
      "american users", "coppa", "hipaa",  // hipaa already in clinical-pack, echo here for clarity
      "virginia cdpa", "texas tdpsa", "florida fdbr", "colorado cpa",
      "connecticut ctdpa", "us state privacy", "us privacy law",
    ],
  },
  "us-ca": {
    keywords: [
      "ccpa", "cpra", "california consumer privacy",
      "california privacy rights", "cppa", "california residents",
      "california users", "do not sell", "opt-out of sale",
      "data subject rights california", "dsr california",
    ],
  },
  "uk": {
    keywords: [
      "uk gdpr", "ico", "information commissioner", "dpa 2018",
      "uk users", "uk customers", "united kingdom", "british users",
      "fca consumer duty", "uk ai regulation",
    ],
  },
  "in": {
    keywords: [
      // Data protection
      "dpdpa", "digital personal data protection", "india data",
      "india users", "indian users", "bharat", "meity",
      // Fintech / telecom
      "rbi data localisation", "rbi circular", "npci", "sebi",
      "india data residency",
    ],
  },
  "br": {
    keywords: [
      "lgpd", "lei 13709", "anpd", "brazil users", "brazil customers",
      "brazilian users", "brasil", "data encarregado", "dpo brazil",
      "lgpd compliance",
    ],
  },
  "au": {
    keywords: [
      "privacy act 1988", "australian privacy principles", "app principles",
      "oaic", "australia users", "australian users", "cdr",
      "consumer data right", "notifiable data breach", "ndb scheme",
      "australia data residency",
    ],
  },
  "sg": {
    keywords: [
      "pdpa", "pdpc", "singapore users", "singaporean users",
      "mas guidelines", "mas tpm", "singpass", "myinfo",
      "singapore data residency", "sg data",
    ],
  },
};

// ── Public API ─────────────────────────────────────────────────────────────

/** Return jurisdictions whose signals match the detection result. */
export function suggestJurisdictions(d: DetectionResult): JurisdictionMatch[] {
  const matches: JurisdictionMatch[] = [];
  const kwLower = d.readmeKeywords.map((k) => k.toLowerCase());

  for (const code of Object.keys(JURISDICTION_SIGNALS) as JurisdictionCode[]) {
    const { keywords } = JURISDICTION_SIGNALS[code];
    const matchedKeywords = keywords.filter((kw) => kwLower.includes(kw));
    if (matchedKeywords.length === 0) continue;

    matches.push({
      jurisdiction: code,
      reviewers: JURISDICTION_REVIEWERS[code],
      signals: matchedKeywords.slice(0, 8),
      humanGates: JURISDICTION_GATES[code],
      laws: JURISDICTION_LAWS[code],
    });
  }

  matches.sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
  return matches;
}

/** Flatten matched jurisdictions to unique sorted reviewer names. */
export function suggestJurisdictionReviewers(d: DetectionResult): string[] {
  const all = new Set<string>();
  for (const m of suggestJurisdictions(d)) for (const r of m.reviewers) all.add(r);
  return Array.from(all).sort();
}

/** Flatten matched jurisdictions to unique sorted gate ids. */
export function suggestJurisdictionGates(d: DetectionResult): string[] {
  const all = new Set<string>();
  for (const m of suggestJurisdictions(d)) for (const g of m.humanGates) all.add(g);
  return Array.from(all).sort();
}

/** Registry of all known jurisdiction codes — useful for /doctor. */
export function listJurisdictions(): JurisdictionCode[] {
  return Object.keys(JURISDICTION_SIGNALS).sort() as JurisdictionCode[];
}
```

- [ ] **Step 3: Build to verify TypeScript compiles**

```bash
cd packages/cli && npm run build 2>&1
```

Expected: no errors, `dist/jurisdictions.js` emitted.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/jurisdictions.ts
git commit -m "feat(jurisdictions): add jurisdiction detection module — EU/US/US-CA/UK/IN/BR/AU/SG"
```

---

### Task 2: `detect.ts` — add geo keywords to mineReadmeKeywords

**Files:**
- Modify: `packages/cli/src/detect.ts` (in `mineReadmeKeywords`, `packTerms` array, around line 860)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "em-fintech-pack\|digital-health-pack\|return Array.from" packages/cli/src/detect.ts | tail -5
```

Expected: shows the last `packTerms` entry and `return Array.from(kws).sort()`.

- [ ] **Step 2: Add jurisdiction terms to `packTerms` in `mineReadmeKeywords`**

Find the line `return Array.from(kws).sort();` near end of `mineReadmeKeywords` and insert BEFORE it:

```typescript
  // Jurisdiction geo/legal terms — emitted verbatim so jurisdictions.ts
  // can exact-match them. Keep in sync with JURISDICTION_SIGNALS in jurisdictions.ts.
  const jurisdictionTerms = [
    // EU
    "gdpr", "dsgvo", "rgpd", "data protection officer", "dpo",
    "right to erasure", "right to be forgotten", "data subject request",
    "article 6", "article 9", "legitimate interest", "lawful basis",
    "privacy by design", "cookie consent",
    "eu ai act", "eu users", "eu customers", "european union",
    "eu data residency", "eu-west", "eu-central",
    "nis2", "dora ict risk", "dora compliance",
    "german users", "french users", "dutch users", "austrian",
    "italian users", "spanish users", "polish users",
    // US
    "ftc", "ftc act", "us users", "us customers", "united states",
    "american users", "virginia cdpa", "texas tdpsa", "florida fdbr",
    "colorado cpa", "connecticut ctdpa", "us state privacy",
    // US-CA
    "ccpa", "cpra", "california consumer privacy",
    "california privacy rights", "cppa", "california residents",
    "california users", "do not sell", "opt-out of sale",
    // UK
    "uk gdpr", "ico", "information commissioner", "dpa 2018",
    "uk users", "uk customers", "united kingdom", "british users",
    "fca consumer duty",
    // IN
    "dpdpa", "digital personal data protection", "india data",
    "india users", "indian users", "bharat", "meity",
    "rbi data localisation", "rbi circular", "india data residency",
    // BR
    "lgpd", "lei 13709", "anpd", "brazil users", "brazil customers",
    "brazilian users", "brasil", "lgpd compliance",
    // AU
    "privacy act 1988", "australian privacy principles", "app principles",
    "oaic", "australia users", "australian users",
    "consumer data right", "notifiable data breach",
    // SG
    "pdpa", "pdpc", "singapore users", "singaporean users",
    "mas guidelines", "singpass",
  ];
  for (const term of jurisdictionTerms) {
    if (text.includes(term)) kws.add(term);
  }
```

- [ ] **Step 3: Build**

```bash
cd packages/cli && npm run build 2>&1
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
node -e "
import { detect } from './packages/cli/dist/detect.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = '/tmp/jurisdiction-test-eu';
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'README.md'), 'We are GDPR compliant and serve EU users. Cookie consent required.');
const r = detect(dir);
console.log('keywords:', r.readmeKeywords.filter(k => ['gdpr','eu users','cookie consent'].includes(k)));
" --input-type module
```

Expected: `keywords: [ 'cookie consent', 'eu users', 'gdpr' ]` (order varies).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/detect.ts
git commit -m "feat(detect): mine jurisdiction geo/legal keywords from README for jurisdiction detection"
```

---

### Task 3: `bootstrap.ts` — add `jurisdiction:` to PROJECT.md template

**Files:**
- Modify: `packages/cli/src/bootstrap.ts`

- [ ] **Step 1: Import suggestJurisdictions**

At the top of `bootstrap.ts`, add to existing imports:

```typescript
import { suggestJurisdictions } from "./jurisdictions.js";
```

- [ ] **Step 2: Compute jurisdiction line before template string**

Find where `complianceLine` is computed (around line 30-40 of bootstrap.ts) and add after it:

```typescript
  const jurisdictionMatches = suggestJurisdictions(detection);
  const jurisdictionLine = jurisdictionMatches.length > 0
    ? jurisdictionMatches.map((m) => m.jurisdiction).join(", ")
    : "unknown";
```

- [ ] **Step 3: Add `jurisdiction:` field to PROJECT.md template**

In the template string, find the `## Compliance` section:

```
## Compliance

compliance: [${complianceLine}]
```

Replace with:

```typescript
## Compliance

compliance: [${complianceLine}]
jurisdiction: [${jurisdictionLine}]

> \`compliance:\` list drives which checklists security-officer runs.
> \`jurisdiction:\` is auto-detected from README geo/legal signals — edit if wrong.
> Supported codes: eu · us · us-ca · uk · in · br · au · sg
> See docs/jurisdiction-compliance.md for what each code activates.
```

- [ ] **Step 4: Build**

```bash
cd packages/cli && npm run build 2>&1
```

Expected: no errors.

- [ ] **Step 5: Verify PROJECT.md output**

```bash
mkdir -p /tmp/jtest && cat > /tmp/jtest/README.md << 'EOF'
# My App
We serve EU users and are GDPR compliant. Cookie consent managed.
EOF
node -e "
import { bootstrap } from './packages/cli/dist/bootstrap.js';
import { detect } from './packages/cli/dist/detect.js';
const d = detect('/tmp/jtest');
bootstrap('/tmp/jtest', 'ai-system', d);
" --input-type module
cat /tmp/jtest/.great_cto/PROJECT.md | grep "jurisdiction:"
```

Expected: `jurisdiction: [eu]`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/bootstrap.ts
git commit -m "feat(bootstrap): add jurisdiction field to PROJECT.md auto-populated from detected geo signals"
```

---

### Task 4: `jurisdictions.test.mjs` — unit tests

**Files:**
- Create: `packages/cli/tests/jurisdictions.test.mjs`

- [ ] **Step 1: Write the test file**

```javascript
// Tests for jurisdictions.ts — suggestJurisdictions, suggestJurisdictionReviewers,
// suggestJurisdictionGates, listJurisdictions.
//
// Run: npm run build && node --test tests/jurisdictions.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestJurisdictions,
  suggestJurisdictionReviewers,
  suggestJurisdictionGates,
  listJurisdictions,
} from "../dist/jurisdictions.js";

function mkDetection(readmeKeywords = []) {
  return { stack: [], readmeKeywords };
}

// ── EU ────────────────────────────────────────────────────────────────────

test("eu: 'gdpr' keyword triggers EU jurisdiction", () => {
  const d = mkDetection(["gdpr"]);
  const matches = suggestJurisdictions(d);
  const eu = matches.find((m) => m.jurisdiction === "eu");
  assert.ok(eu, "eu should be detected from 'gdpr' keyword");
  assert.ok(eu.reviewers.includes("gdpr-reviewer"), "gdpr-reviewer must be included");
  assert.ok(eu.humanGates.includes("gate:gdpr-dpia"), "gate:gdpr-dpia must be included");
  assert.ok(eu.laws.some((l) => l.includes("GDPR")), "laws must mention GDPR");
});

test("eu: 'eu users' triggers EU jurisdiction", () => {
  const d = mkDetection(["eu users"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "eu"), "eu should match 'eu users'");
});

test("eu: 'eu ai act' triggers EU jurisdiction and eu-ai-act-classification gate", () => {
  const d = mkDetection(["eu ai act"]);
  const matches = suggestJurisdictions(d);
  const eu = matches.find((m) => m.jurisdiction === "eu");
  assert.ok(eu, "eu should match 'eu ai act'");
  assert.ok(eu.humanGates.includes("gate:eu-ai-act-classification"));
});

test("eu: 'nis2' triggers EU jurisdiction", () => {
  const d = mkDetection(["nis2"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "eu"), "eu should match 'nis2'");
});

// ── US-CA ─────────────────────────────────────────────────────────────────

test("us-ca: 'ccpa' triggers California jurisdiction", () => {
  const d = mkDetection(["ccpa"]);
  const matches = suggestJurisdictions(d);
  const usca = matches.find((m) => m.jurisdiction === "us-ca");
  assert.ok(usca, "us-ca should be detected from 'ccpa'");
  assert.ok(usca.humanGates.includes("gate:ccpa-dsrp"), "gate:ccpa-dsrp must fire");
});

test("us-ca: 'cpra' triggers California jurisdiction", () => {
  const d = mkDetection(["cpra"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "us-ca"), "us-ca should match 'cpra'");
});

test("us-ca: 'do not sell' triggers California jurisdiction", () => {
  const d = mkDetection(["do not sell"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "us-ca"), "us-ca should match 'do not sell'");
});

// ── UK ────────────────────────────────────────────────────────────────────

test("uk: 'uk gdpr' triggers UK jurisdiction", () => {
  const d = mkDetection(["uk gdpr"]);
  const matches = suggestJurisdictions(d);
  const uk = matches.find((m) => m.jurisdiction === "uk");
  assert.ok(uk, "uk should be detected from 'uk gdpr'");
  assert.ok(uk.humanGates.includes("gate:uk-gdpr-dpia"), "gate:uk-gdpr-dpia must fire");
});

test("uk: 'ico' triggers UK jurisdiction", () => {
  const d = mkDetection(["ico"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "uk"), "uk should match 'ico'");
});

// ── IN ────────────────────────────────────────────────────────────────────

test("in: 'dpdpa' triggers India jurisdiction", () => {
  const d = mkDetection(["dpdpa"]);
  const matches = suggestJurisdictions(d);
  const india = matches.find((m) => m.jurisdiction === "in");
  assert.ok(india, "in should be detected from 'dpdpa'");
  assert.ok(india.reviewers.includes("dpdpa-reviewer"), "dpdpa-reviewer must be included");
  assert.ok(india.humanGates.includes("gate:dpdpa-consent-framework"));
});

test("in: 'india users' triggers India jurisdiction", () => {
  const d = mkDetection(["india users"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "in"), "in should match 'india users'");
});

test("in: 'rbi data localisation' triggers India jurisdiction", () => {
  const d = mkDetection(["rbi data localisation"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "in"), "in should match 'rbi data localisation'");
});

// ── BR ────────────────────────────────────────────────────────────────────

test("br: 'lgpd' triggers Brazil jurisdiction", () => {
  const d = mkDetection(["lgpd"]);
  const matches = suggestJurisdictions(d);
  const br = matches.find((m) => m.jurisdiction === "br");
  assert.ok(br, "br should be detected from 'lgpd'");
  assert.ok(br.humanGates.includes("gate:lgpd-dpia"));
});

// ── AU ────────────────────────────────────────────────────────────────────

test("au: 'privacy act 1988' triggers Australia jurisdiction", () => {
  const d = mkDetection(["privacy act 1988"]);
  const matches = suggestJurisdictions(d);
  const au = matches.find((m) => m.jurisdiction === "au");
  assert.ok(au, "au should be detected from 'privacy act 1988'");
  assert.ok(au.humanGates.includes("gate:au-privacy-act-assessment"));
});

// ── SG ────────────────────────────────────────────────────────────────────

test("sg: 'pdpa' triggers Singapore jurisdiction", () => {
  const d = mkDetection(["pdpa"]);
  const matches = suggestJurisdictions(d);
  const sg = matches.find((m) => m.jurisdiction === "sg");
  assert.ok(sg, "sg should be detected from 'pdpa'");
  assert.ok(sg.humanGates.includes("gate:pdpa-dpo"));
});

// ── Multi-jurisdiction ─────────────────────────────────────────────────────

test("multi: project with gdpr + ccpa triggers both eu and us-ca", () => {
  const d = mkDetection(["gdpr", "ccpa"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "eu"), "eu should match");
  assert.ok(matches.find((m) => m.jurisdiction === "us-ca"), "us-ca should match");
  assert.equal(matches.length >= 2, true, "at least 2 jurisdictions detected");
});

test("multi: suggestJurisdictionReviewers deduplicates across jurisdictions", () => {
  // Both eu and br use gdpr-reviewer — should deduplicate
  const d = mkDetection(["gdpr", "lgpd"]);
  const reviewers = suggestJurisdictionReviewers(d);
  const gdprCount = reviewers.filter((r) => r === "gdpr-reviewer").length;
  assert.equal(gdprCount, 1, "gdpr-reviewer should appear only once even when matched by multiple jurisdictions");
});

test("multi: suggestJurisdictionGates returns sorted unique gates", () => {
  const d = mkDetection(["gdpr", "ccpa", "dpdpa"]);
  const gates = suggestJurisdictionGates(d);
  const unique = new Set(gates);
  assert.equal(gates.length, unique.size, "gates must be unique");
  const sorted = [...gates].sort();
  assert.deepEqual(gates, sorted, "gates must be sorted");
});

// ── No false positives ─────────────────────────────────────────────────────

test("no-match: generic SaaS project does not trigger any jurisdiction", () => {
  const d = mkDetection(["react", "typescript", "postgres", "redis", "stripe"]);
  const matches = suggestJurisdictions(d);
  assert.equal(matches.length, 0, "generic SaaS should not trigger jurisdiction detection");
});

// ── listJurisdictions ──────────────────────────────────────────────────────

test("listJurisdictions returns all 8 codes", () => {
  const codes = listJurisdictions();
  assert.equal(codes.length, 8, "should have 8 jurisdiction codes");
  for (const code of ["au", "br", "eu", "in", "sg", "uk", "us", "us-ca"]) {
    assert.ok(codes.includes(code), `${code} should be in listJurisdictions`);
  }
});

test("listJurisdictions is sorted", () => {
  const codes = listJurisdictions();
  assert.deepEqual(codes, [...codes].sort(), "listJurisdictions must be sorted");
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/cli && npm run build && node --test tests/jurisdictions.test.mjs
```

Expected: all 20 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/jurisdictions.test.mjs
git commit -m "test(jurisdictions): 20 tests covering EU/US-CA/UK/IN/BR/AU/SG detection + multi-jurisdiction + false-positive guard"
```

---

### Task 5: Reviewer agent files

**Files:**
- Create: `agents/gdpr-reviewer.md`
- Create: `agents/us-privacy-reviewer.md`
- Create: `agents/dpdpa-reviewer.md`

- [ ] **Step 1: Create `agents/gdpr-reviewer.md`**

```markdown
---
name: gdpr-reviewer
version: 1.0.0
description: |
  GDPR + EU AI Act + NIS2 specialist reviewer. Auto-invoked when
  jurisdiction detection finds eu, uk, or br signals. Covers
  GDPR Art.5/6/9/25/32/35, Data Protection Impact Assessment,
  EU AI Act risk classification, and NIS2 Article 21 controls.
model: sonnet
applies_to: [ai-system, agent-product, regulated, enterprise-saas, healthcare, fintech]
triggers:
  - jurisdiction: eu
  - jurisdiction: uk
  - jurisdiction: br
---

# GDPR / EU AI Act Reviewer

## Purpose

You are a GDPR, EU AI Act, and NIS2 compliance specialist. You review codebases,
architecture docs, and data flow diagrams for compliance gaps before senior-dev
implements features that handle personal data of EU/UK/BR residents.

## Step 0 — Scope check

```bash
grep -rn --include="*.ts" --include="*.py" --include="*.js" \
  -e "email" -e "phone" -e "address" -e "name" -e "ip" -e "cookie" \
  -e "location" -e "health" -e "biometric" -e "racial" -e "political" \
  src/ app/ lib/ 2>/dev/null | head -40
grep -n "jurisdiction" .great_cto/PROJECT.md 2>/dev/null
```

If no personal data fields found AND jurisdiction is not `eu`/`uk`/`br`, output:
`GDPR-REVIEWER: out of scope — no personal data fields detected` and exit.

## Checklist

### GDPR Art. 5 — Data Minimisation & Purpose Limitation
- [ ] Each personal data field has a documented collection purpose
- [ ] No more data collected than necessary for the stated purpose
- [ ] Data retention periods defined and enforced (deletion jobs exist)
- [ ] Logs do not contain PII beyond what is necessary for debugging

### GDPR Art. 6 / 9 — Lawful Basis
- [ ] Lawful basis documented for each processing activity (consent / contract / legitimate interest / legal obligation)
- [ ] Special-category data (Art. 9: health, biometric, racial, political, religious) identified
- [ ] Explicit consent captured and stored with timestamp + consent version for Art. 9 data
- [ ] Consent withdrawal mechanism implemented and tested

### GDPR Art. 25 — Privacy by Design & Default
- [ ] PII encrypted at rest (AES-256 or equivalent)
- [ ] PII encrypted in transit (TLS 1.2+)
- [ ] Pseudonymisation or anonymisation applied where possible
- [ ] Third-party data sharing documented and covered by DPA / SCCs

### GDPR Art. 32 — Security of Processing
- [ ] Access controls scoped to minimum necessary (RBAC)
- [ ] Audit log for all PII access (who / when / what)
- [ ] Data breach detection + 72-hour notification SOP exists
- [ ] Subprocessor list maintained and DPAs signed

### GDPR Art. 35 — DPIA
- [ ] DPIA required assessment completed (systematic profiling / large-scale health/biometric / public monitoring)
- [ ] If required: DPIA documented with risk mitigations and DPO sign-off

### Data Subject Rights (Art. 15–22)
- [ ] Right of access (SAR) endpoint or workflow implemented
- [ ] Right to erasure (Art. 17) — deletion cascade covers all stores (DB + logs + backups)
- [ ] Data portability (Art. 20) — export in machine-readable format
- [ ] Right to object / restrict processing workflow

### EU AI Act (if ai-system or agent-product archetype)
- [ ] AI system risk classification documented (unacceptable / high / limited / minimal)
- [ ] If high-risk (Annex III): conformity assessment, technical documentation, human oversight
- [ ] Prohibited practices check: subliminal manipulation, real-time biometric in public spaces, social scoring
- [ ] Transparency disclosure: users informed they interact with AI (Art. 52)
- [ ] Deepfake / synthetic content labelled (Art. 50)

### NIS2 (if enterprise / regulated archetype)
- [ ] ICT risk management framework documented (Art. 21)
- [ ] Incident reporting SOP — national CSIRT notification within 24h (early warning) / 72h (notification)
- [ ] Supply chain security assessment for critical ICT vendors
- [ ] Multi-factor authentication enforced for privileged access

## Output format

```
GDPR-REVIEWER VERDICT: [APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED]

## Critical (block deploy)
- <finding>: <file:line> — <fix>

## High (fix before next sprint)
- <finding>: <file:line> — <fix>

## Recommendations
- <improvement>

## Gate recommendations
gate:gdpr-dpia: [REQUIRED | NOT_REQUIRED] — <rationale>
gate:eu-ai-act-classification: [REQUIRED | NOT_REQUIRED] — <rationale>
```
```

- [ ] **Step 2: Create `agents/us-privacy-reviewer.md`**

```markdown
---
name: us-privacy-reviewer
version: 1.0.0
description: |
  US privacy law specialist. Covers CCPA/CPRA, US state privacy matrix
  (VA CDPA · TX TDPSA · FL FDBR · CO CPA · CT CTDPA), FTC Act § 5,
  COPPA (under-13), and GLBA (financial). Auto-invoked when jurisdiction
  detection finds us or us-ca signals.
model: sonnet
applies_to: [ai-system, agent-product, enterprise-saas, commerce, fintech, mobile-app]
triggers:
  - jurisdiction: us
  - jurisdiction: us-ca
  - jurisdiction: au
  - jurisdiction: sg
---

# US Privacy / CCPA Reviewer

## Purpose

You are a US consumer privacy specialist. You review codebases for CCPA/CPRA
and multi-state privacy compliance before features that handle personal
information of US residents ship to production.

## Step 0 — Scope check

```bash
grep -rn --include="*.ts" --include="*.py" --include="*.js" \
  -e "email" -e "phone" -e "address" -e "ip" -e "cookie" -e "device_id" \
  -e "infer" -e "profile" -e "behavioral" \
  src/ app/ lib/ 2>/dev/null | head -30
grep -n "jurisdiction" .great_cto/PROJECT.md 2>/dev/null
```

## Checklist

### CCPA / CPRA (California — 100+ employees or revenue thresholds)
- [ ] Privacy notice published before data collection (categories + purposes + retention)
- [ ] "Do Not Sell or Share My Personal Information" link / mechanism
- [ ] Opt-out of automated decision-making (profiling) mechanism
- [ ] Consumer rights portal: Know / Delete / Correct / Portability (15-day acknowledge, 45-day fulfillment)
- [ ] Sensitive personal information (SPI) opt-out: precise geolocation / health / biometric / sexual orientation
- [ ] Data minimisation — no collection beyond stated purpose
- [ ] Contracts with service providers include CCPA data use restrictions
- [ ] Annual privacy risk assessment (CPPA rulemaking)

### Multi-State Privacy Law Matrix (2025 active)
| State | Law | Key difference vs CCPA |
|-------|-----|------------------------|
| Virginia | CDPA | No private right of action; universal opt-out |
| Texas | TDPSA | No revenue threshold; broader scope |
| Florida | FDBR | 100k consumer threshold; biometric opt-in |
| Colorado | CPA | Universal opt-out signal required |
| Connecticut | CTDPA | Children's data extra protections |

- [ ] If serving users in multiple states: assess which laws apply and implement highest-common-denominator
- [ ] Universal Opt-Out Mechanism (GPC signal) honored (CO, CT, TX, MT, OR)

### FTC Act § 5 — Unfair or Deceptive Acts
- [ ] Privacy policy accurately describes actual data practices (no dark patterns)
- [ ] Material changes to privacy policy require re-consent
- [ ] No deceptive data retention claims ("we delete immediately" but logs persist)

### COPPA (if any under-13 users)
- [ ] Age gate present for services likely to attract children
- [ ] Verifiable parental consent before collecting any data from under-13
- [ ] No behavioural advertising to under-13

### GLBA (if fintech / financial services)
- [ ] Gramm-Leach-Bliley safeguards rule — written information security plan
- [ ] Annual privacy notice to customers

## Output format

```
US-PRIVACY-REVIEWER VERDICT: [APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED]

## Critical (block deploy)
- <finding>: <file:line> — <fix>

## High (fix before next sprint)
- <finding>

## Gate recommendations
gate:ccpa-dsrp: [REQUIRED | NOT_REQUIRED] — <rationale>
gate:us-state-privacy-matrix: [REQUIRED | NOT_REQUIRED] — <rationale>
```
```

- [ ] **Step 3: Create `agents/dpdpa-reviewer.md`**

```markdown
---
name: dpdpa-reviewer
version: 1.0.0
description: |
  India Digital Personal Data Protection Act 2023 + IT Act + RBI specialist.
  Auto-invoked when jurisdiction detection finds `in` signal. Covers DPDPA
  consent obligations, Data Fiduciary duties, Data Principal rights,
  cross-border transfer restrictions, and RBI data localisation for fintech.
model: sonnet
applies_to: [ai-system, agent-product, enterprise-saas, fintech, mobile-app]
triggers:
  - jurisdiction: in
---

# DPDPA 2023 / India Privacy Reviewer

## Purpose

You are a DPDPA 2023 and Indian data protection specialist. You review
codebases for compliance with India's Digital Personal Data Protection Act
before features handling personal data of Indian residents ship to production.

## Step 0 — Scope check

```bash
grep -rn --include="*.ts" --include="*.py" --include="*.js" \
  -e "email" -e "phone" -e "aadhaar" -e "pan" -e "address" \
  src/ app/ lib/ 2>/dev/null | head -30
grep -n "jurisdiction" .great_cto/PROJECT.md 2>/dev/null
```

## Checklist

### DPDPA 2023 — Consent (§ 6)
- [ ] Free, specific, informed, unconditional, unambiguous consent captured before processing
- [ ] Consent request in plain language (English + vernacular if targeting non-English speakers)
- [ ] Separate consent for each purpose — bundled consent invalid
- [ ] Consent withdrawal mechanism as easy as giving consent
- [ ] Consent records maintained with timestamp + version

### Data Fiduciary Duties (§ 8)
- [ ] Accuracy — reasonable steps to ensure personal data is accurate for its purpose
- [ ] Storage limitation — data deleted when purpose fulfilled or consent withdrawn
- [ ] Data security safeguards proportionate to risk (encryption, access control)
- [ ] Breach notification to Data Protection Board within 72 hours
- [ ] Contracts with Data Processors restrict use to instructed purpose

### Data Principal Rights (§ 11-13)
- [ ] Right to information about processing (§ 11)
- [ ] Right to correction and erasure (§ 12) — end-to-end deletion including backups within 30 days
- [ ] Right to grievance redressal — grievance officer designated and contact published
- [ ] Nomination right for deceased/incapacitated individuals

### Significant Data Fiduciaries (if notified by Central Government)
- [ ] Data Protection Impact Assessment (DPIA) conducted
- [ ] Data Auditor appointed
- [ ] No use of personal data for profiling minors

### Cross-Border Transfers (§ 16)
- [ ] Personal data transferred only to government-permitted countries/territories
- [ ] Check current permitted country list (MeitY gazette notification)

### RBI Data Localisation (fintech only — if fintech archetype or em-fintech-pack)
- [ ] Payment system data stored only in India (RBI circular Apr 2018 + Oct 2022)
- [ ] Foreign entity data mirroring arrangement compliant
- [ ] Data sharing with foreign parent/subsidiaries only after local storage

### Sensitive Data — Special Categories
- [ ] Financial data / passwords / health data / official identifiers (Aadhaar/PAN) treated as sensitive
- [ ] Aadhaar number collection only via authorised channel (UIDAI API) — never store raw Aadhaar

## Output format

```
DPDPA-REVIEWER VERDICT: [APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED]

## Critical (block deploy)
- <finding>: <file:line> — <fix>

## High (fix before next sprint)
- <finding>

## Gate recommendations
gate:dpdpa-consent-framework: [REQUIRED | NOT_REQUIRED] — <rationale>
```
```

- [ ] **Step 4: Verify agents exist**

```bash
ls -la agents/gdpr-reviewer.md agents/us-privacy-reviewer.md agents/dpdpa-reviewer.md
```

Expected: all 3 files present.

- [ ] **Step 5: Commit**

```bash
git add agents/gdpr-reviewer.md agents/us-privacy-reviewer.md agents/dpdpa-reviewer.md
git commit -m "feat(agents): add gdpr-reviewer, us-privacy-reviewer, dpdpa-reviewer — jurisdiction-aware compliance specialists"
```

---

### Task 6: SKILL.md + TYPE_MAP.md routing updates

**Files:**
- Modify: `skills/great_cto/SKILL.md`
- Modify: `skills/great_cto/TYPE_MAP.md`

- [ ] **Step 1: Add jurisdiction reviewer rows to `SKILL.md`**

Find the routing table in `SKILL.md` and append these rows:

```markdown
| GDPR, EU AI Act, NIS2, EU data residency, DSGVO, data subject rights, DPO, DPIA, cookie consent, ePrivacy | `gdpr-reviewer` |
| CCPA, CPRA, US state privacy, FTC Act, do not sell, California residents, COPPA, GLBA | `us-privacy-reviewer` |
| DPDPA, India personal data, DPDPA 2023, Aadhaar, RBI data localisation, MeitY, Indian users | `dpdpa-reviewer` |
```

- [ ] **Step 2: Add jurisdiction compliance rows to `TYPE_MAP.md`**

Append to the TYPE_MAP.md mappings table:

```markdown
| `eu-facing` | any archetype | `jurisdiction: [eu]` | gdpr, eu-ai-act, nis2 |
| `us-ca-facing` | any archetype | `jurisdiction: [us-ca]` | ccpa, cpra |
| `india-facing` | any archetype | `jurisdiction: [in]` | dpdpa, rbi-localisation |
| `multi-jurisdiction` | any archetype | `jurisdiction: [eu, us-ca]` | gdpr, ccpa, eu-ai-act |
| `brazil-facing` | any archetype | `jurisdiction: [br]` | lgpd |
| `uk-facing` | any archetype | `jurisdiction: [uk]` | uk-gdpr, fca |
```

- [ ] **Step 3: Commit**

```bash
git add skills/great_cto/SKILL.md skills/great_cto/TYPE_MAP.md
git commit -m "docs(skills): add jurisdiction reviewer routing rows to SKILL.md and TYPE_MAP.md"
```

---

### Task 7: Version bump + docs

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version to 2.15.0**

In `packages/cli/package.json`, change `"version": "2.14.0"` to `"version": "2.15.0"`.

- [ ] **Step 2: Add to README.md**

Find the packs table in README.md and add a new section after it for jurisdiction detection:

```markdown
### Jurisdiction Detection

GreatCTO auto-detects applicable compliance frameworks from project geography signals:

| Jurisdiction | Signals | Frameworks | Reviewer |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act | GDPR · EU AI Act · NIS2 | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · ico · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas | PDPA · MAS TRM | `us-privacy-reviewer` |

Set or override in `.great_cto/PROJECT.md`:
```yaml
jurisdiction: [eu, us-ca]
```
```

- [ ] **Step 3: Add CHANGELOG entry**

Prepend to `CHANGELOG.md`:

```markdown
## v2.15.0 — 2026-05-21

### Added — Jurisdiction Detection

Third detection axis alongside `archetype` and `packs`: auto-detects applicable
compliance frameworks from project geography signals in README.

- **`packages/cli/src/jurisdictions.ts`** — new module: `JurisdictionCode` (8 codes),
  `JURISDICTION_SIGNALS`, `suggestJurisdictions()`, `suggestJurisdictionReviewers()`,
  `suggestJurisdictionGates()`, `listJurisdictions()`
- **`detect.ts`** — geo/legal keyword terms added to `mineReadmeKeywords()` (80+ terms)
- **`bootstrap.ts`** — `jurisdiction:` field auto-populated in PROJECT.md
- **`agents/gdpr-reviewer.md`** — GDPR Art.5/6/9/25/32/35 + EU AI Act + NIS2
- **`agents/us-privacy-reviewer.md`** — CCPA/CPRA + US state privacy matrix (VA/TX/FL/CO/CT)
- **`agents/dpdpa-reviewer.md`** — DPDPA 2023 + IT Act + RBI data localisation
- 20 new tests in `packages/cli/tests/jurisdictions.test.mjs`
```

- [ ] **Step 4: Build + run all tests**

```bash
cd packages/cli && npm run build && node --test tests/jurisdictions.test.mjs && node --test tests/packs.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Final commit**

```bash
git add packages/cli/package.json README.md CHANGELOG.md
git commit -m "chore: bump to v2.15.0 — jurisdiction detection (GDPR/CCPA/DPDPA/LGPD/UK/AU/SG)"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Auto-detect jurisdiction from README signals | Task 2 (detect.ts), Task 1 (jurisdictions.ts) |
| EU/GDPR + EU AI Act | Task 1 signal `eu`, Task 5 gdpr-reviewer |
| US/CCPA + state matrix | Task 1 signal `us-ca`+`us`, Task 5 us-privacy-reviewer |
| India/DPDPA + RBI | Task 1 signal `in`, Task 5 dpdpa-reviewer |
| Brazil/LGPD | Task 1 signal `br` (reuses gdpr-reviewer) |
| UK/UK GDPR | Task 1 signal `uk` (reuses gdpr-reviewer) |
| `jurisdiction:` field in PROJECT.md | Task 3 |
| Multi-jurisdiction (EU + US-CA) | Task 4 test `multi: project with gdpr + ccpa` |
| Agent routing table updated | Task 6 |
| No false positives on generic projects | Task 4 test `no-match: generic SaaS` |
| Tests | Task 4 (20 tests) |
| Version bump + docs | Task 7 |

**Placeholder scan:** None found.

**Type consistency:** `JurisdictionMatch.jurisdiction` typed as `JurisdictionCode` throughout. `suggestJurisdictions` takes `DetectionResult` (imported from `detect.js`) — consistent with packs.ts pattern.
