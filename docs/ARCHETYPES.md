# 25 archetypes auto-detected

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

## Adding a new archetype

Open a [Discussion](https://github.com/avelikiy/great_cto/discussions/categories/archetype-proposals) with:

- Stack signature (filenames, package patterns)
- Compliance frameworks that apply
- 1-2 reviewer agents you'd want auto-loaded

If accepted, the archetype lands in the next minor.
