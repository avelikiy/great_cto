#!/usr/bin/env node
// Process-isolated receipt computation. treeReceipt invokes several synchronous
// Git commands; doing that in the HTTP process stalls every unrelated request.
import { latestApproval, treeReceipt, compareReceipts, mergeBase } from '../../../scripts/lib/receipt.mjs';

const cwd = process.argv[2];
let out;
try {
  const approval = latestApproval(cwd);
  if (!approval?.receipt) {
    out = { state: 'no-receipt', why: 'no approving verdict carries a receipt yet', agent: approval?.agent || null, ts: approval?.ts || null };
  } else {
    const current = treeReceipt(cwd, { base: approval.receipt.base || mergeBase(cwd) });
    out = { ...compareReceipts(approval.receipt, current, { cwd }), agent: approval.agent, ts: approval.ts };
  }
} catch (error) {
  out = { state: 'unreadable', why: String(error?.message || error), agent: null, ts: null };
}
process.stdout.write(JSON.stringify(out));
