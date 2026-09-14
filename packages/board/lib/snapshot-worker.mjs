#!/usr/bin/env node
import { buildBootSnapshot } from './board-projection.mjs';

try {
  const data = buildBootSnapshot(process.argv[2]);
  if (process.send) process.send({ ok: true, data });
  else process.stdout.write(JSON.stringify(data));
} catch (error) {
  const why = String(error?.message || error);
  if (process.send) process.send({ ok: false, why });
  else process.stderr.write(why);
  process.exitCode = 1;
}
