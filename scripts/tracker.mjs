#!/usr/bin/env node
/**
 * `great-cto tracker …` / `node scripts/tracker.mjs …` — the task store from a shell.
 *
 * For agents, shell scripts and people. Design: docs/architecture/ARCH-task-api.md.
 *
 * Exit codes are the contract a shell caller needs:
 *   0  done / read
 *   2  usage error — nothing was sent to the store
 *   3  absent     — the store answered, the task is not there
 *   4  unread     — the store did not answer, or a write could not be confirmed
 *   5  refused    — the store answered and refused the write
 * 3 and 4 are different on purpose: "no such task" and "could not look" must
 * never lead to the same next step.
 */
import { resolve } from 'node:path';
import { isMainModule } from './lib/is-main.mjs';
import { openTaskStore, initTaskStore, TaskReadFailed, TaskWriteFailed, TaskWriteUnknown, TaskUsageError } from './lib/task-store.mjs';

export const EXIT = Object.freeze({ ok: 0, usage: 2, absent: 3, unread: 4, refused: 5 });

const USAGE = `usage: great-cto tracker <command> [options]

  list       [--status S] [--label L] [--parent ID] [--text T] [--all]
  show       <id>
  create     "<title>" --actor A [--type T] [--priority 0-4] [--label L]... [--parent ID] [--description D]
  move       <id> <status> --actor A [--reason R]
  close      <id> --actor A [--reason R]
  link       <id> --depends-on <id> --actor A
  note       <id> "<text>" --actor A
  find-open  [--label L] [--text T]
  init       start .great_cto/tasks.db in a project that has no task store

  common:    --dir PATH (project, default .)   --json

  status:    open | in_progress | blocked | deferred | closed
  actor:     human | agent:<role> | system:<name>
  exit:      0 ok · 2 usage · 3 absent · 4 unread · 5 refused`;

const VALUE_FLAGS = new Set(['--dir', '--status', '--label', '--parent', '--text', '--actor', '--type', '--priority', '--description', '--reason', '--depends-on']);
const BOOL_FLAGS = new Set(['--json', '--all']);

function parseArgs(argv) {
  const positional = [], flags = { '--label': [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOL_FLAGS.has(a)) flags[a] = true;
    else if (VALUE_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new TaskUsageError(`${a} needs a value`);
      if (a === '--label') flags[a].push(v); else if (flags[a] !== undefined) throw new TaskUsageError(`${a} given twice`); else flags[a] = v;
    } else if (a.startsWith('--')) throw new TaskUsageError(`unknown option ${a}`);
    else positional.push(a);
  }
  return { positional, flags };
}

const line = (t) => `${t.id}  ${t.status.padEnd(11)}  ${t.priority === null ? '-' : `P${t.priority}`}  ${t.title}`;

/**
 * Run one tracker command.
 * @returns {Promise<{code:number, out?:string, err?:string}>}
 */
export async function runTracker(argv, { cwd = process.cwd(), storeOptions = {} } = {}) {
  let json = argv.includes('--json');
  const fail = (code, kind, message, extra = {}) => (json
    ? { code, out: JSON.stringify({ ok: false, error: kind, message, ...extra }) }
    : { code, err: `tracker: ${message}` });
  try {
    const [command, ...rest] = argv;
    if (!command || command === 'help' || command === '--help') return { code: command ? EXIT.ok : EXIT.usage, out: USAGE };
    const { positional, flags } = parseArgs(rest);
    json = Boolean(flags['--json']);
    const need = (n, what) => { if (positional.length !== n) throw new TaskUsageError(`${command} takes ${what}`); };
    const ok = (data, text) => ({ code: EXIT.ok, out: json ? JSON.stringify({ ok: true, ...data }) : text });
    const actor = flags['--actor'];
    const dir = resolve(cwd, flags['--dir'] || '.');
    if (command === 'init') {
      need(0, 'no positional arguments');
      const made = initTaskStore(dir);
      return ok(made, made.created ? `task store created: ${made.file}` : `task store already here: ${made.file}`);
    }
    const store = openTaskStore(dir, storeOptions);

    switch (command) {
      case 'list':
      case 'find-open': {
        need(0, 'no positional arguments');
        const labels = flags['--label'];
        if (labels.length > 1) throw new TaskUsageError('one --label per query');
        const filter = { label: labels[0], text: flags['--text'] };
        if (command === 'list') Object.assign(filter, { status: flags['--status'], parent: flags['--parent'], includeClosed: Boolean(flags['--all']) });
        const { tasks } = command === 'list' ? await store.list(filter) : await store.findOpen(filter);
        return ok({ backend: store.backend, count: tasks.length, tasks }, tasks.length ? tasks.map(line).join('\n') : 'no tasks match (the store was read)');
      }
      case 'show': {
        need(1, 'one task id');
        const got = await store.get(positional[0]);
        if (got.state === 'absent') return fail(EXIT.absent, 'absent', `no such task: ${positional[0]}`);
        const t = got.task;
        return ok({ task: t }, [line(t), t.labels.length ? `labels: ${t.labels.join(', ')}` : '', t.description, t.notes ? `notes:\n${t.notes}` : ''].filter(Boolean).join('\n'));
      }
      case 'create': {
        need(1, 'one title');
        const priority = flags['--priority'] === undefined ? undefined : Number(flags['--priority']);
        const made = await store.create({ title: positional[0], type: flags['--type'], priority, labels: flags['--label'], parent: flags['--parent'], description: flags['--description'], actor });
        return ok(made, made.recovered ? `${made.id} (the create timed out; this task was found afterwards)` : made.id);
      }
      case 'move': {
        need(2, 'a task id and a status');
        const moved = await store.move(positional[0], positional[1], { actor, reason: flags['--reason'] });
        return ok(moved, `${moved.id} → ${moved.to}`);
      }
      case 'close': {
        need(1, 'one task id');
        const closed = await store.close(positional[0], { actor, reason: flags['--reason'] });
        return ok(closed, `${closed.id} → closed`);
      }
      case 'link': {
        need(1, 'one task id and --depends-on <id>');
        if (!flags['--depends-on']) throw new TaskUsageError('link needs --depends-on <id>');
        await store.link(positional[0], flags['--depends-on'], { actor });
        return ok({ id: positional[0], depends_on: flags['--depends-on'] }, `${positional[0]} depends on ${flags['--depends-on']}`);
      }
      case 'note': {
        need(2, 'a task id and the note text');
        await store.note(positional[0], positional[1], { actor });
        return ok({ id: positional[0] }, `noted on ${positional[0]}`);
      }
      default:
        throw new TaskUsageError(`unknown command "${command}"`);
    }
  } catch (e) {
    if (e instanceof TaskUsageError) return fail(EXIT.usage, 'usage', e.message);
    if (e instanceof TaskReadFailed) return fail(EXIT.unread, 'unread', `NOT READ — ${e.message}`, { cause: e.code });
    if (e instanceof TaskWriteUnknown) return fail(EXIT.unread, 'unknown', `NOT CONFIRMED — ${e.message}`);
    if (e instanceof TaskWriteFailed) {
      return e.code === 'absent' ? fail(EXIT.absent, 'absent', e.message) : fail(EXIT.refused, 'refused', e.message, { cause: e.code });
    }
    throw e;
  }
}

if (isMainModule(import.meta.url)) {
  const r = await runTracker(process.argv.slice(2));
  if (r.out) process.stdout.write(`${r.out}\n`);
  if (r.err) process.stderr.write(`${r.err}\n`);
  process.exitCode = r.code;
}
