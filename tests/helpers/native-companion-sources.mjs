import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NATIVE_COMPANIONS, NATIVE_COMPANION_PROFILE } from '../../packages/cli/src/native-companion-bundle.mjs';
export function nativeCompanionSources(t, alter = () => {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-companion-source-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const lock = { schema: 1, profile: NATIVE_COMPANION_PROFILE, components: [] }, repositories = {};
  for (const expected of NATIVE_COMPANIONS) {
    const root = path.join(base, expected.name); fs.mkdirSync(root, { mode: 0o700 });
    const git = args => execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
      env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false', GIT_CONFIG_KEY_1: 'tag.gpgSign', GIT_CONFIG_VALUE_1: 'false' } });
    git(['init', '--quiet']); git(['config', 'user.name', 'avelikiy']); git(['config', 'user.email', 'avelikiy@users.noreply.github.com']);
    const prefix = expected.subdirectory === '.' ? root : path.join(root, expected.subdirectory);
    fs.mkdirSync(path.join(prefix, '.claude-plugin'), { recursive: true }); fs.mkdirSync(path.join(prefix, 'skills/example'), { recursive: true });
    fs.writeFileSync(path.join(prefix, '.claude-plugin/plugin.json'), JSON.stringify({ name: expected.name, version: '1.0.0', license: 'MIT', skills: './skills/' }));
    fs.writeFileSync(path.join(prefix, 'skills/example/SKILL.md'), 'Inert source fixture'); fs.writeFileSync(path.join(root, 'LICENSE'), 'MIT License\nInert fixture');
    fs.mkdirSync(path.join(root, '.beads'), { recursive: true }); fs.writeFileSync(path.join(root, '.beads/fixture-state.json'), 'must stay private');
    alter({ expected, root, prefix });
    git(['add', '.']); git(['commit', '--quiet', '-m', 'Inert companion source fixture']);
    const commit = git(['rev-parse', 'HEAD']).trim(), tree = git(['rev-parse', 'HEAD^{tree}']).trim();
    lock.components.push({ id: expected.id, name: expected.name, version: '1.0.0', source: { repository: expected.repository, subdirectory: expected.subdirectory, commit, tree } });
    repositories[expected.id] = path.join(root, '.git');
    fs.chmodSync(repositories[expected.id], 0o700);
  }
  return { base, lock, repositories };
}
