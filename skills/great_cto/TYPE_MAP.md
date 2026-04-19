# Type → Archetype Mapping

> Every specific type resolves to an archetype + default parameters.
> `/start` detects the specific type using keywords (below), then resolves via mapping table.
> Agents read `archetype:` from PROJECT.md — not the specific type.

## Type Detection Keywords

`/start` scores CTO's description against these keyword lists to pick the primary type.

| Keywords | Type |
|----------|------|
| web, fullstack, Next.js, React+backend | `web-fullstack` |
| SPA, single page, Vite, Vue, Angular | `spa-frontend` |
| SSR, Remix, Nuxt, Astro | `ssr-app` |
| static site, Hugo, Gatsby, 11ty, landing page | `static-site` |
| docs, Docusaurus, MkDocs, VitePress | `docs-site` |
| REST API, FastAPI, Express, backend service, HTTP API | `rest-api` |
| GraphQL, Apollo, Hasura, subscriptions | `graphql-api` |
| gRPC, protobuf, RPC | `grpc-service` |
| serverless, Lambda, Cloudflare Workers, edge function | `serverless` |
| microservices, service mesh, Istio, distributed system | `microservices` |
| mobile, iOS, Android, React Native, Flutter app, Swift | `mobile` |
| desktop app, Tauri, WPF, native desktop (not Electron) | `desktop-app` |
| browser extension, Chrome ext, Firefox addon | `browser-extension` |
| VS Code extension, IDE plugin, LSP | `vscode-extension` |
| Electron, cross-platform desktop, Electron+Angular | `electron-app` |
| ML training, PyTorch, fine-tune, model training | `ml-training` |
| inference, ML serving, prediction API, TensorRT | `ml-serving` |
| ETL, Airflow, Spark, data ingestion, pipeline | `data-pipeline` |
| dashboard, D3, Plotly, charts, data visualization | `data-visualization` |
| AI agent, LangChain, autonomous agent, multi-agent | `ai-agent` |
| RAG, retrieval, vector DB, embeddings, semantic search | `rag-system` |
| Terraform, Pulumi, IaC, cloud infra, infrastructure as code | `infra-iac` |
| GitHub Actions, CI/CD tool, workflow automation, DevOps tool | `devops-tool` |
| migration, schema change, Flyway, Alembic, database migration | `db-migration` |
| monorepo, Turborepo, Nx, workspace, pnpm workspace | `monorepo` |
| K8s operator, CRD, Kubebuilder, controller | `k8s-operator` |
| Solidity, smart contract, blockchain, EVM | `smart-contract` |
| trading bot, quant, backtest, algorithmic trading, exchange | `trading-bot` |
| DeFi, protocol, AMM, lending, yield, liquidity | `defi-protocol` |
| payment, Stripe, billing, PCI, checkout | `payment-service` |
| WebSocket, realtime, broadcast, presence, live updates | `realtime-system` |
| Kafka, RabbitMQ, message queue, NATS, pub/sub, event bus | `messaging-queue` |
| video, WebRTC, HLS, live streaming, media | `video-streaming` |
| SaaS, multi-tenant, subscription product, B2B platform | `saas-platform` |
| auth, OAuth, OIDC, SSO, identity provider, login | `auth-service` |
| e-commerce, shop, cart, Shopify, checkout flow | `e-commerce` |
| CMS, Strapi, Contentful, headless CMS | `cms-headless` |
| search, Elasticsearch, Meilisearch, full-text search | `search-service` |
| library, SDK, npm package, PyPI package, crate | `library-sdk` |
| CLI, command line tool, terminal tool | `cli-tool` |
| compiler, parser, AST, language implementation | `compiler-lang` |
| WordPress plugin, PHP plugin, WP extension | `wordpress-plugin` |
| embedded, firmware, IoT, RTOS, ESP32, microcontroller | `embedded-iot` |
| kernel driver, device driver, FPGA, ring-0 | `hardware-driver` |
| game, Unity, Unreal, Godot, game engine | `game` |
| evals, LLMOps, model registry, prompt regression | `llm-ops` |
| Snowflake, BigQuery, dbt, Redshift, data warehouse | `data-warehouse` |
| admin panel, internal tool, internal dashboard, Retool, Appsmith | `internal-tool` |
| push notifications, email service, SMS, SendGrid, transactional email | `notification-service` |
| IDP, Backstage, developer portal, golden path, platform engineering | `platform-engineering` |
| MCP server, model context protocol, tool server, Claude tool | `mcp-server` |
| stack migration, EOL upgrade, PHP upgrade, Node upgrade, Python 2 to 3, Angular migration, strangler fig, runtime EOL | `stack-migration` |
| large refactor, mass rename, architectural refactoring, >50 files, monolith decomposition, extract service, boundary refactor | `large-scale-refactor` |
| AI agent framework, LangGraph, CrewAI, AutoGen, multi-agent framework | `ai-agent-framework` |
| BFF, backend for frontend, API gateway per client, client-specific backend | `bff` |
| feature flags, LaunchDarkly, Unleash, flag service, feature toggles | `feature-flags-service` |
| Chrome extension MV3, Manifest V3, service worker extension, Chromium ext | `chrome-extension-mv3` |
| custody, MPC wallet, HSM wallet, cold storage, hot wallet, multi-sig wallet, key management, Fireblocks | `custody-wallet` |
| computer vision, image classification, object detection, segmentation, YOLO, OpenCV, Detectron2, OCR, image model | `computer-vision` |
| recommendation engine, collaborative filtering, content-based filtering, matrix factorization, RecSys, two-tower model, ranking model | `recommendation-engine` |
| feature store, Feast, Tecton, Hopsworks, feature registry, point-in-time, online/offline features, feature pipeline | `feature-store` |
| time series, forecasting, Prophet, N-BEATS, temporal fusion transformer, demand forecasting, anomaly in time series | `time-series-forecasting` |
| anomaly detection, fraud detection, outlier detection, log anomaly, AIOps, unsupervised detection, isolation forest | `anomaly-detection` |
| cross-chain bridge, lock-and-mint, light client, relayer, bridge validator, cross-chain messaging, LayerZero, Wormhole, Stargate | `bridge-protocol` |
| centralized exchange, CEX, spot trading, futures exchange, order book exchange, white-label exchange, trading platform | `cex-exchange` |
| critical infrastructure, NIS2, operator of essential services, OES, energy grid, water treatment, transport network, essential service | `critical-infrastructure` |
| DORA, digital operational resilience, financial entity, investment firm, credit institution, ICT risk management, MiFID firm | `financial-services` |
| GxP, 21 CFR Part 11, electronic records, electronic signatures, pharma, biotech, clinical trials, LIMS, ELN, MES, validated system | `gxp-system` |
| ISO 27001, ISMS, information security management system, Statement of Applicability, SoA, Annex A, ISMS scope | `iso27001-scope` |
| TISAX, automotive supplier, VDA ISA, BMW supplier, Mercedes supplier, Volkswagen supplier, prototype protection, AL1, AL2, AL3 | `automotive-supplier` |
| voice agent, voice AI, VAPI, ElevenLabs conversational, Retell AI, voice bot, telephony AI, real-time voice, call center AI | `voice-agent` |
| edge app, Cloudflare Workers, Deno Deploy, Vercel Edge, Fastly Compute, edge function, edge-first, edge runtime | `edge-app` |
| multimodal, vision + text, audio + text, GPT-4o app, Claude vision, Gemini multimodal, multi-modal AI, image understanding app | `multimodal-app` |

