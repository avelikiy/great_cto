// Invoked only by the independent read supervisor, never by an HTTP argument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeReceipt, latestApproval, compareReceipts, mergeBase } from '../../../scripts/lib/receipt.mjs';
import { secondOpinionForTree } from '../../../scripts/lib/second-opinion-for-tree.mjs';
import { affectedTests } from '../../../scripts/lib/affected-tests.mjs';
import { isMainModule } from '../../../scripts/lib/is-main.mjs';
const entry = fileURLToPath(import.meta.url);
export const receiptReadEntry = entry;

// The tree a gate token is bound to. Null only outside Git: a real repository
// whose receipt could not be read fails, so it never reads as "not a repo".
function bindingTree() {
  let dir = process.cwd(), gitMetadata = false;
  for (;;) {
    try { fs.lstatSync(path.join(dir, '.git')); gitMetadata = true; break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  const receipt = treeReceipt(process.cwd(), { exclude: ['.great_cto', '.beads'], hashFilesInProcess: true });
  if (!receipt && gitMetadata) throw Error('Repository receipt unavailable');
  return receipt;
}
if (isMainModule(import.meta.url)) {
  try {
    const mode = process.argv[2] || 'binding';
    if (!['binding', 'approval', 'second-opinion', 'touches'].includes(mode) || process.argv.length > 3) throw Error('Invalid evidence operation');
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
    } else if (mode === 'touches') {
      // The gate brief (ADR-036): the change set plus the tests it maps to. The
      // test mapping walks the repository, so it runs here, off the board's
      // request thread, and its failure is reported rather than read as "none".
      const binding = bindingTree();
      let tests;
      try { tests = binding ? { ok: true, value: affectedTests({ cwd: process.cwd(), changed: Object.keys(binding.files || {}) }) } : { ok: true, value: null }; }
      catch (e) { tests = { ok: false, why: String(e?.message || e) }; }
      receipt = { binding, tests };
    } else {
      receipt = bindingTree();
    }
    process.stdout.write(JSON.stringify({ receipt }), error => process.exit(error ? 1 : 0));
  } catch { process.exit(1); }
}
