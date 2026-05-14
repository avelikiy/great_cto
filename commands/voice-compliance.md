---
description: "Voice/telephony compliance check — invokes voice-ai-reviewer to produce TM-voice-{slug}.md with TCPA, STIR/SHAKEN, state recording-consent, EU AI Act Art. 50, and synth-voice deepfake-law gaps."
argument-hint: "[slug] — optional ARCH slug to review (defaults to latest)"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto **/voice-compliance** command. Run the voice-ai-reviewer
on the current project and report findings.

## Step 1 — Locate ARCH doc

```bash
ARGS="${ARGUMENTS:-}"
SLUG="$ARGS"
if [ -z "$SLUG" ]; then
  ARCH=$(ls docs/architecture/ARCH-*.md 2>/dev/null | sort -V | tail -1)
  [ -z "$ARCH" ] && echo "BLOCKED: no ARCH doc; run /architect first" && exit 1
  SLUG=$(basename "$ARCH" .md | sed 's/^ARCH-//')
else
  ARCH="docs/architecture/ARCH-${SLUG}.md"
  [ ! -f "$ARCH" ] && echo "BLOCKED: $ARCH not found" && exit 1
fi
echo "Reviewing: $ARCH"
```

## Step 2 — Detect voice signals (skip if none)

```bash
VOICE_HITS=$(grep -ciE "twilio|vonage|livekit|deepgram|elevenlabs|whisper|ivr|telephony|outbound call|inbound call|voice agent|tts|stt" "$ARCH" .great_cto/PROJECT.md 2>/dev/null || echo 0)
if [ "$VOICE_HITS" -eq 0 ]; then
  echo "No voice/telephony signals in ARCH or PROJECT.md — skipping voice review."
  exit 0
fi
```

## Step 3 — Invoke voice-ai-reviewer

Use the Agent tool with `subagent_type: voice-ai-reviewer` and prompt:

> Review `docs/architecture/ARCH-${SLUG}.md` and `.great_cto/PROJECT.md`.
> Produce `docs/sec-threats/TM-voice-${SLUG}.md` using the template at
> `skills/great_cto/templates/TM-voice.md`. Report critical/high findings
> and append the HANDOFF block. Verdict: signed-off or blocked.

## Step 4 — Surface verdict

After agent completes, print:

- TM file path
- Critical / High counts
- Verdict (signed-off | blocked)
- List of gates raised (`gate:voice-compliance`, …)
- Next action: if blocked → fix critical items, re-run; if signed-off → notify regulatory lead to approve `gate:voice-compliance`.
