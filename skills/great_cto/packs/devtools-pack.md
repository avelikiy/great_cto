# DevTools Pack

> Extends `devtools` archetype with API-first design discipline, multi-language SDK quality, OpenAPI/GraphQL spec stability, docs-as-product principles, deprecation channels, and dev-relations basics for products where the user is another developer.
> Auto-loaded when `archetype: devtools` is detected in PROJECT.md.
> Also loaded explicitly via `packs: [devtools-pack]`.

## What is a "devtools" project (vs `library`, `infra`, `ai-system`)?

A `devtools` project is **a product whose primary user is a developer integrating it into their own product**. The interface is the API, SDK, or CLI — not a UI for end users.

The line between `library` and `devtools`:

- **`library`** = consumed as a dependency in a single language ecosystem (npm package, PyPI, crate). Linked at compile/build time. No backend.
- **`devtools`** = a product with a hosted API/service AND multiple language SDKs. Stripe, Vercel, Pinecone, LangSmith, Neon, Resend, Linear API, Clerk are devtools — not libraries.

The line between `devtools` and `infra`:

- **`infra`** = you operate the cluster / cloud account / pipeline for your own product
- **`devtools`** = you operate a service that other companies integrate into theirs

If you're unsure: ask "would a customer pay you per API call or per seat?" If yes → `devtools`.

## API-first design — the only non-negotiable

Your API is your product surface. It outlives your codebase, your team, sometimes your company.

### Spec is the source of truth

Pick one spec format and stick to it for the lifetime of the product:

| API style | Spec | Tools |
|-----------|------|-------|
| REST | **OpenAPI 3.1** | Spectral (lint), Stainless / openapi-generator (SDK), Redocly / Mintlify (docs) |
| GraphQL | **GraphQL SDL** + Federation if multi-team | gql.tada, Apollo Studio, schema-registry |
| gRPC | `.proto` files | buf (lint), buf push (registry) |
| AsyncAPI (events) | **AsyncAPI 3.0** | Studio + generator |
| MCP | MCP server schema | typescript-sdk / python-sdk |

The spec lives in git. Every change is reviewed. Spec drives:
- SDK code generation
- Documentation generation
- Mock servers for testing
- Contract tests against implementation

If your code is the source of truth and you generate the spec from code annotations — you've inverted the dependency. The spec leads.

### Lint the spec on every PR

Spectral rule examples that block bad API design at PR time:

```yaml
# .spectral.yaml
rules:
  operation-operationId-unique: error
  operation-tag-defined: error
  operation-description: warn
  no-script-tags-in-markdown: error
  oas3-schema: error
  paths-kebab-case:
    given: "$.paths.*~"
    then:
      function: pattern
      functionOptions:
        match: "^\\/([a-z0-9-_]+\\/?)*$"
  no-trailing-slash-in-paths:
    given: "$.paths.*~"
    then:
      function: pattern
      functionOptions:
        notMatch: "/$"
```

## Multi-language SDK quality

If you ship in multiple languages, **all of them are equally important**. The slowest SDK = your customer's first impression in that language.

| SDK | Generator | When |
|-----|-----------|------|
| TypeScript / JavaScript | **Stainless** (recommended), openapi-typescript-codegen | Always — Node + browser |
| Python | **Stainless**, openapi-python-client | Always — broadest LLM/data ML reach |
| Go | **oapi-codegen**, Stainless | Cloud-native, infra teams |
| Java / Kotlin | OpenAPI Generator | Enterprise + Android |
| Rust | progenitor (Oxide) | Niche but loud audience |
| Ruby | OpenAPI Generator | Rails-heavy customers |
| .NET / C# | NSwag / OpenAPI Generator | Enterprise Windows shops |
| Swift / iOS | OpenAPI Generator | iOS clients |

For new project: TS + Python from day 1, Go added when a customer demands it. Don't ship 7 SDKs of mediocre quality — ship 2 great ones.

### SDK quality checklist

Each SDK MUST:

