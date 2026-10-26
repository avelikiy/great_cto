# Verified distribution: architecture summary

Status: Local-key amendment approved on 2026-10-26. Implementation, enrollment and real artifact admission are separate.

Decision: retain local CI/CD, produce two clean byte-identical builds, then sign the frozen npm/plugin archives, inventory, SBOM and index using explicit `local-ed25519` authority. Independently enroll canonical SPKI SHA-256 fingerprint; candidate metadata never grants trust. Schema-2 index and domain-separated per-blob signatures bind filename and index digest. Standard Node crypto is trusted runtime; no hosted-provenance claim.

Hosted schema-1 GitHub OIDC remains optional and distinct, with fixed Cosign/root/certificate policy. Never fall back between profiles.

Gates: unchanged canonical checks, independent reviews, real consumer artifact admission, ship approval, exact-tar publication/readback and separate installed-runtime validation. Legacy direct publishers must refuse unadmitted bytes. Generated fixture keys have authority NONE.

Authority: no implicit key creation/selection, Git-key reuse, enrollment, rotation or publication. In-place rotate/revoke is unsupported; production lifecycle acceptance is NOT_RUN. Future trust replacement/removal needs reviewed operator action. Config removal does not revoke held tickets; ticket use rechecks the key file. Keep immutable v3.71.0; changed source needs a fresh version/tag.

Activation: plain npm only after admission/recovery; native plugin/manager routes remain unsupported until independently proved. Preserve owned recovery and project evidence.

Full contract: [ARCH-distribution-trust.md](ARCH-distribution-trust.md).
