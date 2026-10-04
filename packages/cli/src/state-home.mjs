import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** One resolver for CLI and board, independent of their working directories.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]
 */
export function stateHome(env = process.env, home = homedir()) {
  const configured = env.GREAT_CTO_HOME;
  if (configured === undefined || configured === '') return join(home, '.great_cto');
  if (typeof configured !== 'string' || !isAbsolute(configured) || configured.includes('\0')) {
    throw new Error('GREAT_CTO_HOME must be an absolute dedicated state directory');
  }
  return resolve(configured);
}
