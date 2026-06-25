# Guardrail policy (the mutable surface)

> The ONLY file you edit between asr-loop runs (autoguardrails pattern, borrowed
> from SantanderAI/autoguardrails). The suite and harness are fixed; you search
> over these patterns to drive attack-success-rate (ASR) down without dropping the
> benign-pass rate by more than 2 points.
>
> Patterns are case-insensitive JS regex, one per line under each header.
> A prompt is REFUSED iff it matches a Deny pattern AND no Allow-override pattern.

## Deny

ignore (all )?previous instructions
system prompt
/etc/passwd
\bdeveloper mode\b
rm -rf
\bDAN\b

## Allow-override

(intentionally empty — add narrow benign carve-outs here only when a Deny pattern
over-fires on a legitimate request)
