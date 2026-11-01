# ADR-046: Seals on verdicts and receipt acceptances — tamper-evidence, not a lock

**Date:** 2026-11-01
**Status:** Accepted
**Issue:** great_cto-dv3b
**Related:** [ADR-045 verified distribution](ADR-045-verified-distribution.md) · [verified updates](../reference/verified-updates.md)

## Context

From 3.75.5, devops checks each approving stage against the tree it ships
(`receipt.mjs --verify --agent <stage> --require`). It trusts two kinds of file:

- the newest approving line in `.great_cto/verdicts/<agent>.log`;
- an operator's acceptance of a drifted state in `.great_cto/.receipt-accept`.

Both were plain JSON. A review of 3.75.5 reproduced two forgeries:

- an agent appends a `PASS` line whose receipt is computed on the current tree,
  and `--verify --require` exits 0;
- an agent writes `{hash, agent, at}` with the hash `receipt.mjs` computes, and the
  check reports "accepted by the operator". No terminal is involved.

The terminal check guarded only the `--accept` command. Nothing guarded the files.

## Decision

Every verdict line and every acceptance carries an HMAC-SHA256 seal.

- **What it covers.** Every field of the record but the seal itself, keys sorted
  at every depth. That includes `meta` (the `need=` routing), cost and project
  for a verdict, and the reason for an acceptance. A verdict also counts only in
  the log of the stage it names: a sealed code-reviewer line copied into
  `qa-engineer.log` is skipped.
- **The key.** `~/.great_cto/keys/verdict-seal.key`, 32 random bytes, mode 0600 in
  a 0700 directory, created on first use (`scripts/lib/verdict-seal.mjs`).
- **The writers seal.** `log-verdict.sh` seals through `verdict-record.mjs --emit`;
  `receipt.mjs --accept` seals through `writeAcceptance`.
- **The deploy question checks.** Under `--require`:
  - a newest approval whose seal does not match exits **4** — written or edited
    outside `log-verdict.sh`, and devops blocks;
  - one with no seal (older than 3.75.6, or a machine with no key) exits **3** —
    freshness not verified, said and never passed as verified;
  - an acceptance without a valid seal is not an acceptance.
- **The gate does not touch the operator's key.** `ci-local.sh` points
  `GREAT_CTO_SEAL_KEY` at a throwaway key. A bare `node --test` run outside the
  gate uses the operator's key, as any real verdict does.
- **Pre-push reads seals in one place.** Plain `--verify` does not check verdict
  seals, so lines written before this change keep working. But an acceptance it
  honours must be sealed, the same as for a deploy. An acceptance made on a
  machine without the key, or before 3.75.6, is not honoured, and the operator
  accepts again.

## What this does not do

Every agent runs as the same OS user as the operator. No file on this machine is
out of an agent's reach:

- code that imports `verdict-seal.mjs` can seal anything;
- an agent can run `log-verdict.sh qa-engineer PASS` without being the QA agent.

The seal makes forgery *deliberate* rather than *accidental*:

- a hand-written or hand-edited line fails;
- making a valid one means running the writer or reading the key;
- a direct read of a `*.key` file is refused by the secret-read guard.

A lock would need a human-presence primitive that an agent cannot operate, such as
a hardware key or an OS confirmation dialog. This machine has neither today.

## Options and trade-offs

| Option | Stops a hand-written line | Stops a determined agent | Cost |
|---|---|---|---|
| **HMAC with a guarded key file (chosen)** | yes | no | one module; old lines read as unsealed |
| Keychain item with an always-confirm ACL | yes | only while the human never clicks "Always allow" | macOS only, a dialog per verdict |
| Hardware key (touch to sign) | yes | yes | needs the hardware; every approval waits for a touch |
| Leave the files plain, document the limit | no | no | none (3.75.5) |

## Consequences

- Verdicts written before 3.75.6 read as unsealed under `--require` and are
  reported "not verified" until the stage runs again.
- A deploy from a machine without the key (another clone, CI) cannot verify seals
  and says so (exit 3); it does not pass them.
- Revisit this when a human-presence primitive is available: the seal check is the
  place a signature would replace the HMAC.
