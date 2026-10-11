import { sseClients } from './state.mjs';
import { getTasksAsync, getReadDegradation } from './beads.mjs';

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

async function broadcastTasks(cwd) {
  // A completed write invalidates its cache. Reading it synchronously here
  // froze every HTTP client even though the write response was already sent.
  // With no subscriber there is no projection to refresh at all.
  const clients = [...sseClients].filter(res => res._gctoCwd === cwd);
  if (!clients.length) return { ok: true, subscribers: 0 };
  let msg, result;
  try {
    const tasks = await getTasksAsync(cwd);
    if (getReadDegradation(cwd)) throw Error('snapshot unavailable');
    msg = `event: tasks\ndata: ${JSON.stringify(tasks)}\n\n`;
    result = { ok: true };
  } catch {
    // Preserve the last visible tasks instead of publishing a fabricated [].
    // Explicit transport state; existing clients may not yet render this event.
    result = { ok: false, state: 'unreadable' };
    msg = `event: task-read-state\ndata: ${JSON.stringify(result)}\n\n`;
  }
  for (const res of clients) {
    // A client may have disconnected or changed project while the read ran.
    if (sseClients.has(res) && res._gctoCwd === cwd) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  }
  return result;
}

export { broadcast, broadcastTasks };
