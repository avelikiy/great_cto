#!/usr/bin/env node
// A fixed Git-read fixture. It never reads operator stores or invokes a shell.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.env.GCTO_RECEIPT_CONTROL_ROOT, binary = process.env.GCTO_RECEIPT_REAL_GIT;
if (!root || !path.isAbsolute(root) || !binary || !path.isAbsolute(binary)) process.exit(2);
const args = process.argv.slice(2);
const run = () => {
  const result = spawnSync(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
};
if (args.includes('hash-object') || args.includes('--show-object-format') ||
    (args.includes('rev-parse') && args.includes('HEAD') && fs.existsSync(path.join(root, 'hold-head')))) {
  fs.appendFileSync(path.join(root, 'git-held'), `${process.pid}\n`);
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(root, 'git-release'))) { clearInterval(timer); run(); }
  }, 25);
} else run();
