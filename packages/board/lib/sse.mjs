import { sseClients } from './state.mjs';
import { getTasks } from './beads.mjs';
import { invalidateSnapshot } from './read-model.mjs';
import { invalidateReceipt } from './receipt-read-model.mjs';

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

function broadcastTasks(cwd) {
  invalidateSnapshot(cwd);
  invalidateReceipt(cwd);
  const msg = `event: tasks\ndata: ${JSON.stringify(getTasks(cwd))}\n\n`;
  for (const res of sseClients) {
    if (res._gctoCwd === cwd) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  }
}

function broadcastProject(event, data, cwd) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    if (res._gctoCwd === cwd) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  }
}

export { broadcast, broadcastTasks, broadcastProject };
