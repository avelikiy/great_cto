#!/usr/bin/env node
/** Developer-only local audit/packet preparation. No auto-discovery or host run. */
import { listDomainPacks, boundedFile, auditOverlay, prepareDomainContext } from './lib/domain-evidence.mjs';

export function domainPilot(args) {
  if (args.length === 1 && args[0] === 'catalog') return listDomainPacks();
  const [command, root, overlayPath, projectId, host] = args;
  if ((command !== 'audit' && command !== 'packet') || args.length !== (command === 'audit' ? 4 : 5)) {
    throw Error('usage: domain-pilot.mjs catalog | audit ROOT OVERLAY PROJECT_ID | packet ROOT OVERLAY PROJECT_ID codex|claude-code');
  }
  const overlay = JSON.parse(boundedFile(overlayPath, 65536).toString('utf8'));
  return command === 'audit' ? auditOverlay(root, overlay, { projectId }) : prepareDomainContext(root, overlay, { projectId, host });
}
if (process.argv[1]?.endsWith('/domain-pilot.mjs')) {
  try { process.stdout.write(`${JSON.stringify(domainPilot(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
