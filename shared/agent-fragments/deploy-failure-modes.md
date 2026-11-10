# Deploy failure modes — what breaks, not what to check

A checklist tells you where to look. This tells you **what goes wrong there**,
which is the part that cannot be derived from the checklist.

The distinction is not academic. An agent that asks "which cache layer was
cleared, and is warming needed?" has asked a reasonable question and still
missed the mechanism: a cold cache sends every request to the database at once,
and the database is sized for the hit rate it had a minute ago. Naming the
mechanism is what turns a polite question into a decision.

Read this when a deploy involves state that outlives it, two versions running at
once, a replica, a capacity change, an expiry, or a dependency you do not own —
which is nearly every deploy that is not a static-site push.

Each entry is **mechanism → what it does → what surfaces it**. The question is
last on purpose: the question is worthless without the mechanism behind it.

---

## 1. State that outlives the deploy

The new code starts clean. Everything around it does not.

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Cold cache / thundering herd** | Every request misses at once and falls through to the origin. The database is provisioned for the steady-state hit rate, not for 100% of traffic. Recovery is not automatic: the retry storm can keep it down after the original cause is gone. | Current hit rate and what QPS reaches the origin at 0%. Warm the cache, or stagger invalidation by key range. |
| **Cache key collision across versions** | The new code reads a value the old code wrote under the same key with a different shape. Deserialization fails, or worse, succeeds into the wrong meaning. | Whether the cache key encodes a schema version. |
| **Stale sessions** | A session written by the old code is read by the new. Fields the new code requires are absent for everyone already logged in. | What the new code does with a session it did not write. |
| **In-flight queue messages** | Messages enqueued by the old producer are consumed by the new consumer. The payload contract changed between them, and the queue holds hours of backlog. | Queue depth, and whether the consumer accepts the old payload shape. |
| **Connection pools** | Pools are established at process start against the config that existed then. A config change that "takes effect on reload" often does not reach them. | Which values are re-read on reload and which are fixed at start. |
| **Open long-lived connections** | WebSockets and streams survive the cutover, pinned to old-version state, until the client reconnects — which may be never on a mobile client in the background. | How long the oldest connection can live, and what the client does on forced disconnect. |

## 2. Two versions live at once

Every rollout strategy — canary, blue-green, rolling, additive migration — has a
window where both versions serve. The window is the deploy's real risk surface,
and it is the part most plans describe as if it were instantaneous.

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Schema skew** | Old code runs against the new schema. An additive column is safe; a renamed one, a narrowed type, a new NOT NULL, or a dropped default is not. `SELECT *` makes an additive change unsafe too. | Whether the old code can run unmodified against the new schema for the full window. |
| **Worker skew** | Web processes deploy on cutover; background workers deploy on their own restart cycle, which may be hours later or on job boundaries. Old workers process new-shaped data. | When workers actually pick up new code, and what happens to jobs mid-flight. |
| **Client/API skew** | A browser tab open since before the deploy calls the new API with the old client. Mobile clients are worse: the old version persists for weeks. | The oldest client version the API must still serve, and how it is told to reload. |
| **Cross-service ordering** | Service A's new code calls Service B's endpoint that has not deployed yet. Deploying "together" is not simultaneous. | The order, and whether each side is backward compatible with the other's current version. |
| **Concurrent deploys** | Two teams deploy the same service the same day. A rollback now undoes both changes, and neither team's runbook says so. | Whose change a rollback reverts, and whether the deploys can be ordered. |

## 3. Replicas and asynchrony

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Replication lag** | Replicas trail the primary by an amount that grows under write load — and a migration is write load. Reads served during the change are stale by an unbounded margin. | Current and worst-case lag, and what a stale read means for the user path that takes it. |
| **Read-after-write** | A user writes to the primary and immediately reads from a replica that has not caught up. Their own change appears not to have happened. | Which paths write then read, and whether they are pinned to the primary. |
| **Replica lock inheritance** | Some engines replicate DDL; a migration that "only locks the primary" locks the replicas in turn, serially. | Whether DDL replicates, and what serves reads while it does. |
| **Failover during deploy** | An automatic failover mid-migration promotes a replica that has applied part of the change. | Whether failover is disabled for the migration window. |

## 4. Capacity that changes shape

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Cold start** | Scale-to-zero and new instances pay initialization on the first request. The p50 barely moves; the p99 for a user hitting a fresh instance is a different product. | Cold-start duration, and what fraction of requests hit a cold instance during rollout. |
| **Memory profile change** | The new code's working set differs. The old limit was fine because the old profile fit it; the OOM appears under production traffic, not in staging. | Whether the change touches caching, batch sizes, or concurrency, and what the limit was set from. |
| **Connection exhaustion** | Rolling deploys briefly run both fleets, doubling connections against a pool sized for one. The database refuses connections while both are up. | Pool size × instance count at peak overlap versus the server's limit. |
| **Retry amplification** | A partial failure triggers client retries, which multiply load on the degraded component, which increases failures. Without jitter and a budget, the system cannot recover on its own. | Whether retries have a cap, backoff, and jitter. |
| **Autoscaler lag** | Scaling reacts on a delay measured in minutes. A traffic step, or a fleet replacement, outruns it. | Whether the rollout step is faster than the scale-up. |

