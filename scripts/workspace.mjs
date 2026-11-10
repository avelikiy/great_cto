#!/usr/bin/env node
/**
 * workspace — claim or archive the worktree of one task (ADR-047).
 *
 *   node scripts/workspace.mjs claim <task-id>
 *   node scripts/workspace.mjs archive <task-id>
 *
 * Prints one JSON object. Exit 0: done, or the project has not opted in
 * ({"mode":"shared"}). Exit 3: refused, the reason is in the JSON. Exit 4: the
 * workspace exists but setup failed. Exit 2: usage.
 */
import { claimWorkspace, archiveWorkspace } from './lib/workspace-actions.mjs';
import { isMainModule } from './lib/is-main.mjs';

export function main([command, taskId] = [], { out = process.stdout } = {}) {
  if (!taskId || (command !== 'claim' && command !== 'archive')) {
    process.stderr.write('usage: workspace.mjs claim|archive <task-id>\n');
    return 2;
  }
  let result;
  try {
    result = command === 'claim' ? claimWorkspace({ taskId }) : archiveWorkspace({ taskId });
  } catch (e) {
    // Never a silent exit 0: a caller reading that would work in the shared tree.
    result = command === 'claim' ? { state: 'unavailable', reason: e.message } : { archived: false, reason: e.message };
  }
  out.write(JSON.stringify(result) + '\n');
  if (command === 'archive') return result.archived ? 0 : 3;
  if (result.mode === 'shared') return 0;
  if (result.state === 'conflict' || result.state === 'unavailable') return 3;
  return result.ok ? 0 : 4;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
