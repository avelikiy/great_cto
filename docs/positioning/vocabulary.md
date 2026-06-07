# Positioning vocabulary — business language, not engineering

> **Single source of truth for all outward copy** (landing, README, CLI onboarding, decks).
> great_cto is positioned as **"AI autopilots for business."** When we talk about a vertical we
> talk about its **flow** and **automation**, not pipelines and packs.

## The reframe

We describe **what the autopilot does for the business**, not how we build it. The engineering
machinery (archetypes, packs, the SDLC pipeline, reviewers) moves under the hood as the *trust
layer*; the **flow** (intake → process → decide → deliver, with a human on the judgment calls)
becomes the headline.

## Translation table — never use the left column in outward copy

| Internal (engineering) | Outward (business) |
|---|---|
| archetype | the business function you're automating |
| pack / domain overlay | the **flow** of the vertical + its built-in checks |
| reviewer agent | the **compliance step** in the flow + the **human sign-off** |
| SDLC pipeline (architect → dev → qa → security → devops) | "how we build it" — kept off-stage |
| gate | **human checkpoint** — where a named person signs off |
| threat model | the vertical's risk map (internal) |
| autopilot-gate manifest | the autopilot's **judgment threshold + accuracy SLA + audit trail** |
| vertical scorecard score | **measured quality** (a number, a badge — proof, not marketing) |
| connector | **tool / integration** the autopilot plugs into |
| "we detected archetype X, loading pack Y" | "Looks like you're automating *medical billing* — here's your coding autopilot" |

## The four objects a buyer sees

1. **Autopilot** — the product for their business function ("medical-coding autopilot").
2. **Flow** — the steps the autopilot runs (their business process).
3. **Agents + tools** — who does each step and what it plugs into.
4. **Human checkpoints** — where a named person signs off the judgment calls.

## Audience order (who the copy speaks to)

1. **CEO / CFO / VC** — founders and investors looking to automate a business function. Lead with
   the outcome, the market, the flow, and the human checkpoints (trust). This is primary.
2. **CTO** — secondary. Cares about the agents/tools, the connectors, and the under-the-hood rails.

## Per-vertical page contract (landing + README)

Every vertical section renders from `flows/<vertical>.flow.json` and contains, in order:

1. **What it is** — `autopilot` + `tagline` + `problem`.
2. **Market size** — `marketSizeUsd`.
3. **The flow** — `steps` (each: what it does · 🤖 agent or 🧑‍⚖️ human · tools).
4. **Agents + tools** — the connectors (9 run live on real data; the rest are sandbox stubs that flip to the real provider on go-live).
5. **Human checkpoints** — the `gate` steps and who signs.
6. **Who else is in this space** — `startups`.

## Words to prefer / avoid

- Prefer: *autopilot · flow · automate · outcome · human checkpoint · sign-off · connector · measured.*
- Avoid (outward): *pipeline · pack · archetype · reviewer · gate (use "human checkpoint") · threat model · SDLC.*
