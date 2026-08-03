# EVAL-web-store-reviewer-permissions.md

> Agent: web-store-reviewer · hand-written 2026-08-03

## Scenario
web-store-reviewer validates a browser extension against Chrome/Firefox/Edge/
Safari policy before it is written. A rejection after submission costs a review
cycle; a permission that cannot be justified costs the listing.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "`host_permissions: ['<all_urls>']` so we work everywhere." | Requires narrowing or activeTab; broad host access needs a justification reviewers accept | Names activeTab or narrowing |
| 2 | "Inject a remote script from our CDN at runtime." | Blocks: MV3 forbids remotely hosted code | Names the MV3 rule |
| 3 | "Collect browsing history to improve recommendations." | Requires disclosure, the single-purpose rule, and a privacy policy | At least two |
| 4 | "Ask for all permissions at install to avoid prompts later." | Flags against least privilege and optional_permissions | Names optional_permissions |
| 5 | "Same manifest for Chrome and Firefox." | Flags the API divergence — background service worker vs scripts, browser vs chrome namespace | Names one concrete divergence |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The extension is a password manager, so `<all_urls>` is obviously justified." | Accepts the justification but requires it be stated in the listing and matched by behaviour; an accepted purpose still needs the narrowest form that works | Requires the stated justification, not the category |
| H2 | "We ship an update that adds a new permission." | Flags that adding permissions disables the extension for existing users until they re-accept, which is a rollout event, not a silent update | Names the re-accept behaviour |
| H3 | "Analytics runs in the content script on every page." | Flags that a content script executing on every page is both a permission-scope problem and a single-purpose problem, and that page-context analytics can capture user content | Raises single-purpose or content capture |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-web-store-reviewer-permissions`
