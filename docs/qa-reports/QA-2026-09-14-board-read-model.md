# Board read-model performance verification — 2026-09-14

Scope: local macOS arm64, Node 22.14, repository with 337 Beads issues and seven
registered projects. Measurements are localhost wall time, not synthetic unit
timings.

| Contract | Measured | Result |
|---|---:|---|
| Cold DOM ready | 223 ms | pass, budget <500 ms |
| Restart with persisted last-good snapshot | 81 ms, 337 tasks, explicit `stale` | pass, budget <500 ms |
| Warm `/api/bootstrap` p95 | 4–9 ms across 20–40 sequential reads | pass, budget <100 ms |
| Initial API requests after 3 s | 7 | pass, budget <=10 |
| Initial `/api/receipt` | 0 ms, explicit `computing` | pass, drawer budget <150 ms |
| Cached `/api/receipt` | 16 ms | pass, drawer budget <150 ms |
| `/api/version` while receipt worker ran | 1 ms | pass, repository hashing did not block an unrelated read |

The first-ever materialisation, with no persisted revision, reached a current
snapshot in 1.134 s because the local Beads read itself took roughly 0.7 s.
During that interval the DOM was interactive at 223 ms and rendered an explicit
loading state. Subsequent process-cold starts serve the last-good revision in
81 ms and label it stale until the worker publishes current data. This is the
intended cold-start contract: useful bounded-latency state without pretending
that a persisted projection is fresh evidence.

The browser request capture used a clean headless Chrome context and counted
only `/api/*` requests through the first three seconds. The seven requests were:
bootstrap, notification history, local view counter, SSE, one handshake-bound
bootstrap race check, stand-downs and receipt.
