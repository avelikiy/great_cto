/**
 * Where log-verdict.sh is, as a command an agent can run from anywhere.
 *
 * Agents were told `bash scripts/log-verdict.sh` — a path that exists in the
 * great_cto repository and in no project an agent works in. Over 30 days on one
 * project, eleven of the calls that tried it died with "No such file or
 * directory", and runs that could not find it often recorded nothing at all.
 * The script ships inside the plugin; this names it there.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function logVerdictPath() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'log-verdict.sh');
}

/** `bash '<abs>/scripts/log-verdict.sh'` — quoted, so a path with spaces stays one argument. */
export function logVerdictCommand() {
  return `bash '${logVerdictPath().replace(/'/g, `'\\''`)}'`;
}
