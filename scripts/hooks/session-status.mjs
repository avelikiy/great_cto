#!/usr/bin/env node
// Records whether this session is working, waiting for the operator, or blocked
// on a prompt — see scripts/lib/session-status.mjs. Never blocks, never prints.
import { readFileSync } from 'node:fs';
import { recordHookEvent } from '../lib/session-status.mjs';

try {
  const raw = readFileSync(0, 'utf8');
  recordHookEvent(raw ? JSON.parse(raw) : {});
} catch { /* a status file is a report, never a reason to fail a hook */ }
process.exit(0);
