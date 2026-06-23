// Domain pack detection — overlay packs that ride on top of base archetypes.
// Wave 1-3 (2026-05): voice, clinical, hr-ai, api-platform, lending, clinical-trials,
// robotics, em-fintech, climate, drug-discovery.
// Wave 4 (2026-05): digital-health (wearable, mental-health, nutrition AI, physician HITL).
//
// A pack is a regulatory/domain overlay that triggers one or more specialist
// reviewers (agents/{name}-reviewer.md) when its signals appear in stack,
// dependencies, or README keywords. Detection is deliberately broad — the
// reviewer agents themselves do the final scope decision via their Step 0 grep.

import type { DetectionResult } from "./detect.js";

export type PackName =
  | "voice-pack"
  | "clinical-pack"
  | "hr-ai-pack"
  | "api-platform-pack"
  | "lending-pack"
  | "clinical-trials-pack"
  | "robotics-pack"
  | "em-fintech-pack"
  | "climate-pack"
  | "drug-discovery-pack"
  | "digital-health-pack"
  | "adtech-privacy-pack"
  | "us-ai-pack";

export interface PackMatch {
  pack: PackName;
  reviewers: string[];        // agent names invoked by this pack
  signals: string[];          // why it triggered (matched stack tokens / keywords)
  humanGates: string[];       // gate ids this pack introduces
}

// Reviewer registry — keep in sync with agents/*-reviewer.md and
// skills/great_cto/packs/*-pack.md.
const PACK_REVIEWERS: Record<PackName, string[]> = {
  "voice-pack":            ["voice-ai-reviewer"],
  "clinical-pack":         ["ai-clinical-reviewer", "fda-reviewer"],
  "hr-ai-pack":            ["hr-ai-reviewer"],
  "api-platform-pack":     ["api-platform-reviewer"],
  "lending-pack":          ["lending-credit-reviewer"],
  "clinical-trials-pack":  ["clinical-trials-reviewer", "bio-data-reviewer"],
  "robotics-pack":         ["robotics-safety-reviewer"],
  "em-fintech-pack":       ["emerging-markets-fintech-reviewer"],
  "climate-pack":          ["climate-mrv-reviewer", "biosecurity-reviewer"],
  "drug-discovery-pack":   ["drug-discovery-ml-reviewer", "glp-glab-reviewer", "lab-automation-reviewer"],
  "digital-health-pack":   ["digital-health-reviewer", "ai-clinical-reviewer", "healthcare-reviewer"],
  "adtech-privacy-pack":   ["adtech-privacy-reviewer", "us-privacy-reviewer"],
  "us-ai-pack":            ["us-ai-reviewer"],
};

const PACK_GATES: Record<PackName, string[]> = {
  "voice-pack":            ["gate:voice-compliance"],
  "clinical-pack":         ["gate:samd-class", "gate:clinical-validation", "gate:ide-approval"],
  "hr-ai-pack":            ["gate:aedt-audit"],
  "api-platform-pack":     ["gate:api-contract"],
  "lending-pack":          ["gate:fair-lending"],
  "clinical-trials-pack":  ["gate:irb-ready", "gate:part11-validation", "gate:deidentification"],
  "robotics-pack":         ["gate:hara-signoff", "gate:functional-safety-test"],
  "em-fintech-pack":       ["gate:license-strategy"],
  "climate-pack":          ["gate:mrv-methodology", "gate:durc-signoff", "gate:open-weights-release"],
  "drug-discovery-pack":   ["gate:model-card-signoff", "gate:csv-validation", "gate:iq-oq-pq"],
  "digital-health-pack":   ["gate:wellness-vs-samd", "gate:hitl-design", "gate:wearable-api-access", "gate:supplement-safety", "gate:mental-health-protocol"],
  "adtech-privacy-pack":   ["gate:tracking-consent"],
  "us-ai-pack":            ["gate:ai-governance"],
};

