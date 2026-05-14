// Generator for /for/<archetype>.html landing pages.
// Run: node site/for/_generate.mjs
// Reads data array below and writes one HTML per archetype.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_VER = '2026050414';

// ── Companies data ──────────────────────────────────────────────────────────
const companiesData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'companies.json'), 'utf-8'));
const allCompanies = companiesData.companies;

// Pack overlay metadata — keep in sync with site/pack/_generate.mjs
const PACK_META = {
  'voice-pack':            { name: 'Voice AI',           desc: 'Voice + telephony compliance (TCPA, STIR/SHAKEN, state recording-consent)',                       href: '/pack/voice-pack.html' },
  'clinical-pack':         { name: 'Clinical AI',        desc: 'FDA GMLP + SaMD classification + EU AI Act medical',                                              href: '/pack/clinical-pack.html' },
  'hr-ai-pack':            { name: 'HR-AI',              desc: 'NYC LL 144 AEDT bias audit, EEOC, EU AI Act employment',                                          href: '/pack/hr-ai-pack.html' },
  'api-platform-pack':     { name: 'API Platform',       desc: 'OAuth 2.1, webhook signing, idempotency, RFC 8594 Sunset',                                        href: '/pack/api-platform-pack.html' },
  'lending-pack':          { name: 'Lending/Credit',     desc: 'ECOA / Reg B, FCRA, NMLS state matrix, MLA, BISG fair-lending',                                   href: '/pack/lending-pack.html' },
  'clinical-trials-pack':  { name: 'Clinical Trials',    desc: 'ICH-GCP E6(R3), 21 CFR Part 11, CDISC, FHIR R5, OMOP, DICOM, de-id',                              href: '/pack/clinical-trials-pack.html' },
  'robotics-pack':         { name: 'Robotics Safety',    desc: 'ISO 10218 / TS 15066 (cobot) / IEC 61508 (SIL), HARA, SROS2',                                     href: '/pack/robotics-pack.html' },
  'em-fintech-pack':       { name: 'EM Fintech',         desc: 'India DPDP, Nigeria CBN, Brazil BCB/LGPD, MAS, OJK, BSP, local rails',                            href: '/pack/em-fintech-pack.html' },
  'climate-pack':          { name: 'Climate MRV',        desc: 'GHG Protocol, Verra, SBTi, CSRD, CBAM + biosecurity (DURC, IGSC HSP v2)',                         href: '/pack/climate-pack.html' },
  'drug-discovery-pack':   { name: 'Drug Discovery',     desc: 'ChEMBL versioning, applicability domain, ALCOA+, SiLA2, IQ/OQ/PQ',                                href: '/pack/drug-discovery-pack.html' },
};

