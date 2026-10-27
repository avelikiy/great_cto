# Claude local cache recovery probe v5

Freeze before execution. Retain v4's failed exact rollback: the native host added
`.orphaned_at` to its previous cache after selection changed. Do not ignore that
member or relabel the three-JSON restore as exact recovery.

Repeat v4's valid existing-local-marketplace experiment with the same fixed
deadlines, containment, bounded native/stub protocol, source/cache membership and
three native allow/deny phases. Before selection changes, retain a complete
private backup of the old cache outside the native cache tree, with each regular
member's bytes/mode and directory membership. No symlink or hardlink is allowed.

After the candidate phase, inspect the previous cache. Its original members must
still match the retained inventory. The only additional member permitted by this
experiment is the observed native `.orphaned_at` marker. Record its actual bytes,
mode and owner as part of the written state; any other member or changed original
byte fails recovery. Do not infer its contents or silently remove unknown state.

Immediately before restoration, re-read both the three JSON files and the entire
old-cache inventory. Restore only if they still equal the recorded written state.
Restore the full prior cache, including exact membership and modes, then the
three exact JSON snapshots. An observed external edit yields RECOVERY_REQUIRED;
it must not be overwritten. This remains a quiescent fixture experiment, not an
atomic compare-and-swap claim or arbitrary same-user race proof.

The restored native phase must verify complete source/cache bytes before running
the actual guard. Success requires all v4 observations plus exact prior cache
inventory and the three JSON snapshots after restoration. Keep the original
source payload unchanged and remove only owned fixture paths after verified
process cleanup. This route experiment does not establish durable crash recovery,
the production transaction implementation or complete N01–N20 acceptance.
