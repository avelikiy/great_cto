// scripts/lib/is-main.mjs — was this module started as the program, or imported?
//
// great_cto-hu2l. The scripts used to answer that by comparing process.argv[1]
// with import.meta.url as strings. Node resolves the module URL through
// symlinks and leaves argv[1] as typed, so the two disagree whenever the path
// crosses a link: macOS /var → /private/var and /tmp → /private/tmp, a
// symlinked home, the plugin cache links under ~/.claude/plugins/cache. The CLI
// then ran nothing and exited 0, and a caller that checks only the exit code
// took that for success.
//
// Both sides go through realpath. A path that cannot be resolved is not this
// module, so a failed realpath answers false instead of guessing from strings.
// tests/main-guard-scan.test.mjs refuses a new guard that skips this.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMainModule(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1 || !importMetaUrl) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
