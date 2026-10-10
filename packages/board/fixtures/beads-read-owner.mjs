// Fixed test-only parent, killed after the child-start handshake.
import { getTasksAsync } from '../lib/beads.mjs';
await getTasksAsync(process.cwd());