- [ ] Match SDK version semver to API version (or pin explicitly)
- [ ] Idempotency keys on all state-changing methods
- [ ] Automatic retries with exponential backoff for 429 / 5xx
- [ ] Request signing if applicable (HMAC, JWT)
- [ ] Pagination iterator helpers (don't make customers write while loops)
- [ ] Native types for the language (TypedDict for Python, Pydantic models, structs for Go)
- [ ] Tested example code in README that can be copy-pasted as-is
- [ ] Types/stubs for IDE autocomplete (`.pyi` for Python, `.d.ts` for TS)
- [ ] Telemetry-free OR opt-in only with clear disclosure
- [ ] No transitive deps with critical CVEs (use `cargo audit` / `npm audit` / `pip-audit` in CI)

### Stainless specifically (recommended for new projects)

Generates production-grade SDKs from OpenAPI spec. Used by OpenAI, Anthropic, Cloudflare, Linear. Run on every spec change in CI. Caveat: paid product after free tier; openapi-generator is the OSS alternative if budget is a hard constraint.

## OpenAPI / GraphQL spec stability — versioning

Breaking changes in your API kill your customers' production builds. Strict rules:

### Major version = new path or new schema

Don't break `/v1`. Add `/v2`. Run both in parallel for at least 1 year.

```
/v1/users/{id}    → keep stable
/v2/users/{id}    → new shape, breaking changes
```

For GraphQL: use `@deprecated` directive + monitor field-level usage; remove only when 0 queries hit a field for 90+ days.

### Backward-compatible changes (allowed in MINOR)

- Adding optional fields to request body (server defaults)
- Adding fields to response body (clients ignore unknown)
- Adding new enum values (clients should `default` on unknown)
- Adding new endpoints
- Loosening validation (e.g. integer → string-or-integer)

### Breaking changes (always MAJOR)

- Removing a field from response
- Renaming a field
- Changing a field type (string → number)
- Removing an enum value
- Tightening validation
- Changing pagination scheme
- Changing error format

Run `openapi-diff` on every PR. Block merge if it reports breaking changes without a `/v2` path or explicit override comment.

## Docs as product

Your docs are the funnel. The first 90 seconds matter more than features.

### Structure

```
docs/
├── quickstart/                # 30-second to hello-world
│   ├── typescript.md
│   ├── python.md
│   └── curl.md
├── concepts/                  # mental model, NOT API reference
│   └── how-X-works.md
├── guides/                    # tasks: "how do I do Y?"
│   └── implement-webhooks.md
├── reference/                 # generated from OpenAPI / GraphQL spec
│   └── (auto-generated)
├── examples/                  # full runnable sample apps
│   └── (one folder per stack)
└── changelog/                 # API + SDK changelog
    └── 2026-Q1.md
```

### Tools

- **Mintlify** (paid, hosted, beautiful, used by Resend, Anthropic, Stripe) — default for new projects
- **Redocly** (OpenAPI-first, can self-host)
- **Docusaurus** + plugins (open-source, more work)
- **VitePress** + custom (lightweight, devs love it, but more DIY)
- **GitBook** (hosted, less dev-friendly)

### Quickstart rule

The quickstart MUST get someone from "I have your docs open" to "first API call succeeded" in **under 90 seconds**. If it takes longer:
- They might leave forever
- They will form negative impressions of every subsequent page

Test it on a fresh laptop with a stopwatch. If a senior engineer can't do it in 90s, fix the quickstart, not the engineer.

## Deprecation channels

When you remove things, customers find out. The question is whether they find out from your headers or from production breaking.

### Three-layer notification

1. **`Deprecation` HTTP header** — RFC 9745:
   ```
   Deprecation: @1735689600
   Sunset: Wed, 31 Dec 2026 23:59:59 GMT
   Link: <https://docs.example.com/migrations/v1-to-v2>; rel="deprecation"
   ```
2. **SDK warnings** — bump SDK MINOR with deprecation warnings (Python `DeprecationWarning`, TS `@deprecated` JSDoc)
3. **Email + dashboard banner** — tell users in Slack/email/in-app for at least 90 days before sunset

### Sunset timeline

- T-180d: announce deprecation, all 3 channels
- T-90d: increase warning frequency, contact major customers personally
- T-30d: red banner in dashboard, daily emails to top 10% of API consumers
- T-0: 410 Gone with `Sunset` header pointing to migration doc

For free-tier customers: shorter timeline acceptable (90d). For enterprise contracts: 12+ months minimum, contractually.

## Telemetry — opt-in, transparent, useful

If you want to know what customers actually use, ask. Don't sneak.

### What's OK (explicit opt-in)

- Anonymous usage metrics: which SDK methods called, response codes, error rates
- Performance: latency percentiles, throughput per customer
- Beta feature adoption: what % of users tried feature X

### What's NOT OK

- Sending request bodies (might contain PII)
- Sending response bodies (might contain PII)
- Sending stack traces with file paths (leaks user's directory structure)
- Sending env variables, hostnames, IP, user data
- Default-on with hidden disclosure in ToS

### Implementation

Default OFF. Provide a clear env var: `DISABLE_TELEMETRY=1` and a clear opt-in command in CLI: `your-cli telemetry enable`. Document what you collect in a single page: `https://docs.yourcompany.com/telemetry`.

## Pricing model decisions (impact on architecture)

Pricing model leaks into architecture. Decide early.

| Model | Architectural implication |
|-------|--------------------------|
| Per seat | User accounts + roles + auth, billing per workspace |
| Per API call (usage-based) | Real-time metering, accurate counting, daily aggregation, caps to prevent surprise bills |
| Per resolution / outcome | Define "success" metric in contract; outcome tracking; dispute resolution flow |
| Per "compute unit" / token | Token counting at request boundary, customer-facing usage dashboard |
| Tiered (Free / Pro / Enterprise) | Feature flags per tier, upgrade flow, tier downgrades |
| Hybrid (base + overage) | Base subscription billing + usage on top |

Tooling: Stripe Billing handles flat-rate + usage-based well. For complex usage: **Lago** (open source), **Stigg**, **Orb**.

Anti-pattern: launching with "Contact Sales" pricing. Friction is enormous. Have a self-serve free tier or transparent pricing page even if your enterprise tier is custom.

## Dev relations basics

DevTools companies live or die by community. You don't need a 5-person team — you need consistency.

- **Discord / Slack** — single channel, responsive within 24h, documented expectations
- **GitHub Discussions** — for the "search-first" type of devs; pin good answers
- **Changelog** — published on a regular cadence (weekly or per-release), discoverable, RSS-able
- **Blog with technical depth** — not marketing fluff; deep dives on internals, architecture decisions, postmortems
- **Office hours** — weekly 30-min open Zoom/Discord stage; first 50 customers will love this
- **Public roadmap** — Notion / GitHub Projects / Linear public view; let customers vote

## Compliance defaults for `devtools`

| Trigger | Add to compliance |
|---------|-------------------|
| Always | `openssf` (Scorecard ≥ 7.5), `api-stability` (no breaking changes in MINOR/PATCH) |
| Hosted API for paying customers | `soc2-type-2` (within 12 months of revenue) |
| EU customers | `gdpr` (DPA template, sub-processor list) |
| AI / LLM-related | `eu-ai-act` (transparency obligations even if not high-risk) |
| Stores customer code or data | `iso27001` (when enterprise sales requires) |
| Financial services customers | `pci-dss` if payment data passes through; `sox` if customers need audit trail |

`security-officer` runs the matching checklist when these are set.

## Anti-patterns specific to `devtools`

| Pattern | Why it fails | Fix |
|---------|-------------|-----|
| API designed by intern, frozen forever | Bad shape rules years of customer pain | Spec review by 2+ senior engineers, design partners feedback |
| One huge `/v1` endpoint with switch by `action` field | Can't deprecate sub-actions, hard to document | One endpoint per resource × verb |
| Different auth schemes per endpoint | Confusing, error-prone | One auth scheme (Bearer JWT or API key); rotate docs |
| SDK in language X gets feature 2 weeks after language Y | Customers in X feel like second-class | Publish all SDKs from same spec on same release |
| Quickstart that requires a credit card | Massive drop-off at 30 seconds | Free tier without payment until usage threshold |
| Docs versioned to current major only | Customers on older versions can't find their docs | Version selector at top of docs site, archived docs always reachable |
| "Coming soon" features in pricing page | Blocks customers from buying today's product | Ship first, advertise after |
| Breaking change at GA | Customers built integrations, now broken | Run beta with explicit instability warning, freeze on GA |
| Slack-only support, response time hours-to-days | Customers cannot self-serve, churn | Search-first docs + Discord/Discussions + escalation to Slack |

## Recommended `PROJECT.md` for new devtools project

```yaml
primary: api-platform
archetype: devtools
project_size: medium
stack: [typescript, hono, postgres, openapi]
team-size: 4
compliance: [openssf, api-stability, gdpr]
qa-extras: [openapi-lint, sdk-example-test, contract-test]
performance-sla: p95 < 100ms (read), p95 < 500ms (write)
packs: [devtools-pack]
```
