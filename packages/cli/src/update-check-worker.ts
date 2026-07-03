// Standalone entry point for the detached background update-check process.
// Spawned by update-check.ts (spawnBackgroundCheck) via `node dist/update-check-worker.js`.
// Deliberately tiny: just calls refreshCache() and exits. stdio is "ignore"
// from the parent, so nothing here should assume a console is attached.

import { refreshCache } from "./update-check.js";

await refreshCache();
