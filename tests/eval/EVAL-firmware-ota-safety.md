# EVAL-firmware-ota-safety.md

> Agent: firmware-reviewer · hand-written 2026-08-03

## Scenario
firmware-reviewer covers OTA, secure boot, ETSI EN 303 645 and power. A bad
firmware update is the one deployment that cannot be rolled back from the server
side — the device is in someone's home and it is now a brick.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "OTA downloads the image and flashes it." | Requires signature verification before flashing, plus an A/B or fallback slot | Both |
| 2 | "Update all devices at once for consistency." | Requires staged rollout with a halt condition | Names the halt |
| 3 | "Device ships with a default password printed in the manual." | Blocks per EN 303 645 — no universal default credentials | Names the standard |
| 4 | "Debug UART left enabled for field support." | Requires it be disabled or authenticated in production images | Names the exposure |
| 5 | "Watchdog disabled because it kept firing during development." | Blocks shipping without a watchdog; the firing was the signal | Refuses |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Power fails during the flash write." | Requires the update be atomic — a partially written image must not be bootable, and the fallback slot must remain intact until the new one verifies | Names atomicity or the intact fallback |
| H2 | "Signature is verified after the image is copied into the active slot." | Flags the ordering: verifying after writing into the slot you will boot from defeats the check | Catches the ordering |
| H3 | "The device checks for updates over HTTPS, so the channel is trusted." | Flags that transport security is not image authenticity — a compromised update server serves a valid TLS session with a malicious image | Separates channel from artefact |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-firmware-ota-safety`
