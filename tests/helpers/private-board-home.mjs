// Fixed preload for owned board fixtures. Paths are data, never generated JS.
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, dirname, basename, relative } from 'node:path';
const supplied = process.env.GREAT_CTO_FIXTURE_HOME;
if (!supplied || !isAbsolute(supplied)) throw Error('private fixture home required');
const home = realpathSync(supplied), temporary = realpathSync(os.tmpdir());
const rel = relative(temporary, home);
if (!rel || rel.startsWith('..') || isAbsolute(rel) || basename(home) !== 'home'
  || !/^(?:board-port-form-|port-form-ambient-)/.test(basename(dirname(home)))
  || !statSync(home).isDirectory()) throw Error('owned temporary board fixture required');
os.homedir = () => home;
syncBuiltinESMExports();
