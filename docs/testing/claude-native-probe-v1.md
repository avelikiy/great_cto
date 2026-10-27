# Claude native route probe v1

This is a prerequisite experiment for ADR-046, not N01–N20 acceptance and not an
operator installation. Freeze these commands and observations before the probe.
Source adapters remain unsupported until the complete acceptance is executed.

Use a newly owned temporary root, an inert fixture plugin `gcto-admission-probe`
and a local fixture marketplace `gcto-native-acceptance`. Neither contains project
data, credentials, companions or shell hooks. The fixture is not a great_cto
release and gives no distribution or installation authority.

Pin the canonical Claude executable, SHA256 and `--version` in private evidence.
Run each command with a 30000 ms deadline, 1 MiB output cap, empty stdin and a
minimal environment. HOME, USERPROFILE, CLAUDE_CONFIG_DIR, TMPDIR and XDG paths
point inside the owned root. Provider variables and NODE_OPTIONS are absent.
Disable update/telemetry checks. Working directory is an owned empty project.

The OS sandbox denies all network, reads beneath the operator home except the
exact pinned executable, keychain service lookup and all writes except the owned
root and `/dev/null`. Verify containment with explicit negative read, write and
network probes before native commands. A failed containment check aborts.

Run in order, stopping on failed registration:

1. `claude --version`
2. `claude plugin marketplace add <owned-marketplace-root> --json`
3. `claude plugin install gcto-admission-probe@gcto-native-acceptance --scope user --json`
4. `claude plugin list --json`
5. `claude mcp list`

Compare source/cache bytes and registration state after successful commands.
Do not treat a zero exit or listing as process/MCP/hook proof. The fixture local
Node MCP may write `GCTO_NATIVE_MCP_READY_V1` inside the owned root only after it
receives a real JSON-RPC initialize request. Marker absence is unobserved startup,
not a passed test. Directly launching that script does not count as native proof.

Do not invoke print/model, plugin eval/test, network fallback, hook auto-trust,
operator restart, token helpers or native global homes. No paid-model request.
Record actual commands/exits, omitted observations and containment failures.
On completion remove only this experiment's root after saving private evidence;
never stop or remove another process or installation.
