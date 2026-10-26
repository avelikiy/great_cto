# Verified distribution: architecture summary

Status: Proposed; gate:arch pending. No production implementation or signature claim.

Decision: build exact npm and complete compiled plugin archives once; sign each blob,
runtime inventory and strict index under the fixed GitHub Actions issuer,
repository, tag and workflow identity. Certificate workflow SHA must match the
signed source commit. Trusted Cosign verifies before any candidate code runs.

Activation: initially support staged plain npm and managed local Claude only
when their complete admission/recovery contracts pass. Block unsupported native,
pnpm and Volta routes; npx MCP and companion downloads require separate admitted
runtime closure. Preserve only owned package/bin state and private legacy recovery.

Bootstrap: source admission → candidate tag plus SIGN_ONLY → artifact admission →
publish. SIGN_ONLY must block npm, JSR, public releases and announcements.
A branch certificate or synthetic test cannot authorize production release.

Gates: 16 proposed acceptance scenarios, hostile-input and recovery tests,
real cryptographic evidence, independent review and exact-candidate verification.
Existing graph gates stay unchanged. Workflow availability, trusted verifier and
publisher settings are external prerequisites.

Full contract: [ARCH-distribution-trust.md](ARCH-distribution-trust.md).
