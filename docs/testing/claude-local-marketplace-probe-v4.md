# Claude existing local marketplace probe v4

Freeze before execution. v3 lacked marketplace metadata and did not establish a
working local registration. Do not convert that failure into a passed baseline.
This experiment uses an already valid, dedicated local marketplace registration,
created inside an owned temporary home with the real v1 install commands.

Use the v2 bounded native guard harness and v3 external-network negative probe.
Keep operator filesystem/keychain access denied and allow only the exact local
stub port through SBPL localhost. Both address families are permitted by that
filter; the server/BASE_URL use IPv4. No provider or real credential is used.

Prepare two owned immutable fixture source trees: baseline 0.0.1 and candidate
0.0.2, each with one marketplace entry and the same bounded fixture hook. The
marketplace alias is dedicated to this fixture and contains no neighboring plugin.
Install the baseline with real `marketplace add` and `plugin install`. Require a
listing with no component errors and a working baseline allow/deny native run.

Snapshot exact bytes of user settings, known_marketplaces and installed_plugins.
Under a single-writer precondition, switch only the selected local marketplace's
source path in user settings/known_marketplaces, its installLocation, and the one
user plugin entry's installPath/version. Preserve every other key, trust choice,
scope and old payload. Do not create an alias, disable another copy, edit signed
manifests, refresh global skills or claim read-then-rename is atomic CAS.

Require listing without errors and exact candidate source/runtime paths, then
repeat the real native guard test. Restore the exact three snapshots only if
their current bytes still match what this fixture wrote. Repeat listing and the
native baseline test after restoration. Drift must fail the experiment rather
than be overwritten. Record baseline/candidate/restored hook roots and sessions.

All three native phases require allowed sentinel creation, forbidden sentinel
absence, nonce-bound actual hook events and the native denial tool result. The
local stub may handle at most twelve total requests, three Messages responses
per phase, each request/output limited to 1 MiB. Each command retains 30000 ms.
Verify owned process groups and remaining command paths before root deletion.

This is `REAL_NATIVE_ENGINE_WITH_SYNTHETIC_MODEL`, authority `NONE`. It proves at
most this bounded existing-local-marketplace route. It does not cover bare
registrations, marketplace creation/migration, release admission, crash recovery,
concurrency, the real great_cto hooks or complete N01–N20 acceptance.
