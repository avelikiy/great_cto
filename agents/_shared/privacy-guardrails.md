# Privacy guardrails (canonical — knowledge/lesson writers)

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