// Return companies in this archetype space. Ordered by stage maturity (public →
// growth → series → seed → open-source) then alphabetical. Pioneer ★ shown as
// a card badge — not the primary sort, so the visual story is global coverage.
const STAGE_RANK = { 'public': 0, 'subsidiary': 1, 'growth': 2, 'series-e': 3, 'series-f': 3, 'series-d': 4, 'series-c': 5, 'series-b': 6, 'series-a': 7, 'seed': 8, 'open-source': 9, 'acquired': 10, 'private': 11 };
function companiesForArchetype(archetype, limit = 20) {
  const list = Object.entries(allCompanies)
    .filter(([_id, c]) => (c.archetypes || []).includes(archetype))
    .map(([id, c]) => ({ id, ...c }));
  list.sort((a, b) => {
    const sa = STAGE_RANK[a.stage] ?? 99;
    const sb = STAGE_RANK[b.stage] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
  return list.slice(0, limit);
}

// Packs that an archetype is most likely to overlay with.
const ARCHETYPE_PACK_AFFINITY = {
  'agent-product':   ['voice-pack', 'clinical-pack', 'hr-ai-pack'],
  'ai-system':       ['voice-pack', 'clinical-pack', 'hr-ai-pack', 'drug-discovery-pack'],
  'healthcare':      ['clinical-pack', 'clinical-trials-pack', 'voice-pack'],
  'fintech':         ['lending-pack', 'em-fintech-pack', 'api-platform-pack'],
  'commerce':        ['lending-pack', 'em-fintech-pack'],
  'devtools':        ['api-platform-pack', 'voice-pack'],
  'library':         ['api-platform-pack'],
  'iot-embedded':    ['robotics-pack', 'clinical-pack'],
  'regulated':       ['clinical-pack', 'climate-pack', 'drug-discovery-pack'],
  'web-service':     ['api-platform-pack'],
  'data-platform':   ['climate-pack', 'clinical-trials-pack'],
  'mlops':           ['clinical-pack', 'drug-discovery-pack'],
  'enterprise-saas': ['hr-ai-pack', 'api-platform-pack'],
  'marketplace':     ['em-fintech-pack', 'lending-pack'],
  'edtech':          ['hr-ai-pack'],
  'insurance':       ['lending-pack', 'em-fintech-pack'],
  'gov-public':      ['climate-pack'],
  'streaming':       ['api-platform-pack'],
  'infra':           [],
  'cli-tool':        [],
  'browser-extension': [],
  'cms':             ['api-platform-pack'],
  'game':            [],
  'web3':            ['api-platform-pack', 'em-fintech-pack'],
  'mobile-app':      ['voice-pack', 'lending-pack'],
};

// Extract registrable domain from a URL (e.g. https://stripe.com/foo → stripe.com).
// Used to drive Clearbit-style auto-discovered logo URLs.
function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function logoTag(c) {
  const d = domainOf(c.url);
  if (!d) return '';
  // Clearbit Logo API — free, no key, ~70% coverage for known companies.
  // onerror hides the broken image so the card falls back to name-only.
  const src = `https://logo.clearbit.com/${d}?size=64`;
  return `<img class="co-logo" src="${src}" alt="" loading="lazy" onerror="this.style.display='none'" />`;
}

function companiesSection(slug) {
  const cos = companiesForArchetype(slug);
  if (cos.length === 0) return '';
  const cards = cos.map(c => {
    const stage = c.stage ? `<span class="co-stage">${c.stage}</span>` : '';
    const country = c.country ? `<span class="co-country">${c.country}</span>` : '';
    return `<a class="co-card" href="${c.url}" rel="nofollow noopener" target="_blank">
        <div class="co-head">${logoTag(c)}<span class="co-name">${c.name}</span></div>
        <div class="co-tag">${c.tagline}</div>
        <div class="co-meta">${stage}${country}</div>
      </a>`;
  }).join('\n      ');
  return `
<section class="wrap" id="companies">
  <div class="eyebrow">Real-world examples</div>
  <h2 class="h2">Companies operating as <em>${slug}</em>.</h2>
  <p class="lede">${cos.length} startups in this space. Click for full pack mapping.</p>
  <div class="co-grid">
      ${cards}
  </div>
  <p class="co-disclaimer">Listed companies operate in this space. Inclusion is based on publicly available product descriptions and does not imply endorsement of or by GreatCTO.</p>
</section>`;
}

function applicablePacksSection(slug) {
  const packs = ARCHETYPE_PACK_AFFINITY[slug] || [];
  if (packs.length === 0) return '';
  const cards = packs.map(p => {
    const m = PACK_META[p];
    if (!m) return '';
    return `<a class="pack-card" href="${m.href}">
        <div class="pack-name">+ ${m.name}</div>
        <div class="pack-desc">${m.desc}</div>
      </a>`;
  }).filter(Boolean).join('\n      ');
  return `
<section class="wrap" id="packs">
  <div class="eyebrow">Domain pack overlays</div>
  <h2 class="h2">Likely to overlay on <em>${slug}</em>.</h2>
  <p class="lede">Packs auto-attach when CLI detects pack-specific signals (e.g. <code class="inline-code">twilio</code> in deps → voice-pack). Each pack adds its own reviewer agents + human gates on top of the base archetype pipeline.</p>
  <div class="pack-grid">
      ${cards}
  </div>
</section>`;
}

const archetypes = [
  {
    slug: 'web-service',
    icon: '🌐',
    name: 'Web service',
    title: 'Ship REST/GraphQL APIs <em>without</em> the OWASP Top-10 surprise.',
    sub: 'Building with <b>Express</b>, <b>Fastify</b>, <b>Django</b>, <b>FastAPI</b>, <b>Spring Boot</b>, or <b>Rails</b>? GreatCTO auto-detects the web-service archetype and ships <b>OWASP API Top-10</b>, <b>GDPR data-minimization</b>, and <b>SLO/error-budget</b> gates from day one.',
    compliance: ['gdpr', 'owasp-api-top-10'],
    detected: '<code class="inline-code">express</code> + <code class="inline-code">postgres</code>',
    title2: 'The 5 API bugs that <em>leak data</em>.',
    before: [
      'Missing rate limit — credential stuffing in week 2',
      'CORS misconfigured — third-party JS reads tokens',
      'Stack traces leaked in 500 responses',
      'JWT signature not verified server-side',
      'No input validation on path params — SSRF',
      '<b>One incident · GDPR notification · 4% revenue fine.</b>',
    ],
    after: [
      'security-officer covers OWASP API1–10 every commit',
      'CORS + CSP + rate-limit gate on senior-dev output',
      'Error responses sanitized; stack traces only to logs',
      'JWT, OAuth scopes, and session fixation auto-checked',
      'Input validation enforced via OpenAPI schema',
      '<b>0-day-1 audit-ready, no compliance officer needed.</b>',
    ],
    agents: [
      ['security-officer', 'OWASP API Top-10', 'A01 broken access control · A02 crypto failures · A03 injection · A07 identification failures. Every commit, every endpoint, every dependency.'],
      ['performance-engineer', 'SLO budget design', 'p50/p95/p99 latency targets · k6 load tests · capacity planning. Activated when performance-sla is set in PROJECT.md.'],
      ['code-reviewer', '12-angle review', 'Idempotency · concurrency · race conditions · N+1 · cache invalidation · log-injection. 12 independent passes on every PR.'],
      ['senior-dev', 'TDD with audit trail', 'RED → GREEN → IMPROVE. Every gate approval written to ~/.great_cto/decisions.md — append-only, auditor-ready.'],
    ],
    finalLine: 'Drop into any Express / FastAPI / Django repo.',
  },
  {
    slug: 'agent-product',
    icon: '🤖',
    name: 'Agent product',
    title: 'Ship your <em>agent product</em> without learning the hard way.',
    sub: 'Building with <b>LangGraph</b>, <b>CrewAI</b>, <b>MCP</b>, or your own multi-agent loop? GreatCTO auto-detects the stack and ships <b>agent-eval gates</b>, <b>prompt-injection review</b>, and <b>EU AI Act + OWASP LLM Top 10</b> compliance from day one.',
    compliance: ['eu-ai-act', 'owasp-llm-top-10'],
    detected: '<code class="inline-code">@langchain/langgraph</code> + <code class="inline-code">pinecone</code>',
    title2: 'The 5 ways agent products <em>silently break</em>.',
    before: [
      'Prompt injection in tool calls — no eval gate',
      'Cross-user state leak — no isolation review',
      'Cost runaway — no budget monitor',
      'RAG poisoning — no source signing',
      'Output exfiltration via SSRF in tool layer',
      '<b>Find out from your AI security reporter at 3am</b>',
    ],
    after: [
      'Agent-eval gate runs golden + red-team prompts before merge',
      'ai-security-reviewer covers OWASP LLM Top 10',
      'ai-eval-engineer runs regression on every prompt change',
      'Cost-overrun + cross-user isolation tests built in',
      'Auto-detected when LangGraph + vector DB present',
      '<b>Sleep tonight. Ship Friday.</b>',
    ],
    agents: [
      ['ai-security-reviewer', 'Pre-implementation threat model', 'OWASP LLM Top 10 coverage: prompt injection, output exfiltration, SSRF in tool layer, supply chain, cost runaway, cross-user isolation, RAG poisoning. Outputs <code>TM-{slug}.md</code> and signs off Critical/High mitigations.'],
      ['ai-prompt-architect', 'System prompts as ADRs', 'Outputs <code>ADR-PROMPT-{name}.md</code> with sha256-pinned prompt text, jailbreak resistance test cases, revision history. Pairs with ai-eval-engineer for golden-set scenarios.'],
      ['ai-eval-engineer', 'Regression on every prompt change', 'Builds the eval pipeline: golden citation, refuse-when-uncertain, output schema, prompt-injection, cost-overrun, cross-user isolation. Detects drift.'],
      ['senior-dev', 'Implementation with TDD', 'Implements only after AI-security signs off Critical/High. Full TDD cycle (RED → GREEN → REFACTOR). Coverage threshold enforced.'],
    ],
    finalLine: 'Drop into any LangGraph / CrewAI / MCP / Mastra / Anthropic SDK repo.',
  },
  {
    slug: 'fintech',
    icon: '🏦',
    name: 'Fintech',
    title: 'Ship banking software <em>without</em> a Big-4 audit fee.',
    sub: 'Building with <b>Plaid</b>, <b>Wise</b>, <b>Dwolla</b>, or <b>Stripe Connect</b>? GreatCTO auto-detects the fintech archetype and ships <b>PCI-DSS scope-reduction</b>, <b>SOX ITGC</b>, <b>KYC/AML</b>, <b>SCA / PSD2</b> compliance gates from day one — without hiring a compliance officer.',
    compliance: ['pci-dss', 'sox', 'kyc-aml', 'gdpr'],
    detected: '<code class="inline-code">plaid</code> + <code class="inline-code">express</code>',
    title2: 'The 5 fintech bugs that <em>cost millions</em>.',
    before: [
      'Webhook signature not verified — replay attacks',
      'Idempotency key reused across users — duplicate charges',
      'Missing SoD (separation of duties) — SOX violation',
      'PCI scope exploded — full SAQ-D audit instead of SAQ-A',
      'Refund flow not idempotent — auditor finds in week 1',
      '<b>$200k audit + 4-month delay</b>',
    ],
    after: [
      'pci-reviewer signs off scope-reduction (SAQ-A)',
      'Idempotency proof + webhook signature gates',
      'regulated-reviewer covers SOX ITGC + SoD',
      'KYC/AML + DORA Article 16 ICT risk auto-checked',
      'Refund/dispute flow — idempotency proof required',
      '<b>Audit-ready from commit 1.</b>',
    ],
    agents: [
      ['pci-reviewer', 'PCI-DSS scope reduction', 'SAQ-A vs SAQ-D decision · idempotency proof · webhook signature validation · refund/dispute flow · Strong Customer Authentication (SCA / PSD2 EU) · PSP failover. Signs off scope decisions before senior-dev claims tasks.'],
      ['regulated-reviewer', 'SOX + DORA + NIS2', 'DORA ICT risk (Articles 5 &amp; 16), NIS2 Article 21 controls, ISO27001 SoA gap analysis, SOX ITGC (access control, change management, SoD), HIPAA PHI handling + BAA requirements when in scope.'],
      ['security-officer', 'Continuous compliance', 'npm audit · OWASP A02 cryptographic failures · A07 identification failures · A03 injection · GDPR data minimization · breach notification readiness.'],
      ['senior-dev', 'Implementation with audit trail', 'Every gate approval written to <code>~/.great_cto/decisions.md</code> — append-only, queryable, auditor-ready. No more "show me the architecture decision" panic.'],
    ],
    finalLine: 'Drop into any Plaid / Wise / Stripe Connect / Razorpay / Mercury repo.',
  },
  {
    slug: 'healthcare',
    icon: '🏥',
    name: 'Healthcare',
    title: 'Ship healthcare software <em>without</em> a HIPAA breach notification.',
    sub: 'Building with <b>FHIR</b>, <b>HL7</b>, or storing <b>PHI</b>? GreatCTO auto-detects the healthcare archetype and ships <b>HIPAA Security Rule</b>, <b>HITECH</b>, <b>BAA-ready</b>, <b>encryption-at-rest</b> compliance gates — without learning the regs the hard way.',
    compliance: ['hipaa', 'hitech', 'gdpr'],
    detected: '<code class="inline-code">fhir</code> + <code class="inline-code">express</code>',
    title2: 'The 5 healthcare bugs that trigger <em>HHS notification</em>.',
    before: [
      'PHI logged to plaintext stdout — breach notification',
      'Audit log not append-only — HIPAA §164.312(b) violation',
      'BAA not signed with vendor — strict liability',
      'Encryption at rest missing — Safe Harbor lost',
      'Patient consent flow ad-hoc — HHS finds in audit',
      '<b>$50k–$1.5M penalty per violation</b>',
    ],
    after: [
      'regulated-reviewer flags PHI in non-encrypted paths',
      'Audit log gate: append-only + tamper-evident',
      'BAA checklist enforced before vendor integration',
      'Encryption-at-rest verified for FHIR + HL7 stores',
      'Consent flow auto-templated from FHIR Consent resource',
      '<b>HHS-audit-ready from commit 1.</b>',
    ],
    agents: [
      ['regulated-reviewer', 'HIPAA Privacy + Security Rule', 'HIPAA PHI handling + BAA requirements, audit log requirements (§164.312(b)), encryption requirements, breach notification readiness, SOX ITGC overlap when in financial-health scope.'],
      ['security-officer', 'Encryption + access control', 'Encryption at rest (Safe Harbor), TLS 1.2+ in transit, role-based access (minimum necessary), session timeout, password complexity per NIST 800-63B.'],
      ['code-reviewer', 'PHI leak detection', '12-angle review including: PHI in logs, PHI in error messages, PHI in URL parameters, PHI in cache keys, third-party integrations without BAA.'],
      ['senior-dev', 'FHIR-native implementation', 'FHIR Consent resource handling · Patient resource access checks · Bundle transaction integrity · OAuth2 SMART-on-FHIR scopes · audit log on every PHI access.'],
    ],
    finalLine: 'Drop into any FHIR / HL7 / EHR-integration repo.',
  },
  {
    slug: 'ai-system',
    icon: '🧠',
    name: 'AI system',
    title: 'Ship AI features <em>before</em> the EU AI Act ships you.',
    sub: 'Building with <b>OpenAI</b>, <b>Anthropic</b>, <b>RAG pipelines</b>, or <b>vector DBs</b>? GreatCTO auto-detects the ai-system archetype and ships <b>EU AI Act risk-tier</b>, <b>OWASP LLM Top-10</b>, <b>eval golden-set</b>, and <b>cost-overrun</b> gates from day one.',
    compliance: ['eu-ai-act', 'owasp-llm-top-10'],
    detected: '<code class="inline-code">openai</code> + <code class="inline-code">pinecone</code>',
    title2: 'The 5 AI bugs that <em>silently rot</em>.',
    before: [
      'Prompt injection — user asks for system prompt',
      'No eval suite — model drift goes undetected for weeks',
      'Token cost explodes 10x — discovered on the bill',
      'Hallucinations cited as fact — legal liability',
      'No refuse-when-uncertain — fabricates answers',
      '<b>Silent regression · angry users · hidden cost.</b>',
    ],
    after: [
      'ai-prompt-architect pins prompts via sha256 + ADR',
      'ai-eval-engineer runs golden-set on every prompt change',
      'Cost-overrun gate blocks deploy if budget exceeded',
      'Citation enforcement — refuse if confidence < threshold',
      'Cross-user isolation + jailbreak resistance verified',
      '<b>Eval-driven · cost-controlled · audit-ready.</b>',
    ],
    agents: [
      ['ai-prompt-architect', 'Versioned system prompts', 'Outputs ADR-PROMPT-{name}.md with sha256-pinned prompt text, jailbreak resistance test cases, revision history.'],
      ['ai-eval-engineer', 'Golden-set regression', 'tests/eval/EVAL-*.md — citation accuracy, refuse-when-uncertain, output schema, prompt injection, cost-overrun, cross-user isolation.'],
      ['ai-security-reviewer', 'OWASP LLM Top-10', 'Prompt injection · output exfiltration · SSRF in tool layer · supply chain · cost runaway · cross-user isolation · model jailbreak · RAG poisoning.'],
      ['security-officer', 'EU AI Act risk tier', 'Limited / High / Unacceptable risk classification. Article 9 risk management. Article 13 transparency. Conformity assessment readiness.'],
    ],
    finalLine: 'Drop into any LangChain / LlamaIndex / OpenAI repo.',
  },
  {
    slug: 'commerce',
    icon: '💳',
    name: 'Commerce',
    title: 'Take payments <em>without</em> taking PCI risk.',
    sub: 'Building with <b>Stripe</b>, <b>Shopify</b>, <b>WooCommerce</b>, or <b>Square</b>? GreatCTO auto-detects the commerce archetype and ships <b>PCI-DSS SAQ-A scope reduction</b>, <b>idempotent refund flows</b>, <b>SCA / PSD2</b>, and <b>GDPR cookie consent</b> gates from day one.',
    compliance: ['pci-dss', 'gdpr', 'sca-psd2'],
    detected: '<code class="inline-code">stripe</code> + <code class="inline-code">next.js</code>',
    title2: 'The 5 commerce bugs that <em>cost real money</em>.',
    before: [
      'Idempotency key reused — duplicate $400 charge',
      'PCI scope blew out from SAQ-A to SAQ-D',
      'Refund flow not idempotent — refunded twice',
      'Webhook signature not verified — replay attack',
      'GDPR cookie banner missing — €20M fine risk',
      '<b>$200k audit + chargeback storm.</b>',
    ],
    after: [
      'pci-reviewer signs off scope-reduction (SAQ-A)',
      'Idempotency proof required on every payment endpoint',
      'Refund + dispute flow gated for idempotency',
      'Webhook signature + replay protection auto-checked',
      'GDPR consent + cookie banner enforced at gate:ship',
      '<b>Audit-ready from commit 1 · zero chargebacks.</b>',
    ],
    agents: [
      ['pci-reviewer', 'PCI-DSS scope reduction', 'SAQ-A vs SAQ-D decision · idempotency proof · webhook signature · refund/dispute flow · SCA / PSD2 · PSP failover. Pre-implementation sign-off.'],
      ['security-officer', 'OWASP A02 + GDPR', 'Cryptographic failures · cookie consent · data-minimization · breach notification readiness · PII redaction in logs.'],
      ['code-reviewer', '12-angle review', 'Race conditions on inventory · double-charge prevention · refund idempotency · webhook replay · session fixation.'],
      ['senior-dev', 'TDD with audit trail', 'Every gate approval written to ~/.great_cto/decisions.md — auditor-ready, append-only, queryable across projects.'],
    ],
    finalLine: 'Drop into any Stripe / Shopify / WooCommerce repo.',
  },
  {
    slug: 'mobile-app',
    icon: '📱',
    name: 'Mobile app',
    title: 'Ship to App Store <em>without</em> the rejection email.',
    sub: 'Building with <b>React Native</b>, <b>Flutter</b>, <b>Swift</b>, or <b>Kotlin</b>? GreatCTO auto-detects the mobile-app archetype and ships <b>App Store / Play Store policy</b>, <b>IAP receipt validation</b>, and <b>push token security</b> gates before TestFlight.',
    compliance: ['app-store', 'play-store', 'gdpr'],
    detected: '<code class="inline-code">react-native</code> + <code class="inline-code">@stripe/stripe-react-native</code>',
    title2: 'The 5 mobile bugs that <em>break shipping</em>.',
    before: [
      'IAP receipt not server-validated — pirated unlocks',
      'Push token leaked in logs — silent push to all users',
      'App Store rejected for non-IAP payment in iOS',
      'Privacy nutrition label wrong — 7-day re-review',
      'Deep-link without verification — phishing vector',
      '<b>2-week shipping delay every release.</b>',
    ],
    after: [
      'IAP receipt validation (server-side) is gate:ship',
      'Push token redacted from logs · APNs signing checked',
      'Apple/Google policy compliance audited pre-release',
      'Privacy manifest + nutrition label auto-generated',
      'Deep-link / universal-link verification mandatory',
      '<b>Pass review on first attempt.</b>',
    ],
    agents: [
      ['security-officer', 'Mobile OWASP', 'M1 improper credential usage · M3 insecure auth · M4 insufficient input validation · M9 insecure data storage · M10 insufficient cryptography.'],
      ['code-reviewer', '12-angle review', 'Memory leaks on background · battery drain · network resilience · cold-start budget · accessibility (a11y) compliance.'],
      ['performance-engineer', 'Cold start budget', 'TTI < 2s on iPhone SE · APK/IPA size budget · frame rate targets · battery profile.'],
      ['senior-dev', 'TDD with audit trail', 'Every store-policy decision logged to ~/.great_cto/decisions.md. Reused across iOS + Android variants.'],
    ],
    finalLine: 'Drop into any React Native / Flutter / Swift / Kotlin repo.',
  },
  {
    slug: 'cli-tool',
    icon: '🔧',
    name: 'CLI tool',
    title: 'Build a CLI <em>that doesn\'t</em> ship a footgun.',
    sub: 'Building with <b>Node CLI</b>, <b>Python click</b>, <b>Rust clap</b>, or <b>Go cobra</b>? GreatCTO auto-detects the cli-tool archetype and ships <b>shell-injection prevention</b>, <b>--help conventions</b>, <b>dangerous-default detection</b>, and <b>cross-platform path handling</b> gates from day one.',
    compliance: [],
    detected: '<code class="inline-code">commander</code> + <code class="inline-code">execa</code>',
    title2: 'The 5 CLI bugs that <em>burn user trust</em>.',
    before: [
      'Shell injection via user input passed to exec()',
      'Dangerous default — rm -rf without confirmation',
      'No --help · no --version · no exit codes',
      'Crashes on Windows because of POSIX path assumptions',
      'Logs secrets when --verbose is on',
      '<b>1 GitHub issue · trust gone · uninstalled.</b>',
    ],
    after: [
      'No shell — execFile with argv array, never spawn(\'sh\')',
      'Destructive ops require --yes or interactive confirm',
      'Standard --help / --version / proper exit codes',
      'Path handling cross-platform (path.join, no /)',
      'Secret redaction in logs at gate:ship',
      '<b>Reliable · predictable · trustworthy.</b>',
    ],
    agents: [
      ['security-officer', 'Shell-injection prevention', 'Every exec(), spawn(), system() call audited. argv arrays only. No shell metacharacter passthrough.'],
      ['code-reviewer', 'CLI UX conventions', '--help format · exit codes · stdin/stdout/stderr separation · --json output mode · NO_COLOR / FORCE_COLOR respect.'],
      ['qa-engineer', 'Cross-platform tests', 'Linux + macOS + Windows matrix · Node 18 / 20 / 22 · Python 3.10 / 3.11 / 3.12 · proper EOL handling.'],
      ['senior-dev', 'TDD with snapshots', 'Snapshot tests on stdout/stderr · golden output files · regression-proof.'],
    ],
    finalLine: 'Drop into any Node / Python / Rust / Go CLI repo.',
  },
  {
    slug: 'library',
    icon: '📦',
    name: 'Library',
    title: 'Publish a library <em>without</em> the breaking-change rage.',
    sub: 'Building an <b>npm</b>, <b>PyPI</b>, <b>crates.io</b>, or <b>Maven</b> library? GreatCTO auto-detects the library archetype and ships <b>semver enforcement</b>, <b>API stability checks</b>, <b>changelog discipline</b>, and <b>migration guides</b> from day one.',
    compliance: [],
    detected: '<code class="inline-code">package.json</code> with <code class="inline-code">"main"</code> + <code class="inline-code">"exports"</code>',
    title2: 'The 5 library bugs that <em>destroy adoption</em>.',
    before: [
      'Breaking change shipped as patch — community rage',
      'No TypeScript types — JS-only adoption',
      'Stale CHANGELOG.md — users blindsided on upgrade',
      'Tree-shaking broken — bundle size doubles',
      'No migration guide for v1 → v2',
      '<b>Stars drop · forks happen · ecosystem fork.</b>',
    ],
    after: [
      'Semver gate: any public API change → minor or major',
      'Types auto-generated · published · checked',
      'CHANGELOG.md updated at gate:ship — required',
      'Bundle-size budget enforced with size-limit',
      'Migration guide template required for major bumps',
      '<b>Predictable upgrades · happy users · ecosystem trust.</b>',
    ],
    agents: [
      ['code-reviewer', 'API surface diff', 'Detects breaking changes via api-extractor / pyright / cargo public-api. Forces semver alignment.'],
      ['qa-engineer', 'Backward-compat matrix', 'Tests against last 3 major versions of consumers. Snapshot diff on type definitions. Bundle-size regression checked.'],
      ['senior-dev', 'CHANGELOG discipline', 'Conventional commits → auto-generate CHANGELOG.md · Keep a Changelog format · migration guides for major bumps.'],
      ['security-officer', 'Supply-chain audit', 'npm audit · cargo audit · Dependabot · OpenSSF Scorecard · provenance checks at publish time.'],
    ],
    finalLine: 'Drop into any npm / PyPI / cargo / Maven library.',
  },
  {
    slug: 'browser-extension',
    icon: '🌍',
    name: 'Browser extension',
    title: 'Ship a Chrome / Firefox extension <em>without</em> store rejection.',
    sub: 'Building a <b>Chrome / Firefox / Edge / Safari</b> extension on <b>Manifest V3</b>? GreatCTO auto-detects the browser-extension archetype and ships <b>permission-justification audit</b>, <b>CSP enforcement</b>, <b>host_permissions minimization</b>, and <b>cross-browser API divergence</b> gates from day one.',
    compliance: ['csp', 'mv3-security', 'gdpr'],
    detected: '<code class="inline-code">manifest.json</code> with <code class="inline-code">manifest_version: 3</code>',
    title2: 'The 5 extension bugs that <em>get you delisted</em>.',
    before: [
      'host_permissions: ["<all_urls>"] — Chrome rejects',
      'Inline script in popup — CSP violation',
      'webRequest blocking still in code — MV3 incompatible',
      'Permissions justification missing — store delays 2 wk',
      'Logs user URLs to remote — privacy violation',
      '<b>Delisted · re-review · revenue gone.</b>',
    ],
    after: [
      'web-store-reviewer audits manifest.json pre-submit',
      'host_permissions minimized + activeTab pattern',
      'CSP enforced · no inline · no eval · MV3-clean',
      'Permission justification doc auto-generated',
      'No PII / browsing history sent to servers',
      '<b>Pass review on first attempt · stay listed.</b>',
    ],
    agents: [
      ['web-store-reviewer', 'Store policy audit', 'Validates manifest.json against Chrome / Firefox / Edge / Safari policies. Generates threat model with permissions justification, host_permissions audit, CSP enforcement, cross-browser API divergence.'],
      ['security-officer', 'CSP + DOM XSS', 'Content Security Policy hardening · inline-script blocking · DOM-based XSS detection · message-passing trust boundaries between content / background / popup.'],
      ['code-reviewer', '12-angle review', 'Cross-browser API divergence (chrome.* vs browser.*) · service worker lifecycle · message-passing race conditions · storage.local quota.'],
      ['senior-dev', 'TDD with playwright', 'E2E in headless Chrome / Firefox · permissions tested · upgrade path from MV2 → MV3 verified.'],
    ],
    finalLine: 'Drop into any Chrome / Firefox / Edge MV3 extension.',
  },
  {
    slug: 'game',
    icon: '🎮',
    name: 'Game',
    title: 'Ship games <em>without</em> a COPPA letter from FTC.',
    sub: 'Building with <b>Unity</b>, <b>Unreal</b>, <b>Godot</b>, or web canvas? GreatCTO auto-detects the game archetype and ships <b>COPPA under-13 compliance</b>, <b>ESRB / PEGI age-rating alignment</b>, <b>IAP age gates</b>, and <b>accessibility</b> gates from day one.',
    compliance: ['coppa', 'age-rating', 'accessibility'],
    detected: '<code class="inline-code">Unity</code> project / <code class="inline-code">canvas</code> game loop',
    title2: 'The 5 game bugs that <em>summon regulators</em>.',
    before: [
      'Collects DOB without parental consent — COPPA fine',
      'IAP without age gate — Apple rejects under-13 app',
      'Loot boxes without disclosure — Belgium / NL ban',
      'No subtitles · no remap · accessibility lawsuit',
      'PII in analytics — GDPR + COPPA double hit',
      '<b>FTC letter · App Store removal · class action.</b>',
    ],
    after: [
      'Under-13 detection + parental consent flow',
      'IAP age-gate + spending limits enforced',
      'Loot-box odds disclosed — Belgium / NL safe',
      'Accessibility gates: subtitles, remap, colorblind',
      'PII / DOB never sent to analytics — verified at gate',
      '<b>Globally compliant · safe for kids · sue-proof.</b>',
    ],
    agents: [
      ['security-officer', 'COPPA + GDPR-K', 'Under-13 PII collection prevention · parental consent · data minimization · COPPA-safe analytics · Children\'s Code (UK) compliance.'],
      ['code-reviewer', 'Game UX + accessibility', 'WCAG 2.2 AA · subtitle support · key-remap · colorblind palettes · motion-reduction · audio cue alternatives.'],
      ['performance-engineer', 'Frame budget', '60 / 120 fps targets · GPU memory budget · battery profile on mobile · network resilience for online modes.'],
      ['senior-dev', 'TDD on game logic', 'Pure-function game-state tests · network desync detection · save-game backward compatibility.'],
    ],
    finalLine: 'Drop into any Unity / Unreal / Godot / web-canvas project.',
  },
  {
    slug: 'web3',
    icon: '⛓️',
    name: 'Web3 / DeFi',
    title: 'Ship a smart contract <em>without</em> losing $1B to MEV.',
    sub: 'Building with <b>Solidity</b>, <b>Anchor</b>, <b>Foundry</b>, or <b>Rust contracts</b>? GreatCTO auto-detects the web3 archetype and ships <b>oracle strategy</b> (Chainlink/Pyth/TWAP), <b>MEV protection</b>, <b>upgradeability decision</b>, and <b>L2 sequencer halt</b> gates from day one.',
    compliance: ['soc2', 'audit-prep'],
    detected: '<code class="inline-code">foundry.toml</code> / <code class="inline-code">hardhat.config.ts</code> / <code class="inline-code">Anchor.toml</code>',
    title2: 'The 5 DeFi bugs that <em>drain the treasury</em>.',
    before: [
      'Single Chainlink oracle — manipulation, $80M drain',
      'No MEV protection — sandwich on every swap',
      'Reentrancy via callback in ERC777 — empty pool',
      'Upgradeable proxy without timelock — admin rug',
      'L2 sequencer halts — oracle stale, liquidations cascade',
      '<b>Hack on day 3 · TVL gone · brand dead.</b>',
    ],
    after: [
      'oracle-reviewer signs off Chainlink + Pyth + TWAP combo',
      'MEV: commit-reveal, threshold, or batch-auction',
      'CEI pattern + reentrancy guards + Slither passes',
      'Timelock + multisig on upgrades · transparent proxy',
      'L2 sequencer halt detection + circuit breaker',
      '<b>Audit-ready · MEV-resistant · timelocked.</b>',
    ],
    agents: [
      ['oracle-reviewer', 'Oracle + MEV strategy', 'Chainlink / Pyth / TWAP combo · MEV protection (sandwich/JIT/flash-loan) · upgradeability decision (Immutable/UUPS/Diamond/Beacon) · L2 sequencer halts · custody/multisig/timelock · formal verification scope.'],
      ['security-officer', 'OWASP smart-contract', 'Reentrancy · access control · arithmetic · DoS · randomness · front-running · timestamp dependence · Slither/Mythril/Echidna pre-deploy.'],
      ['code-reviewer', '12-angle review', 'Storage layout · upgrade-safe slots · gas optimization · invariant testing · fuzz / property tests with Foundry.'],
      ['senior-dev', 'TDD with Foundry', 'forge test · invariants · fuzz · differential vs reference impl · mainnet-fork integration tests.'],
    ],
    finalLine: 'Drop into any Foundry / Hardhat / Anchor repo.',
  },
  {
    slug: 'data-platform',
    icon: '📊',
    name: 'Data platform',
    title: 'Build a data platform <em>without</em> the GDPR scramble.',
    sub: 'Building with <b>Snowflake</b>, <b>BigQuery</b>, <b>dbt</b>, <b>Spark</b>, or <b>Databricks</b>? GreatCTO auto-detects the data-platform archetype and ships <b>GDPR retention</b>, <b>PII detection in logs</b>, <b>lineage tracking</b>, and <b>SLO budget</b> gates from day one.',
    compliance: ['gdpr', 'data-residency', 'lineage'],
    detected: '<code class="inline-code">dbt_project.yml</code> + <code class="inline-code">snowflake</code>',
    title2: 'The 5 data-platform bugs that <em>haunt audits</em>.',
    before: [
      'PII logged in Spark driver logs — kept 90 days',
      'GDPR retention not enforced — 5-year-old user data',
      'Lineage broken — can\'t answer "where does this come from"',
      'Broken DAG silently fills nulls — bad dashboards',
      'PII in BigQuery exports without masking',
      '<b>SAR fails · DPIA fails · ICO knocks.</b>',
    ],
    after: [
      'PII detection on driver logs · masked at sink',
      'Retention policies codified · auto-enforced',
      'Lineage required: every column has a source',
      'DAG failures alert · null-thresholds at gate:ship',
      'Export classification + masking auto-checked',
      '<b>SAR-ready · DPIA-clean · auditor-friendly.</b>',
    ],
    agents: [
      ['security-officer', 'GDPR + data residency', 'Article 5 minimization · Article 17 erasure · Article 32 security of processing · cross-border transfer (SCCs) · DPIA generation.'],
      ['db-migration-reviewer', 'Schema migration safety', 'Zero-downtime ALTER patterns · index lock duration · backfill safety · rollback strategy · PII column handling.'],
      ['performance-engineer', 'Query budget', 'p95 query latency · partition / cluster strategy · cost-per-query · slot consumption · BI dashboard SLO.'],
      ['code-reviewer', 'dbt model review', 'Idempotent models · incremental safety · test coverage (not_null, unique, accepted_values) · lineage docs · contract enforcement.'],
    ],
    finalLine: 'Drop into any dbt / Spark / Snowflake / BigQuery repo.',
  },
  {
    slug: 'devtools',
    icon: '🛠️',
    name: 'Devtools',
    title: 'Ship developer tools <em>without</em> a supply-chain incident.',
    sub: 'Building <b>CLI plugins</b>, <b>IDE extensions</b>, or <b>dev SDKs</b>? GreatCTO auto-detects the devtools archetype and ships <b>OpenSSF Scorecard</b>, <b>SOC2 Type 2</b>, <b>signed releases</b>, and <b>telemetry-leak prevention</b> gates from day one.',
    compliance: ['openssf', 'soc2-type-2', 'gdpr'],
    detected: '<code class="inline-code">package.json</code> + <code class="inline-code">.github/workflows/release.yml</code>',
    title2: 'The 5 devtools bugs that <em>poison ecosystems</em>.',
    before: [
      'Release pipeline unsigned — typosquat replaces it',
      'Telemetry sends repo paths · GitHub usernames',
      'Auto-update without provenance · malicious update',
      'OpenSSF Scorecard < 5 — corp blocklists you',
      'Crash reports include full source files',
      '<b>One bad release · 100k devs compromised.</b>',
    ],
    after: [
      'Sigstore + provenance on every release',
      'Telemetry: opt-in, anonymous UUID only · no PII',
      'Auto-update verifies signature before install',
      'OpenSSF Scorecard ≥ 7 enforced at gate:ship',
      'Crash reports redacted · path-stripped · stack-only',
      '<b>Trustworthy · enterprise-blessed · no supply chain.</b>',
    ],
    agents: [
      ['security-officer', 'Supply chain', 'Sigstore signing · SLSA Level 3 · provenance · Dependabot · OpenSSF Scorecard ≥ 7 · npm provenance · pinned actions in CI.'],
      ['code-reviewer', 'Telemetry hygiene', 'No paths · no usernames · no source · opt-in default · revocable consent · GDPR-compliant identifiers (UUID, no IP).'],
      ['qa-engineer', 'Cross-version matrix', 'Backward compat to last 3 majors · Node 18/20/22 · Python 3.10/3.11/3.12 · IDE: VS Code current+1, JetBrains current+1.'],
      ['senior-dev', 'Reproducible builds', 'Locked dependencies · pinned actions · deterministic build outputs · binary diff verification on releases.'],
    ],
    finalLine: 'Drop into any CLI plugin / IDE extension / SDK repo.',
  },
  {
    slug: 'iot-embedded',
    icon: '📡',
    name: 'IoT / embedded',
    title: 'Ship firmware <em>that doesn\'t</em> fail ETSI EN 303 645.',
    sub: 'Building with <b>Zephyr</b>, <b>ESP-IDF</b>, <b>FreeRTOS</b>, or <b>embassy (Rust)</b>? GreatCTO auto-detects the iot-embedded archetype and ships <b>OTA update strategy</b>, <b>secure boot validation</b>, <b>watchdog patterns</b>, <b>power profiling</b>, and <b>ETSI EN 303 645</b> gates from day one.',
    compliance: ['iso27001', 'etsi-en-303-645', 'cra'],
    detected: '<code class="inline-code">CMakeLists.txt</code> + <code class="inline-code">prj.conf</code> (Zephyr) / <code class="inline-code">sdkconfig</code> (ESP-IDF)',
    title2: 'The 5 firmware bugs that <em>brick fleets</em>.',
    before: [
      'OTA without rollback — bad update bricks 50k devices',
      'Secure boot disabled in prod — root via UART',
      'No watchdog — silent hang, MTBF 3 days',
      'Default password "admin/admin" — Mirai botnet',
      'Power profile never measured — battery dies in 2hr',
      '<b>Recall · CE mark suspended · brand dead.</b>',
    ],
    after: [
      'firmware-reviewer enforces A/B partitions + rollback',
      'Secure boot mandatory at gate:ship · keys in HSM',
      'Watchdog config audited · hang-detection tested',
      'Per-device unique creds · no default passwords',
      'Power profile measured at gate:ship · budget enforced',
      '<b>ETSI EN 303 645-clean · CRA-ready · MTBF 5+ years.</b>',
    ],
    agents: [
      ['firmware-reviewer', 'OTA + secure boot', 'OTA update strategy (A/B partitions, rollback) · ETSI EN 303 645 compliance · secure boot validation · hardware-in-the-loop test design · power profiling · watchdog patterns · RTOS-specific patterns.'],
      ['security-officer', 'EU CRA + ETSI', 'EU Cyber Resilience Act · ETSI EN 303 645 (consumer IoT) · default-password ban · vulnerability disclosure · SBOM at gate:ship.'],
      ['qa-engineer', 'HIL test design', 'Hardware-in-the-loop test rigs · environmental stress (temp, vibration) · power-cycle endurance · OTA storm test · field-recovery scenarios.'],
      ['performance-engineer', 'Power + memory budget', 'Active / sleep / deep-sleep profiles · RAM / flash budget · BLE / Wi-Fi / LoRa range tests · battery-life projection.'],
    ],
    finalLine: 'Drop into any Zephyr / ESP-IDF / FreeRTOS / embassy repo.',
  },
  {
    slug: 'infra',
    icon: '☁️',
    name: 'Infrastructure',
    title: 'Ship infra-as-code <em>without</em> the public-S3 incident.',
    sub: 'Building with <b>Terraform</b>, <b>Pulumi</b>, <b>Helm</b>, or <b>AWS CDK</b>? GreatCTO auto-detects the infra archetype and ships <b>SOC2 controls</b>, <b>drift detection</b>, <b>IAM least-privilege</b>, and <b>migration-rollback</b> gates from day one.',
    compliance: ['soc2', 'cis-benchmarks'],
    detected: '<code class="inline-code">main.tf</code> / <code class="inline-code">Pulumi.yaml</code> / <code class="inline-code">Chart.yaml</code>',
    title2: 'The 5 infra bugs that <em>make news</em>.',
    before: [
      'S3 bucket public — 200M records on HaveIBeenPwned',
      'IAM AdministratorAccess on CI role · root-equivalent',
      'No drift detection — manual changes break terraform plan',
      'Migration without rollback — schema lock for 6 hours',
      'Helm upgrade fails mid-rollout — half the fleet broken',
      '<b>Outage · breach · TechCrunch headline.</b>',
    ],
    after: [
      'tfsec / checkov gate · public-S3 blocked at PR',
      'IAM least-privilege via Access Analyzer + iamlive',
      'Drift detection in CI · alerts on manual changes',
      'db-migration-reviewer signs off rollback path',
      'Helm: canary + automatic rollback on probe failure',
      '<b>SOC2 Type 2-clean · zero outages from infra.</b>',
    ],
    agents: [
      ['security-officer', 'SOC2 + CIS', 'CIS AWS / GCP / Azure benchmarks · SOC2 Type 2 controls · tfsec · checkov · IAM least-privilege · KMS rotation · CloudTrail enforced.'],
      ['db-migration-reviewer', 'Migration safety', 'Lock duration · rollback strategy · zero-downtime patterns · PII column handling · index creation safety. Blocks deploy if no rollback path exists.'],
      ['devops', 'Canary + rollback', 'Canary 5% → 20% → 100% · health probes · automatic rollback · GitOps reconciliation · drift alerts.'],
      ['performance-engineer', 'Capacity planning', 'Right-sizing · auto-scaling thresholds · cost-per-request · ASG / HPA tuning · spot vs on-demand mix.'],
    ],
    finalLine: 'Drop into any Terraform / Pulumi / Helm / CDK repo.',
  },
  {
    slug: 'enterprise-saas',
    icon: '🏢',
    name: 'Enterprise SaaS',
    title: 'Sell to enterprises <em>without</em> the cross-tenant breach.',
    sub: 'Building <b>multi-tenant B2B SaaS</b>? GreatCTO auto-detects the enterprise-saas archetype and ships <b>tenant isolation</b> (RLS / schema-per-tenant), <b>SSO + SCIM</b> (Okta / Azure AD / WorkOS), <b>immutable audit log</b>, <b>data residency</b>, and <b>SOC2 Type 2</b> gates from day one.',
    compliance: ['soc2-type-2', 'iso27001', 'gdpr', 'ccpa'],
    detected: '<code class="inline-code">workos</code> / <code class="inline-code">samlify</code> / <code class="inline-code">@scim2/core</code>',
    title2: 'The 5 enterprise-SaaS bugs that <em>kill deals</em>.',
    before: [
      'Cross-tenant query leaks customer A data to customer B — auditor finds in week 1',
      'No SSO support — every enterprise prospect stalls at security review',
      'Audit log mutable in app DB — SOC2 CC7 fail',
      'No data residency option — EU customers churn after Schrems II',
      'Tier downgrade deletes data — paying customers lose trust',
      '<b>One incident · 6-month SOC2 re-audit · enterprise pipeline frozen.</b>',
    ],
    after: [
      'enterprise-saas-reviewer enforces RLS on every PII table',
      'WorkOS / SAML + SCIM at gate:ship for enterprise tier',
      'Audit log → S3 Object Lock immutable + customer-exportable',
      'Per-tenant region pinning · EU + US write paths separated',
      'Tier downgrade preserves data 90d · Stripe metered reconciliation daily',
      '<b>Enterprise-ready from week 1 · SOC2 Type 2-clean.</b>',
    ],
    agents: [
      ['enterprise-saas-reviewer', 'Tenant isolation + SSO', 'Row-level / schema-per-tenant / DB-per-tenant decision · Postgres RLS policies · SAML 2.0 + OIDC + SCIM · per-tenant IdP config · admin-impersonation audit trail · per-tenant rate limits.'],
      ['security-officer', 'SOC2 Type 2 controls', 'CC6.1 access control · CC7 system monitoring · CC8 change management · CC9 risk mitigation. Audit-log signing + retention. Vulnerability disclosure process.'],
      ['db-migration-reviewer', 'RLS-safe schema changes', 'Tenant-key migration safety · default-deny RLS policies · backfill safety · index strategy for multi-tenant queries · zero-downtime patterns.'],
      ['regulated-reviewer', 'GDPR + CCPA + DPA', 'Data Processing Agreements ready · sub-processors list maintained · GDPR Art. 17 erasure SLA · CCPA right-to-know + delete · ISO27001 SoA gap analysis.'],
    ],
    finalLine: 'Drop into any B2B SaaS / multi-tenant Next.js / Django / Rails repo.',
  },
  {
    slug: 'mlops',
    icon: '🧪',
    name: 'MLOps',
    title: 'Train your own models <em>without</em> $50k surprise GPU bills.',
    sub: 'Building with <b>PyTorch</b>, <b>TensorFlow</b>, <b>Ray</b>, <b>MLflow</b>, <b>W&B</b>, or <b>Kubeflow</b>? GreatCTO auto-detects the mlops archetype and ships <b>dataset versioning</b> (DVC / LakeFS), <b>training cost budgets</b>, <b>drift detection</b>, <b>bias / fairness audit</b>, <b>shadow + canary serving</b>, and <b>EU AI Act high-risk</b> gates from day one.',
    compliance: ['eu-ai-act', 'nist-ai-rmf', 'iso42001'],
    detected: '<code class="inline-code">mlflow</code> + <code class="inline-code">torch</code> + <code class="inline-code">dvc</code>',
    title2: 'The 5 MLOps bugs that <em>silently corrupt prod</em>.',
    before: [
      'Training run not reproducible — can\'t roll back to last good model',
      'GPU run costs $50k — discovered on the cloud bill',
      'Feature drift undetected for 6 weeks — accuracy down 12%',
      'No fairness audit — disparate impact lawsuit on hiring model',
      'No shadow mode — first deploy causes p99 latency 10× regression',
      '<b>Silent regression · invisible cost · regulator letter.</b>',
    ],
    after: [
      'mlops-reviewer pins dataset version + code commit on every run',
      'Hard cost cap + checkpoint cadence + early stopping',
      'Evidently / WhyLabs drift detector + alerting at PSI > 0.2',
      'Fairness audit at promotion · 4/5 rule disparate impact bound',
      'Shadow → canary → full · single-command rollback tested',
      '<b>Reproducible · cost-bounded · drift-monitored · audit-ready.</b>',
    ],
    agents: [
      ['mlops-reviewer', 'Training + serving lifecycle', 'Dataset lineage (DVC / LakeFS) · cost budget enforcement · MLflow / W&B model registry · drift detection wired · bias audit per protected attribute · shadow → canary serving · EU AI Act risk tier classification.'],
      ['ai-eval-engineer', 'Golden-set regression', 'tests/eval/EVAL-*.md golden scenarios · accuracy + F1 + per-cohort breakdown · cost-per-eval · cross-model comparison.'],
      ['ai-security-reviewer', 'Model security', 'Prompt injection (if LLM fine-tune) · model extraction · membership inference · adversarial robustness · supply chain (pretrained model provenance).'],
      ['data-platform-reviewer', 'Training data PII', 'PII classification on training data · GDPR Art. 17 erasure → retrain trigger · sub-processor docs · cross-border transfer compliance.'],
    ],
    finalLine: 'Drop into any PyTorch / TensorFlow / Ray / Kubeflow repo.',
  },
  {
    slug: 'streaming',
    icon: '⚡',
    name: 'Streaming',
    title: 'Process events at p99 < 1s <em>without</em> the duplicate-charge incident.',
    sub: 'Building with <b>Kafka</b>, <b>Kinesis</b>, <b>Pulsar</b>, <b>Flink</b>, <b>Beam</b>, or <b>Debezium CDC</b>? GreatCTO auto-detects the streaming archetype and ships <b>exactly-once semantics</b>, <b>idempotency proofs</b>, <b>backpressure strategy</b>, <b>DLQ + poison-message handling</b>, <b>schema evolution</b>, and <b>checkpoint storage</b> gates from day one.',
    compliance: ['gdpr', 'soc2-cc7'],
    detected: '<code class="inline-code">kafkajs</code> / <code class="inline-code">@confluentinc/kafka-javascript</code> / <code class="inline-code">debezium</code>',
    title2: 'The 5 streaming bugs that <em>page you at 4am</em>.',
    before: [
      'At-least-once consumer + non-idempotent sink → duplicate $400 charges',
      'No DLQ — poison message blocks topic for 6 hours',
      'Schema change deployed without registry — every consumer dies',
      'Backpressure unhandled — Kafka lag 2 days · users see stale data',
      'Stateful Flink job crashes — no checkpoint, lost state, manual replay',
      '<b>One bad event · all-hands incident · trust gone.</b>',
    ],
    after: [
      'streaming-reviewer enforces exactly-once on payment paths',
      'DLQ topic per consumer · retry+move policy · alert on rate spike',
      'Schema Registry with backward-compat enforced · breaking change procedure',
      'Lag alerting at 60s/5min · capacity tested in staging · replay tooling',
      'Checkpoint storage configured · savepoints before deploy · TTL on state',
      '<b>p99 < 1s · zero duplicate charges · zero data loss.</b>',
    ],
    agents: [
      ['streaming-reviewer', 'Delivery + ordering + DLQ', 'At-most-once / at-least-once / exactly-once decision · idempotency proof · partition-key strategy · backpressure mechanism · DLQ + poison-message handling · schema evolution · stateful checkpoint storage.'],
      ['performance-engineer', 'p99 latency budget', 'End-to-end p50 / p95 / p99 targets · tail-latency causes (GC, network, checkpoint pauses) · throughput capacity test · load test with realistic burst.'],
      ['data-platform-reviewer', 'Downstream warehouse load', 'Stream → batch handoff · GDPR retention in event store · CDC fidelity (snapshot + log-based replication) · OpenLineage event emission.'],
      ['security-officer', 'Event PII + audit', 'PII classification per event type · authorization on producer/consumer · audit log emission for regulated topics · encryption in flight (TLS) + at rest.'],
    ],
    finalLine: 'Drop into any Kafka / Kinesis / Pulsar / Flink / Beam repo.',
  },
  {
    slug: 'marketplace',
    icon: '🏪',
    name: 'Marketplace',
    title: 'Run a two-sided platform <em>without</em> an OFAC felony.',
    sub: 'Building <b>Uber-style / Etsy-style / B2B marketplace</b>? GreatCTO auto-detects the marketplace archetype and ships <b>Stripe Connect / Adyen MarketPay payouts</b>, <b>seller KYC</b> (Persona / Onfido / Sumsub), <b>OFAC sanctions screening</b>, <b>marketplace facilitator tax</b> (US Wayfair), <b>1099-K reporting</b>, <b>escrow + dispute mediation</b>, and <b>EU DSA + P2B</b> gates from day one.',
    compliance: ['pci-dss', 'kyc-aml', 'dsa-eu', '1099-k', 'ofac', 'wayfair'],
    detected: '<code class="inline-code">stripe-connect</code> + <code class="inline-code">persona</code> / <code class="inline-code">onfido</code>',
    title2: 'The 5 marketplace bugs that <em>land C-suite in court</em>.',
    before: [
      'Payout to unscreened seller — OFAC violation · officer liability',
      'No KYC at $10k threshold — FinCEN audit · fines',
      'Marketplace tax not collected in 45 states — Wayfair audit · back taxes',
      '1099-K not issued — IRS penalties · seller class action',
      'Funds commingled with operating capital — ‘not in trust\' lawsuit',
      '<b>Felony exposure · audit storm · platform shutdown.</b>',
    ],
    after: [
      'marketplace-reviewer enforces Persona KYC before first listing',
      'OFAC + EU CFSP + UK HMT screening at signup + quarterly',
      'Stripe Tax / Avalara per-state nexus · automated remittance',
      '1099-K issued by Jan 31 · W-9 collected · TIN matching',
      'Funds in PSP balance · escrow with hold-and-release · dispute freeze',
      '<b>Compliant in 50 states + EU + UK · audit-defensible.</b>',
    ],
    agents: [
      ['marketplace-reviewer', 'Two-sided payouts + KYC', 'Stripe Connect / Adyen MarketPay decision · seller KYC + KYB · OFAC + sanctions screening · marketplace facilitator tax · 1099-K · escrow / hold-and-release · dispute mediation · two-sided fee model · DSA / P2B compliance.'],
      ['pci-reviewer', 'Buyer-side payments', 'PCI-DSS scope · idempotency on charges · webhook signature · refund / dispute flow · SCA / PSD2 · PSP failover.'],
      ['regulated-reviewer', 'EU DSA + P2B', 'Article 16 notice-and-action · trader traceability · transparency report (VLOP) · P2B 15-day terms-change notice · ranking transparency · suspension explanation + appeal.'],
      ['security-officer', 'OFAC + abuse + fraud', 'Sanctions screening pipeline · fraud detection · review moderation · counterfeit detection · CSAM hash + NCMEC reporting (if image/video listings).'],
    ],
    finalLine: 'Drop into any Stripe Connect / Adyen MarketPay / two-sided platform.',
  },
  {
    slug: 'cms',
    icon: '📰',
    name: 'CMS / content',
    title: 'Publish content <em>without</em> losing 30% of organic traffic.',
    sub: 'Building with <b>Sanity</b>, <b>Contentful</b>, <b>Strapi</b>, <b>Payload</b>, <b>Ghost</b>, <b>Gatsby</b>, or <b>Eleventy</b>? GreatCTO auto-detects the cms archetype and ships <b>schema.org structured data</b>, <b>Core Web Vitals</b> (LCP / INP / CLS), <b>DMCA workflow</b>, <b>UGC moderation</b> (CSAM + NCMEC), <b>image pipeline</b> (AVIF / WebP / responsive), <b>SEO hygiene</b>, and <b>WCAG 2.2 AA</b> gates from day one.',
    compliance: ['dmca', 'wcag-2.2-aa', 'gdpr', 'dsa-eu'],
    detected: '<code class="inline-code">@sanity/client</code> / <code class="inline-code">contentful</code> / <code class="inline-code">@payloadcms/payload</code>',
    title2: 'The 5 CMS bugs that <em>tank rankings + invite lawsuits</em>.',
    before: [
      'No schema.org JSON-LD — Google rich snippets miss · 30% organic loss',
      'LCP > 4s on article template — Core Web Vitals fail · ranking drop',
      'No CSAM detection on image upload — federal liability (18 USC § 2258A)',
      'DMCA agent unregistered — §512 safe harbor void · publisher liability',
      'WCAG 2.2 fails on form / video — ADA Title III lawsuit',
      '<b>Traffic crash · DOJ letter · DMCA storm.</b>',
    ],
    after: [
      'cms-reviewer enforces JSON-LD per content type · validated in CI',
      'Lighthouse CI gate: LCP < 2.5s / INP < 200ms / CLS < 0.1',
      'PhotoDNA on every image · NCMEC CyberTipline reporting flow',
      'DMCA agent registered · notice-and-action · repeat-infringer policy',
      'axe-core in CI · captions for video · alt-text linter on schema',
      '<b>Top SEO discipline · safe-harbored · accessible · audit-clean.</b>',
    ],
    agents: [
      ['cms-reviewer', 'SEO + DMCA + UGC + a11y', 'Schema.org coverage per content type · Core Web Vitals budget · DMCA registered agent + notice-and-action · UGC moderation (CSAM hash + NCMEC + spam + hate-speech) · image / video pipeline · SEO hygiene · WCAG 2.2 AA · EU DSA Article 16.'],
      ['performance-engineer', 'CWV + capacity', 'LCP / INP / CLS budgets · CDN cache rules · image format negotiation · responsive srcset · lazy-loading · CrUX dashboard · RUM on top routes.'],
      ['security-officer', 'UGC abuse + auth', 'Upload validation · EXIF strip · spam classifier · hate-speech detection · banned-user enforcement (IP + email + device fingerprint) · session security.'],
      ['data-platform-reviewer', 'Analytics PII', 'Comment / review PII classification · GDPR consent · cookie banner · analytics SDK opt-in · cross-border for EU readers.'],
    ],
    finalLine: 'Drop into any Sanity / Contentful / Strapi / Payload / Ghost / Gatsby site.',
  },
  {
    slug: 'regulated',
    icon: '🛡️',
    name: 'Regulated',
    title: 'Ship in regulated industries <em>without</em> the Big-4 retainer.',
    sub: 'Building under <b>HIPAA</b>, <b>SOX</b>, <b>GDPR</b>, <b>DORA</b>, or <b>NIS2</b>? GreatCTO auto-detects the regulated archetype and ships <b>SOC2</b>, <b>HIPAA PHI handling + BAA</b>, <b>SOX ITGC</b>, <b>DORA Article 16</b>, and <b>NIS2 Article 21</b> gates from day one.',
    compliance: ['soc2', 'hipaa', 'sox', 'dora', 'nis2', 'iso27001'],
    detected: 'PROJECT.md flag <code class="inline-code">archetype: regulated</code> or <code class="inline-code">compliance: [hipaa, sox]</code>',
    title2: 'The 5 regulated-industry bugs that <em>cost audits</em>.',
    before: [
      'PHI in application logs — HIPAA breach notification',
      'SOX SoD violated — same engineer codes + deploys',
      'DORA Article 16 ICT incident process missing',
      'NIS2 Article 21 controls absent — €10M fine risk',
      'ISO27001 SoA stale 18 months — re-certification denied',
      '<b>$500k+ fine · auditor leaves · re-cert delay.</b>',
    ],
    after: [
      'regulated-reviewer covers HIPAA PHI + BAA at gate',
      'SoD enforced via CI: separate review + deploy roles',
      'DORA Article 16 incident playbook + drill schedule',
      'NIS2 Article 21 controls auto-mapped to PRs',
      'ISO27001 SoA re-validated at every dependency bump',
      '<b>Audit-ready continuously · no Big-4 retainer.</b>',
    ],
    agents: [
      ['regulated-reviewer', 'DORA + NIS2 + ISO27001', 'DORA ICT risk (Articles 5 & 16) · NIS2 Article 21 controls · ISO27001 SoA gap analysis · SOX ITGC (access control, change management, SoD) · HIPAA PHI handling + BAA requirements.'],
      ['security-officer', 'Continuous compliance', 'Every commit checked against active framework. SBOM generated. Vulnerability disclosure process. Breach notification readiness.'],
      ['db-migration-reviewer', 'Audit-safe migrations', 'PII column handling · access logs · retention enforcement · rollback path mandatory · change ticket linked.'],
      ['senior-dev', 'Audit trail', 'Every gate approval written to ~/.great_cto/decisions.md — append-only ADR log, queryable across projects, auditor-ready.'],
    ],
    finalLine: 'Drop into any regulated-industry repo.',
  },
  {
    slug: 'edtech',
    icon: '🎓',
    name: 'Edtech',
    title: 'Ship K-12 / classroom tooling <em>without</em> the FTC fine.',
    sub: 'Building with <b>Canvas LMS</b>, <b>Moodle</b>, <b>LTI</b>, <b>SCORM</b>, or targeting <b>K-12</b> students? GreatCTO auto-detects the edtech archetype and ships <b>COPPA verifiable parental consent</b>, <b>FERPA student-data handling</b>, <b>GDPR-K age detection</b>, <b>WCAG 2.2 AA + Section 508</b>, and <b>state student-privacy</b> (SOPIPA-CA, NY 2-D) gates from day one.',
    compliance: ['coppa', 'ferpa', 'gdpr-k', 'wcag-2.2-aa', 'section-508', 'sopipa-ca'],
    detected: '<code class="inline-code">canvas-lms</code> + <code class="inline-code">lti</code> or README mentions <code class="inline-code">k-12</code> / <code class="inline-code">student</code>',
    title2: 'The 5 edtech bugs that <em>cost FTC fines</em>.',
    before: [
      'Checkbox-only "I am 13+" — COPPA $50k per violation',
      'Student data sold to ad networks — FERPA + 30+ states violated',
      'GDPR-K assumed 13 globally — banned in DE/NL (16)',
      'Drag-drop without keyboard alt — Section 508 fail, no fed funding',
      'No CSAM hash on UGC — federal reporting obligation missed',
      '<b>FTC settlement · school contracts pulled · App Store reject.</b>',
    ],
    after: [
      'edtech-reviewer enforces verifiable parental consent (FTC-approved methods)',
      'FERPA-compliant data handling — school-official contract template',
      'Geo-detect age threshold per GDPR-K member-state (13/14/15/16)',
      'WCAG 2.2 AA automated check + manual VPAT prep',
      'CSAM hash + NCMEC reporting wired in by default',
      '<b>0-day-1 audit-ready, sellable to public schools.</b>',
    ],
    agents: [
      ['edtech-reviewer', 'COPPA + FERPA + WCAG + state', 'COPPA verifiable parental consent (5 FTC-approved methods) · FERPA school-official contract analysis · GDPR-K geo-detection · WCAG 2.2 AA criteria · SOPIPA-CA / NY 2-D state laws.'],
      ['security-officer', 'Child-safety + UGC', 'CSAM hash matching (PhotoDNA / NCMEC) · grooming detection · age-verification flows · uploaded-content moderation · session security.'],
      ['data-platform-reviewer', 'Student-data minimization', 'Under-13 data minimization · no behavioral ads · no third-party tracking · educational-purpose-only data flows · subprocessor DPAs.'],
      ['ai-security-reviewer', 'AI in edtech', 'If AI-tutoring / AI-grading: explainability for parents · bias audit on diverse student populations · data-residency for EU schools.'],
    ],
    finalLine: 'Drop into any K-12 / LMS / classroom-tooling repo.',
  },
  {
    slug: 'gov-public',
    icon: '🏛️',
    name: 'Government & Civic Tech',
    title: 'Ship to federal / state agencies <em>without</em> a 2-year ATO.',
    sub: 'Building with <b>login.gov</b>, <b>USWDS</b>, <b>gov.uk Design System</b>, or targeting <b>FedRAMP</b> / <b>StateRAMP</b>? GreatCTO auto-detects the gov-public archetype and ships <b>FedRAMP boundary scoping</b>, <b>NIST 800-53 Rev 5</b> control mapping, <b>FISMA</b> compliance, <b>Section 508</b> accessibility, and <b>PIA</b> generation from day one.',
    compliance: ['fedramp', 'nist-800-53', 'fisma', 'section-508', 'pia', 'ato', 'cjis', 'stateramp'],
    detected: '<code class="inline-code">login-gov-sdk</code> + <code class="inline-code">uswds</code> or README mentions <code class="inline-code">fedramp</code> / <code class="inline-code">government</code>',
    title2: 'The 5 gov-tech bugs that <em>kill ATO</em>.',
    before: [
      'FedRAMP scope too broad — every component in boundary, $2M ATO',
      'Audit logs not immutable — AU-9 fails, ATO denied',
      'IA-2 MFA via SMS — not phishing-resistant, FIPS 140 fails',
      'Section 508 manual VPAT first time — agency procurement stops',
      'PIA missing — E-Government Act 208 violated',
      '<b>ATO denied · $2M+ wasted · contract evaporates.</b>',
    ],
    after: [
      'gov-reviewer scopes FedRAMP boundary — push compliance-light OUT',
      'NIST 800-53 controls auto-mapped to architecture decisions',
      'AU-9 immutability via WORM storage / cryptographic chain',
      'IA-2(11) phishing-resistant MFA: FIDO2 / PIV / CAC required',
      'WCAG 2.2 AA in CI + structured VPAT input ready',
      '<b>ATO in 6 months instead of 18-24, $500k saved.</b>',
    ],
    agents: [
      ['gov-reviewer', 'FedRAMP + NIST + PIA + 508', 'FedRAMP authorization-boundary scoping · NIST 800-53 Rev 5 control mapping (Moderate / High / Tailored) · FISMA · Section 508 / WCAG 2.2 AA · PIA draft · CJIS for law-enforcement integrations · StateRAMP for state-level.'],
      ['security-officer', 'Continuous compliance', 'POA&M tracking · ConMon (continuous monitoring) automation · monthly vuln scans · annual assessment prep · NIST 800-53 control evidence collection.'],
      ['db-migration-reviewer', 'Audit-safe migrations', 'PII change tracking · access logs · retention enforcement · rollback path mandatory · change ticket linked to ATO POA&M.'],
      ['senior-dev', 'FIPS 140 cryptography', 'Validated crypto modules everywhere · MFA flows reviewed · audit log integrity proven · no plaintext fallback paths.'],
    ],
    finalLine: 'Drop into any federal / state / municipal tech repo.',
  },
  {
    slug: 'insurance',
    icon: '🛡️',
    name: 'Insurance / InsurTech',
    title: 'Ship insurance products <em>across 50 states</em> without filing burnout.',
    sub: 'Building with <b>ACORD standards</b>, <b>NAIC schemas</b>, <b>Guidewire</b>, <b>Duck Creek</b>, or doing P&C / life / health / reinsurance? GreatCTO auto-detects the insurance archetype and ships <b>NAIC 50-state filing matrix</b>, <b>Solvency II</b>, <b>IFRS 17</b>, <b>ASOP 41/56</b> actuarial audit, and <b>anti-discrimination pricing</b> analysis from day one.',
    compliance: ['naic', 'solvency-ii', 'ifrs-17', 'gdpr', 'ccpa', 'anti-discrimination-pricing', 'actuarial-asops', 'state-doi'],
    detected: '<code class="inline-code">acord-standards</code> + <code class="inline-code">naic-schemas</code> or README mentions <code class="inline-code">underwriting</code> / <code class="inline-code">premium</code> / <code class="inline-code">claim</code>',
    title2: 'The 5 insurance bugs that <em>kill at IPO due-diligence</em>.',
    before: [
      'Pricing model uses ZIP code — disparate-impact discrimination, CA bans',
      'Actuarial model not auditable — ASOP 56 violated, regulator pulls license',
      'NY in scope — 23 NYCRR 500 cybersecurity controls missing',
      'Solvency II SCR calc not reproducible — supervisor review fails',
      'Claims fraud detector — false-positive rate 30%, adjuster fatigue',
      '<b>State license suspended · IPO blocked · $10M fine.</b>',
    ],
    after: [
      'insurance-reviewer maps state-by-state filing matrix at gate',
      'ASOP 41/56 auditable model documentation auto-generated',
      'NYDFS 23 NYCRR 500 controls implemented in CI',
      'Solvency II SCR calc reproducible — versioned data + assumptions',
      'Disparate-impact analysis on every pricing model change',
      '<b>50-state-ready · audit-clean · IPO-due-diligence proof.</b>',
    ],
    agents: [
      ['insurance-reviewer', 'NAIC + Solvency + actuarial', 'NAIC 50-state filing matrix · Solvency II SCR/MCR · IFRS 17 contract measurement (GMM/PAA/VFA) · ACORD message validation · ASOP 41/56 model documentation · disparate-impact pricing analysis · bordereau reporting for reinsurance.'],
      ['regulated-reviewer', 'NYDFS + state cybersec', 'NY 23 NYCRR 500 specific controls · NAIC Cybersecurity Event Notification Model #672 (30+ states adopted) · DPA chains for cloud-deployed carriers.'],
      ['security-officer', 'Claims fraud + PII', 'Network analysis for claim rings · velocity checks · document forgery detection · NICB integration · PII handling for insureds + claimants.'],
      ['ai-security-reviewer', 'AI in pricing/claims', 'AI-driven underwriting auditability · explainability per consumer right · bias on protected classes · adverse-action notice generation when AI denies a claim or quote.'],
    ],
    finalLine: 'Drop into any P&C / life / health / reinsurance / MGA / TPA repo.',
  },
];

const tpl = (a) => {
  const desc = a.sub.replace(/<[^>]+>/g, '').slice(0, 158);
  const canonical = `https://greatcto.systems/for/${a.slug}.html`;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "GreatCTO", "item": "https://greatcto.systems/" },
      { "@type": "ListItem", "position": 2, "name": "Archetypes", "item": "https://greatcto.systems/#archetypes" },
      { "@type": "ListItem", "position": 3, "name": a.name, "item": canonical },
    ],
  };
  const techArticleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": `GreatCTO for ${a.name}`,
    "description": desc,
    "url": canonical,
    "image": "https://greatcto.systems/assets/og-board.png",
    "author": { "@type": "Organization", "name": "GreatCTO", "url": "https://greatcto.systems" },
    "publisher": { "@type": "Organization", "name": "GreatCTO", "url": "https://greatcto.systems" },
    "datePublished": "2026-05-04",
    "dateModified": "2026-05-14",
    "about": a.compliance.length ? a.compliance.map(c => ({ "@type": "Thing", "name": c })) : undefined,
    "keywords": [a.slug, a.name, "AI agents", "specialist reviewers", ...a.compliance].join(", "),
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>GreatCTO for ${a.name} — ${a.compliance.join(', ') || 'specialist agents + 12-angle review'}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0e0c" />
<meta name="description" content="${desc}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="GreatCTO" />
<meta property="og:title" content="GreatCTO for ${a.name}" />
<meta property="og:description" content="49 specialist agents · ${a.compliance.join(' · ') || 'TDD + 12-angle review'} · Free, MIT, runs locally." />
<meta property="og:image" content="https://greatcto.systems/assets/og-board.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="GreatCTO for ${a.name}" />
<meta name="twitter:description" content="49 specialist agents · ${a.compliance.join(' · ') || 'TDD + 12-angle review'}. Free, MIT, runs locally." />
<meta name="twitter:image" content="https://greatcto.systems/assets/og-board.png" />

