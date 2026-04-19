# Demo: Smart Contract

**Stack**: Solidity, Hardhat, OpenZeppelin, Ethereum mainnet
**Detected types**: `smart-contract`
**Pipeline**: Slither + Mythril → testnet → mainnet (no /ship — uses Hardhat deploy)

---

## Session transcript

```
/start "ERC-20 governance token with staking and time-lock, Ethereum mainnet"

Great CTO: Got it: smart-contract. MANDATORY security gate active.
Deploy method: Hardhat deploy (not /ship).

"build staking contract with 30-day time-lock and reward distribution"

[tech-lead — Opus]
Architecture ready → docs/architecture/ARCH-staking.md
• ERC-20 + EIP-2612 permit for gasless approvals
• Staking contract: checkpoint-based reward calculation (no loops)
• TimeLock: 30-day delay on parameter changes
• Upgrade: transparent proxy (UUPS) for emergency fixes
• ADR-001: UUPS over Transparent Proxy — 40% gas savings on calls
Proceed? [yes/no]

approve

[senior-dev — Sonnet]
Branch: feat/1-staking-contract
TDD: Hardhat tests — 63 unit tests, fork testing on mainnet state
PR: #3 opened

[red-team — Sonnet]
Attacks run: 31
• P0: Reentrancy attack on withdraw() — reward drained before balance update → BUG-001
• P0: Integer overflow in compoundRewards() at high staking amounts → BUG-002
• P1: Flash loan manipulation of reward calculation snapshot
Pipeline BLOCKED — senior-dev must fix P0s before proceeding.

[senior-dev fixes P0s — re-runs red-team]
Red Team (round 2): 0 P0, 0 P1, 2 P2 ✓

[qa-engineer + security-officer + runbook-writer — parallel]
QA: PASS
  • Slither: 0 high/critical ✓
  • Mythril: 0 vulnerabilities ✓
  • Gas optimization: stake()=45k, withdraw()=38k (under budget) ✓
  • Fork test: mainnet state, 10k ETH stress test ✓
Security: APPROVED
  • Reentrancy guards: ✓
  • Integer arithmetic: SafeMath / Solidity 0.8 overflow protection ✓
  • Access control: Ownable + TimeLock ✓
  • No selfdestruct, no delegatecall to untrusted ✓
Runbook: docs/runbooks/RB-staking-2026-04-07.md ✓
Confidence: HIGH

Deploy via Hardhat? [yes/no]

ship it

[devops — Haiku]
Goerli testnet: deploy + 24h monitoring → PASS
Mainnet: deploy via Hardhat
Contract verified on Etherscan ✓
CHANGELOG.md ✓

Deploy complete.
Contract: 0x742d...  | Gas used: 2.1M | Verified: ✓
```

---

## Key pipeline rules applied

| Rule | Applied |
|------|---------|
| MANDATORY security gate | ✓ |
| Slither static analysis | ✓ |
| Mythril symbolic execution | ✓ |
| Testnet before mainnet | ✓ |
| Red team reentrancy attacks | ✓ (P0 found + fixed) |
| Hardhat deploy (not /ship) | ✓ |
| Etherscan verification | ✓ |
