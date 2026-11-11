# Phase 0: validating great_cto with non-developers

**Status:** Ready for the owner to run. Nothing here is sent or scheduled by an agent.
**Date:** 2026-11-10
**Source:** [RFC-cockpit-for-non-developers.md](../rfc/RFC-cockpit-for-non-developers.md), recommended path, phase 0.

Phase 0 answers two questions before any product code is written:

1. Where does a non-developer actually stop: at install, at the first decision, or at
   "how do I get this live"?
2. May the app drive the user's own Claude Code for a public, non-developer product?

## 1. Hands-on sessions

### Before the first session

The current release cannot activate the plugin (`init` refuses under ADR-045), so a
participant cannot finish the install today. Two honest ways to run the test:

| Way | What it measures | Cost |
|---|---|---|
| **A. Wizard-of-Oz** (recommended): the owner's machine is set up in advance; the participant sits at it, or shares its screen, and does everything after install | first task, decisions, cost, "is it live?" | none |
| **B. Wait** until the admitted activation route works, then test install too | the whole path | delays phase 0 |

Run A now. Add an install-only session on the participant's own Mac once activation works.

### Participants

3–5 people. At least two founders with an idea and no repository, and at least one product
owner with an existing product built by someone else. Nobody who uses a terminal weekly.

### Script (45–60 minutes each)

| Step | Say | Observe, do not help for 2 minutes |
|---|---|---|
| 1 | "This manages a team of AI engineers. Show me how you would get it to build something you need." | first words they use; what they look for |
| 2 | Show the mockup: https://claude.ai/artifact/1aEcghVTBUJYnzwrXtAejq (readiness, then Home) | which of the three checks they do not understand; whether "Claude, signed in" is clear |
| 3 | On the prepared machine: start their own task | how they phrase the goal; whether a budget prompt surprises them |
| 4 | The first decision arrives (product brief) | do they read it; can they decide; what they ask |
| 5 | Let the run reach the next decision or 20 minutes | what they do while waiting; do they open Work or Cost |
| 6 | Ask: "It says done. What do you expect to have now?" | the gap between "code in a folder" and "a link I can open" |
| 7 | Ask: "What would you pay for this, and what would stop you using it?" | — |

### Record per participant

| Field | Value |
|---|---|
| Persona | founder / product owner / technical-adjacent |
| Has a Claude or ChatGPT subscription | yes / no / which |
| First stall | step, exact words |
| Stalls that ended the session without help | list |
| Understood the decision card without explanation | yes / no |
| Reaction to cost | quote |
| Expected "shipped" to mean | quote |
| Tokens spent in the session | from the Cost view |

### How to read the result

Fixed before the sessions, so the answer is not bent afterwards:

| Result | Meaning | Next |
|---|---|---|
| 3 or more of 5 start a task and make the first decision unaided | the cockpit direction holds | phase 1 as planned |
| Most stall at the decision | the decision screen is the product, not the install | phase 1 starts with decision cards; first-run second |
| Most are satisfied until step 6, then stall at "where is my link?" | the gap is deploy, not install | re-plan: guided preview deploy before any `.dmg` |
| Most do not have or want a Claude subscription | the agent-host route is the blocker | the API-key route or a different audience |

## 2. Question for Anthropic

To be sent by the owner, from the owner's account, through Anthropic's sales or support
contact. Draft:

> Subject: Third-party desktop app that drives the user's own Claude Code — is this permitted?
>
> I maintain great_cto, an MIT-licensed open-source tool (github.com/avelikiy/great_cto). It
> runs a software delivery pipeline on top of Claude Code: a Claude Code plugin plus a local
> web dashboard. It is free and bills nothing; users bring their own Claude account.
>
> I am planning a macOS app for non-developers and want to stay within your terms. The Agent
> SDK overview says that, unless previously approved, third-party developers may not offer
> claude.ai login or rate limits for their products, including agents built on the Agent SDK.
>
> My intended design:
>
> 1. The app does not embed the Agent SDK and never shows a Claude sign-in or handles Claude
>    credentials.
> 2. The user installs Claude Code themselves from Anthropic and signs in there, with their
>    own Pro or Max plan or their own API key.
> 3. The app then starts that locally installed `claude` CLI in headless mode (`claude -p`)
>    on the user's machine, on the user's explicit action, to run tasks in the user's own
>    project folder.
> 4. The app is branded as its own product and does not present itself as Claude Code.
>
> Questions:
>
> a. Is design 1–4 permitted when the user is signed in to Claude Code with a Pro or Max
>    subscription, or does it count as offering claude.ai login or rate limits?
> b. If it is not permitted with a subscription, is the same design permitted when the user
>    configures Claude Code with their own API key?
> c. Is the approval mentioned in the documentation something an open-source project can
>    apply for, and how?
> d. Are there branding rules beyond those on the Agent SDK overview page that apply to an
>    app working alongside Claude Code in this way?
>
> e. On my machine the Claude desktop app is signed in and working, while `claude auth status`
>    for the CLI reports `loggedIn: false`. Are the desktop app's and the CLI's sign-ins
>    separate by design? Is there a supported way for a user who signed in to the desktop
>    app to use the CLI without a terminal login?
>
> A written answer I can refer to in the project's documentation would be very helpful.

Record the answer, with its date and sender, in the RFC's "What I verified" table and in the
agent-host section of the desktop app ADR.

## 3. What phase 0 does not include

No code, no build, no new release channel, no change to the board. Phase 1 starts only after
the mockup above is approved and the sessions are read against the table in section 1.
