import { existsSync, lstatSync, mkdirSync, mkdtempSync } from 'node:fs';
import { isAbsolute, join, dirname } from 'node:path';

function defaultRoot() {
  if (process.platform !== 'darwin' || !process.getuid) {
    throw Error('set GREAT_CTO_LIVE_BASE_DIR to a durable, private absolute path');
  }
  return join('/Users/Shared', `great-cto-acceptance-${process.getuid()}`);
}

/** Human-gated runs must survive OS temporary-directory cleanup. */
export function createFixtureBase(root = process.env.GREAT_CTO_LIVE_BASE_DIR || defaultRoot()) {
  if (!isAbsolute(root)) throw Error('fixture base directory must be absolute');
  for (let p = root; ; p = dirname(p)) {
    if (existsSync(join(p, '.codex', 'config.toml'))) {
      throw Error('fixture base has ancestor Codex config; choose a clean location');
    }
    if (dirname(p) === p) break;
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0
    || (process.getuid && stat.uid !== process.getuid())) {
    throw Error('fixture base directory must be a private, user-owned directory (mode 0700)');
  }
  return mkdtempSync(join(root, 'mixed-release-'));
}
