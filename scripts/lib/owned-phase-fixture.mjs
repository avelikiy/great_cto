import { mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// No caller-selected deletion target. Cleanup is a closure over one exclusively
// created private directory, with a repeated identity check, not an OS sandbox.
export function createOwnedPhaseFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-phase-fixture-')));
  const initial = lstatSync(root);
  if (!initial.isDirectory() || (initial.mode & 0o077) !== 0) throw new Error('fixture must be a private directory');
  let removed = false;
  return Object.freeze({
    root,
    cleanup() {
      if (removed) return;
      const current = lstatSync(root);
      if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(root) !== root ||
          current.dev !== initial.dev || current.ino !== initial.ino || current.uid !== initial.uid || (current.mode & 0o077) !== 0) {
        throw new Error('fixture identity changed; cleanup refused');
      }
      rmSync(root, { recursive: true, force: true });
      removed = true;
    },
  });
}