## 5. Time, expiry and schedules

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Certificate expiry** | TLS certs expire on a date nobody is watching, and renewal is often a component with its own failure mode. "Handled by the load balancer" names the terminator, not the renewer. | Expiry date, what renews it, and what alerts before it. |
| **Credential and token expiry** | Deploy keys, cloud tokens, and signing keys expire. The deploy that discovers it is the one under time pressure. | Expiry of every credential the deploy path uses. |
| **Cron overlap and skew** | A scheduled job started before the deploy runs old code; the next one runs new. A job that took longer than its interval now runs twice concurrently. | Which jobs can be running at cutover, and whether they are re-entrant. |
| **Low-traffic deploy windows** | 3am reduces blast radius and also removes the signal. Fewer requests means longer to detect a fault, and nobody is awake to see it. | Whether error-rate thresholds are still statistically meaningful at that hour, and who is awake. |
| **Time-zone and clock assumptions** | Date rollovers, DST, and leap seconds hit code that assumed local time. | Whether the change touches scheduling, expiry, or date arithmetic. |

## 6. Dependencies you do not own

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Vendor status page** | Green means their service is up for most customers. It says nothing about your integration, your quota, your API version, or your region. | Your own synthetic check against the integration path. |
| **Rate limits and quotas** | A deploy that changes traffic shape — a retry, a backfill, a warmed cache — can cross a quota that was never near. | Current usage against the limit, and what the new shape does to it. |
| **DNS TTL** | A DNS cutover propagates over the TTL, not instantly. Rollback propagates over it too, so your recovery time has a floor you set days ago. | The TTL, lowered before the change, not during. |
| **CDN and edge cache** | Edge nodes serve the old asset until purged, and purge is eventual. A client can hold new HTML with old JavaScript. | Whether assets are content-hashed, so old and new can coexist. |
| **Transitive dependency change** | "Only a dependency bump" describes the top-level line. The lockfile is where the actual change is: one direct bump can move dozens of transitive packages. | The lockfile diff, not the manifest diff. |

## 7. Recovery that is not what it claims

The rollback plan is the part nobody tests and everybody cites.

| Mechanism | What it does | What surfaces it |
|---|---|---|
| **Rollback is not instant** | "A single command" measures typing, not effect. Image pull, health checks, connection draining and DNS all sit between the command and recovery. | Measured time from command to serving, not the command's length. |
| **Rollback does not undo data** | Code reverts; rows written by the new code do not. A migration applied is applied. | What the new code wrote, and whether the old code can read it. |
| **Mutable image tags** | `latest` makes the deployed version unknowable after the fact and gives the rollback no target to name. | A pinned, immutable digest or version tag. |
| **Backups are untested until restored** | A backup that has never been restored is a hypothesis. The restore also has a window: everything written since the last snapshot is gone. | When a restore was last rehearsed, and the acceptable data loss (RPO). |
| **A revert is a deploy** | Reverting code returns the code, not the state. Time has passed and data has changed under the new behaviour. | What ran against the data since, and whether the revert needs its own migration. |
| **Blue-green teardown** | Deleting the old environment before the new one is verified under real traffic removes the only fast path back. | Keep it until a stated verification window has passed under production load. |

---

## Using this

Three ways it goes wrong, in order of how often:

1. **A generic question where a mechanism is the answer.** "Is warming needed?"
   is not "a cold cache puts 100% of traffic on a database sized for 5%."
   The mechanism is what makes the risk arguable.
2. **The right concern aimed at the wrong component.** A migration prompts
   thinking about the primary, so replication lag on the *replica* goes
   unexamined even though it is what serves the reads.
3. **The word "only".** "Only a dependency bump", "only a config change", "only
   a restart" — each names the top-level change and hides the transitive one.

Most of this is not a reason to refuse a deploy — it is what a plan has to have
accounted for before the irreversible step, and what to name when it has not.

**But this catalogue does not override a hard precondition.** A missing rollback
path, an unapproved gate, unset configuration and an unmonitored production
deploy are refusals, and no amount of naming mechanisms converts one into a
staged plan. Knowing that a one-way migration is a common, well-understood shape
explains *why* it is dangerous; it does not make it approved. If reading this
section produced a sentence of the form "X requires a modified strategy, not a
refusal", check first whether X is on the refusal list — because that sentence is
how a precondition gets reasoned away.
