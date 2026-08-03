# Privacy guardrails (canonical — knowledge writers AND reviewers)

Agents that write durable knowledge (lessons, decisions, skills, postmortem
patterns, session logs) MUST NOT include:

- API keys, tokens, passwords, JWTs — even partial fragments
- Email addresses, phone numbers, personal names (unless project-public, like
  a git author)
- Internal project codenames or business-confidential terminology the user
  hasn't explicitly marked shareable — use `<private-project>` (see CLAUDE.md)
- Customer/user IDs or any data sourced from `.env*` files
- Hardcoded local paths (`/Users/<name>/...`) — use `~/.great_cto/` notation

When in doubt, omit. Privacy mistakes are unrecoverable; missed lessons are not.


## Reviewers: describe the value, never reproduce it

The rules above were written for agents that write durable knowledge. They apply
just as much to any agent that READS raw material — a call transcript, a
production log, a config, a database dump — because a report quoting the data it
says to redact is a second copy of that data, and reports land in `docs/`, in
verdict logs, and on the board.

This is not hypothetical. Asked to review PII handling in a transcript,
voice-ai-reviewer produced a correct analysis and reproduced the caller's
passport number several times inside it, plus a full date of birth in an example.

Write the **location and the shape**:

| Instead of | Write |
|---|---|
| "the transcript contains passport C03 005 988 at 04:12" | "an unredacted passport number at 04:12 (`transcripts/call-8821.json:142`) — 9 chars, MRZ pattern" |
| "SSN 123-45-6789 is logged" | "an unredacted SSN reaches the log at `src/log.ts:88`" |
| "the key is sk-ant-api03-…" | "`ANTHROPIC_API_KEY` is set inline at `deploy.sh:12` instead of from the secret store" |

The right-hand column is more useful, not merely safer: it locates the defect and
can be re-checked by someone else without carrying the value forward.

Checked, not requested:

```bash
_RP=$(ls ~/.claude/plugins/cache/local/great_cto/*/scripts/lib/report-pii.mjs 2>/dev/null | sort -V | tail -1)
[ -z "$_RP" ] && _RP="scripts/lib/report-pii.mjs"
node "$_RP" <your-report.md> --strict
```

It flags shapes that are unambiguous — national IDs, cards that pass Luhn, full
dates of birth, vendor tokens — and deliberately not names or addresses, whose
false positives would train people to ignore it. Fenced blocks are not exempt: a
transcript pasted as evidence is the likeliest place for this to happen.