// Trigger signals — stack tokens OR README keywords.
const SIGNALS: Record<PackName, { stack: string[]; keywords: string[] }> = {
  "voice-pack": {
    stack: ["twilio", "vonage", "livekit", "deepgram", "elevenlabs", "whisper", "hume"],
    keywords: ["voice", "telephony", "ivr", "call-center", "tts", "stt", "speech-to-text", "text-to-speech", "phone", "outbound call", "inbound call", "voice agent"],
  },
  "clinical-pack": {
    stack: ["fhir", "hl7"],
    keywords: ["clinical", "patient", "ehr", "emr", "phi", "hipaa", "diagnos", "triage", "radiolog", "patholog", "samd", "scribe", "telehealth-ai", "medical record", "cds", "clinical decision support"],
  },
  "hr-ai-pack": {
    stack: ["greenhouse", "lever", "ashby", "workday"],
    // "candidate" alone is too generic (SaMD/predicate-candidate clash); use compound terms.
    keywords: ["recruit", "hiring", "candidate screening", "candidate evaluation", "candidate ranking", "resume", "ats", "talent acquisition", "performance review", "workforce scheduling", "employee evaluation", "aedt"],
  },
  "api-platform-pack": {
    stack: ["openapi", "graphql", "grpc", "fastify", "trpc"],
    keywords: ["public api", "partner api", "developer portal", "api key", "webhook", "sdk", "rest api", "graphql api", "openapi"],
  },
  "lending-pack": {
    stack: ["plaid"],
    // "ecoa" removed: collides with clinical "eCOA" (Electronic Clinical Outcome Assessment).
    // Lending-specific signals (loan, fcra, nmls, underwrit, fico, ...) are unambiguous.
    keywords: ["loan", "lending", "credit decision", "underwrit", "bnpl", "buy now pay later", "buy-now-pay-later", "payroll advance", "ewa", "line of credit", "fico", "credit score", "fcra", "nmls", "financing", "adverse action"],
  },
  "clinical-trials-pack": {
    stack: ["fhir", "hl7", "dicom", "redcap"],
    // "ecoa" removed: ambiguous with lending ECOA (Reg B). Other clinical-trial
    // signals (ctms, edc, epro, econsent, cdisc, irb, ...) are unambiguous.
    keywords: ["clinical trial", "ctms", "edc", "epro", "econsent", "esource", "randomization", "rtsm", "irt", "decentralized trial", "ind submission", "21 cfr 11", "cdisc", "sdtm", "adam", "irb"],
  },
  "robotics-pack": {
    stack: ["ros", "ros2", "moveit", "gazebo", "px4"],
    keywords: ["robot", "cobot", "manipulator", "end-effector", "amr", "agv", "autonomous mobile", "surgical robot", "ros 2", "drone", "uav"],
  },
  "em-fintech-pack": {
    stack: [],
    keywords: ["india", "nigeria", "brazil", "indonesia", "philippines", "mexico", "kenya", "m-pesa", "mpesa", "upi", "pix", "gcash", "ovo", "dana", "rbi", "cbn", "bsp", "ojk", "mas", "bcb", "condusef", "cross-border", "remittance", "local rails"],
  },
  "climate-pack": {
    stack: [],
    keywords: ["carbon", "emission", "ghg", "mrv", "scope 1", "scope 2", "scope 3", "verra", "gold standard", "puro", "sbti", "cdp", "csrd", "cbam", "ghgrp", "offset", "credit retir", "removal", "biogenic",
              // biosec triggers
              "dna synthesis", "gene synthesis", "oligonucleotide", "protein design", "esm", "alphafold", "rfdiffusion", "pathogen", "select agent", "gain-of-function", "dual-use", "bsl-3", "bsl-4", "biocontainment", "bwc", "p3co", "igsc", "cloud lab"],
  },
  "drug-discovery-pack": {
    stack: ["rdkit"],
    keywords: ["drug discovery", "binding affinity", "admet", "toxicity prediction", "generative chem", "generative protein", "antibody design", "mrna design", "virtual screening", "docking", "fep", "alphafold", "rfdiffusion", "chembl", "bindingdb", "pdbbind",
              // GLP / lab-automation triggers
              "glp", "gmp", "gxp", "preclinical", "lims", "eln", "annex 11", "alcoa",
              "lab automation", "cloud lab", "robotic biology", "liquid handler", "hamilton", "tecan", "beckman", "opentrons", "plate reader", "sequencer", "hplc", "mass spec", "sila"],
  },
  "digital-health-pack": {
    stack: ["healthkit", "health-connect", "garmin-connect-iq", "samsung-health", "fitbit", "polar", "withings", "oura", "whoop"],
    keywords: [
      // wearable / biometric
      "wearable", "apple watch", "apple health", "healthkit", "health connect", "garmin", "samsung health",
      "google fit", "fitbit", "heart rate", "hrv", "heart rate variability", "spo2", "sleep tracking",
      "sleep stages", "biometric sensor", "stress score", "activity tracking", "ecg wearable",
      // mental health / wellness AI
      "mental health", "mental wellness", "wellbeing", "mindfulness ai", "stress detection",
      "burnout detection", "mood tracking", "anxiety ai", "depression ai", "phq-9", "gad-7",
      "digital therapeutics", "dtx", "cbt app", "dbt app", "therapy ai",
      // fitness / nutrition AI
      "personalised training", "personalized training", "fitness ai", "nutrition ai",
      "supplement recommendation", "supplement ai", "diet ai", "meal plan ai", "macro ai",
      // HITL clinical
      "physician review", "physician hitl", "doctor in the loop", "clinical review workflow",
      "remote patient monitoring", "rpm", "teleconsultation",
    ],
  },
  "adtech-privacy-pack": {
    stack: ["fbevents", "facebook-pixel", "meta-pixel", "gtag", "ga4", "google-tag-manager", "gtm", "tiktok-pixel", "fullstory", "hotjar", "logrocket", "mouseflow", "smartlook"],
    keywords: [
      "meta pixel", "facebook pixel", "fbevents", "conversions api", "capi",
      "google analytics", "ga4", "google tag manager", "tiktok pixel", "ad pixel",
      "tracking pixel", "session replay", "session recording", "heatmap",
      "fullstory", "hotjar", "logrocket", "retargeting", "behavioral advertising",
      "vppa", "cipa", "wiretap", "my health my data", "mhmda", "consumer health data",
    ],
  },
  "us-ai-pack": {
    stack: [],
    keywords: [
      "nist ai rmf", "ai rmf", "ai risk management", "colorado ai act", "sb 205",
      "algorithmic discrimination", "consequential decision", "high-risk ai",
      "automated decision", "ai impact assessment", "utah ai", "traiga",
      "ai transparency", "ab 2013", "sb 942", "training data transparency",
      "ai disclosure", "generative ai disclosure", "deepfake disclosure", "ai governance",
    ],
  },
};

