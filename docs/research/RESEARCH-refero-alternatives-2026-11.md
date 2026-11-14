# Free alternatives to Refero for Claude Code

Date: 2026-11-11. Research only: nothing was installed, no settings or MCP config changed.

## Summary

Refero is two products in one package, and only one of them costs money:

| Part | What it is | Price |
|---|---|---|
| **(a) Methodology**: the `refero-design` skill | research-first workflow, reference lock, decision ledger, anti-averaging rules, nine anti-AI-slop tells, about 4,000 lines of craft notes (type, color, motion, icons, forms, copy) | **free, MIT** |
| **(b) Reference data**: the Refero MCP | `refero_search_styles / _screens / _flows`, `get_screen_image`, `get_similar_screens`; 150k+ screens, 6k+ flows, curated "styles" | **paid**. The Free plan has no MCP; Pro and up include it. Without a subscription the tools answer `NO_SUBSCRIPTION` (measured 2026-09-01, recorded in `agents/design-advisor.md`) |

**Recommendation:**

1. **Methodology: no new install needed.** great_cto already covers most of it (`ui-ux-pro-max`, `anydesign`, `committed-aesthetic`, `design-advisor`). The real gap is small: an explicit **reference lock + decision ledger + post-build check against the lock**. Close it with one short skill of our own (see the last section). If the owner wants a ready external tool on top, **Impeccable** (Apache-2.0, free, local, 62 deterministic slop rules) is the best addition.
2. **Reference data: there is no free equivalent of Refero's curated *styles* and *flows*.** The closest free substitutes are:
   - live capture of named real sites with Playwright (`anydesign/scripts/capture_site.py`, already in the repo): free, unlimited, exact tokens;
   - **awesome-design-md** (84 DESIGN.md files of real developer sites, MIT repo): the nearest thing to Refero "styles", offline and free;
   - a free hosted screenshot MCP (**Pablooo**, **Lazyweb**): screens only, smaller corpora, terms not verified.
3. Keep `refero-design` as a free skill if wanted, but note it is written to **make itself the only design authority** ("prefer over… frontend design… skills") and to make research mandatory. Without the paid MCP that mandatory step gets satisfied from model memory. `design-advisor` already handles that by recording research as consulted / unreachable / not attempted; keep that rule.

## What Refero gives, from its sources

Source: `github.com/referodesign/refero_skill` (MIT, 349 stars, last push 2026-10-15). The installed plugin copy (1.0.2) and the standalone skill copy are byte-identical.

**Free (in the skill):**

- Discovery brief template (what / who / platform / goal / tone / objection / constraints / path).
- Workflow routing: direct build, visual exploration (three reference-locked options), audit, asset generation.
- **Reference lock**: one primary source; 3–5 traits to preserve; 1–2 borrowed details; token-role rules (a CTA color stays CTA-only); media strategy; reject list; token commitments.
- **Decision ledger**: `Decision | Source | Source rule / role | Why`. A choice with no source is removed.
- Anti-averaging: when references conflict, pick one dominant one; never take the "safe centre".
- Anti-AI-slop guide: nine tells (indigo/violet, cards everywhere, dark by default, calm editorial serif on autopilot, emoji as icons, left accent stripe, reference averaging, token-role drift, fake graphics / text-only collapse) plus a checklist.
- Quality gate (15 questions) and a visual QA pass comparing the build with the lock.
- Craft references: typography (737 lines), color (563), craft details: focus, forms, images, touch, perf, a11y (525), motion (504), copywriting (222), icons (166).

**Paid (needs the MCP at `https://api.refero.design/mcp`, OAuth):**

