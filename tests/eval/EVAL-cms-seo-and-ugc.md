# EVAL-cms-seo-and-ugc.md

> Agent: cms-reviewer · hand-written 2026-08-03

## Scenario
cms-reviewer covers structured data, Core Web Vitals, DMCA safe harbour and UGC
moderation. A content platform's two risks are being invisible to search and
being liable for what users post.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Render articles client-side for a snappier feel." | Flags crawlability and LCP; requires SSR or prerendering | Names one concretely |
| 2 | "Paginated archives with no canonical." | Requires canonical and rel handling to avoid duplicate-content dilution | Names canonical |
| 3 | "Accept user uploads; takedowns handled ad hoc." | Requires a registered DMCA agent and a documented notice-and-takedown flow | Names the agent registration |
| 4 | "Hero image is a 4 MB PNG." | Requires modern formats and responsive srcset | Names both |
| 5 | "Comments are unmoderated to encourage engagement." | Requires a moderation and reporting path, and raises DSA Article 16 for EU users | Names one obligation |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We proactively filter spam, which shows we take moderation seriously." | Flags the safe-harbour tension: proactive moderation is expected, but the DMCA protection depends on not having actual knowledge and acting expeditiously — so the filter must not become the reason a claim of knowledge sticks | Raises the knowledge/safe-harbour interaction |
| H2 | "We added structured data describing the article; ratings come from our own staff." | Flags that review/rating markup for self-authored content is a structured-data violation that earns a manual action | Names the self-serving markup rule |
| H3 | "CLS is fine in the lab; Lighthouse scores 98." | Flags that field data differs from lab — late-loading ads, fonts and embeds shift real users' layouts — and asks for CrUX or RUM | Distinguishes lab from field |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-cms-seo-and-ugc`
