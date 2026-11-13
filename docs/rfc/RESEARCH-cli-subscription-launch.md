# Research: may the cockpit start the user's own Claude Code under a subscription login?

**Status:** research note, not a decision. Nothing here was sent to Anthropic.
**Date:** 2026-11-11. Every quote below was read on 2026-11-11.
**Question:** may a third-party local application (the great_cto board, open source, installed
by the user on their own machine) start and drive the user's own `claude` CLI under the user's
Claude subscription login, or must it use an API key — and what technically works today?
**Related:** `RFC-cockpit-for-non-developers.md`, `ADR-049-board-starts-work.md`,
`ADR-DRAFT-desktop-app-channel.md`, `PLAN-phase1-cockpit.md`,
`docs/product/PHASE0-non-developer-validation.md`.

## Answer

| | |
|---|---|
| **Case (a)**: the app starts the installed, unmodified `claude` binary under the user's own login | **Addressed by Anthropic's documentation, and on its face allowed**, with four conditions (section 1.1). This is a change from the RFC, which recorded it as "unverified". Three points stay open because the text does not name a local open-source app (section 3.2) |
| **Case (b)**: the app embeds the Agent SDK and uses the user's claude.ai login | **Not allowed without Anthropic's prior approval.** The documents say to use an API key |
| **Case (c)**: the user gives the app an API key | **Allowed.** It is the route the documents tell developers to use |

What is proven by test is narrower than what the documents say: see section 2. The
print-mode calls were run by the owner from a terminal on 2026-11-11 (section 2.2).

## 1. Documents

How the quotes were taken: the three legal pages and the Claude Code pages were downloaded as
page source or as the documentation's own Markdown (`<page>.md`) and the quoted sentences were
found in that text. They are exact. Line breaks inside a quote are removed.

### 1.1 Case (a): starting the installed `claude` binary

**D1. Anthropic documents running the CLI as a subprocess of another program.**

> "To drive the same agent loop from a language other than Python or TypeScript, run the CLI as
> a subprocess with the `-p` flag and `--output-format json`."

`https://code.claude.com/docs/en/agent-sdk/overview.md`

**D2. A section of the Claude Code legal page is about products that run Claude Code.**

