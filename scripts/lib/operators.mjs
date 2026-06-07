// scripts/lib/operators.mjs — operator invites (the CTO/admin onboards a licensed signer).
//
// The admin creates an invite for an operator: a role (which fixes the vertical scope) + a tenant +
// a name. That mints a TOKEN. The operator opens /autopilot.html?invite=<token> and is locked to
// that role + tenant — the token is their credential, resolved server-side, so they can't escalate
// by picking another role. Stored at ~/.great_cto/operators.json (override GREAT_CTO_OPERATORS_PATH).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { ROLES } from './roles.mjs';

function storePath() { return process.env.GREAT_CTO_OPERATORS_PATH || join(homedir(), '.great_cto', 'operators.json'); }
function load() { try { return JSON.parse(readFileSync(storePath(), 'utf8')); } catch { return { invites: {} }; } }
function save(db) { const p = storePath(); if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(db, null, 2) + '\n'); return db; }

/** Admin mints an invite for an operator. Throws on an unknown / non-operator role. */
export function createInvite({ role, tenant = 'default', name = '', email = '', createdBy = 'admin' } = {}) {
  if (!ROLES[role]) throw new Error(`unknown role '${role}'`);
  if (role === 'admin') throw new Error('cannot invite an admin role');
  const db = load();
  const token = randomBytes(16).toString('hex');
  const invite = { token, role, roleLabel: ROLES[role].label, tenant, name, email, createdBy, status: 'pending', createdAt: new Date().toISOString() };
  db.invites[token] = invite;
  save(db);
  return invite;
}

export function listInvites() {
  return Object.values(load().invites).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** Resolve a token → the invite (the operator's authoritative role + tenant), or null. */
export function resolveInvite(token) {
  if (!token) return null;
  return load().invites[token] || null;
}

/** Mark an invite accepted the first time the operator opens it. */
export function acceptInvite(token) {
  const db = load(); const inv = db.invites[token];
  if (inv && inv.status === 'pending') { inv.status = 'accepted'; inv.acceptedAt = new Date().toISOString(); save(db); }
  return inv || null;
}

export function revokeInvite(token) {
  const db = load(); const had = !!db.invites[token];
  delete db.invites[token]; save(db);
  return had;
}
