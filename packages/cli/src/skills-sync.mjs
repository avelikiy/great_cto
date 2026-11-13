/**
 * `great-cto skills sync`: clone the optional skill and agent catalogs into ~/.great_cto.
 *
 * The SessionStart hook used to start these three clones by itself, in the background, on every
 * machine that opened a session. Each is a shallow clone of the head of a mutable branch, and what
 * it holds is read by agents as instructions, so ADR-050 decision 9 moved it from "automatic" to
 * "when the user asks". The sources, flags and target directories are the hook's own, so everything
 * that reads ~/.great_cto/{catalog,anthropic-skills,personal-skills} finds them where it always did.
 * A directory that is already there is left alone; refreshing it is `git -C <dir> pull`, the user's
 * call, because a refresh is another fetch of a mutable branch.
 *
 * This file imports node built-ins only, like the other release modules, so the compiled CLI can load
 * it without the rest of the CLI and a test can load it without a build.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const SKILL_SOURCES = Object.freeze([
  Object.freeze({ name: 'catalog', url: 'https://github.com/davila7/claude-code-templates.git' }),
  Object.freeze({ name: 'anthropic-skills', url: 'https://github.com/anthropics/skills.git' }),
  Object.freeze({ name: 'personal-skills', url: 'https://github.com/avelikiy/ai-agent-skills.git' }),
]);

/** git, with no shell and no credential prompt: a clone that needs a password fails, it does not wait for one. */
function runGit(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { status: result.status, stderr: result.stderr ?? '', error: result.error };
}

const firstLine = text => String(text ?? '').split('\n').find(line => line.trim()) ?? '';

/**
 * @param {{ home?: string, run?: (command: string, args: string[]) => { status: number | null, stderr?: string, error?: Error } }} [options]
 * @returns {{ name: string, url: string, target: string, state: 'cloned' | 'present' | 'failed', detail?: string }[]}
 */
export function syncSkills({ home = homedir(), run = runGit } = {}) {
  const root = join(home, '.great_cto');
  const results = [];
  for (const { name, url } of SKILL_SOURCES) {
    const target = join(root, name);
    if (existsSync(target)) {
      results.push({ name, url, target, state: 'present', detail: `already there; to refresh it: git -C ${target} pull` });
      continue;
    }
    mkdirSync(root, { recursive: true });
    const result = run('git', ['clone', '--depth=1', url, target]);
    if (result.status === 0) results.push({ name, url, target, state: 'cloned' });
    else if (result.error?.code === 'ENOENT') results.push({ name, url, target, state: 'failed', detail: 'git is not installed or not on PATH' });
    else results.push({ name, url, target, state: 'failed', detail: firstLine(result.stderr) || `git exited with ${result.status}` });
  }
  return results;
}

const USAGE = [
  'usage: great-cto skills sync',
  '  Clone the optional skill catalogs into ~/.great_cto (catalog, anthropic-skills, personal-skills).',
  '  Nothing is cloned unless you run this; a directory that is already there is left as it is.',
];

/**
 * @param {string[]} argv what follows `skills`
 * @param {{ log: (line: string) => void, error: (line: string) => void }} io
 * @returns {number} the exit code
 */
export function runSkillsCommand(argv, io, deps = {}) {
  const [verb] = argv;
  if (verb === '--help' || verb === 'help' || verb === '-h') { for (const line of USAGE) io.log(line); return 0; }
  if (verb !== 'sync') {
    if (verb !== undefined) io.error(`unknown skills command: ${verb}`);
    for (const line of USAGE) io.error(line);
    return 2;
  }
  const results = syncSkills(deps);
  for (const r of results) {
    const where = r.target.replace(deps.home ?? homedir(), '~');
    if (r.state === 'cloned') io.log(`  cloned   ${r.name}  ${where}`);
    else if (r.state === 'present') io.log(`  present  ${r.name}  ${where}  (${r.detail})`);
    else io.error(`  failed   ${r.name}  ${r.url}: ${r.detail}`);
  }
  return results.some(r => r.state === 'failed') ? 1 : 0;
}
