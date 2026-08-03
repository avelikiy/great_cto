# Step 2a — Formal Verification

> Runs only for `smart-contract` and `defi-protocol` archetypes. Read it when
> the project is one of those; every other project used to carry it in SKILL.md
> on every request.

**Step 2a — Formal Verification** (only for `smart-contract` and `defi-protocol` types):

Run BEFORE code review. Blocks pipeline if any violation found.

```bash
TYPE=$(grep "^primary:\|^secondary:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr '\n' ' ')
echo "$TYPE" | grep -qE "smart-contract|defi-protocol" && echo "FORMAL_VERIFICATION_REQUIRED" || echo "SKIP"
```

If FORMAL_VERIFICATION_REQUIRED → spawn `great_cto-security-officer` with focused prompt:
> "Run formal verification for this smart contract / DeFi protocol. Steps:
> 1. Run Echidna fuzz (≥10k runs): `echidna-test . --config echidna.yaml 2>&1 | tee docs/security/echidna-$(date +%Y-%m-%d).txt`
> 2. Run Slither static analysis: `slither . 2>&1 | tee docs/security/slither-$(date +%Y-%m-%d).txt`
> 3. For defi-protocol: run Foundry invariant tests: `forge test --match-test invariant 2>&1 | tee docs/security/invariant-$(date +%Y-%m-%d).txt`
> 4. For defi-protocol: confirm formal verification artifact exists in docs/security/ (Certora/KEVM proof)
> 5. Write summary to docs/security/FORMAL-VERIFICATION-$(date +%Y-%m-%d).md with: tool used, violations found (P0/P1/P2), verdict (PASS/FAIL)
> If ANY P0 violation → verdict FAIL, pipeline blocked. Do not proceed to code review."

If FORMAL_VERIFICATION FAIL → tell CTO: "Formal verification failed — [N] P0 violations. Senior-dev must fix before pipeline can continue."
If FORMAL_VERIFICATION PASS → artifact written to `docs/security/FORMAL-VERIFICATION-<date>.md` → proceed.
