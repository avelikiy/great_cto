# Web3 Domain Pack

> Extends `web3` archetype with domain-specific depth for smart contracts, DeFi protocols, custody wallets, bridge protocols, CEX exchanges, and trading bots.
> Loaded when `packs: [web3-pack]` is in PROJECT.md or auto-loaded for `web3` archetype.

## QA Extras Reference

### `formal-verification` — Mathematical Proof (defi-protocol, bridge-protocol)
- **What**: Prove contract correctness against formal specification
- **Tool**: Certora Prover, K Framework, or Scribble annotations
- **Threshold**: All specified invariants proven; 0 counter-examples
- **Artifacts**: Formal spec file + verification report in `docs/security/`

### `flash-loan-sim` — Flash Loan Attack (defi-protocol)
- **What**: Simulate flash loan attacks against protocol
- **Tool**: Foundry fork test with flash loan provider
- **Scenarios**: Price manipulation, liquidity drain, governance attack, oracle manipulation
- **Threshold**: 0 profitable attack vectors found
- **Report**: Attack simulation log in `docs/security/`

### `economic-attack-sim` — Economic Attack (bridge-protocol, defi-protocol)
- **What**: Simulate economic attacks (MEV, sandwich, front-running)
- **Tool**: Foundry + Flashbots simulation or custom attack scripts
- **Scenarios**: Sandwich attack on swaps, front-running on mints, back-running on oracle updates
- **Threshold**: 0 profitable MEV vectors or documented mitigation for each

### `kill-switch` — Emergency Stop (trading-bot)
- **What**: Verify kill-switch disables all trading activity within SLA
- **Tool**: Trigger kill-switch during active trading simulation
- **Threshold**: All open orders cancelled within 5s, no new orders placed, position exposure capped
- **Test both**: bot-level kill-switch + exchange-level API kill-switch

### `slither-audit` — Static Analysis (smart-contract)
- **What**: Slither static analysis for known vulnerability patterns
- **Tool**: `slither . --filter-paths "test|mock" 2>&1`
- **Threshold**: 0 high/critical findings, all medium findings documented with justification
- **SWC checklist**: SWC-103 (floating pragma), SWC-104 (unchecked return), SWC-107 (reentrancy), SWC-110 (assert), SWC-113 (DoS), SWC-115 (tx.origin), SWC-116 (timestamp), SWC-124 (lack of ctor), SWC-125 (incorrect inheritance)

### `echidna-fuzz` — Property-Based Fuzzing (smart-contract, defi-protocol)
- **What**: Fuzz contract with Echidna for invariant violations
- **Tool**: `echidna . --test-mode assertion --test-limit 50000`
- **Threshold**: 50,000+ runs, 0 invariant violations
- **Properties**: balance invariants, access control, state machine transitions

### `reentrancy-guard` — Reentrancy Audit (smart-contract)
- **What**: Verify all external calls are protected against reentrancy
- **Tool**: Manual audit + Slither reentrancy detector
- **Checklist**: CEI pattern (Checks-Effects-Interactions), ReentrancyGuard on all public functions with external calls, no callbacks in state-changing functions

### `gas-optimization` — Gas Profiling (smart-contract)
- **What**: Profile gas usage per function, identify optimization opportunities
- **Tool**: `forge test --gas-report`
- **Threshold**: No function >500k gas without documented justification
- **Report**: Gas report in `docs/qa-reports/`

### `key-ceremony` — Key Management (custody-wallet)
- **What**: Audit key generation ceremony transcript
- **Checklist**: Multi-party computation (MPC) or Shamir's Secret Sharing, HSM attestation verified, no single point of compromise, ceremony witnesses documented
- **Artifact**: Key ceremony transcript in `docs/security/` (signed by witnesses)

### `sanctions-screening` — Compliance Screening (custody-wallet, cex-exchange)
- **What**: Verify sanctions screening integration
- **Lists**: OFAC SDN, EU consolidated list, UNSC consolidated list
- **SLA**: Screening data updated ≤24h
- **Test**: Submit known sanctioned addresses → verify blocking

### `kyc-aml` — KYC/AML Integration (cex-exchange)
- **What**: Verify KYC/AML flow completeness
- **Checklist**: Identity verification, proof of address, PEP screening, adverse media check, ongoing monitoring, suspicious activity reporting (SAR)
- **Test**: End-to-end KYC flow with test identities

### `order-matching` — Order Book Correctness (cex-exchange)
- **What**: Prove order matching engine correctness
- **Properties**: FIFO/price-time priority, no order duplication, no phantom fills, atomic execution
- **Tool**: Property-based tests + formal specification of matching rules
- **Threshold**: 0 matching errors across 100k+ simulated orders

### `circuit-breaker` — Market Circuit Breaker (cex-exchange, trading-bot)
- **What**: Verify circuit breaker triggers correctly
- **Scenarios**: Flash crash (>10% drop in 1min), liquidity drain, API overload
- **Threshold**: Circuit breaker triggers within configured parameters, graceful degradation confirmed

## Compliance Extras

### `fatf` — FATF Travel Rule
- Verify travel rule implementation for transfers >$1,000 (or jurisdiction threshold)
- Originator + beneficiary info transmitted with transaction
- Integration with travel rule provider (Notabene, Sygna, TRP)

### `ccss` — CryptoCurrency Security Standard
- Classify each component: Level 1 (basic), Level 2 (standard), Level 3 (advanced)
- Key storage audit per CCSS requirements
- Signing protocol verification
- Document classification in `docs/security/CCSS-classification.md`

### `ofac` — Sanctions Compliance
- Wallet screening against OFAC SDN list
- Transaction monitoring for sanctioned jurisdictions
- Blocking mechanism verified (transactions from/to sanctioned addresses rejected)
- Update SLA: ≤24h after list update published

### `kyc-aml-regs` — KYC/AML Regulatory
- Jurisdiction-specific requirements documented
- Customer Due Diligence (CDD) process verified
- Enhanced Due Diligence (EDD) for high-risk customers
- SAR filing process tested
- Record retention: minimum 5 years