## Mapping Table

| Specific type | Archetype | Default params | Overrides |
|--------------|-----------|---------------|-----------|
| `rest-api` | `web-service` | compliance: [owasp-api] |  |
| `graphql-api` | `web-service` | compliance: [owasp-api], qa-extras: [depth-limit, complexity-limit] |  |
| `grpc-service` | `web-service` | compliance: [owasp-api] |  |
| `bff` | `web-service` | compliance: [owasp-api] |  |
| `web-fullstack` | `web-service` | compliance: [owasp, gdpr-cookie] |  |
| `spa-frontend` | `web-service` | compliance: [owasp, gdpr-cookie, csp] |  |
| `ssr-app` | `web-service` | compliance: [owasp, csp] |  |
| `static-site` | `web-service` |  | security-gate: no |
| `docs-site` | `web-service` |  | security-gate: no |
| `cms-headless` | `web-service` | compliance: [owasp] |  |
| `internal-tool` | `web-service` | compliance: [rbac] |  |
| `realtime-system` | `web-service` | performance-sla: p95 < 50ms |  |
| `notification-service` | `web-service` | compliance: [can-spam, gdpr, casl] |  |
| `messaging-queue` | `web-service` | qa-extras: [message-ordering, idempotency] |  |
| `search-service` | `web-service` | qa-extras: [relevance-eval] |  |
| `feature-flags-service` | `web-service` | qa-extras: [flag-consistency] |  |
| `microservices` | `web-service` | qa-extras: [contract-test] |  |
| `serverless` | `web-service` | qa-extras: [cold-start] |  |
| `mobile` | `mobile-app` | compliance: [owasp-masvs, att, play-api-34] |  |
| `electron-app` | `mobile-app` | compliance: [electron-security] |  |
| `desktop-app` | `mobile-app` |  |  |
| `browser-extension` | `mobile-app` | compliance: [csp] |  |
| `chrome-extension-mv3` | `mobile-app` | compliance: [csp, mv3-security] |  |
| `vscode-extension` | `mobile-app` |  |  |
| `ai-agent` | `ai-system` | compliance: [eu-ai-act] | security-gate: mandatory |
| `ai-agent-framework` | `ai-system` | compliance: [eu-ai-act] |  |
| `rag-system` | `ai-system` | compliance: [eu-ai-act], qa-extras: [retrieval-quality] |  |
| `mcp-server` | `ai-system` | qa-extras: [tool-injection, schema-enforcement] | security-gate: mandatory |
| `llm-ops` | `ai-system` | compliance: [eu-ai-act], qa-extras: [prompt-regression, cost-cap] |  |
| `ml-training` | `ai-system` | qa-extras: [bias-audit, data-poisoning, model-card] |  |
| `ml-serving` | `ai-system` | qa-extras: [drift-monitoring, model-card] |  |
| `computer-vision` | `ai-system` | qa-extras: [edge-compat, model-card, bias-audit] |  |
| `recommendation-engine` | `ai-system` | qa-extras: [popularity-bias, diversity, model-card] |  |
| `anomaly-detection` | `ai-system` | qa-extras: [false-positive-rate, threshold-justification] |  |
| `voice-agent` | `ai-system` | compliance: [tcpa, gdpr-biometric], qa-extras: [wer, ttfb, barge-in] | security-gate: mandatory |
| `multimodal-app` | `ai-system` | compliance: [eu-ai-act], qa-extras: [per-modality-accuracy, hallucination, cross-modal] | security-gate: mandatory |
| `data-pipeline` | `data-platform` |  |  |
| `data-warehouse` | `data-platform` | compliance: [pii-classification, data-lineage] |  |
| `data-visualization` | `data-platform` | qa-extras: [snapshot-regression] |  |
| `feature-store` | `data-platform` | qa-extras: [point-in-time, online-offline-consistency] |  |
| `time-series-forecasting` | `data-platform` | qa-extras: [backtest-validation] |  |
| `infra-iac` | `infra` | deploy-method: terraform, qa-extras: [checkov, tfsec] |  |
| `k8s-operator` | `infra` | deploy-method: helm, compliance: [cis-k8s] |  |
| `platform-engineering` | `infra` | deploy-method: terraform |  |
| `devops-tool` | `infra` |  |  |
| `db-migration` | `infra` | qa-extras: [rollback-dry-run, schema-diff] |  |
| `edge-app` | `infra` | qa-extras: [cold-start-50ms, bundle-1mb, no-nodejs-api, multi-region-latency] |  |
| `library-sdk` | `library` | compliance: [openssf], qa-extras: [semver, cross-version-compat] |  |
| `cli-tool` | `library` |  |  |
| `compiler-lang` | `library` | qa-extras: [cross-version-compat, benchmark-regression] |  |
| `wordpress-plugin` | `library` | compliance: [owasp] |  |
| `game` | `library` | qa-extras: [fps-benchmark, memory-profiling] |  |
| `e-commerce` | `commerce` | compliance: [pci-dss, owasp] | security-gate: mandatory |
| `payment-service` | `commerce` | compliance: [pci-dss, sox] | security-gate: mandatory, min-size: enterprise |
| `saas-platform` | `commerce` | compliance: [soc2] | security-gate: mandatory |
| `auth-service` | `commerce` | compliance: [owasp-auth] | security-gate: mandatory |
| `smart-contract` | `web3` |  | security-gate: mandatory |
| `defi-protocol` | `web3` | qa-extras: [formal-verification, flash-loan-sim] | security-gate: mandatory |
| `trading-bot` | `web3` | qa-extras: [kill-switch] | security-gate: mandatory |
| `custody-wallet` | `web3` | compliance: [fatf, ccss, ofac] | security-gate: mandatory, min-size: enterprise |
| `bridge-protocol` | `web3` | qa-extras: [formal-verification, economic-attack-sim] | security-gate: mandatory |
| `cex-exchange` | `web3` | compliance: [kyc-aml, fatf, ofac, pci-dss] | security-gate: mandatory, min-size: enterprise |
| `embedded-iot` | `iot-embedded` | compliance: [etsi-303-645] | security-gate: mandatory |
| `hardware-driver` | `iot-embedded` | qa-extras: [hil-test] |  |
| `critical-infrastructure` | `regulated` | compliance: [nis2] | security-gate: mandatory, min-size: enterprise |
| `financial-services` | `regulated` | compliance: [dora] | security-gate: mandatory, min-size: enterprise |
| `gxp-system` | `regulated` | compliance: [21cfr11] | security-gate: mandatory, min-size: enterprise |
| `iso27001-scope` | `regulated` | compliance: [iso27001] | security-gate: mandatory, min-size: enterprise |
| `automotive-supplier` | `regulated` | compliance: [tisax] | security-gate: mandatory, min-size: enterprise |
| `large-scale-refactor` | `web-service` | qa-extras: [snapshot-regression, dep-graph] | security-gate: no |
| `stack-migration` | `web-service` | qa-extras: [snapshot-regression, dual-runtime] | security-gate: no |
| `monorepo` | `web-service` | qa-extras: [affected-only-test] |  |
| `video-streaming` | `web-service` | qa-extras: [webrtc-security, cdn-latency] |  |

## How /start Uses This Table

1. `/start` detects specific type (e.g. `voice-agent`) using keyword matching
2. Looks up archetype in this table → `ai-system`
3. Merges default params from this table with any user overrides
4. Writes to PROJECT.md:
   ```yaml
   primary: voice-agent          # specific type (for reference)
   archetype: ai-system          # pipeline rules come from here
   compliance: [tcpa, gdpr-biometric]
   qa-extras: [wer, ttfb, barge-in]
   security-gate: mandatory
   ```
5. Agents read `archetype:` + params — not `primary:` — for all pipeline decisions

## When Type Is Not In This Table

If `/start` detects a type not listed here:
- Default archetype: `web-service`
- Default params: none
- `/start` warns: "Type `<type>` not in archetype map — defaulting to `web-service`. Run `/audit` to refine."
