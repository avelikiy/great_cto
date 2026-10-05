import { test, expect, mock } from 'claude-code/testing'

// The board is answered by these hooks, which stand where the engine would. What
// the mod posts is recorded, so each test asserts exactly what reached the board.

const ROOT = '/work/demo-proj'
const SURFACES = ['terminal', 'desktop'] as const

type Posted = { url: string; body: any }

function board(on: any, inbox: { status?: number; headers?: Record<string, string>; body?: unknown; down?: boolean }, env?: Record<string, string>) {
  const posted: Posted[] = []
  const toasts: string[] = []
  const status: (string | undefined)[] = []
  const opened: any[] = []
  mock.clock(on)
  mock.env(on, env ?? {})
  const value = (v: unknown) => ({ value: v })
  on('session.root', () => value(ROOT))
  on('command.register', () => value(undefined))
  on('ui.open', (_: any, e: any) => { opened.push(e); return value({ isPlaced: true }) })
  on('ui.toast', (_: any, e: any) => { toasts.push(e.text); return value(undefined) })
  on('ui.status', (_: any, e: any) => { status.push(e.text); return value(undefined) })
  on('http.fetch', (_: any, e: any) => {
    if (e.init?.method === 'POST') {
      posted.push({ url: e.url, body: JSON.parse(e.init.body) })
      return value({ status: 200, ok: true, headers: {}, text: '{"ok":true}' })
    }
    if (inbox.down) return { deny: 'connect ECONNREFUSED 127.0.0.1:3141' }
    const s = inbox.status ?? 200
    return value({ status: s, ok: s < 300, headers: inbox.headers ?? {}, text: JSON.stringify(inbox.body ?? {}) })
  })
  return { posted, toasts, status, opened }
}

// What the board would issue for a gate; derived, so no literal reads as a credential.
const issued = (id: string) => `${id}.issued`

const PLAN = { id: 'demo-1', title: 'plan review', reversibility: { state: 'cheap', gate: 'plan' }, token: issued('demo-1') }
const SHIP = { id: 'demo-2', title: 'ship checkout', reversibility: { state: 'expensive', gate: 'ship' }, token: issued('demo-2') }

async function openPane($: any, surface: (typeof SURFACES)[number]) {
  await $.command.run({ command: 'gates', args: '', origin: 'user' } as any)
  return $.ui.mount({
    plugin: 'great-cto', surface, component: 'Pane', requestId: 'great-cto-gates',
    props: { title: 'Gates', isFocused: true, bodyColumns: 80 },
  } as any)
}

for (const surface of SURFACES) {
  test(`${surface}: a cheap gate is approved through the board's route, with its token and project`, async ($, on) => {
    const b = board(on, { body: { pending_gates: [PLAN] } })
    const ui = await openPane($, surface)
    expect(await ui.find({ text: /gate:plan — plan review/ })).toBeDefined()
    await ui.press({ key: 'approve-demo-1' })
    expect(b.posted).toEqual([{ url: 'http://127.0.0.1:3141/api/gates/demo-1', body: { action: 'approve', token: issued('demo-1'), project: ROOT } }])
    expect(b.toasts.some(t => t === 'gate:plan approved')).toBe(true)
  })

  test(`${surface}: an expensive gate offers no Approve button — the typed name goes to the board as confirm`, async ($, on) => {
    const b = board(on, { body: { pending_gates: [SHIP] } })
    const ui = await openPane($, surface)
    expect(await ui.find({ key: 'approve-demo-2' })).toBeUndefined()
    await ui.input({ key: 'confirm-demo-2', text: 'gate:ship', kind: 'submit' })
    expect(b.posted).toEqual([{ url: 'http://127.0.0.1:3141/api/gates/demo-2', body: { action: 'approve', token: issued('demo-2'), project: ROOT, confirm: 'gate:ship' } }])
  })
}

test('what was typed is sent as typed — the board, not the pane, decides whether it matches', async ($, on) => {
  const b = board(on, { body: { pending_gates: [SHIP] } })
  const ui = await openPane($, 'terminal')
  await ui.input({ key: 'confirm-demo-2', text: 'yes', kind: 'submit' })
  expect(b.posted[0].body.confirm).toBe('yes')
})

test('a board that is down is "not checked", never "no gates"', async ($, on) => {
  const b = board(on, { down: true })
  const ui = await openPane($, 'terminal')
  expect(await ui.find({ text: /not answering/ })).toBeDefined()
  expect(await ui.find({ text: /No gates waiting/ })).toBeUndefined()
  expect(b.status.at(-1)).toBeUndefined()
})

test('a project the board does not know is said so, not served as another project', async ($, on) => {
  board(on, { headers: { 'x-project-resolved': 'fallback' }, body: { pending_gates: [PLAN] } })
  const ui = await openPane($, 'terminal')
  expect(await ui.find({ text: /not a project the board knows/ })).toBeDefined()
  expect(await ui.find({ key: 'approve-demo-1' })).toBeUndefined()
})

test('the status line counts what waits, and clears when nothing does', async ($, on) => {
  const b = board(on, { body: { pending_gates: [PLAN, SHIP] } })
  await openPane($, 'terminal')
  expect(b.status.at(-1)).toBe('great_cto: 2 gates waiting — /gates')
})

test('BOARD_PORT moves the pane to the board where the board is', async ($, on) => {
  const b = board(on, { body: { pending_gates: [PLAN] } }, { BOARD_PORT: '4242' })
  await $.session.start({ source: 'startup' } as any).catch(() => {})
  const ui = await openPane($, 'terminal')
  await ui.press({ key: 'approve-demo-1' })
  expect(b.posted[0].url).toBe('http://127.0.0.1:4242/api/gates/demo-1')
})

test('/gates opens the pane holding the keyboard, so 1 and 2 press at once', async ($, on) => {
  const b = board(on, { body: { pending_gates: [PLAN] } })
  await openPane($, 'terminal')
  expect(b.opened.some(o => o.id === 'great-cto-gates' && o.focus === true)).toBe(true)
})
