// Synthetic subprocess-only failure after actual run-file rename; never active in production.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
let committed = false;
const rename = fs.renameSync, write = fs.writeFileSync;
fs.renameSync = (from, to) => {const value = rename(from, to); if (to === process.env.SHIP_FIXTURE_FAULT_RUN_FILE) committed = true; return value;};
fs.writeFileSync = (path, ...args) => {
  if (committed && String(path).startsWith(process.env.SHIP_FIXTURE_FAULT_TASK_FILE)) throw Object.assign(new Error('synthetic observer failed after committed rename'), {code: 'EIO'});
  return write(path, ...args);
};
syncBuiltinESMExports();
