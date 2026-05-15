# Demo video — script + shot list

> 60–90 second hero demo. Path: empty repo → init → archetype detect → first
> feature ship → gate approval. Single take preferred; cuts only on terminal
> output flooding the screen.

## Target audience

A CTO landing on greatcto.systems for the first time. Skeptical. They've seen
30 AI coding tools this month. Decides in 15 s whether to stay.

## Hard constraints

- **60–90 s total.** Hard cap. Hero embed strips longer videos.
- **No music.** Just keystroke + terminal beeps.
- **No voice-over** in v1. Subtitles only. v2 may add a 6-line VO.
- **Captioned by default** — looped on autoplay, muted is the norm.
- **Aspect:** 16:9 at 1920×1080, embed-friendly.
- **One take** — viewer must trust we're not editing.

## What it must NOT show

- ❌ A pre-cooked repo with code already there
- ❌ The terminal "thinking" with fake spinners
- ❌ More than 2 keystroke pauses > 3 s (cut to next state if waiting)
- ❌ Any LLM API key entry on screen
- ❌ Multiple cuts that hide latency

## Shot list

### 00:00–00:04 · Cold open

- **Visual:** Empty terminal in a freshly created directory. `mkdir saas-demo && cd saas-demo && ls` shows nothing.
- **Caption:** `Empty repo. No tooling. Solo dev.`

### 00:04–00:10 · The install

- **Visual:** Type `npx great-cto init`. Press Enter.
- **Caption:** `One command. Runs locally. MIT license.`

### 00:10–00:22 · Archetype detection

- **Visual:** Output shows:
  ```
  ✓ scanning… 0 deps · 0 files
  ? what are you building?  ▎
  ```
  Type: `voice AI for restaurants`
  ```
  ✓ archetype:    agent-product
  ✓ pack overlay: voice-pack
  ✓ gates wired:  gate:plan · gate:voice-compliance · gate:ship
  ✓ agents:       34 specialists ready
  ```
- **Caption:** `Detects the archetype. Wires the gates. No config.`

### 00:22–00:32 · First feature prompt

- **Visual:** Type `/start "ship the take-order endpoint"`
- **Output (compressed):**
  ```
  ░ architect …  ARCH-take-order.md drafted    $0.18
  ░ pm        …  3 beads tasks queued          $0.05
  ⚐ gate:plan    awaiting human approval
  ```
- **Caption:** `Architect drafts the spec. PM decomposes. Stops at the gate.`

### 00:32–00:42 · First gate

- **Visual:** A clean side-panel showing the ARCH doc + cost estimate + 3 tasks.
- Keystroke: `y` (approve).
- **Caption:** `Decision #1 of 2. ~30 seconds, one click.`

### 00:42–00:58 · The pipeline runs

- **Visual:** Terminal streams (cut to ~8 visible lines, no fake animations):
  ```
  ▸ senior-dev #1  …  POST /orders  +213 LOC +28 tests   $0.42
  ▸ senior-dev #2  …  consent flow  +91 LOC  +12 tests   $0.31
  ▸ qa-engineer    …  coverage 93%  · type ok · lint ok  $0.18
  ▸ security       …  PCI SAQ-A · TCPA · STIR/SHAKEN OK  $0.27
  ▸ voice-ai-rev   …  voice consent flow signed off      $0.21
  ▸ code-reviewer  …  12 angles · P0:0 P1:1 P2:2          $0.34
  ⚐ gate:ship      awaiting human approval
  ```
- **Caption:** `34 agents working in parallel. You see verdicts, not noise.`

### 00:58–01:08 · Second gate

- **Visual:** Side-panel: review verdicts collapsed by reviewer. One yellow `P1` chip ("rate limit recommendation"). Operator clicks it, sees the diff, hits **Approve**.
- **Caption:** `Decision #2 of 2. Every verdict is one click from the source diff.`

### 01:08–01:18 · Deploy + done

- **Visual:**
  ```
  ▸ devops  …  canary 5% → 20% → 100%  · health OK     $0.07
  ✓ shipped. PR-001 merged. v0.1.0 published.
  ⌁ continuous-learner: lesson saved (cross-project memory)
  ```
- **Caption:** `~45 minutes. Two clicks. ~$2 in LLM cost. Sleep tonight.`

### 01:18–01:24 · Outro card

- **Visual:** Static card with text:
  ```
  greatcto.systems
  $ npx great-cto init
  ```
- **Caption:** `Free. MIT. Runs locally. Pay your own API.`

## Production notes

- **Terminal:** iTerm2 or Warp at 14 pt Geist Mono on dark theme. Window 1600×900 with a 32 px outer padding.
- **Recording:** ScreenStudio or asciinema → mp4. Keep file ≤ 8 MB for hero embed.
- **Capture clock:** record at 60 fps to avoid frame-drop visual jitter during fast text streams.
- **Subtitles:** burn in. Verdana 24 pt, white, 60 % opacity black bar behind. WCAG-readable.
- **No drop-shadows** on terminal screenshots. They look stocky.
- **Show real costs.** If a step is $0.42 actual, do not round to $0.50 to be tidy. Honesty compounds.

## Where it embeds

1. **Hero of greatcto.systems** — replace or sit alongside the existing `<div class="hero-terminal">`. Above the fold, autoplay+muted+looped.
2. **`/proof` page** — at the top, before the timeline. Sets the frame for the static timeline below.
3. **README.md** — embedded thumbnail linking to YouTube unlisted upload.
4. **`/architecture` page** — at the bottom, as "see it run" CTA after the static diagram.

## Versioning

- **v1 (this script):** silent, captioned, one take, voice-pack scenario.
- **v2 (after we have ≥ 100 WAU):** add 6-line voice-over. Same script, no visual changes.
- **v3 (after enterprise wedge proves):** swap voice-pack for fintech (Stripe Connect + PCI). Two parallel cuts.

## Re-record cadence

Re-shoot when **any** of these happens:
- Agent count visible on screen changes (e.g. 34 → 38)
- CLI command changes (e.g. `init` flow gets a new prompt)
- A pack mentioned in subtitles ships or retires
- The cost numbers drift > 15 % from current truth

## Anti-patterns to avoid

- ❌ "Look at all these agents!" — the count is not the story. Two decisions is the story.
- ❌ Showing the kanban board flying through 50 tasks. Looks impressive, reads as bot-spam.
- ❌ A "before vs after" split-screen. Trite. The 90 s is the proof.
- ❌ Voice-over that says "It's like having a CTO in your terminal." We are not allowed to use the word "like." Show the artifact.

## Approval

Ship after:
1. One internal viewing on a phone (subtitles legible at small size).
2. One CTO friend who has not seen GreatCTO watches it cold and tells you what they think it does in one sentence. If their sentence matches the positioning, ship. If not, re-record.