- `search_styles` / `get_style`: semantic search over curated **style systems** extracted from real marketing sites (thesis, tokens, type scale, section rhythm, do/don't). Web marketing pages only; no dashboards or iOS.
- `search_screens` / `get_screen` / `get_similar_screens` / `get_screen_image`: 150k+ app and web screens with metadata and screenshots.
- `search_flows` / `get_flow`: 6k+ multi-step journeys with step goals and system responses.
- `search_apps` / `search_sites`.

## Options checked

"Verified" means checked on the repo or the vendor's own page on 2026-11-11, not from a search snippet. Licences and activity come from the GitHub API.

| Option | Covers | Free? limits | Install | Licence | Verdict |
|---|---|---|---|---|---|
| **great_cto skills** `ui-ux-pro-max`, `anydesign`, `committed-aesthetic`, `aesthetic-instrument` + agent `design-advisor` | methodology (most of it) + local reference capture | free, local | already in repo | MIT (vendored ones keep their LICENSE) | **use; add the small gap below** |
| **Refero skill only** (no MCP) | methodology | free | `npx skills add https://github.com/referodesign/refero_skill --skill refero-design` | MIT | fine as reading; it claims to override other design skills, so don't make it the authority |
| **Impeccable** (`pbakaus/impeccable`) | methodology: 24 commands (`critique`, `audit`, `polish`, `bolder`, `shape`…), `PRODUCT.md` / `DESIGN.md`, 62 deterministic slop rules, live variant mode | free, local, no API key | `npx impeccable install`, then `/impeccable init` | Apache-2.0; 108k stars; active (pushed today) | **best external methodology add-on** |
| **Anthropic `frontend-design`** (`anthropics/claude-plugins-official`) | methodology, short: commit to a bold direction, avoid generic AI look | free | `/plugin install frontend-design@claude-plugins-official` (already enabled on this machine) | Apache-2.0 | keep; light, no research step |
| **ui-ux-pro-max upstream** (`nextlevelbuilder/ui-ux-pro-max-skill`) | craft data: styles, palettes, font pairs, UX rules | free, local | already vendored at `skills/ui-ux-pro-max` | MIT; 148k stars, active | already have it; pull upstream updates if wanted |
| **awesome-design-md** (`VoltAgent/awesome-design-md`) | **reference data, style layer**: 84 DESIGN.md files of real developer-focused sites | free, offline, files in a repo | `git clone https://github.com/VoltAgent/awesome-design-md` (read files; nothing to run) | MIT for the repo; content describes third-party brands | **closest free stand-in for Refero "styles"** |
| **Playwright capture** (`microsoft/playwright-mcp` or `anydesign/scripts/capture_site.py`) | reference data: screenshots + real CSS tokens of any named live site | free, local, unlimited | already in repo (`anydesign`) | Apache-2.0 | **use for "look at X, Y, Z"**: exact values, but you must already know which sites |
| **Firecrawl MCP** | reference data: page scrape + screenshots | free tier with an account and API key; cloud | `npx -y firecrawl-mcp` + `FIRECRAWL_API_KEY` | MIT (server) | not needed while Playwright works locally |
| **shadcn MCP** | component examples / blocks (not inspiration) | free, no auth for the public registry | `pnpm dlx shadcn@latest mcp init --client claude` | MIT | useful when implementing, not for research |
| **Figma MCP (official, remote)** | reads *your* Figma files; can write to canvas | Starter / View / Collab seats: **6 read tool calls per month**; real use needs a paid Dev/Full seat | `claude mcp add --transport http figma https://mcp.figma.com/mcp` | proprietary service | not a reference library; skip as a Refero substitute |
| **Mobbin MCP (official)** | reference data: 600k+ screens, flows | **paid only** (Pro ~$10/mo and up; Free plan has no MCP); API Team+ only | `claude mcp add mobbin --transport http https://api.mobbin.com/mcp` | proprietary | the cheapest *paid* Refero alternative, not free |
| `pdcolandrea/mobbin-mcp` (unofficial) | Mobbin via session cookie | free account | — | ISC; **archived** | **avoid**: archived, scrapes internal endpoints, likely against Mobbin terms |
| **Lazyweb MCP** | reference data: 281k+ screens (iOS + marketing pages), DESIGN.md-style app files; no web-app flows yet | MCP and public tools free; full reports $39/mo Pro | vendor page offers only `curl … install.sh \| bash`; prefer adding the MCP endpoint by hand after reading the script | proprietary; reuse terms not stated | **try as free screen search**; review the install script first; vendor numbers are self-reported |
| **Pablooo MCP** (operated by Graines SAS) | reference data: 8k+ mobile and desktop screenshots, image search in chat | reported free, no key (aggregator listing; vendor page does not state price) | `claude mcp add --transport http pablooo --scope user https://mcp.pablooo.club` (from the aggregator, not confirmed on the vendor page) | proprietary; terms not checked | small corpus; try only after confirming terms |
| `YonasValentin/design-inspiration-mcp-server` | Google image search scoped to Dribbble / Behance / Awwwards / Mobbin / Pinterest + token extraction via `dembrandt` | needs a Serper key: 2,500 free searches, no card | build from source, `claude mcp add design-inspiration -e SERPER_API_KEY=… -- node …/dist/index.js` | MIT; 22 stars, last push 2026-03 | ok as a free search wrapper; low maintenance; Dribbble shots are mostly concept art, not shipped product UI |
| `redf0x1/ui-ux-pro-mcp` | curated design-resource list as MCP | free | `npx` | MIT; inactive since 2026-01 | redundant with `ui-ux-pro-max` |
| `Forge-Space/ui-mcp` | reference analysis from URLs and images | free | — | MIT; **archived** | skip |
| **OpenDesign** (`nexu-io/open-design`) | design-agent workspace: skills, templates, design systems | open source core; cloud and model credits paid | see repo QUICKSTART | Apache-2.0; 107k stars | a separate app, not a drop-in for Claude Code research; skip |
| **Rico** dataset | 72k Android screens, 9.7k apps (2017) | free download | dataset | CC BY 4.0 confirmed only for the derived semantic set | dated; for research/ML, not taste |
| **WebUI** dataset | 400k rendered web pages + metadata (2023) | free download | dataset | licence of the dataset not found | personal research only until the licence is confirmed |
| Page Flows, Screenlane, Godly, Land-book, Lapa Ninja, Dribbble | human galleries | browse free, some paid tiers | no official MCP found; reachable only by browsing (Playwright) | proprietary content | open manually or through Playwright; never bulk-scrape |

## Top 3 picks

1. **Our own stack plus `reference-lock`** (free, no install; the skill now exists). Covers the methodology. Steps: discovery → (existing system? `anydesign` : `committed-aesthetic` directions) → reference lock → decision ledger → build → screenshot vs lock.
2. **Impeccable**, for review and anti-slop checks on built UI:

   ```bash
   npx impeccable install
   ```

   then `/impeccable init` in the project. It writes `PRODUCT.md` and `DESIGN.md` into the project; check they do not collide with files there already.
3. **Free reference data from two local sources:**

   ```bash
   git clone https://github.com/VoltAgent/awesome-design-md ~/.great_cto/refs/awesome-design-md
   ```

   for the style layer, plus `anydesign`'s Playwright capture of 3–5 named live products for screens. If a hosted screen search is wanted, add **Lazyweb** (after reading its install script) or **Pablooo**:

   ```bash
   claude mcp add --transport http pablooo --scope user https://mcp.pablooo.club
   ```

## What nothing free replaces

- **Semantic search over curated style systems.** You ask "premium fintech, restrained type" and get several fully described token systems from sites you did not know. Free routes need you to know the sites already (Playwright) or are limited to 84 developer sites (awesome-design-md).
- **Flows**: 6k+ annotated multi-step journeys with step goals and system responses. No free MCP has flows; Lazyweb says web-app flows are not available yet. Rico has no journey annotation. A free fallback is to walk a real product's flow yourself with Playwright, which is slow and needs an account on that product.
- **"Similar screens" expansion** from one good example, and consistent metadata for filtering by state or component.
- **Breadth with curation**: 150k screens chosen for quality. Free screen corpora are smaller (8k Pablooo) or unverified (Lazyweb's numbers are self-reported).

If flows matter on a project, the cheapest paid route is **Mobbin Pro (~$10/month, MCP included)**, not Refero.

## Does great_cto already cover the methodology?

Mostly yes. Mapping:

| Refero element | great_cto today | Status |
|---|---|---|
| Discovery brief | `agents/design-advisor.md` (DESIGN doc structure), `skills/great_cto` intake | covered |
| "Existing system? match it, else choose a direction" | `agents/design-advisor.md` (stance table) + `skills/anydesign/SKILL.md` | covered |
| Three directions, then commit to one | `agents/design-advisor.md` (2–4 directions) + `skills/committed-aesthetic/SKILL.md` | covered |
| Craft knowledge: type, color, motion, a11y, forms | `skills/ui-ux-pro-max/` (CSV database + 99 UX rules), `skills/anydesign/references/` | covered, different shape |
| Reference capture from a real site | `skills/anydesign/scripts/capture_site.py`, `extract_css_vars.py`, `extract_colors.py`, `check_contrast.py` | covered (Refero has no local capture at all) |
| Honest research status (consulted / unreachable / not attempted) | `agents/design-advisor.md` | covered, stricter than Refero |
| House aesthetic with checkable rules | `skills/aesthetic-instrument/SKILL.md` | covered (great_cto surfaces only) |
| Anti-slop tells | partly: `design-advisor` "no clean modern minimal", `committed-aesthetic` | **partial**: no named, checkable list |
| **Reference lock** (preserve / borrow / role rules / reject) | none | **gap** |
| **Decision ledger** with a source per decision | none (the DESIGN doc cites ui-ux-pro-max rules, not a ledger) | **gap** |
| Anti-averaging and token-role rules | implicit in `committed-aesthetic` | **partial** |
| Visual QA: compare the build with the lock | `anydesign/scripts/verify_design.py` exists, not tied to a lock | **partial** |

### Small addition that closes the gap

Written on 2026-11-14 as `skills/reference-lock/SKILL.md` (about 130 lines, our own text) and
preloaded by `agents/design-advisor.md`. It carries:

1. **Reference sources, in order, all free:** user-provided references → an existing product or design system (`anydesign`) → 3–5 named live products captured with Playwright → `awesome-design-md` files → a hosted screen MCP if the owner installed one → otherwise "unreachable", with direction taken from `committed-aesthetic`, never from model memory reported as research.
2. **Reference lock template**: primary source, preserve (3–5 traits), borrow (≤2), role rules, media strategy, reject list, token commitments.
3. **Decision ledger** table in every DESIGN doc: `Decision | Source | Role rule | Why`; a row with no source is cut. `artifact-lint` can check the table exists.
4. **Nine named slop tells** as a checklist, written in our own words; a checkable subset (indigo/violet accent, emoji as icons, left accent stripe, nested cards) can become lint rules.
5. **Close the loop**: after the build, screenshot desktop + mobile and check each "preserve" trait against the lock (`anydesign/scripts/verify_design.py`).

Refero's text is MIT, so it could be vendored with its licence like `ui-ux-pro-max` and `anydesign`. Writing our own short version is better: Refero's skill carries instructions that make itself the sole design authority and assume the paid MCP.

## Licence check: what may go into great_cto (MIT, public)

| Source | May ship in great_cto? | Condition |
|---|---|---|
| Refero skill text | yes | MIT: keep the copyright notice and licence file |
| Impeccable | yes, if vendored | Apache-2.0: keep LICENSE and NOTICE, mark changes. Better to recommend the install than to vendor it |
| Anthropic `frontend-design` | yes, if vendored | Apache-2.0; recommending the install is enough |
| ui-ux-pro-max, anydesign | already shipped | MIT, licence files present |
| awesome-design-md files | **link, don't vendor** | repo is MIT, but each file describes another company's brand; fine to read as research, not to ship as our design or under their names |
| Screenshots from Refero, Mobbin, Lazyweb, Pablooo, Dribbble, live sites | **never commit** | third-party copyright and trademarks; research use only, kept outside the repo (scratch or `~/.great_cto/refs/`); describe the pattern in our own words in docs |
| Refero / Mobbin metadata (style text, flow steps) | quote briefly with attribution, don't copy in bulk | service terms; the existing practice in `docs/design/*` (citing IDs and one line of finding) is fine |
| Rico (derived semantic set) | data use with attribution | CC BY 4.0 |
| WebUI | personal research only | dataset licence not confirmed |

## Sources

- Refero skill repo: https://github.com/referodesign/refero_skill
- Refero plans: https://doc.refero.design/help/plans
- Impeccable: https://github.com/pbakaus/impeccable
- Anthropic plugins: https://github.com/anthropics/claude-plugins-official
- awesome-design-md: https://github.com/VoltAgent/awesome-design-md
- ui-ux-pro-max upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- shadcn MCP: https://ui.shadcn.com/docs/mcp
- Figma MCP guide: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Figma MCP limits: https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions
- Mobbin MCP: https://mobbin.com/mcp
- Lazyweb vs Mobbin (vendor-authored): https://design.lazyweb.com/vs/mobbin.md
- Lazyweb MCP install: https://www.lazyweb.com/mcp-install
- Pablooo: https://pablooo.club, listing https://mcpservers.org/servers/pablooo-club-mcp
- Design Inspiration MCP: https://github.com/YonasValentin/design-inspiration-mcp-server
- WebUI paper: https://arxiv.org/abs/2301.13280
