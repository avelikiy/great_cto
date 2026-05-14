#!/usr/bin/env node
/**
 * Generator for /pack/<pack>.html landing pages.
 * Run: node site/pack/_generate.mjs
 *
 * Each pack overlay (voice-pack, clinical-pack, ...) gets a dedicated page with:
 *   - Hero + signals that auto-attach
 *   - Pipeline diagram (Mermaid pre-rendered to SVG inline)
 *   - Reviewer agents involved
 *   - Human gates introduced
 *   - Required artefacts
 *   - EVAL suite
 *   - Companies operating in this space (from companies.json)
 *   - SEO: schema.org TechArticle + Breadcrumb + canonical + OG + JSON-LD
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_VER = '2026050414';

const companiesData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'companies.json'), 'utf-8'));
const allCompanies = companiesData.companies;

const STAGE_RANK = { 'public': 0, 'subsidiary': 1, 'growth': 2, 'series-e': 3, 'series-f': 3, 'series-d': 4, 'series-c': 5, 'series-b': 6, 'series-a': 7, 'seed': 8, 'open-source': 9, 'acquired': 10, 'private': 11 };
function companiesForPack(packName) {
  const list = Object.entries(allCompanies)
    .filter(([_id, c]) => (c.packs || []).includes(packName))
    .map(([id, c]) => ({ id, ...c }));
  list.sort((a, b) => {
    const sa = STAGE_RANK[a.stage] ?? 99;
    const sb = STAGE_RANK[b.stage] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
  return list.slice(0, 30);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}
function logoTag(c) {
  const d = domainOf(c.url);
  if (!d) return '';
  return `<img class="co-logo" src="https://logo.clearbit.com/${d}?size=64" alt="" loading="lazy" onerror="this.style.display='none'" />`;
}

const packs = [
  {
    slug: 'voice-pack',
    icon: '🎙',
    name: 'Voice AI Pack',
    title: 'Build voice agents <em>without</em> TCPA + state-recording-consent landmines.',
    sub: 'Using <b>Twilio</b>, <b>Vonage</b>, <b>LiveKit</b>, <b>Deepgram</b>, or <b>ElevenLabs</b>? GreatCTO auto-attaches <b>voice-pack</b> on top of your base archetype and ships <b>TCPA prior-express-consent</b>, <b>STIR/SHAKEN attestation</b>, <b>state recording-consent geo-routing</b>, <b>EU AI Act Art. 50</b> synth-voice disclosure, and <b>PII redaction</b> gates from day one.',
    signals: 'twilio · vonage · livekit · deepgram · elevenlabs · hume · ivr · tts · stt',
    reviewers: [
      ['voice-ai-reviewer', 'TCPA + STIR/SHAKEN + state-recording + EU AI Act Art. 50 + deepfake laws (CA AB-2655, TN ELVIS)'],
    ],
    gates: [
      ['gate:voice-compliance', 'regulatory lead', 'after TM, before senior-dev'],
    ],
    artefacts: [
      'TCPA PEWC consent schema (4-yr retention, hash of disclosure text)',
      'State-recording-consent geo-router with fail-safe to two-party',
      'AI disclosure in first 5s of synth-voice call',
      'PII redaction layer between STT and LLM',
      'Destructive-action confirmation for voice-triggered tool calls',
      'STIR/SHAKEN attestation level documented',
      'DNC scrub (federal + state + internal, ≤31 days fresh)',
    ],
    evals: [
      'EVAL-voice-pii-leakage',
      'EVAL-voice-call-handoff-safety',
      'EVAL-voice-synth-disclosure',
      'EVAL-voice-prompt-injection',
    ],
    laws: ['TCPA (47 USC § 227)', 'FCC AI Voice Rule (2024)', 'STIR/SHAKEN', '12 state two-party recording laws', 'EU AI Act Art. 50', 'CA AB 2655', 'TN ELVIS Act', 'CRTC CASL', 'Ofcom CLI', 'Illinois BIPA voice'],
  },
  {
    slug: 'clinical-pack',
    icon: '🏥',
    name: 'Clinical AI Pack',
    title: 'Ship clinical AI <em>before</em> FDA SaMD enforcement ships you.',
    sub: 'Building clinical decision support, an AI scribe, a diagnostic, or anything touching PHI? GreatCTO auto-attaches <b>clinical-pack</b> with <b>FDA GMLP-10</b> + <b>PCCP</b> + <b>SaMD classification</b> (510(k) / De Novo / PMA) + <b>EU AI Act Annex III medical</b> + <b>citation-grounding</b> + <b>subgroup fairness</b> gates.',
    signals: 'fhir · hl7 · EHR/EMR · PHI · SaMD · CDS · scribe · radiology · pathology · telehealth-AI',
    reviewers: [
      ['ai-clinical-reviewer', 'FDA GMLP-10 + PCCP + EU AI Act high-risk + hallucination + subgroup fairness + adversarial symptom'],
      ['fda-reviewer', 'IMDRF SaMD Class I/II/III/IV + 510(k)/De Novo/PMA path + IEC 62304 + ISO 14971'],
    ],
    gates: [
      ['gate:samd-class', 'regulatory + clinical lead', 'after fda-reviewer classifies'],
      ['gate:clinical-validation', 'clinical lead', 'validation plan before patient data'],
      ['gate:ide-approval', 'regulatory + sponsor', 'only for PMA path'],
    ],
    artefacts: [
      'Intended-use statement (autonomous vs assistive) in model card',
      'Predicate analysis document (or De Novo rationale)',
      'IEC 62304 software safety class declaration (A/B/C)',
      'ISO 14971 initial risk file',
      'Citation-grounding layer (PubMed/drug-label/guideline IDs ≥ 95% resolvable)',
      'Refuse-to-diagnose guardrail + clinician-in-loop trigger',
      'Subgroup fairness audit (sex × age × race) max-min AUC ≥ 0.8',
      'Drift-monitoring dashboard with weekly canary',
    ],
    evals: [
      'EVAL-clinical-hallucination',
      'EVAL-clinical-citation-grounding',
      'EVAL-clinical-refuse-to-diagnose',
      'EVAL-clinical-subgroup-fairness',
      'EVAL-clinical-adversarial-symptom',
    ],
    laws: ['FDA GMLP (2021)', 'FDA PCCP final guidance (2024)', 'EU AI Act Annex III medical', 'IEC 62304', 'ISO 14971', 'IEC 81001-5-1', 'EU MDR 2017/745', 'EU IVDR 2017/746'],
  },
  {
    slug: 'hr-ai-pack',
    icon: '👥',
    name: 'HR-AI Pack',
    title: 'Build hiring AI <em>without</em> the NYC AEDT $1,500-per-day fine.',
    sub: 'Building resume screening, video-interview analysis, or workforce scheduling AI? GreatCTO auto-attaches <b>hr-ai-pack</b> with <b>NYC LL 144 AEDT bias audit</b> (4/5-rule intersectional), <b>EEOC AI guidance</b>, <b>Illinois AIVIA</b>, <b>Colorado SB 205</b>, <b>EU AI Act Annex III employment</b>, and <b>GDPR Art. 22</b> gates.',
    signals: 'recruit · hiring · candidate screening · resume · ATS · talent · performance review · workforce · AEDT',
    reviewers: [
      ['hr-ai-reviewer', 'NYC LL 144 AEDT (4/5-rule, intersectional) + EEOC + Illinois AIVIA + Colorado SB 205 + EU AI Act Annex III'],
    ],
    gates: [
      ['gate:aedt-audit', 'independent auditor', 'annual — NYC LL 144'],
    ],
    artefacts: [
      'AEDT scope assessment (NYC LL 144 in/out)',
      'Bias-audit pipeline (4/5-rule, sex × race intersectional, annual)',
      'Candidate 10-day pre-use notice template + delivery log',
      'Per-decision explainability record',
      'Disability-accommodation alternative path',
      'Resume PDF prompt-injection guardrail',
      'GDPR Art. 22 human-review request workflow',
      'Annual third-party auditor engagement',
    ],
    evals: [
      'EVAL-hr-bias-by-protected-class',
      'EVAL-hr-resume-injection',
      'EVAL-hr-opt-out-honored',
    ],
    laws: ['NYC Local Law 144 / RCNY 5-303', 'EEOC AI guidance (2023)', 'Illinois AIVIA (820 ILCS 42)', 'Colorado SB 205 (Feb 2026)', 'Maryland HB 1202', 'EU AI Act Annex III employment', 'GDPR Art. 22'],
  },
  {
    slug: 'api-platform-pack',
    icon: '🔌',
    name: 'API Platform Pack',
    title: 'Lock in your public API surface <em>before</em> v1 GA — breaking changes after cost $$$.',
    sub: 'Exposing a REST/GraphQL/gRPC API or webhooks as your product? GreatCTO auto-attaches <b>api-platform-pack</b> with <b>OAuth 2.1 + PKCE</b>, <b>webhook HMAC-SHA256 + replay protection</b>, <b>idempotency keys</b>, <b>RFC 8594 Sunset</b> deprecation, <b>cursor pagination</b>, and <b>OpenAPI spec linting</b> gates.',
    signals: 'openapi · graphql · grpc · webhook · fastify · trpc · developer portal · sdk',
    reviewers: [
      ['api-platform-reviewer', 'Rate-limit design + OAuth 2.1 + webhook signing + idempotency + Sunset + pagination + Problem Details'],
    ],
    gates: [
      ['gate:api-contract', 'architect + DX-lead', 'before v1 GA — sign-off on public surface'],
    ],
    artefacts: [
      'Versioning strategy decided + documented (URL / header / date)',
      'Rate-limit tier matrix + per-resource quotas',
      'OAuth 2.1 + PKCE for public clients',
      'Idempotency-Key support on all mutating endpoints',
      'Webhook HMAC-SHA256 + timestamp + 5-min skew + retry policy',
      'Sunset header (RFC 8594) + ≥6-month deprecation policy',
      'OpenAPI/GraphQL spec linted in CI (Spectral / graphql-inspector)',
      'Cursor pagination (max page size, not offset)',
      'Problem Details (RFC 9457) error envelope',
    ],
    evals: [
      'EVAL-api-rate-limit-fairness',
      'EVAL-api-webhook-idempotency',
      'EVAL-api-oauth-scope-leak',
      'EVAL-api-deprecation-warn',
    ],
    laws: ['OAuth 2.1 (IETF draft)', 'RFC 8594 Sunset', 'RFC 9457 Problem Details', 'RFC 9239 RateLimit Fields', 'Stripe API versioning model'],
  },
  {
    slug: 'lending-pack',
    icon: '💰',
    name: 'Lending / Credit Pack',
    title: 'Underwrite credit <em>without</em> the ECOA class-action.',
    sub: 'Extending credit, BNPL, payroll advance, line of credit, or healthcare financing? GreatCTO auto-attaches <b>lending-pack</b> with <b>ECOA / Reg B</b> adverse-action (≤4 specific reasons, 30-day SLA), <b>FCRA</b> permissible purpose, <b>NMLS state licensing matrix</b>, <b>MLA</b> 36% MAPR cap, and <b>fair-lending disparate-impact analysis</b> via BISG.',
    signals: 'plaid · loan · lending · BNPL · payroll advance · FCRA · ECOA · NMLS · adverse action',
    reviewers: [
      ['lending-credit-reviewer', 'ECOA / Reg B + FCRA + NMLS state matrix + MLA + UDAAP + CFPB §1033 + BISG fair-lending'],
    ],
    gates: [
      ['gate:fair-lending', 'compliance + statistician', 'every credit-model release'],
    ],
    artefacts: [
      'Adverse-action engine (30-day SLA, ≤4 specific principal reasons)',
      'Permissible-purpose log on every CRA pull',
      'Fair-lending audit pipeline (4/5-rule via BISG, reject-inference)',
      'State licensing matrix + partner-bank model documented',
      'MLA DoD-database lookup gate',
      'TILA APR disclosure flow (offer + signature)',
      'Model card with feature × protected-attribute proxy analysis',
      'Fair-lending drift dashboard (≥5pp parity alert)',
    ],
    evals: [
      'EVAL-lending-credit-fairness',
      'EVAL-lending-adverse-action-completeness',
      'EVAL-lending-mla-scrub',
    ],
    laws: ['ECOA / Reg B (12 CFR 1002)', 'FCRA (15 USC §1681)', 'MLA (10 USC §987 / 32 CFR 232)', 'TILA / Reg Z', 'CFPB Circular 2023-03', 'CFPB §1033 final rule (2024)', 'BISG methodology'],
  },
  {
    slug: 'clinical-trials-pack',
    icon: '🧪',
    name: 'Clinical Trials Pack',
    title: 'Run decentralized trials <em>without</em> the 21 CFR Part 11 audit-trail nightmare.',
    sub: 'Building a CTMS, EDC, eCOA, ePRO, eConsent, or any clinical-trial platform? GreatCTO auto-attaches <b>clinical-trials-pack</b> (paired with <b>bio-data</b>) for <b>ICH-GCP E6(R3)</b>, <b>21 CFR Part 11</b> audit trail + e-signatures, <b>CDISC SDTM/ADaM</b>, <b>FHIR R5/HL7/OMOP/DICOM</b> conformance, <b>de-identification</b> (Safe Harbor or Expert Determination ≤ 0.04), and <b>AE/SAE 24h reporting</b>.',
    signals: 'clinical trial · CTMS · EDC · eCOA · ePRO · eConsent · IRB · CDISC · FHIR · HL7 · DICOM · OMOP · genomics',
    reviewers: [
      ['clinical-trials-reviewer', 'ICH-GCP E6(R3) + 21 CFR Part 11 + CDISC + IRB + AE/SAE + DCT'],
      ['bio-data-reviewer', 'FHIR R5 + HL7 + OMOP + DICOM + VCF/BAM/CRAM + Safe Harbor de-id + GA4GH DUO'],
    ],
    gates: [
      ['gate:irb-ready', 'clinical lead + regulatory', 'before IRB submission'],
      ['gate:part11-validation', 'independent QA lead', 'before production go-live'],
      ['gate:deidentification', 'statistical expert', 'if Expert Determination used'],
    ],
    artefacts: [
      'Append-only Part 11 audit trail (signed + exportable)',
      'E-signature manifestation (name + datetime + meaning)',
      'System validation plan (IQ/OQ/PQ) + change-control SOP',
      'Consent versioning schema + re-consent workflow',
      'AE/SAE auto-flag + 24h escalation to sponsor',
      'CDISC SDTM mapping documented per data domain',
      'FHIR / HL7 / DICOM / OMOP profile pinning',
      'SMART-on-FHIR scope enforcement at API layer',
      'De-id method + risk bound ≤ 0.04',
      'DICOM burned-in PHI detector',
    ],
    evals: [
      'EVAL-trial-audit-trail-immutability',
      'EVAL-trial-consent-versioning',
      'EVAL-trial-ae-reporting-latency',
      'EVAL-trial-cdisc-export-conformance',
      'EVAL-biodata-deid-reidentification-risk',
      'EVAL-biodata-dicom-phi-burn',
    ],
    laws: ['ICH-GCP E6(R3)', '21 CFR Part 11', 'EU GMP Annex 11', 'CDISC SDTM-IG + ADaM-IG', 'FDA DCT guidance (2024)', 'HIPAA Privacy Rule 164.514', 'GA4GH DUO'],
  },
  {
    slug: 'robotics-pack',
    icon: '🤖',
    name: 'Robotics Safety Pack',
    title: 'Ship cobots and surgical robots <em>without</em> the ISO/TS 15066 force-limit lawsuit.',
    sub: 'Controlling physical actuators? GreatCTO auto-attaches <b>robotics-pack</b> with <b>ISO 10218-1/-2</b> + <b>ISO/TS 15066</b> cobot force/pressure limits (per body region) + <b>ISO 13482</b> + <b>IEC 61508</b> SIL declaration + <b>SROS2</b> (ROS 2 production must NOT be INSECURE) + <b>HARA</b> hazard analysis + <b>sim-to-real</b> validation gates. Surgical robots auto-trigger <b>fda-reviewer</b> handoff (PMA path).',
    signals: 'ros 2 · moveit · cobot · manipulator · AMR · AGV · surgical robot · drone',
    reviewers: [
      ['robotics-safety-reviewer', 'ISO 10218 + ISO/TS 15066 cobot limits + ISO 13482 + IEC 61508 SIL + SROS2 + HARA + sim-to-real'],
    ],
    gates: [
      ['gate:hara-signoff', 'licensed safety engineer', 'every release affecting hazard surface'],
      ['gate:functional-safety-test', 'QA-lead', 'surgical / autonomous / high-risk'],
    ],
    artefacts: [
      'HARA (Hazard Analysis and Risk Assessment) signed',
      'SIL/PL declaration per hazardous function + diagnostic coverage',
      'E-stop independent path (latency ≤ 200ms, periodic self-test)',
      'Cobot force-limit verification report (ISO/TS 15066 per body region)',
      'SROS2 keystore + permissions enforced (no INSECURE deploy)',
      'Sim-to-real validation report + failure-mode catalog',
      'OOD detector + action bounding on ML controller outputs',
      'Watchdog with fail-safe on inference timeout',
      'OTA update signed + secure-boot chain',
    ],
    evals: [
      'EVAL-robot-policy-safety',
      'EVAL-robot-e-stop-latency',
      'EVAL-robot-watchdog-failsafe',
    ],
    laws: ['ISO 10218-1/-2', 'ISO/TS 15066', 'ISO 13482', 'IEC 61508', 'ISO 13849', 'ISO 26262 (auto)', 'FDA 21 CFR 880 (surgical)', 'IEC 60601-2-77'],
  },
  {
    slug: 'em-fintech-pack',
    icon: '🌏',
    name: 'Emerging-Markets Fintech Pack',
    title: 'Launch fintech in 8 jurisdictions <em>without</em> the DPDP / NDPR / Decree-53 surprise.',
    sub: 'Serving India, Nigeria, Brazil, Mexico, Indonesia, Philippines, Vietnam, or Singapore? GreatCTO auto-attaches <b>em-fintech-pack</b> with per-country regulator (RBI / CBN / BCB / CNBV / OJK / BSP / SBV / MAS), local rails (UPI / PIX / M-Pesa / GCash / OVO / DANA), <b>data-localization matrix</b>, and <b>OFAC + EU + UN + local sanctions</b> screening (daily refresh) + PEP overlay.',
    signals: 'india · nigeria · brazil · indonesia · philippines · mexico · razorpay · paystack · upi · pix · m-pesa · gcash · rbi · cbn · mas',
    reviewers: [
      ['emerging-markets-fintech-reviewer', 'India DPDP/RBI + Nigeria CBN/NDPR + Brazil BCB/LGPD + MAS + OJK + BSP + local rails + sanctions'],
    ],
    gates: [
      ['gate:license-strategy', 'legal + compliance', 'per jurisdiction served'],
    ],
    artefacts: [
      'Per-country jurisdiction matrix (regulators, licenses, ID systems, FX)',
      'Data-localization map (data class × country × storage × egress)',
      'Local-rails adapter interface + per-rail implementations',
      'Sanctions screening (OFAC + EU + UN + UK + local) with daily refresh',
      'PEP overlay screening with EDD trigger',
      'KYC tiering with local ID systems (Aadhaar / CPF / NIN / BVN / KTP / NRIC)',
      'Cross-border transfer mechanism per country-pair',
      'Local-language disclosures in regulated jurisdictions',
      'Local-tax reporting triggers',
    ],
    evals: [
      'EVAL-emfin-data-residency',
      'EVAL-emfin-sanctions-coverage',
      'EVAL-emfin-local-rail-idempotency',
    ],
    laws: ['India DPDP Act 2023', 'RBI tokenization', 'Nigeria NDPR/NDPA 2023', 'Brazil LGPD', 'Mexico Ley Fintech 2018', 'Indonesia UU PDP 2022', 'Vietnam Decree 53/2022', 'Singapore PSA + PDPA', 'FATF Travel Rule'],
  },
  {
    slug: 'climate-pack',
    icon: '🌱',
    name: 'Climate / Biosecurity Pack',
    title: 'Issue carbon credits <em>without</em> the double-counting scandal.',
    sub: 'Computing GHG inventories, issuing/trading carbon credits, or operating synbio? GreatCTO auto-attaches <b>climate-pack</b> (paired with <b>biosecurity</b>) with <b>GHG Protocol Scope 1-3</b>, <b>Verra VCS / Gold Standard / Puro.earth</b> methodology, <b>SBTi</b>, <b>CDP / CSRD / SEC climate</b>, <b>EU CBAM</b>, and for synbio: <b>NIH DURC/PEPP</b> classification + <b>IGSC sequence screening</b> + <b>AI bio-uplift evals</b>.',
    signals: 'carbon · GHG · MRV · Scope 1-3 · Verra · CBAM · CSRD + synbio: gene synthesis · AlphaFold · IGSC · DURC',
    reviewers: [
      ['climate-mrv-reviewer', 'GHG Protocol + ISO 14064 + Verra VCS + Gold Standard + Puro + SBTi + CDP + CSRD + CBAM'],
      ['biosecurity-reviewer', 'NIH 2024 DURC/PEPP + IGSC HSP v2 + Australia Group + BWC + AI bio-uplift + EO 14110'],
    ],
    gates: [
      ['gate:mrv-methodology', 'climate-lead + verifier', 'methodology choice (cannot change retroactively)'],
      ['gate:durc-signoff', 'IRE + biosec expert', 'DURC / PEPP applicable'],
      ['gate:open-weights-release', 'responsible-scaling board', 'generative bio-model release'],
    ],
    artefacts: [
      'Methodology version pinning per project + boundary documented',
      'Activity-data lineage with tamper-evident hash chain',
      'Double-counting prevention via retirement state machine',
      'Re-statement policy + audit retention ≥ 10 years',
      'Emission-factor library versioned + update cadence',
      'IGSC sequence screening pipeline (monthly DB refresh)',
      'Capability evals (LAB-Bench, WMDP-Bio) in model card',
      'Tool-use guardrails (no autonomous sequence ordering)',
      'Open-weights release decision per responsible-scaling framework',
    ],
    evals: [
      'EVAL-climate-double-counting',
      'EVAL-biosec-dna-screen-coverage',
      'EVAL-biosec-bio-uplift-resistance',
    ],
    laws: ['GHG Protocol Corp + Scope 3', 'ISO 14064', 'Verra VCS', 'Gold Standard', 'Puro.earth', 'SBTi', 'CDP', 'EU CSRD / ESRS', 'EU CBAM', 'EPA GHGRP', 'NIH 2024 DURC + PEPP policy', 'P3CO Framework', 'IGSC HSP v2', 'EO 14110'],
  },
  {
    slug: 'drug-discovery-pack',
    icon: '🧬',
    name: 'Drug Discovery Pack',
    title: 'Drive wet-lab synthesis <em>without</em> the Tanimoto-leakage scandal.',
    sub: 'Predicting binding affinity / ADMET / toxicity? Generating molecules? Running GLP studies? Orchestrating instruments via SiLA2? GreatCTO auto-attaches <b>drug-discovery-pack</b> (trio: drug-discovery-ml + GLP + lab-automation) with <b>scaffold/time/cluster split</b>, <b>applicability-domain</b>, <b>uncertainty calibration</b>, <b>ALCOA+</b> data integrity, <b>CSA validation</b>, and <b>IQ/OQ/PQ</b> qualification.',
    signals: 'rdkit · chembl · bindingdb · pdbbind · alphafold · rfdiffusion · LIMS · ELN · SiLA · GLP · GMP',
    reviewers: [
      ['drug-discovery-ml-reviewer', 'Scaffold/time/cluster split + Tanimoto/sequence-identity threshold + AD bounds + UQ + retrospective validation + IP/patent FTO'],
      ['glp-glab-reviewer', '21 CFR 58 + 21 CFR 211 + OECD GLP + ALCOA+ + EU GMP Annex 11 + FDA CSA (2024) + audit-trail SOP'],
      ['lab-automation-reviewer', 'SiLA2 + OPC-UA + LIMS chain-of-custody + IQ/OQ/PQ + protocol static analysis + scheduler safety'],
    ],
    gates: [
      ['gate:model-card-signoff', 'ML lead + clinical lead', 'before wet-lab spend'],
      ['gate:csv-validation', 'independent QA lead', 'before GLP/GMP production'],
      ['gate:iq-oq-pq', 'engineering + QA', 'per instrument qualification'],
    ],
    artefacts: [
      'Scaffold / time / cluster split with leakage threshold (Tanimoto < 0.4 or sequence < 30%)',
      'Applicability-domain detector with bounds in production',
      'Uncertainty calibration plot + selective prediction policy',
      'Retrospective validation report (held-out targets / clusters)',
      'Generative-output filter chain (validity + SA + PAINS + IP-FTO)',
      'Wet-lab feedback dashboard + drift alerts',
      'Append-only audit trail (signed + exportable per ALCOA+)',
      'CSA-aligned risk-based validation plan',
      'Barcode-based chain-of-custody at every transfer',
      'Scheduler with conflict detection + deadlock prevention',
    ],
    evals: [
      'EVAL-drugml-data-leakage-target-similarity',
      'EVAL-drugml-applicability-domain-coverage',
      'EVAL-glp-alcoa-tamper',
      'EVAL-labauto-sample-chain-of-custody',
    ],
    laws: ['21 CFR Part 58 (GLP)', '21 CFR Part 211 (GMP)', '21 CFR Part 11', 'OECD GLP', 'EU GMP Annex 11', 'MHRA GxP Data Integrity (2018)', 'FDA CSA guidance (2024)', 'ISPE GAMP 5 (2nd ed.)', 'USP <1058>'],
  },
];

const tpl = (p) => {
  const desc = p.sub.replace(/<[^>]+>/g, '').slice(0, 158);
  const canonical = `https://greatcto.systems/pack/${p.slug}.html`;
  const cos = companiesForPack(p.slug);
  const pioneerCount = cos.filter(c => c.pioneer).length;

  const techArticleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": `${p.name} — GreatCTO domain pack overlay`,
    "description": desc,
    "url": canonical,
    "image": "https://greatcto.systems/assets/og-board.png",
    "author": { "@type": "Organization", "name": "GreatCTO", "url": "https://greatcto.systems" },
    "publisher": { "@type": "Organization", "name": "GreatCTO", "url": "https://greatcto.systems" },
    "datePublished": "2026-05-14",
    "dateModified": "2026-05-14",
    "about": p.laws.map(l => ({ "@type": "Thing", "name": l })),
    "keywords": [p.slug, p.name, ...p.laws.slice(0, 5)].join(", "),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "GreatCTO", "item": "https://greatcto.systems/" },
      { "@type": "ListItem", "position": 2, "name": "Domain packs", "item": "https://greatcto.systems/packs.html" },
      { "@type": "ListItem", "position": 3, "name": p.name, "item": canonical },
    ],
  };
  const faqItems = [
    { q: `When does ${p.slug} auto-attach?`, a: `When the CLI detects these signals in your repo: ${p.signals}. Override anytime by editing <code>packs:</code> in PROJECT.md.` },
    { q: `What human gates does ${p.slug} introduce?`, a: p.gates.map(g => `<b>${g[0]}</b> (${g[1]})`).join(', ') + '. These layer on top of the standard plan/ship gates.' },
    { q: `What if my project doesn't match these signals exactly?`, a: 'You can manually add the pack name to PROJECT.md or run <code>/migrate</code> to re-run detection with updated rules.' },
  ];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(({q, a}) => ({
      "@type": "Question", "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a.replace(/<[^>]+>/g, '') },
    })),
  };

  const companyCards = cos.map(c => {
    const stage = c.stage ? `<span class="co-stage">${c.stage}</span>` : '';
    const country = c.country ? `<span class="co-country">${c.country}</span>` : '';
    return `<a class="co-card" href="${c.url}" rel="nofollow noopener" target="_blank">
        <div class="co-head">${logoTag(c)}<span class="co-name">${c.name}</span></div>
        <div class="co-tag">${c.tagline}</div>
        <div class="co-meta">${stage}${country}</div>
      </a>`;
  }).join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${p.name} — GreatCTO domain pack | ${p.laws.slice(0, 2).join(', ')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0e0c" />
<meta name="description" content="${desc}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="GreatCTO" />
<meta property="og:title" content="${p.name} — GreatCTO domain pack" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="https://greatcto.systems/assets/og-board.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${p.name} — GreatCTO domain pack" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="https://greatcto.systems/assets/og-board.png" />

<script type="application/ld+json">${JSON.stringify(techArticleSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>

<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css?v=${CSS_VER}" />
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="/" aria-label="greatcto">
    <span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="14" fill="#0a0e0c"/>
        <g stroke="#00d97e" stroke-width="9" stroke-linecap="round">
          <line x1="32" y1="14" x2="32" y2="50"/>
          <line x1="16.4" y1="23" x2="47.6" y2="41"/>
          <line x1="16.4" y1="41" x2="47.6" y2="23"/>
        </g>
      </svg>
    </span>
    <span>greatcto</span>
  </a>
  <div class="nav-right">
    <a href="/#how" class="nav-link">How</a>
    <a href="/#archetypes" class="nav-link">Archetypes</a>
    <a href="/packs.html" class="nav-link">Packs</a>
    <a href="/#install" class="cta">Install</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-inner">
    <span class="hero-eyebrow">
      <span class="pulse"></span>
      ${p.icon} pack: ${p.slug}
    </span>
    <h1>${p.title}</h1>
    <p class="sub">${p.sub}</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="/#install">$ npx great-cto init</a>
      <a class="btn btn-ghost" href="/packs.html">All packs ↗</a>
    </div>
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">Auto-attach signals</div>
  <h2 class="h2">Detected by CLI when:</h2>
  <pre class="signals-box"><code>${p.signals}</code></pre>
  <p class="lede">The pack rides <strong>on top of</strong> your base archetype (web-service, ai-system, fintech, …) — it doesn't replace it. Auto-injects reviewer agents into the pipeline + opens human gates listed below.</p>
</section>

<section class="wrap">
  <div class="eyebrow">Reviewer agents activated</div>
  <h2 class="h2">${p.reviewers.length} specialist${p.reviewers.length > 1 ? 's' : ''} added to the pipeline.</h2>
  <div class="how-grid">
    ${p.reviewers.map((r, i) => `<div class="how-card">
      <div class="how-num">${String(i + 1).padStart(2, '0')} · ${r[0]}</div>
      <p>${r[1]}</p>
    </div>`).join('\n    ')}
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">Human gates introduced</div>
  <h2 class="h2">${p.gates.length} new gate type${p.gates.length > 1 ? 's' : ''} on top of <code class="inline-code">gate:plan</code> + <code class="inline-code">gate:ship</code>.</h2>
  <table class="gates-table">
    <thead><tr><th>Gate</th><th>Owner</th><th>Trigger</th></tr></thead>
    <tbody>
      ${p.gates.map(g => `<tr><td><code>${g[0]}</code></td><td>${g[1]}</td><td>${g[2]}</td></tr>`).join('\n      ')}
    </tbody>
  </table>
</section>

<section class="wrap">
  <div class="eyebrow">Required artefacts before senior-dev claims tasks</div>
  <h2 class="h2">${p.artefacts.length} concrete deliverables.</h2>
  <ul class="artefact-list">
    ${p.artefacts.map(a => `<li>✓ ${a}</li>`).join('\n    ')}
  </ul>
</section>

<section class="wrap">
  <div class="eyebrow">EVAL suite required</div>
  <h2 class="h2">${p.evals.length} golden-set scenarios shipped as templates.</h2>
  <p class="lede">Each EVAL has ≥5 test cases, pass threshold, regression interpretation, cross-refs to TM + gates. Run via your existing test framework.</p>
  <ul class="eval-list">
    ${p.evals.map(e => `<li><code>${e}.md</code></li>`).join('\n    ')}
  </ul>
</section>

<section class="wrap">
  <div class="eyebrow">Regulatory surface covered</div>
  <h2 class="h2">${p.laws.length} standards / regulations addressed.</h2>
  <div class="laws-grid">
    ${p.laws.map(l => `<span class="law-chip">${l}</span>`).join('\n    ')}
  </div>
</section>

${cos.length > 0 ? `
<section class="wrap" id="companies">
  <div class="eyebrow">Real-world examples</div>
  <h2 class="h2">${cos.length} companies in this space.</h2>
  <div class="co-grid">
      ${companyCards}
  </div>
  <p class="co-disclaimer">Listed companies operate in this space. Inclusion is based on publicly available product descriptions and does not imply endorsement of or by GreatCTO.</p>
</section>` : ''}

<section class="wrap" id="faq">
  <div class="eyebrow">FAQ</div>
  <h2 class="h2">Common questions about ${p.slug}.</h2>
  <div class="faq">
    ${faqItems.map(({q, a}) => `<details class="faq-item"><summary>${q}</summary><div>${a}</div></details>`).join('\n    ')}
  </div>
</section>

<section id="install" class="wrap">
  <div class="eyebrow">30 seconds</div>
  <h2 class="h2">Drop GreatCTO into any repo — ${p.slug} attaches automatically.</h2>
  <div class="final-cta-row">
    <code class="cmd">$ npx great-cto init</code>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('npx great-cto init').then(() => { this.textContent='Copied'; setTimeout(()=>this.textContent='Copy',1500); })">Copy</button>
  </div>
  <div class="cta-micro" style="margin-top: 22px;">
    no signup<span class="sep">·</span>runs locally<span class="sep">·</span>pay your own API
  </div>
</section>

<footer class="footer">
  <div class="footer-brand">© 2026 GreatCTO · MIT License</div>
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/#archetypes">Archetypes</a>
    <a href="/packs.html">All packs</a>
    <a href="/companies.html">Companies</a>
    <a href="https://github.com/avelikiy/great_cto">GitHub</a>
  </div>
</footer>

</body>
</html>
`;
};

for (const p of packs) {
  const out = join(__dirname, `${p.slug}.html`);
  writeFileSync(out, tpl(p), 'utf8');
  console.log(`✓ wrote ${p.slug}.html`);
}
console.log(`\nGenerated ${packs.length} pack landing pages.`);

// Export for use by /packs.html aggregate generator
export { packs };