<script type="application/ld+json">${JSON.stringify(techArticleSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

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
    <a href="/#vs" class="nav-link">vs Cursor</a>
    <a href="/#install" class="cta">Install</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-inner">
    <span class="hero-eyebrow">
      <span class="pulse"></span>
      ${a.icon} archetype: ${a.slug}
    </span>
    <h1>${a.title}</h1>
    <p class="sub">${a.sub}</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="/#install">$ npx great-cto init</a>
      <a class="btn btn-ghost" href="/" target="_self">Back to home ↗</a>
    </div>
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">What you avoid</div>
  <h2 class="h2">${a.title2}</h2>

  <div class="split">
    <div class="split-col before">
      <h3>Without GreatCTO</h3>
      <ul>
        ${a.before.map(b => `<li><span class="icon">☐</span><span>${b}</span></li>`).join('\n        ')}
      </ul>
    </div>
    <div class="split-col after">
      <h3>With GreatCTO</h3>
      <ul>
        ${a.after.map(b => `<li><span class="icon">✓</span><span>${b}</span></li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>

<section id="board" class="wrap">
  <div class="eyebrow">Auto-applied gates</div>
  <h2 class="h2">Detected: ${a.detected} →<br/><em>${a.slug} archetype.</em></h2>
  ${a.compliance.length ? `<p class="lede">Compliance auto-suggested: ${a.compliance.map(c => `<code class="inline-code">${c}</code>`).join(' · ')}. Specialist agents activated:</p>` : `<p class="lede">No regulatory compliance — but TDD, 12-angle review, security audit, and supply-chain hardening still apply:</p>`}

  <div class="how-grid">
    ${a.agents.map((ag, i) => `<div class="how-card">
      <div class="how-num">${String(i + 1).padStart(2, '0')} · ${ag[0]}</div>
      <h3>${ag[1]}</h3>
      <p>${ag[2]}</p>
    </div>`).join('\n    ')}
  </div>
</section>

${applicablePacksSection(a.slug)}

${companiesSection(a.slug)}

<section id="install" class="wrap">
  <div class="eyebrow">30 seconds</div>
  <h2 class="h2">${a.finalLine}</h2>
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
    <a href="/#archetypes">All archetypes</a>
    <a href="/companies.html">Companies</a>
    <a href="https://github.com/avelikiy/great_cto">GitHub</a>
    <a href="https://www.npmjs.com/package/great-cto">npm</a>
  </div>
</footer>

</body>
</html>
`;
};

for (const a of archetypes) {
  const out = join(__dirname, `${a.slug}.html`);
  writeFileSync(out, tpl(a), 'utf8');
  console.log(`✓ wrote ${a.slug}.html`);
}
console.log(`\nGenerated ${archetypes.length} archetype landing pages.`);
