# QA: asynchronous receipt release 3.62.2

Date: 2026-10-11. Tracking: great_cto-932g.7.5.

## Source and independent review

[PR #180](https://github.com/avelikiy/great_cto/pull/180) merged normally as
`abd3e35559be56395e2b5e76ac8f60b1e3495388`. Its tree is identical to reviewed
candidate `16bc030c2a9befa44a80e8e6b2f67fa4128ed86d`.

The complete canonical gate finished with exit 0, GREEN and 15 NOT CHECKED.
Root/hooks/board: 1404 PASS; libraries: 3324 PASS and 6 skipped; eval: 242 PASS;
docs: 76 PASS; browser: 15 PASS; CLI: 369 PASS; archetype: 34 PASS.
The other nine skips are external pipeline actions. These suites overlap and
must not be summed as unique tests. No executed stage failed.
Canonical log SHA256:
`7fdea86a13753d8b51c72b6f59788911df1f6ba76b199e52f3d66ad126be3296`.

Independent exact-head re-review passed nine targeted cases without failures
or skips and confirmed mitigation of all three P2 findings: stale requests
reissuing consumed tokens, symlink aliases bypassing the physical-project fence,
and whole-file hashing memory. Snyk reported SUCCESS on the reviewed head.
Author combined focus passed 68 checks without failures or skips.

Release-only metadata commit:
`bfeafd0226795ae420559a98d19c88bfcbc947af`.
TypeScript build, 22 focused receipt/import checks and 76 documentation checks
passed. No application source was changed after canonical review.

## Distribution

[GitHub Release](https://github.com/avelikiy/great_cto/releases/tag/v3.62.2)
published at 2026-10-11T12:06:01Z. npm publication was accepted, initially returned
404 while processing, then exposed 3.62.2. Registry metadata cached by a pack
command also briefly returned ETARGET; a prefer-online read succeeded. No
duplicate publish or immutable-version overwrite was attempted.

Downloaded registry archive is byte-identical to the tested local archive:
184 files, SHA1 `b5c542c6e21a360a3e5046a947316a94615ca506`,
SHA256 `54628706f267b100e8ee774b20295314a42e5b764c3237a232525d0b9cd447b2`.
Registry integrity:
`sha512-bmgnbJsPtG5bmsg+85fn+c41+PJIZH6wiyxYdWP6ladCm7uD3h3JjvkiQTFYZfk2Me2zrhUCaIVJ1svhVj+LHg==`.

A private installed archive passed all four actual held-Git HTTP scenarios;
a fresh registry consumer independently repeated all four with no failures or
skips. The first author consumer command had an incorrect packaged server path
and failed four startup handshakes. The corrected entrypoint passed without
modifying package bytes; that initial red log remains retained.

The registry consumer's shipped runtime modules also passed 15 worker/SSE cases
without failures or skips. Test files and their fixed fake-Beads fixtures were
copied into the private consumer only; production runtime modules were not changed.
These checks cover actual owner SIGKILL, closed-pipe descendant cleanup, bounded
read concurrency/deadlines, stdout backpressure and SSE reconnect/disconnection.
One separate actual cold HTTP scenario against the registry-installed server
also passed without failure or skip.

## Installation and runtime

Native Claude marketplace/plugin refresh and native Codex marketplace upgrade
confirmed installed/enabled 3.62.2. CLI reports 3.62.2. Active host selection was
preserved; the inactive local Claude registration remains inactive, old caches
and a registry backup remain available. Receipt-reader hashes agree across
source and both host caches. Existing model sessions are not hot-load proof.

The board runs from the active installed Claude marketplace artifact, adopted
by PID 1 and bound only to loopback. Its initial version read reports
running=installed=3.62.2, stale=no. The browser displays English selected-project
Usage for the selected project without account-wide project contamination. No operator
content or screenshots are included in this report.

The sustained installed runtime probe completed with exit 0, PASS: 1200 seconds,
25 samples and 125 requests, with no restarts, timeouts or degraded task snapshots.
Each sample concurrently checked version, HTML, project Inbox, Usage and Tasks.
The original deadlines were unchanged: 3 seconds for the first four endpoints,
25 seconds for Tasks. Running and installed versions remained 3.62.2, stale=no;
Usage progressed from computing to counted and stayed readable.
Maximum across the four lighter endpoints: 1057 ms; Tasks: 428 ms.
A separate selected-project approval receipt request returned HTTP 200 in 1478 ms.
Runtime log SHA256:
`f49466ba7fdda80ea246abe96a6ece910c7aae5259da790d3d8292cbcb909ad9`.
This is measured health of one installed local instance in one 20-minute window,
not a universal latency guarantee, all-project certification or model-quality score.

## Limits and external blocker

The decision fence coordinates one board process, not distributed board instances.
Read-path isolation is not a claim about every synchronous write path or universal
host compatibility. Paid-model quality, external notifications and production
deployment are not established by fixture tests or this local runtime probe.

[Release announcement](https://github.com/avelikiy/great_cto/actions/runs/38137991843)
failed before steps: GitHub reports the account is locked due to a billing issue.
This remains an owner-action blocker, separately tracked as great_cto-932g.9.
No social announcement, JSR publication or public article publication is claimed.
