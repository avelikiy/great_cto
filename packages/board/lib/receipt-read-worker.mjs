// Invoked only by the independent read supervisor, never by an HTTP argument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeReceipt } from '../../../scripts/lib/receipt.mjs';
const entry = fileURLToPath(import.meta.url);
export const receiptReadEntry = entry;
if (process.argv[1] === entry) {
  try {
    let dir = process.cwd(), gitMetadata = false;
    for (;;) {
      try { fs.lstatSync(path.join(dir, '.git')); gitMetadata = true; break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
    }
    const receipt = treeReceipt(process.cwd(), { exclude: ['.great_cto', '.beads'], hashFilesInProcess: true });
    // Preserve explicit non-Git binding, but never mint an unbound token when
    // a real repository's evidence read failed.
    if (!receipt && gitMetadata) throw Error('Repository receipt unavailable');
    process.stdout.write(JSON.stringify({ receipt }), error => process.exit(error ? 1 : 0));
  } catch { process.exit(1); }
}
