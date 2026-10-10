import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Gate, View } from '../types'

// The gates waiting on the person, in the session they are working in.
//
// The board stays the one door an approval goes through: this reads the gates and
// their ADR-024 tokens from the board's /api/inbox and posts a decision to its
// /api/gates/<id>, so the token check, the binding to the tree as it is, the
// decision log and the wake-up all stay where they are. Nothing here writes a gate.
//
// A gate that is expensive to undo (or unclassified) keeps the board's ritual: the
// person types the gate's name, and the text goes to the board as `confirm`, where
// the server compares it. The pane never fills it in, and a button is never offered
// in its place: a second press is not the same act as typing what you are approving.

// The board's address: BOARD_PORT, as packages/board/lib/config.mjs reads it, else 3141.
let BOARD = 'http://127.0.0.1:3141'
async function locate($: any): Promise<void> {
  const port = Number(await $.env.get('BOARD_PORT'))
  BOARD = `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : 3141}`
}
const PANE = 'great-cto-gates'
const view = atom({ plugin: 'great-cto', key: 'view' } as const, { state: 'loading' } as View)
const busy = atom({ plugin: 'great-cto', key: 'busy' } as const, null as string | null)
const seen = atom({ plugin: 'great-cto', key: 'seen' } as const, 0)

const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p

// The project travels as the session root's absolute path, which the board resolves
// for any project under HOME — registered or not, and never confused with another
// project whose directory has the same name. A path the board cannot honour comes
// back from /api/inbox as a fallback, and the pane then offers no decision at all.
async function projectOf($: any): Promise<string> {
  return await $.session.root()
}

function gatesOf(body: any): Gate[] {
  return (body?.pending_gates || []).map((g: any) => ({
    id: String(g.id),
    title: String(g.title || g.id),
    gate: g.reversibility?.gate ? `gate:${g.reversibility.gate}` : String(g.id),
    guarded: ['expensive', 'unclassified'].includes(g.reversibility?.state),
    token: g.token ?? null,
  }))
}

async function refresh($: any): Promise<void> {
  const project = await projectOf($)
  let next: View
  try {
    const r = await $.http.fetch(`${BOARD}/api/inbox?project=${encodeURIComponent(project)}`)
    if (r.headers['x-project-resolved'] === 'fallback') next = { state: 'not-on-board', project: basename(project) }
    else if (!r.ok) next = { state: 'error', why: `board answered ${r.status}` }
    else next = { state: 'ok', project: basename(project), gates: gatesOf(JSON.parse(r.text)), at: new Date().toISOString() }
  } catch (err) {
    next = { state: 'board-down', why: String((err as Error)?.message || err) }
  }
  await update($, view, () => next)

  const count = next.state === 'ok' ? next.gates.length : 0
  $.ui.status(count ? `great_cto: ${count} gate${count === 1 ? '' : 's'} waiting — /gates` : undefined)
  const before = await read($, seen)
  if (count > before) {
    $.ui.toast(`great_cto: ${count - before} new gate${count - before === 1 ? '' : 's'} waiting on you`)
    void $.ui.open({ id: PANE, title: 'Gates' })
  }
  await update($, seen, () => count)
}

async function decide($: any, gate: Gate, action: 'approve' | 'reject', confirm?: string): Promise<void> {
  if ((await read($, busy)) !== null) return
  await update($, busy, () => gate.id)
  try {
    const project = await projectOf($)
    const r = await $.http.fetch(`${BOARD}/api/gates/${encodeURIComponent(gate.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: gate.token, project, ...(confirm !== undefined ? { confirm } : {}) }),
    })
    let body: any = {}
    try { body = JSON.parse(r.text) } catch { /* the status still says what happened */ }
    $.ui.toast(r.ok
      ? `${gate.gate} ${action === 'approve' ? 'approved' : 'rejected'}`
      : `${gate.gate} not ${action}d: ${body.error || `board answered ${r.status}`}`,
      { timeoutMs: 8000 })
  } catch (err) {
    $.ui.toast(`${gate.gate}: the board could not be reached — ${String((err as Error)?.message || err)}`, { timeoutMs: 8000 })
  } finally {
    await update($, busy, () => null)
    await refresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gates', description: 'great_cto gates waiting on you, in a pane' })
    await locate($)
    $.clock.every(30_000, () => { void refresh($) })
    void refresh($)
    return next(e)
  })

  // Asked for, the pane takes the keyboard: 1 / 2 press at once, Esc goes back to the
  // prompt. Opened by a new gate, it does not — it must not catch keys being typed.
  on('command.run', { command: 'gates' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Gates', focus: true })
    await refresh($)
    return { text: 'Gates pane opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const v = await read($, view)
    const working = await read($, busy)

    if (v.state === 'loading') return <Text dimColor>Asking the board…</Text>
    if (v.state === 'board-down') {
      return (
        <Box flexDirection="column">
          <Text color="yellow">The board is not answering at {BOARD} — gates not checked.</Text>
          <Text dimColor>Start it with /board. This is not the same as no gates.</Text>
        </Box>
      )
    }
    if (v.state === 'not-on-board') {
      return <Text color="yellow">{v.project} is not a project the board knows — gates not checked.</Text>
    }
    if (v.state === 'error') return <Text color="red">Gates not checked: {v.why}</Text>
    if (!v.gates.length) return <Text dimColor>No gates waiting on you in {v.project}.</Text>

    const one = v.gates.length === 1
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{v.project} · {v.gates.length} waiting · checked {v.at.slice(11, 19)} UTC</Text>
        {v.gates.map(g => (
          <Box flexDirection="column">
            <Text bold>{g.gate} — {g.title}</Text>
            <Text dimColor>{g.id}</Text>
            {!g.token
              ? <Text color="yellow">The board issued no approval token for it — decide on the board ({BOARD}).</Text>
              : working === g.id
                ? <Text dimColor>Sending…</Text>
                : g.guarded
                  ? (
                    <Box flexDirection="column">
                      <Text color="yellow">Expensive to undo. To approve, type {g.gate} and press Enter.</Text>
                      <Input key={`confirm-${g.id}`} label="approve:" placeholder={g.gate} submitLabel="approve"
                        onSubmit={value => { void decide($, g, 'approve', value) }} />
                      <Button key={`reject-${g.id}`} onPress={() => { void decide($, g, 'reject') }}>Reject</Button>
                    </Box>
                  )
                  : (
                    <Box flexDirection="row" gap={2}>
                      <Button key={`approve-${g.id}`} variant="primary" hotkey={one ? '1' : undefined}
                        onPress={() => { void decide($, g, 'approve') }}>Approve</Button>
                      <Button key={`reject-${g.id}`} hotkey={one ? '2' : undefined}
                        onPress={() => { void decide($, g, 'reject') }}>Reject</Button>
                    </Box>
                  )}
          </Box>
        ))}
      </Box>
    )
  })
}
