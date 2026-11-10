#!/usr/bin/env node
/** Opt-in private graph observer. Never blocks a host or prints payload data. */
import { readSync } from 'node:fs';
import { observeNativeGraphHook } from '../lib/host-graph-bindings.mjs';
import { projectRoot } from '../lib/project-root.mjs';
try {
  const chunks = []; let total = 0, n; const chunk = Buffer.alloc(65536);
  while ((n = readSync(0, chunk, 0, chunk.length, null)) > 0) {
    total += n; if (total > 1024 * 1024) throw Error('event too large'); chunks.push(Buffer.from(chunk.subarray(0, n)));
  }
  const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  observeNativeGraphHook({ root: projectRoot(event.cwd || process.cwd()), host: process.env.GREAT_CTO_HOST || 'claude-code', event });
} catch { /* observation failures grant no authority and cannot block execution */ }
