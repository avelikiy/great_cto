#!/usr/bin/env node
// A Beads stand-in for browser journeys, pointed at by GREAT_CTO_BD_BIN.
//
// State lives in $FAKE_BD_STATE (JSON: { broken, tasks }) so a test can change
// what "bd" answers mid-session — including making it fail, which is the one
// thing a real store cannot be asked to do on cue. `update` writes the status
// back and appends the event to .beads/interactions.jsonl, the file the board
// reads a task's history from. Anything else succeeds and prints [].
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.FAKE_BD_STATE;
if (!file) { process.stderr.write('FAKE_BD_STATE is not set\n'); process.exit(2); }
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (state.broken) { process.stderr.write('Error: database is locked (fake bd, broken on purpose)\n'); process.exit(1); }

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'list') {
  process.stdout.write(JSON.stringify(state.tasks));
} else if (cmd === 'update') {
  const id = args[0];
  const status = args[args.indexOf('--status') + 1];
  const notes = args.includes('--notes') ? args[args.indexOf('--notes') + 1] : null;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) { process.stderr.write(`no issue ${id}\n`); process.exit(1); }
  const from = task.status;
  task.status = status;
  if (notes) task.notes = notes;
  task.updated_at = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(state));
  fs.appendFileSync(path.join(process.cwd(), '.beads', 'interactions.jsonl'),
    JSON.stringify({ id, ts: task.updated_at, actor: 'board', action: 'status_changed', from, to: status, notes }) + '\n');
  process.stdout.write('[]');
} else {
  process.stdout.write('[]');
}
