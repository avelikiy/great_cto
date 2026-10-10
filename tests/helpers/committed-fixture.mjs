import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** Real baseline for controller fixtures; no global Git configuration changes. */
export function commitFixture(root) {
  if (!existsSync(join(root, '.gitignore'))) writeFileSync(join(root, '.gitignore'), '.great_cto/\n');
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']); git(['add', '.']);
  git(['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-qm', 'fixture baseline', '--allow-empty']);
}
