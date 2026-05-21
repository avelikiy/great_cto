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
      "american users", "coppa", "hipaa",
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
