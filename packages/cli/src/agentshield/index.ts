/**
 * @great-cto/agentshield — public API
 *
 * Programmatic usage:
 *   import { scan } from '@great-cto/agentshield';
 *   const report = scan('./src');
 *   console.log(report.findings);
 *
 * SARIF output:
 *   import { toSarif } from '@great-cto/agentshield/sarif';
 *   writeFileSync('agentshield.sarif', JSON.stringify(toSarif(report)));
 */

export { scan, scanFile } from './scanner.js';
export { loadRules, parseRulesFile, loadUserRules, userGuardrailsPath } from './rules-loader.js';
export type {
  Rule,
  Finding,
  Location,
  Severity,
  ScannerName,
  ScanOptions,
  ScanReport,
  GuardrailAction,
} from './types.js';
export { SEVERITY_ORDER, severityRank } from './types.js';
