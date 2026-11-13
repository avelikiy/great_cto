/**
 * `.great_cto/tasks.md` backend of the task store — for projects without Beads.
 *
 * Phase 1 wraps the parser the board already ships (packages/board/lib/beads.mjs)
 * instead of copying it: two parsers of nineteen table shapes would drift. The
 * import is lazy, so a Beads project never loads the board module. Phase 4 moves
 * the parser down into this file and the board imports it from here.
 *
 * Smaller on purpose: reads, and a status write for the table dialect. Create,
 * link and note are refused by name — a markdown table has no safe place for them.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskReadFailed, TaskWriteFailed } from './task-store.mjs';

let boardReader = null;
async function reader() {
  if (boardReader) return boardReader;
  try {
    boardReader = await import('../../packages/board/lib/beads.mjs');
  } catch (e) {
    throw new TaskReadFailed('backend_unavailable', `the tasks.md reader could not be loaded: ${e?.message || e}`);
  }
  return boardReader;
}

/** The board's row → the store's task. The parser keeps the UI status and a 3-value raw one. */
function normalize(row) {
  const status = row.raw_status === 'closed' ? 'closed'
    : row.raw_status === 'blocked' ? 'blocked'
      : row.status === 'in_progress' ? 'in_progress' : 'open';
  const labels = Array.isArray(row.labels) ? row.labels : [];
  const title = String(row.title || '');
  return {
    id: String(row.id),
    title,
    description: row.description || '',
    notes: row.notes || '',
    design: '',
    acceptance: '',
    status,
    priority: Number.isInteger(row.priority) ? row.priority : null,
    type: 'task',
    labels,
    owner: row.owner || '',
    parent: null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    closed_at: row.closed_at || null,
    close_reason: row.close_reason || '',
    is_gate: Boolean(row.is_gate) || labels.includes('gate') || title.toLowerCase().startsWith('gate:'),
  };
}

export function tasksMdBackend(cwd) {
  const file = join(cwd, '.great_cto', 'tasks.md');

  async function list() {
    if (!existsSync(file)) throw new TaskReadFailed('not_initialized', 'list tasks: .great_cto/tasks.md is not there');
    const board = await reader();
    const rows = board.parseTasksMd(cwd);
    // parseTasksMd answers [] for an unreadable or unparseable file and records
    // why. Ask, so that "could not read" does not leave here as "no tasks".
    const why = board.getReadDegradation(cwd);
    if (why) throw new TaskReadFailed('store_refused', `list tasks: ${why}`);
    return rows.map(normalize);
  }

  async function get(id) {
    return (await list()).find((t) => t.id === id) || null;
  }

  const unsupported = (what) => async () => {
    throw new TaskWriteFailed('unsupported', `${what} is not supported by the tasks-md backend — this project tracks tasks in .great_cto/tasks.md`);
  };

  async function setStatus(id, status) {
    if (!(await get(id))) throw new TaskWriteFailed('absent', `move ${id}: no such task`);
    const board = await reader();
    if (!board.setTaskStatusInTasksMd(cwd, id, status)) {
      throw new TaskWriteFailed('unsupported', `move ${id}: its row has no status cell the tasks-md backend can rewrite`);
    }
  }

  return {
    name: 'tasks-md',
    list,
    get,
    create: unsupported('create'),
    move: (id, status) => setStatus(id, status),
    close: (id) => setStatus(id, 'closed'),
    link: unsupported('link'),
    note: unsupported('note'),
  };
}
