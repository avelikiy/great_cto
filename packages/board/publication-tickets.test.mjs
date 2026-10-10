import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicationTickets, localPublicationOrigin } from './lib/publication-tickets.mjs';
test('publication ticket binds project, origin and typed branch, expires and consumes once', () => {
  let time = 0; const store = publicationTickets({ now: () => time, ttl: 10, limit: 1 });
  const binding = { root: '/project', origin: 'http://localhost:1', branch: 'feature', approval: 'digest' };
  const id = store.issue(binding); assert.throws(() => store.issue(binding), /capacity/);
  for (const change of [{ root: '/other' }, { origin: 'http://evil.test' }, { branch: 'main' }]) assert.throws(() => store.consume(id, { ...binding, ...change }), /bound/);
  assert.equal(store.consume(id, binding).approval, 'digest'); assert.throws(() => store.consume(id, binding), /missing/);
  const expired = store.issue(binding); time = 11; assert.throws(() => store.consume(expired, binding), /expired/);
});
test('publication capability is loopback and same-origin only, not a hosted board write capability', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:1', origin: 'http://localhost:1' } };
  assert.equal(localPublicationOrigin(req), 'http://localhost:1');
  for (const bad of [{ socket: { remoteAddress: '10.0.0.1' } }, { headers: { host: 'evil.test:1', origin: 'http://evil.test:1' } }, { headers: { host: 'localhost:1', origin: 'http://evil.test:1' } }, { headers: { host: 'localhost:1' } }])
    assert.equal(localPublicationOrigin({ ...req, ...bad }), null);
  assert.equal(localPublicationOrigin({ ...req, headers: { host: 'localhost:1', 'sec-fetch-site': 'same-origin' } }), 'http://localhost:1');
});
