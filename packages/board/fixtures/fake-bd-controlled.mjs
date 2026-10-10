#!/usr/bin/env node
// Fixed local test protocol. No shell commands or operator stores.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = process.env.FAKE_BD_CONTROL_ROOT;
if (!root || !path.isAbsolute(root)) process.exit(2);
const key = path.basename(process.cwd());
const marker = name => path.join(root, `${key}.${name}`);
if (process.argv.includes('--descendant')) {
  process.on('SIGTERM', () => {});
  fs.writeFileSync(marker('descendant'), String(process.pid));
  setInterval(() => {}, 1000);
} else {
  fs.appendFileSync(marker('started'), `${process.pid}\n`);
  if (process.env.FAKE_BD_CONTROL_MODE === 'fail') {
    process.exit(1);
  } else if (process.env.FAKE_BD_CONTROL_MODE === 'hang') {
    process.on('SIGTERM', () => {});
    spawn(process.execPath, [new URL(import.meta.url).pathname, '--descendant'], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  } else if (process.env.FAKE_BD_CONTROL_MODE === 'oversize') {
    process.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1, 120));
    setInterval(() => {}, 1000);
  } else {
    const timer = setInterval(() => {
      if (!fs.existsSync(marker('release'))) return;
      clearInterval(timer);
      process.stdout.write(JSON.stringify([{ id: 'FIXTURE-1', title: 'Fixture task', status: 'open', priority: 0 }]));
    }, 25);
  }
}
