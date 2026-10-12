import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createPreferencesStore, STORAGE_KEYS } from './preferences-store.ts'
import { WIDGET_SELECTOR, shortcutFor, type KeyPress } from './shortcuts.ts'

/** A plain key press on the page body: no modifier, nothing focused that has keys of its own. */
const press = (key: string, over: Partial<KeyPress> = {}): KeyPress => ({
  key,
  defaultPrevented: false,
  composing: false,
  ctrl: false,
  meta: false,
  alt: false,
  typing: false,
  inWidget: false,
  modalOpen: false,
  ...over,
})

// ---- the shortcuts themselves -----------------------------------------------------------------------

test('p, c, r, 2 and ? are the five shortcuts, and nothing else is', () => {
  assert.equal(shortcutFor(press('p'), true), 'projects')
  assert.equal(shortcutFor(press('c'), true), 'contact')
  assert.equal(shortcutFor(press('r'), true), 'resume')
  assert.equal(shortcutFor(press('2'), true), 'second-tab')
  assert.equal(shortcutFor(press('?'), true), 'key-sheet')
  for (const key of ['P', 'C', 'R', 'a', 'z', '1', '3', 'Enter', 'Tab', ' ', 'Escape', 'ArrowDown', 'constructor', '__proto__', '']) {
    assert.equal(shortcutFor(press(key), true), null, `"${key}" is not a shortcut`)
  }
})

test('WCAG 2.1.4: with the switch off no key is a shortcut, the question mark included', () => {
  for (const key of ['p', 'c', 'r', '2', '?']) assert.equal(shortcutFor(press(key), false), null, key)
})

test('typing, a modifier, an input-method composition, a handled key and an open dialog all leave the key alone', () => {
  assert.equal(shortcutFor(press('p', { typing: true }), true), null)
  for (const modifier of ['ctrl', 'meta', 'alt'] as const) assert.equal(shortcutFor(press('r', { [modifier]: true }), true), null, modifier)
  assert.equal(shortcutFor(press('c', { composing: true }), true), null)
  assert.equal(shortcutFor(press('c', { defaultPrevented: true }), true), null)
  assert.equal(shortcutFor(press('2', { modalOpen: true }), true), null)
})

test('focus inside a radio group, a summary or a log is left alone (they take keys of their own)', () => {
  assert.equal(shortcutFor(press('p', { inWidget: true }), true), null)
  for (const role of ['radiogroup', 'log']) assert.ok(WIDGET_SELECTOR.includes(`[role="${role}"]`), role)
  assert.ok(WIDGET_SELECTOR.includes('summary'))
})

// ---- the visitor's switch, stored as ruphak-keys ------------------------------------------------------

/** A page with a localStorage, so the store reads and writes the way it does in a browser. */
function installPage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const g = globalThis as Record<string, unknown>
  g.document = { documentElement: { dataset: {} }, querySelector: () => null }
  g.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
  return data
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>
  delete g.document
  delete g.localStorage
})

test('the switch is on by default and the store keeps it under ruphak-keys', () => {
  const data = installPage()
  const store = createPreferencesStore({ defaultDepth: '30s' })
  assert.equal(STORAGE_KEYS.keys, 'ruphak-keys')
  assert.equal(store.getSnapshot().keys, true)
  assert.equal(shortcutFor(press('p'), store.getSnapshot().keys), 'projects')

  store.actions.setKeys(false)
  assert.equal(store.getSnapshot().keys, false)
  assert.equal(data.get('ruphak-keys'), 'off')
  assert.equal(shortcutFor(press('p'), store.getSnapshot().keys), null, 'the handler reads the switch at the moment of the press')

  store.actions.toggleKeys()
  assert.equal(store.getSnapshot().keys, true)
  assert.equal(data.get('ruphak-keys'), 'on')
})

test('a stored "off" disables the handlers from the first render of the next visit', () => {
  installPage({ 'ruphak-keys': 'off' })
  const store = createPreferencesStore({ defaultDepth: '30s' })
  assert.equal(store.getSnapshot().keys, false)
  for (const key of ['p', 'c', 'r', '2', '?']) assert.equal(shortcutFor(press(key), store.getSnapshot().keys), null, key)
  // The server's snapshot (what is prerendered and what the first client render matches) is "on".
  assert.equal(store.getServerSnapshot().keys, true)
})

test('subscribers hear about the switch, and an unchanged value is not a change', () => {
  installPage()
  const store = createPreferencesStore({ defaultDepth: '30s' })
  let heard = 0
  store.subscribe(() => (heard += 1))
  store.actions.setKeys(true) // already on
  assert.equal(heard, 0)
  store.actions.setKeys(false)
  assert.equal(heard, 1)
})