/** Return packs whose signals match the detection result. Deterministic + sorted. */
export function suggestPacks(d: DetectionResult): PackMatch[] {
  const matches: PackMatch[] = [];
  const stackLower = new Set(d.stack.map((s) => s.toLowerCase()));
  const kwLower = d.readmeKeywords.map((k) => k.toLowerCase());

  for (const pack of Object.keys(SIGNALS) as PackName[]) {
    const { stack, keywords } = SIGNALS[pack];
    const matchedStack = stack.filter((s) => stackLower.has(s.toLowerCase()));
    // Exact-match on README-mined raw tokens. detect.ts emits the same vocabulary,
    // so kwLower.includes(kw) avoids false-positive substring fuzz
    // (e.g. "lending" matching pack trigger "ind").
    const matchedKeywords = keywords.filter((kw) => kwLower.includes(kw));
    const signals = [...matchedStack, ...matchedKeywords];
    if (signals.length > 0) {
      matches.push({
        pack,
        reviewers: PACK_REVIEWERS[pack],
        signals: signals.slice(0, 8), // cap for log readability
        humanGates: PACK_GATES[pack],
      });
    }
  }
  matches.sort((a, b) => a.pack.localeCompare(b.pack));
  return matches;
}

/** Convenience — flatten matched packs to reviewer agent names (unique, sorted). */
export function suggestPackReviewers(d: DetectionResult): string[] {
  const all = new Set<string>();
  for (const m of suggestPacks(d)) for (const r of m.reviewers) all.add(r);
  return Array.from(all).sort();
}

/** Convenience — flatten matched packs to human-gate ids (unique, sorted). */
export function suggestPackGates(d: DetectionResult): string[] {
  const all = new Set<string>();
  for (const m of suggestPacks(d)) for (const g of m.humanGates) all.add(g);
  return Array.from(all).sort();
}

/** Registry of all known packs — useful for /doctor / introspection. */
export function listPacks(): PackName[] {
  return Object.keys(SIGNALS).sort() as PackName[];
}
