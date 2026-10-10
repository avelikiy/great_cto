#!/usr/bin/env node
import { readExecutionBudget, budgetSnapshot, reconcileAgent, reconcileBudgetLock } from './lib/agent-execution-budget.mjs';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
try {
  const budget = readExecutionBudget(resolve(value('--dir') || '.'));
  if (!budget) throw Error('GREAT_CTO_AGENT_BUDGET_FILE is not configured');
  const confirmedStopped = args.includes('--confirm-stopped');
  if (args[0] === 'status') console.log(JSON.stringify(budgetSnapshot(budget), null, 2));
  else if (args[0] === 'reconcile') {
    reconcileAgent(budget, { token: value('--token'), fence: Number(value('--fence')), confirmedStopped });
    console.log('Exact agent lease reconciled; admitted-call count is not refunded.');
  } else if (args[0] === 'recover-lock') {
    reconcileBudgetLock(budget, { token: value('--token'), confirmedStopped }); console.log('Dead transaction lock reconciled.');
  } else throw Error('expected status, reconcile or recover-lock');
} catch (error) { console.error(error.message); process.exitCode = 2; }