> "### Can customers offer Claude Code in their products?
>
> Unless we've mutually agreed otherwise, preinstalling or running Claude Code in your products
> or services (e.g. in hosted sandboxes or other agent infrastructure) requires agreeing to our
> Commercial Terms of Service and complying with the conditions below:
>
> * **The Claude Code binary must not be modified.** Claude Code must be installed and run as
>   published by Anthropic, and customers may not remove, disable, or restrict any
>   authentication method built into it (including methods that permit signing in with a Claude
>   account or the user's own API key).
> * **Customers may not pay for, resell, or intermediate Claude usage on their end users'
>   behalf.** Each end user must authenticate with their own Anthropic API key, Claude
>   subscription plan credentials, or 3P inference provider credential (Amazon Bedrock, Google
>   Cloud's Agent Platform, Microsoft Foundry). That usage is billed directly to the end user
>   under their own agreement with Anthropic or, for third-party inference providers, with the
>   applicable provider."

`https://code.claude.com/docs/en/legal-and-compliance.md`, "Legal agreements"

**D3. The same page, on credentials.**

> "* **OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max,
>   Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of
>   Claude Code and other native Anthropic applications. […]
> * **Developers** building products or services that interact with Claude's capabilities,
>   including those using the Agent SDK, should use API key authentication through Claude
>   Console or a supported cloud provider. Anthropic does not permit third-party developers to
>   offer Claude.ai login into their own applications, or to route requests through Free, Pro,
>   Max, or Ultra plan credentials on behalf of their users. Moreover, developers may not
>   collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a
>   Claude account must complete through Anthropic's own flow.
>
> This does not restrict how customers provision and manage their own API keys […]. Nor does it
> prevent an end user from signing in to the unmodified Claude Code binary with their own
> Claude subscription, including where a platform hosts Claude Code as described under *Can
> customers offer Claude Code in their products?* above.
>
> Anthropic reserves the right to take measures to enforce these restrictions and may do so
> without prior notice.
>
> For questions about permitted authentication methods for your use case, please contact sales."

Same page, "Authentication and credential use".

**D4. Naming.**

> "You can accurately say, in plain text, that your product has Claude Code preinstalled or that
> it runs Claude Code. But you can't use the Claude Code or Anthropic names or logos as part of
> your own product, feature, or company name, in your own logo, or in a way that suggests
> Anthropic built, endorses, or is partnered with your product."

Same page. The Agent SDK overview adds, for SDK partners: allowed "{YourAgentName} Powered by
Claude"; not permitted "Claude Code" or "Claude Code Agent"; "Your product should maintain its
own branding and not appear to be Claude Code or any Anthropic product."
(`https://code.claude.com/docs/en/agent-sdk/overview.md`, "Branding guidelines").

**D5. Usage limits assume individual use.**

> "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of
> Claude Code and the Agent SDK."

`https://code.claude.com/docs/en/legal-and-compliance.md`, "Acceptable use"

**D6. Consumer Terms (Pro, Max), effective Oct 8, 2025.** Among the things a user may not do:

> "Except when you are accessing our Services via an Anthropic API Key or where we otherwise
> explicitly permit it, to access the Services through automated or non-human means, whether
> through a bot, script, or otherwise."

> "To develop any products or services that compete with our Services, including to develop or
> train any artificial intelligence or machine learning algorithms or models or resell the
> Services."

> "You may not share your Account login information, Anthropic API key, or Account credentials
> with anyone else or make your Account available to anyone else."

`https://www.anthropic.com/legal/consumer-terms`, sections 2 and 3

**D7. Usage Policy, shown with "Effective Nov 12, 2026"** (the day after this was read), under
"Do Not Abuse Our Platform":

> "Resell, proxy, or otherwise provide access to Claude through unauthorized means, including
> services that route requests through consumer subscriptions or misrepresent the product or
> client being used"

> "Intentionally bypass or interfere with capabilities, restrictions, or guardrails established
> within our products, including by circumvention of the account sign-up or log-in process
> […]"

> "Agentic use cases must comply with the Usage Policy. Users are responsible for ensuring that
> agents they build or deploy, including actions those agents take through tools, browsers, or
> connected systems, comply with this Usage Policy."

`https://www.anthropic.com/legal/aup`

**D8. Scripts under a subscription are a documented use.**

> "For CI pipelines, scripts, or other environments where interactive browser login isn't
> available, generate a one-year OAuth token with `claude setup-token`"

`https://code.claude.com/docs/en/authentication.md`, "Generate a long-lived token". The GitHub
Actions page says the same for CI: "`CLAUDE_CODE_OAUTH_TOKEN`: an OAuth token that authenticates
with your Claude subscription, available on Pro, Max, Ultra, Team, and Enterprise plans."
(`https://code.claude.com/docs/en/github-actions.md`).

**D9. Print-mode and third-party-app usage counts against the plan — for now.**

> "Update June 15, 2026: We've paused the previously-announced changes to Claude Agent SDK
> usage. For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage
> still draw from your subscription limits."

> "Update October 7, 2026: […] Nothing changes for your plan: when you're signed in with your
> Claude plan, the Claude Agent SDK and `claude -p` still draw from your subscription limits."

`https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan`

### 1.2 Case (b): embedding the Agent SDK

> "Unless previously approved, Anthropic does not allow third party developers to offer
> claude.ai login or rate limits for their products, including agents built on the Claude Agent
> SDK. Use the API key authentication methods described in the Quickstart instead."

`https://code.claude.com/docs/en/agent-sdk/overview.md`, note under "Get started". D3 says the
same. The SDK is technically the same thing as case (a) — "The Agent SDK spawns and supervises
a `claude` CLI subprocess" (`https://code.claude.com/docs/en/agent-sdk/hosting.md`) — but it
bundles its own binary and its hosting page documents only `ANTHROPIC_API_KEY`.

### 1.3 Case (c): an API key

> "Subject to these Terms, Anthropic gives Customer permission to use the Services, including to
> power products and services Customer makes available to its own customers and end users"

> "Customer may not and must not attempt to (a) access the Services to build a competing product
> or service, including to train competing AI models or resell the Services except as expressly
> approved by Anthropic; (b) reverse engineer or duplicate the Services; or (c) support any
> third party's attempt at any of the conduct restricted in this sentence."

`https://www.anthropic.com/legal/commercial-terms`, effective Jun 17, 2025, A.1 and D.4. In the
cockpit the key and the Commercial Terms agreement belong to the user, not to great_cto; D3
covers that: usage must be "billed to the key owner under their agreement with Anthropic".

### 1.4 Credentials, limits and caps (technical documentation)

| Topic | Quote | Source |
|---|---|---|
| Which credential wins | "When multiple credentials are present, Claude Code chooses one in this order": 1 cloud provider; 2 `ANTHROPIC_AUTH_TOKEN`; 3 `ANTHROPIC_API_KEY`; 4 `apiKeyHelper`; 5 `CLAUDE_CODE_OAUTH_TOKEN`; 6 Anthropic profile; 7 "Subscription OAuth credentials from `/login`" | `…/docs/en/authentication.md`, "Authentication precedence" |
| Key in print mode | "In non-interactive mode (`-p`), the key is always used when present." | same |
| Billing effect | "If you have an ANTHROPIC_API_KEY environment variable set on your system, Claude Code will use this API key for authentication instead of your Claude subscription […], resulting in API usage charges rather than using your subscription's included usage." | `https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan` |
| `--bare` | "In bare mode, Claude Code never reads OAuth credentials or the system keychain." and "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." | `…/docs/en/headless.md`, "Start faster with bare mode" |
| Sign-in probe | "`claude auth status` … Exits with code 0 if logged in, 1 if not. … `authMethod` field is one of `none`, `claude.ai`, `oauth_token`, `api_key`, `api_key_helper`, or `third_party`" | `…/docs/en/cli-reference.md` |
| Failure reporting | "Claude Code exits with code 0 on success and a non-zero code when the run fails […] When a failure happens inside the run, such as missing authentication, Claude Code prints the failure as the result on stdout." | `…/docs/en/headless.md` |
| Retry and limit categories | `system/api_retry` event, `error` is one of "`authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `billing_error`, `rate_limit`, `overloaded`, …" | same, "Handle API retries" |
| Money cap | "`--max-budget-usd` Stop the run once estimated spend on API calls reaches this amount (print mode only). Claude Code checks the cap against its client-side cost estimate, which can differ from your bill. […] Spend can pass the cap, so leave headroom." | `…/docs/en/cli-reference.md` |
| Cost figure | "The `total_cost_usd` and `costUSD` fields are client-side estimates, not authoritative billing data." | `…/docs/en/agent-sdk/cost-tracking.md` |
| Turn cap | "`--max-turns` Limit the number of agentic turns (print mode only). No limit by default." | `…/docs/en/cli-reference.md` |
| Plan limits | "Pro and Max plans have a five-hour session limit and a weekly limit. […] These limits are shared across Claude and Claude Code" | support article 11145838 |
| Desktop app sign-in | "Claude Desktop and cloud sessions do not call `apiKeyHelper` or read these environment variables: they use OAuth" | `…/docs/en/authentication.md`, "Credential management" |

### 1.5 Where the documents are silent or ambiguous

1. **No document names a local, open-source desktop app.** D2's examples are "hosted sandboxes
   or other agent infrastructure". Reading D2 as covering the cockpit is an inference.
2. **D2 "requires agreeing to our Commercial Terms of Service".** It does not say who agrees
   when the product is a free open-source tool with no contracting entity, or whether a
   Pro/Max user (who is under the Consumer Terms) may then use it.
3. **D3 has two sentences that pull in different directions for this product.** "Developers
   building products … should use API key authentication" and no routing "through … plan
   credentials on behalf of their users" on one side; "Nor does it prevent an end user from
   signing in to the unmodified Claude Code binary with their own Claude subscription" on the
   other. The page does not define "route requests … on behalf of their users".
4. **"Ordinary, individual usage" (D5) is not defined.** A pipeline of many headless stages per
   task is not mentioned.
5. **D6 "where we otherwise explicitly permit it".** The documents describe `claude -p` and
   `claude setup-token` for scripts under a subscription (D8), but no page states that this is
   the explicit permission the Consumer Terms refer to.
6. **D9 says "for now".** A change to how `claude -p` and third-party app usage is counted was
   announced and paused. The documents do not say what the change was or whether it returns.
7. **`--bare` becoming the default for `-p`.** No page says whether a non-bare print mode that
   reads the subscription login will remain.
8. **How a plan-limit refusal looks in print-mode output** (exit code, result fields) is not
   documented. The interactive wording is ("You've hit your session limit"), and
   `rate_limit_event` is documented for the Python SDK only.
9. **Whether the desktop app's sign-in and the CLI's sign-in are separate by design** is not
   stated.

## 2. Tests

Machine: macOS, Claude Code CLI `2.1.316`. A project hook
(`scripts/hooks/orchestrator-check.mjs`) forbids `claude -p` from inside an agent session, and
it was not worked around. So the tests are in two groups.

### 2.1 Run on 2026-11-11 (no model call, $0)

`claude auth status --json` in five credential setups. Only non-secret fields are shown. The
"no login" state was produced with `CLAUDE_CONFIG_DIR` pointing at an empty folder.

| # | Setup | `loggedIn` | `authMethod` | `apiKeySource` | `subscriptionType` | Exit |
|---|---|---|---|---|---|---|
| A | subscription login only | true | `claude.ai` | absent | `max` | 0 |
| B | login + `ANTHROPIC_API_KEY` set to a dummy string | true | `claude.ai` | `ANTHROPIC_API_KEY` | `max` | 0 |
| C | no login, no key | false | `none` | absent | absent | 1 |
| D | no login + dummy `ANTHROPIC_API_KEY` | true | `api_key` | `ANTHROPIC_API_KEY` | absent | 0 |
| E | login + dummy `CLAUDE_CODE_OAUTH_TOKEN` | true | `oauth_token` | absent | absent | 0 |

Text form of C: "Not logged in. Run claude auth login to authenticate.", exit 1.

What this shows:

- **Not signed in is detectable for free**: exit 1 and `loggedIn: false` (C).
- **The probe does not validate a credential.** A dummy key (D) and a dummy token (E) both
  report `loggedIn: true`, exit 0. `detectClaude` in `scripts/lib/claude-exec.mjs` treats
  `loggedIn === true` as "available", so it would pass both.
- **With a login and a key both present, the probe does not say which one a run will use** (B):
  `authMethod` stays `claude.ai` while `apiKeySource` appears. The documentation says the key
  wins in `-p` (section 1.4). The app cannot rely on `authMethod` alone to tell the user what
  they will be charged against.
- **An environment token replaces the stored login in the probe** (E), consistent with the
  documented precedence.

From the RFC's headless check of 2026-11-10 (owner's terminal, same CLI version): `claude -p`
with a plugin command completed under a subscription login (`authMethod: claude.ai`, `max`),
exit 0, with a reported cost of $0.48 — so `total_cost_usd` is reported under a subscription
too, as an estimate. With an expired CLI session the same call ended with an authentication
error, $0, exit 1.

### 2.2 Run by the owner on 2026-11-11 (print mode)

Script: [`research-cli-subscription-check.mjs`](research-cli-subscription-check.mjs), run in a
plain terminal (it refuses to start inside a Claude Code session):

```bash
node docs/rfc/research-cli-subscription-check.mjs
```

It works only in a new folder under the system temp directory, uses the `haiku` alias with
`--safe-mode` and `--max-budget-usd 0.25` per call, prints one table, and never prints a
credential. State at the start (T0): CLI `2.1.316`, `loggedIn=true`, `authMethod=claude.ai`,
`subscriptionType=max`, no credential variable in the shell. Observed values are copied from
the script's output.

| Test | Setup | Exit | `subtype` | `is_error` | Other observed values |
|---|---|---|---|---|---|
| T1 | login only, `--output-format json` | 0 | `success` | false | 1 turn; `total_cost_usd=0.00198`; `session_id` present; reply "OK" |
| T2 | login only, `stream-json` | 0 | `success` | false | events: `system/init`, `rate_limit_event`, `assistant`, `result/success`; `init.apiKeySource=none`; `rate_limit_event`: `rateLimitType=seven_day`, `status=allowed`; fields of `rate_limit_info`: `status`, `resetsAt`, `rateLimitType`, `overageStatus`, `overageDisabledReason`, `isUsingOverage`, `unifiedWindows` |
| T3 | login + invalid `ANTHROPIC_API_KEY` | 1 | `success` | true | `init.apiKeySource=ANTHROPIC_API_KEY`; result text "Invalid API key · Fix external API key" |
| T4 | login + real key | — | — | — | not run (no `GCTO_TEST_API_KEY` exported) |
| T5 | no login, no key | 1 | `success` | true | `auth status` exit 1; result text "Not logged in · Please run /login" |
| T6 | no login + invalid key | 1 | `success` | true | `auth status` exit 0; result text "Invalid API key · Fix external API key" |
| T7 | `--bare`, login only | 1 | `success` | true | result text "Not logged in · Please run /login" |
| T8 | `--max-turns 1`, task needs a tool | 1 | `error_max_turns` | true | `num_turns=2`; `total_cost_usd=0.00066` |
| T9 | `--max-budget-usd 0.0001`, login only | 1 | `error_max_budget_usd` | true | 1 turn; `total_cost_usd=0.000127` (above the cap); empty result text |
| T10 | `--tools Read,Glob,Grep --permission-mode dontAsk --permission-prompts none`, asked to create a file | 0 | `success` | false | file not created; `permission_denials=0`; 4 turns |
| T11 | `--resume <session id from T1>` | 0 | `success` | false | same session id; the word from T1 was recalled |

What this shows:

- **Print mode works under a subscription login** with JSON and stream output, a turn cap, a
  tool allow-list and resume (T1, T2, T8, T10, T11).
- **With a login and an environment key both present, the key is used** (T3): the run reported
  `apiKeySource=ANTHROPIC_API_KEY` and failed on the invalid key instead of falling back to the
  login. The documented precedence holds. Test B in 2.1 showed the probe still says
  `authMethod: claude.ai` in that state, so the probe misreports what a run will be billed to.
  Not tested with a valid key (T4).
- **The reliable source for the credential type is the `system/init` event of the run itself**:
  `apiKeySource` was `none` under the login and `ANTHROPIC_API_KEY` with the key (T2, T3).
- **A failure is `is_error: true` plus a non-zero exit; `subtype` is not a failure signal.**
  Three different authentication failures all came back as `subtype=success` (T3, T5, T6, T7).
  ADR-049 rule 11 already says to read the exit code and `is_error`.
- **The caller can tell the failures apart only by the result text**: "Not logged in · Please
  run /login" (T5, T7) against "Invalid API key · Fix external API key" (T3, T6). That text is
  not a documented contract.
- **`--bare` refuses the subscription login** exactly like a machine with no login (T7).
- **`--max-budget-usd` is enforced under a subscription** (T9), against the client-side
  estimate, and the run ended slightly above the cap, as documented. So a per-call cap is
  usable on the subscription route; the dollars are an estimate of plan usage, not a charge.
- **`--max-turns` stops the run with `error_max_turns` and exit 1** (T8). The result reported
  `num_turns=2` for a cap of 1.
- **A tool that is not in `--tools` produces no `permission_denials` entry** (T10): the file was
  not written, and the run still ended as a success. "The agent could not write" cannot be read
  from that field; the controller has to check the outcome itself.
- **A subscription run is metered against a plan window**: the stream carried a
  `rate_limit_event` for the `seven_day` window with `status=allowed` and overage fields (T2).
  This is the hook for showing limits in the app. How much one run moves the window was not
  measured.

Still not observed by anyone: **a real plan-limit refusal** in print mode. It needs an
exhausted five-hour or weekly window. Until one is seen, the app should treat any of these as
"limit or account problem, stop and show it": non-zero exit, `is_error: true`, an `api_retry`
event with `rate_limit`, `billing_error` or `account_on_hold`, or a `rate_limit_event` whose
status is not `allowed`.

## 3. Conclusion

### 3.1 Table

| Case | What the documents say | What the test showed | Risk for a public open-source tool | Recommendation |
|---|---|---|---|---|
| **(a)** start the installed `claude` under the user's own login | Running Claude Code from a product is described and conditioned, not forbidden (D2); an end user may sign in to the unmodified binary with their own subscription (D3); subprocess use is documented (D1); such usage draws from plan limits "for now" (D9). Not written for a local open-source app (1.5, items 1–3) | Probe works and detects "not signed in" (2.1). The probe does not validate credentials and does not show which credential a run uses. `-p` under a subscription works with JSON and stream output, turn and money caps, a tool allow-list and resume (2.2). An environment key overrides the login (T3) | **Medium-low, and it sits mostly with the user's account**, since Anthropic "may [enforce] without prior notice" (D3). Sources of risk: wording that reads as "sign in with Claude" inside our app; heavy pipelines against "ordinary, individual usage" (D5); the counting change that is paused (D9); `--bare` becoming the `-p` default | **Keep as the default route**, under the conditions in 3.3. Send the narrowed question (3.2) and do not block phase 1 on the answer |
| **(b)** embed the Agent SDK with the user's claude.ai login | Not allowed unless previously approved; use an API key (1.2, D3) | Not tested: nothing to test without doing what is not allowed | **High.** A distributed product doing this is the named case | **Do not build.** If the SDK is ever embedded, API key only |
| **(c)** the user's own API key | The route developers are told to use (D3, 1.3) | A key in the environment is picked up and is used in `-p` whenever present (documented; B and D in 2.1). A wrong key still passes the probe | **Low** for terms. Product cost: the user needs a Console account and billing, and pays per token. Security: the app must store the key safely | **Keep as the fallback, and make it a visible choice**, not an accident of the user's shell |

### 3.2 Is the question to Anthropic still needed?

Yes, but a shorter one, and it is no longer a blocker for building. The existing draft is in
`docs/product/PHASE0-non-developer-validation.md`, section 2. Compared with what was read:

| Draft question | Now |
|---|---|
| a. Is the design permitted under a Pro or Max login | Mostly answered by D2 and D3. Keep, rewritten to cite that section |
| b. Is it permitted with the user's own API key | Answered: yes (D3, 1.3). **Drop** |
| c. Can an open-source project apply for the approval | Not needed for (a) if D2 applies. **Replace** with the Commercial Terms question below |
| d. Branding rules | Answered by D4. **Drop** |
| e. Are the desktop app's and the CLI's sign-ins separate | Not answered by the documents (1.5, item 9). It is a product question, not a terms question. **Move** to a separate support request or drop |

Proposed wording (to be sent by the owner; the legal page names sales as the contact):

> Subject: Local open-source app that runs the user's own Claude Code — does your "Can
> customers offer Claude Code in their products?" section apply?
>
> great_cto is a free, MIT-licensed tool (github.com/avelikiy/great_cto). Its local dashboard
> starts the user's own, separately installed, unmodified `claude` CLI in print mode
> (`claude -p`) on the user's machine, on the user's click. Users install Claude Code from
> Anthropic and sign in through Anthropic's own flow. The tool never shows a Claude sign-in,
> never reads, stores or forwards credentials, sends no requests of its own to Anthropic, and
> bills nothing.
>
> 1. Does the section "Can customers offer Claude Code in their products?" on
>    code.claude.com/docs/en/legal-and-compliance cover this, including when the user is signed
>    in with a Pro or Max plan? Or is it "routing requests through plan credentials on behalf of
>    users"?
> 2. That section requires agreeing to the Commercial Terms. Who has to agree for a free
>    open-source tool with no company behind it, and does it change anything for a user on the
>    Consumer Terms?
> 3. One task runs several `claude -p` calls in sequence (plan, build, review). Is that
>    "ordinary, individual usage" for plan limits?
> 4. When `--bare` becomes the default for `-p`, will a supported way remain for a print-mode
>    run to use the subscription login?

### 3.3 Conditions the product has to hold for case (a)

These follow from D2–D4 and from the test. Each is something the code or the copy can hold:

1. Use the `claude` the user installed. Do not bundle, patch or wrap the binary.
2. Never show a Claude sign-in, never ask for, read, copy or store Claude credentials or
   tokens, and never generate or handle a `claude setup-token` token. Sign-in happens only in
   Anthropic's own flow. Copy says "Claude Code, signed in", not "sign in with Claude".
3. Do not remove or restrict any sign-in method of the CLI. In particular the app must not
   force the subscription: if the user chose an API key, that works too.
4. Never pay for, proxy or pool usage. One user, their own account, their own machine.
5. Naming per D4: "runs Claude Code" in plain text is fine; no Claude or Anthropic name or logo
   in the product's name or logo; nothing that suggests endorsement.
6. **Say which credential a run will use before it starts**, and do not let a stray
   `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` in the environment turn a "subscription" run
   into API billing silently (section 1.4, test B).
7. **Do not pass `--bare`** on the subscription route (it never reads the login), and re-check
   this at each CLI upgrade because of the announced default change.
8. Keep runs within what one person would do: one task at a time per user (ADR-049 already
   requires it), no background loops, a visible stop.

### 3.4 What this means for the existing documents

Nothing below was edited. Line numbers are those of the files on `main` at `97f64c2f`
(2026-11-11).

**`RFC-cockpit-for-non-developers.md`**

| Line | Now | Would become |
|---|---|---|
| 102 (options table, "Licensing", column B) | "**unverified** — see below" | addressed by the Claude Code legal page; allowed on its face under the conditions in 3.3; three open points |
| 111 (verified claims) | cites only the Agent SDK note | add D2 and D3 as verified on 2026-11-11, with the URL |
| 114 (option B "Unverified … Needs a written answer") | unverified | "Addressed, not confirmed for a local open-source app"; link to this note |
| 130–131 ("Before public launch … get Anthropic's answer on B. If it is 'no', ship C") | answer is a precondition of launch | answer is wanted, not a precondition of phase 1; C stays the fallback and becomes a user-visible choice |
| 327 (risk "Licensing of option B") | mitigation "written answer from Anthropic first" | mitigation: conditions 1–8 in code and copy, plus the narrowed question |
| 387, 395–396, 412 ("Open", "Agent host route", decisions table row 2) | "Conditional on Anthropic's answer" | "Default: the user's own CLI under the conditions of this note; API key as a choice; narrowed question sent" — the owner's decision to change, not this note's |
| 476 ("It goes into the question for Anthropic") | desktop vs CLI sign-in | moves to a separate support request (3.2, row e) |
| new risk rows | — | `--bare` default change; the paused change to how `claude -p` usage is counted (D9) |

**`docs/product/PHASE0-non-developer-validation.md`**, section 2: replace the draft with the
wording in 3.2; change "sales or support contact" to the sales contact named on the legal page.

**`ADR-DRAFT-desktop-app-channel.md`**

| Line | Now | Would become |
|---|---|---|
| 36–37 (decision 6, "Agent host") | "does not embed or authenticate a coding agent. It detects the user's own Claude Code or Codex and guides install and sign-in. Branding: never 'Claude…'" | keep, and add: unmodified user-installed binary only; no credential handling of any kind; no restriction of the CLI's sign-in methods; naming per D4 (may say "runs Claude Code") |
| "Record the answer … in the agent-host section" (referenced from PHASE0) | waits for the answer | cite this note now; add the answer when it comes |

**`ADR-DRAFT-app-updater.md`**: no line depends on this question. No change.

**`ADR-049-board-starts-work.md`** (accepted; changes need the owner)

| Line | Now | Would become |
|---|---|---|
| 51–54 (rule 10, "Sign-in is probed, not assumed … a real, free probe") | `claude auth status` is treated as the probe | the free probe proves only "a credential is configured" (tests D and E). Either word the rule that way, or count the first model call as the proof and treat its authentication failure as a failed start (rule 11 already covers the failure) |
| new rule | — | the start shows which credential the run will use (subscription login or API key); credential variables are not inherited silently by the stage process |

**`PLAN-phase1-cockpit.md`**

| Line | Now | Would become |
|---|---|---|
| 21 ("Sign-in is probed, not assumed \| yes") | marked as already done | "partly": `detectClaude` passes an invalid key or token (2.1) |
| 38, 67 (G4, S2: per-call `--max-budget-usd`) | a money cap per call | add: the cap works under a subscription (T9) and is checked against a client-side estimate that "can pass the cap" (1.4); under a subscription the dollar figure is an estimate of plan usage, not a charge |
| 70 (S5 readiness: "Claude probe, project folder, git") | probe only | readiness also warns when both a login and an environment key are present; the credential type shown for a run is taken from `apiKeySource` in the run's `system/init` event (T2, T3), not from the probe |
| 72, 91 (S7, the paid real run) | one proof run | the flag questions are already answered by section 2.2; S7 keeps only the end-to-end proof |
| 92 ("Any time \| Anthropic's answer … A 'no' replaces the sign-in path with an API key") | open dependency | still true; add that the documents already describe the route, so the expected answer is a clarification |
| new gap | — | G8: stage calls must not pass `--bare` on the subscription route; a test pins the argument list (today `runClaudeExec` uses `--safe-mode --restricted`, not `--bare`) |

## 4. What is proven and what is not

| Claim | Status |
|---|---|
| Anthropic's documents describe products that run the unmodified Claude Code binary with each user's own credentials, including subscription credentials | proven by quote (D2, D3) |
| Offering claude.ai login in a product, or embedding the SDK under it, needs prior approval | proven by quote (1.2, D3) |
| An API key is the route developers are told to use | proven by quote (D3) |
| D2 applies to a local open-source app with no contracting entity | **not proven** — inference; in the question |
| A multi-stage pipeline is "ordinary, individual usage" | **not proven** — in the question |
| `claude -p` works under a subscription login | proven on 2026-11-10 (RFC check), one machine |
| "Not signed in" is detectable for free | proven on 2026-11-11 (test C) |
| The free probe proves a working credential | **disproven** (tests D, E) |
| In `-p` an environment API key beats the subscription login | proven on 2026-11-11 with an invalid key (T3); not tested with a valid key (T4) |
| `stream-json`, `--max-turns`, a `--tools` allow-list and `--resume` work under a subscription | proven on 2026-11-11 (T2, T8, T10, T11), one machine, one CLI version |
| `--max-budget-usd` is enforced under a subscription | proven on 2026-11-11 (T9); the run ended above the cap, as documented |
| `--bare` refuses the subscription login | proven on 2026-11-11 (T7) |
| A failed run is marked by `subtype` | **disproven**: authentication failures return `subtype=success` with `is_error: true` and exit 1 (T3, T5, T6, T7) |
| What a plan-limit refusal looks like to the caller in print mode | **not proven**, not documented, not cheaply testable |
| Usage from a started run counts against plan limits | documented (D9), "for now"; the run carried a `rate_limit_event` for the `seven_day` window (T2); the amount was not measured |
