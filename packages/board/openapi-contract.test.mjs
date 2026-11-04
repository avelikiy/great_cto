// The board's HTTP contract, packages/board/openapi.json, held against the code
// and against a live board.
//
// The page and the CLI read these responses by key. A handler that renames a
// key, turns a list into an object or starts answering 500 breaks a screen
// without breaking any test that asserts only a status. Two checks:
//
//   1. The contract names exactly the routes the server has (route inventory):
//      a new route is added to the contract, a removed one leaves it.
//   2. Every readable route, requested the way the contract records, answers
//      the recorded status with a body of the recorded shape.
//
// After a deliberate API change: node scripts/board-openapi.mjs --write, and
// review the diff of openapi.json like code.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeInventory } from '../../tests/helpers/board-routes.mjs';
import { CONTRACT, startContractBoard, call, validate, contractPath } from '../../tests/helpers/board-contract.mjs';

const doc = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const REFRESH = 'node scripts/board-openapi.mjs --write';

test('the contract names every route the server has, and no other', () => {
  const server = routeInventory().map(contractPath).sort();
  const contract = Object.keys(doc.paths).sort();
  assert.deepEqual(server.filter((p) => !contract.includes(p)), [], `routes missing from openapi.json — ${REFRESH}`);
  assert.deepEqual(contract.filter((p) => !server.includes(p)), [], `openapi.json names routes the server no longer has — ${REFRESH}`);
});

let board;
after(() => board?.close());

test('every readable route answers the recorded status with a body of the recorded shape', { timeout: 120000 }, async () => {
  board = await startContractBoard();
  const drift = [];
  let checked = 0;
  for (const [path, ops] of Object.entries(doc.paths)) {
    const op = ops.get;
    if (!op?.['x-probe']) continue;
    const [status, response] = Object.entries(op.responses)[0];
    const res = await call(board.port, op['x-probe']);
    checked++;
    if (String(res.status) !== status) { drift.push(`GET ${path}: status ${res.status}, contract ${status} — ${res.body.slice(0, 120)}`); continue; }
    const schema = response.content?.['application/json']?.schema;
    if (!schema) continue;
    if (res.json === undefined) { drift.push(`GET ${path}: body is not JSON (${res.type})`); continue; }
    for (const line of validate(schema, res.json)) drift.push(`GET ${path}: ${line}`);
  }
  assert.ok(checked >= 40, `only ${checked} routes probed — the contract lost its probes`);
  assert.deepEqual(drift, [], `responses that left the contract (deliberate? ${REFRESH}):\n  ${drift.join('\n  ')}`);
});
