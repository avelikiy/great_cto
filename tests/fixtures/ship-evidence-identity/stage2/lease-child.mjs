// Actual parent-handoff assertion path, controlled solely by test IPC.
import { pathToFileURL } from 'node:url';
const { acquireProjectLease } = await import(pathToFileURL(process.env.SHIP_FIXTURE_LEASE_MODULE));
let lease;
try {
  lease = acquireProjectLease(process.env.SHIP_FIXTURE_ROOT, {store: process.env.GREAT_CTO_TASKS_DIR, reuseToken: process.env.GREAT_CTO_WORK_LEASE});
  lease.assertOwned(); process.send({ready: true});
} catch (error) {process.send({ready: false, error: error.message}); process.exit(2);}
process.on('message', message => {
  if (message === 'check') {
    try {lease.assertOwned(); process.send({owned: true});}
    catch (error) {process.send({owned: false, error: error.message});}
  }
  if (message === 'release') {lease.release(); process.send({released: true}); process.exit(0);}
});
