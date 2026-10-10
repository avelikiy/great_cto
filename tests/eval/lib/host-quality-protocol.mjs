// Keep only the exact optional snapshot fallbacks admitted by the controller.
const optionalWarning = line => /WARN codex_rollout::list: state db discrepancy during find_thread_path_by_id_str_in_subdir: falling_back$/.test(line.trim())
  || /WARN codex_core::shell_snapshot: Failed to create shell snapshot for [^:]+: Snapshot command timed out for [^\s]+$/.test(line.trim())
  || /WARN codex_core::shell_snapshot: Failed to delete shell snapshot at AbsolutePathBuf\("[^"]*\/\.codex\/shell_snapshots\/[0-9a-f-]+(?:\.\d+)?\.sh"\): Os \{ code: 2, kind: NotFound, message: "No such file or directory" \}$/.test(line.trim());

export function responseFailure(response) {
  if ((response.errors || []).some(e => /OAuth session expired|Failed to authenticate|authentication failed|not logged in/i.test(String(e)))) {
    return 'host-authentication-failure';
  }
  if (response.code !== 0 || response.state !== 'ok'
    || (response.errors || []).some(e => !String(e).split('\n').every(optionalWarning))) return 'host-response-failure';
  return null;
}
