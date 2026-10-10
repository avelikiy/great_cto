/** Ephemeral, single-use UI capability. Never stored inside a worker project. */
import { randomUUID } from 'node:crypto';
export function publicationTickets({ now = Date.now, ttl = 120000, limit = 128 } = {}) {
  const tickets = new Map();
  const prune = () => { for (const [id, t] of tickets) if (t.expiresAt <= now()) tickets.delete(id); };
  return {
    issue(binding) {
      prune(); if (tickets.size >= limit) throw Error('publication preview capacity reached');
      const id = randomUUID(); tickets.set(id, { ...binding, expiresAt: now() + ttl }); return id;
    },
    consume(id, { root, origin, branch }) {
      prune(); const ticket = tickets.get(id);
      if (!ticket || ticket.root !== root || ticket.origin !== origin || ticket.branch !== branch) throw Error('publication confirmation is missing, expired or bound to another project/origin/branch');
      tickets.delete(id); return ticket;
    },
  };
}
export function localPublicationOrigin(req) {
  const address = req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return null;
  const host = req.headers.host;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\]):[0-9]+$/.test(host || '')) return null;
  const expected = `http://${host}`;
  if (req.headers.origin === expected || (!req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin')) return expected;
  return null;
}
