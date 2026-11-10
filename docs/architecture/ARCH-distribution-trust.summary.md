# Verified distribution: architecture summary

Status: Local-key authority and test-clock v3 decisions approved. Production enrollment and artifact admission remain separate.

Decision: local CI/CD produces two clean byte-identical builds, then signs frozen npm/plugin archives, inventory, SBOM and index with explicit `local-ed25519` authority. Independently enroll canonical SPKI SHA-256 fingerprint; candidate metadata never grants trust. Schema-2 index and domain-separated signatures bind filename and index digest. Node crypto is trusted runtime, without hosted-provenance claims.

Hosted schema-1 GitHub OIDC stays optional and distinct, with fixed Cosign/root/certificate policy. No profile fallback.

Gates: complete canonical inventory, unchanged budgets, approved test-only v3 phase clocks, independent reviews, real artifact admission, ship approval, exact-tar publication/readback and installed-runtime verification. Legacy direct publishers refuse unadmitted bytes. Fixture keys have authority NONE; historical failures remain evidence.

Authority: no implicit key creation, Git-key reuse, enrollment, rotation or publication. In-place rotate/revoke remains unsupported; lifecycle acceptance is NOT_RUN. Config removal does not revoke held tickets; ticket use rechecks key files. Preserve immutable v3.71.0; changed source needs a new version/tag.

Activation: owned plain npm after admission/recovery. Native plugin/manager routes remain unsupported until independently proved. Preserve project evidence.

Full contract: [ARCH-distribution-trust.md](ARCH-distribution-trust.md).
