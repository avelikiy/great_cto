# Claude existing local selection probe v3

Freeze before execution. This is a route experiment, not complete ADR-046
acceptance or permission to edit operator registrations. Use the bounded native
guard harness described in v2, with its exact real host and inert local model.

Use SBPL `localhost:<owned ephemeral port>` because macOS rejects numeric hosts
in this filter. The rule permits that loopback port in both address families;
the fixture HTTP server and BASE_URL use IPv4. All other network stays denied.
Verify both another loopback port and TEST-NET-2 `198.51.100.1:9` are denied with
EPERM/EACCES. Do not interpret a timeout or connection refusal as sandbox proof.

Create a legacy fixture registration directly inside the owned config home:
`plugins/installed_plugins.json`, schema version 2, one user entry named
`gcto-admission-probe@local`. Point installPath at the owned baseline payload.
Create owned user settings enabling only that entry; include a harmless unrelated
fixture key. This seed is simulated legacy state, not an admitted release.

Run real `claude plugin list --json` and require the exact baseline path/version.
Then switch only that user entry's installPath/version to the owned candidate
payload; leave every unrelated key, setting and old payload unchanged. Run real
listing again and require the candidate path/version. Do not create, add, refresh
or disable any marketplace. This experiment investigates the existing local
registration route rather than using the source installer as a fallback.

Execute the v2 native guard scenario and require the same two hook events,
sentinels and native allow/deny tool results. Success also requires the selected
hook root to be the candidate and the legacy payload remain unchanged. If the
host ignores the entry or resolves another source, record that fact as failure;
do not change registry schema or silently add a marketplace to obtain success.

Use 30000 ms and a runtime-enforced 1 MiB output cap per command. Verify recorded
process groups have no non-zombie members before cleanup. Inspect the owned
root's remaining command paths for escaped descendants; distinguish this bounded
fixture check from a general proof about arbitrary detached code. No real API,
credential, trust bypass, active session or global configuration is touched.
