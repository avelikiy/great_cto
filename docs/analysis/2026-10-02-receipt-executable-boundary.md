# Receipt inspection must not execute candidate helpers

The hidden scorer process uses builtin-only imports, but its parent also reads a
Git receipt. Plain Git inspection can invoke configured filesystem monitors,
external diff drivers, text conversion, clean filters and long-running process
filters. A non-model diagnostic check must not silently execute those helpers.

The shared receipt reader now runs Git with `core.fsmonitor=false`, disables
external diff and textconv, enumerates **filter names only** from effective Git
configuration and overrides clean/process/required filter settings for diff
inspection. It hashes on-disk files with `hash-object --no-filters`. Git documents
the [diff flags](https://git-scm.com/docs/git-diff.html) and
[raw hash option](https://git-scm.com/docs/git-hash-object.html).

This uses command arguments, not a shell, and does not modify repository or
global Git configuration. Filter discovery is bounded to 64 KiB and 128 unique
drivers. Git subprocesses have a five-second timeout. Failed diff, inventory or
file hashing returns an unavailable receipt, rather than substituting an empty
diff and reporting a clean tree.

Tests configure external diff, textconv, clean and filesystem monitor helpers
which write a harmless external sentinel. Direct fixture Git commands prove
that the helpers are executable. Receipt inspection must not create the sentinel.
A separate test covers required process filters, and failed Git inspection must
return null.

This is not general OS isolation or proof against concurrent Git-config changes.
The Git executable and operator environment remain trusted. Git still determines
tracked/untracked scope and normalization; ignored runtime inputs are not covered
by the receipt. The docs scorer separately binds baseline inputs, including the
ignored project declaration. That does not extend receipt scope universally.

The raw hashing semantics may differ from earlier filter-normalized receipts.
Do not rewrite old receipts or retroactively call them raw-byte evidence. A run
with affected historical receipts needs a fresh assessment and verification;
an old approval is not permission to substitute a new receipt. No historical
state migration, gate approval, installed plugin update or release occurs here.
