// Invoked only by the independent read supervisor, never by an HTTP argument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeReceipt, latestApproval, compareReceipts, mergeBase } from '../../../scripts/lib/receipt.mjs';
import { secondOpinionForTree } from '../../../scripts/lib/second-opinion-for-tree.mjs';
const entry = fileURLToPath(import.meta.url);
export const receiptReadEntry = entry;
if (process.argv[1] === entry) {
  try {
    const mode = process.argv[2] || 'binding';
    if (!['binding', 'approval', 'second-opinion'].includes(mode) || process.argv.length > 3) throw Error('Invalid evidence operation');
    let receipt;
    if (mode === 'second-opinion') {
      receipt = secondOpinionForTree(process.cwd());
    } else if (mode === 'approval') {
      const approval = latestApproval(process.cwd());
      if (!approval?.receipt) {
        receipt = { state: 'no-receipt', why: 'no approving verdict carries a receipt yet', agent: approval?.agent || null, ts: approval?.ts || null };
      } else {
        const current = treeReceipt(process.cwd(), { base: approval.receipt.base || mergeBase(process.cwd()), hashFilesInProcess: true });
        receipt = { ...compareReceipts(approval.receipt, current, { cwd: process.cwd() }), agent: approval.agent, ts: approval.ts };
      }
    } else {
      let dir = process.cwd(), gitMetadata = false;
      for (;;) {
        try { fs.lstatSync(path.join(dir, '.git')); gitMetadata = true; break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
      }
      receipt = treeReceipt(process.cwd(), { exclude: ['.great_cto', '.beads'], hashFilesInProcess: true });
      // Preserve explicit non-Git binding, but never mint an unbound token when
      // a real repository's evidence read failed.
      if (!receipt && gitMetadata) throw Error('Repository receipt unavailable');
    }
    process.stdout.write(JSON.stringify({ receipt }), error => process.exit(error ? 1 : 0));
  } catch { process.exit(1); }
}
