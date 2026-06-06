# 26 archetypes auto-detected

[← back to README](../README.md)

Each archetype activates its own specialist agents and compliance checklists.

| Archetype | Default tier | Specialist agents auto-loaded | Compliance |
|---|---|---|---|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars-252.204-7012 · itar · ear · section-889 · fedramp |

## How detection works

1. `npx great-cto init` scans your repo (`package.json`, `pyproject.toml`, `Cargo.toml`, infrastructure files, source tree shape).
2. Heuristic confidence score determines fit. If `>= 0.85`, archetype is set automatically.
3. If `< 0.85` and `ANTHROPIC_API_KEY` is set, an Anthropic Haiku second-opinion call (~$0.001) confirms or overrides.
4. On any uncertainty, you're prompted to confirm.

## Override

```bash
npx great-cto init --archetype <name>            # explicit at install
echo "archetype: enterprise-saas" >> .great_cto/PROJECT.md  # edit anytime
npx great-cto init --no-llm                      # skip Haiku second-opinion
```

## Per-archetype landing pages

In-depth pages on what each archetype gets and why:

- [agent-product](https://greatcto.systems/for/agent-product)
- [fintech](https://greatcto.systems/for/fintech)
- [healthcare](https://greatcto.systems/for/healthcare)

## Domain packs (v2.8 — overlay reviewers)

10 packs ride **on top of** archetypes. CLI detects pack-specific signals (deps, README terms) — packs add their own reviewer(s), threat-model template, EVAL suite, and human gates.

| Pack | Triggers | Reviewers | Gates |
|---|---|---|---|
| voice-pack | twilio · livekit · deepgram · elevenlabs · ivr · tts/stt | voice-ai-reviewer | gate:voice-compliance |
| clinical-pack | EHR · PHI · SaMD · CDS · scribe · telehealth-AI | ai-clinical · fda | gate:samd-class · gate:clinical-validation · gate:ide-approval |
| hr-ai-pack | recruit · hiring · resume · ats · AEDT | hr-ai | gate:aedt-audit |
| api-platform-pack | OpenAPI · GraphQL · webhook · developer portal | api-platform | gate:api-contract |
| lending-pack | plaid · loan · BNPL · FCRA · NMLS | lending-credit | gate:fair-lending |
| clinical-trials-pack | FHIR · HL7 · DICOM · CTMS · EDC · eConsent · CDISC | clinical-trials · bio-data | gate:irb-ready · gate:part11-validation · gate:deidentification |
| robotics-pack | ROS 2 · MoveIt · cobot · surgical robot · drone | robotics-safety | gate:hara-signoff · gate:functional-safety-test |
| em-fintech-pack | India · Nigeria · Brazil · UPI · PIX · M-Pesa · RBI · CBN | em-fintech | gate:license-strategy |
| climate-pack | GHG · Scope 1-3 · Verra · CBAM · DURC · IGSC | climate-mrv · biosecurity | gate:mrv-methodology · gate:durc-signoff · gate:open-weights-release |
| drug-discovery-pack | ChEMBL · AlphaFold · LIMS · SiLA2 · GLP | drug-discovery-ml · GLP · lab-automation | gate:model-card-signoff · gate:csv-validation · gate:iq-oq-pq |

→ 15 new reviewer agents · 38 EVAL templates · 19 new human-gate types.
Full overlay matrix + activation logic: [skills/great_cto/ARCHETYPES.md](../skills/great_cto/ARCHETYPES.md#domain-overlays-wave-1-3-specialised-reviewers).

## Adding a new archetype

Open a [Discussion](https://github.com/avelikiy/great_cto/discussions/categories/archetype-proposals) with:

- Stack signature (filenames, package patterns)
- Compliance frameworks that apply
- 1-2 reviewer agents you'd want auto-loaded

If accepted, the archetype lands in the next minor.
