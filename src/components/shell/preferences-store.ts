import { getTierInfo } from '../../cluster/tier.ts'
import type { Depth } from '../../data/copy.ts'
import { DEPTHS } from '../../data/copy.ts'
import type {
  MachineMode,
  MotionMode,
  PreferencesActions,
  PreferencesSnapshot,
  Theme,
} from './preferences-context.ts'

/**
 * The preference store. It is created once per <PreferencesProvider> (so the server render and each
 * route can pass their own default depth) and read with useSyncExternalStore, which is what keeps
 * hydration clean: React hydrates with `getServerSnapshot()` (defaults, identical to the prerendered
 * HTML) and re-renders with `getSnapshot()` (the visitor's stored choices) right after.
 *
 * localStorage keys (unchanged from v2 where they existed): ruphak-theme, ruphak-motion,
 * ruphak-machine, ruphak-plain, ruphak-depth, ruphak-keys (the single-key shortcuts; `off` or absent-means-on). Sound is never stored. Every storage access is wrapped:
 * private windows and blocked storage must not break the page.
 */

export const STORAGE_KEYS = {
  theme: 'ruphak-theme',
  motion: 'ruphak-motion',
  machine: 'ruphak-machine',
  plain: 'ruphak-plain',
  depth: 'ruphak-depth',
  keys: 'ruphak-keys',
} as const

export const THEME_COLORS: Record<Theme, string> = { light: '#f3eee4', dark: '#141311' }

export interface PreferencesStore {
  getSnapshot(): PreferencesSnapshot
  getServerSnapshot(): PreferencesSnapshot
  subscribe(listener: () => void): () => void
  actions: PreferencesActions
  /** Attach system listeners (reduced motion, colour scheme). Returns the cleanup. Call from an effect. */
  connect(): () => void
}

export interface StoreOptions {
  defaultDepth: Depth
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
}

const isDepth = (value: unknown): value is Depth => (DEPTHS as readonly unknown[]).includes(value)

export interface PreferenceInputs {
  theme: Theme
  motionChoice: MotionMode
  machineChoice: MachineMode
  plain: boolean
  depth: Depth
  sound: boolean
  keys: boolean
  reduce: boolean
  basic: boolean
}

/** Combine the visitor's choices with the system settings that can override them (pure; exported for tests). */
export function derivePreferences(i: PreferenceInputs): PreferencesSnapshot {
  const motion: MotionMode = i.reduce || i.motionChoice === 'lite' ? 'lite' : 'full'
  const machine: MachineMode = i.basic || i.machineChoice === 'off' ? 'off' : 'on'
  return {
    theme: i.theme,
    motion,
    motionLite: motion === 'lite',
    motionForced: i.reduce,
    plain: i.plain,
    machine,
    machineOff: machine === 'off',
    machineForced: i.basic,
    depth: i.depth,
    sound: i.sound,
    keys: i.keys,
  }
}

export function createPreferencesStore(options: StoreOptions): PreferencesStore {
  const listeners = new Set<() => void>()
  const serverSnapshot = derivePreferences({
    theme: 'light',
    motionChoice: 'full',
    machineChoice: 'on',
    plain: true,
    depth: options.defaultDepth,
    sound: false,
    keys: true,
    reduce: false,
    basic: false,
  })

  const onClient = typeof document !== 'undefined'
  const root = onClient ? document.documentElement : null

  const initial: PreferenceInputs = onClient
    ? {
        theme: root?.dataset.theme === 'dark' ? 'dark' : 'light',
        motionChoice: read(STORAGE_KEYS.motion) === 'lite' ? 'lite' : 'full',
        machineChoice: read(STORAGE_KEYS.machine) === 'off' ? 'off' : 'on',
        plain: read(STORAGE_KEYS.plain) !== 'off',
        depth: (() => {
          const stored = read(STORAGE_KEYS.depth)
          return isDepth(stored) ? stored : options.defaultDepth
        })(),
        sound: false,
        keys: read(STORAGE_KEYS.keys) !== 'off',
        reduce: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
        basic: getTierInfo().tier === 'basic',
      }
    : {
        theme: 'light',
        motionChoice: 'full',
        machineChoice: 'on',
        plain: true,
        depth: options.defaultDepth,
        sound: false,
        keys: true,
        reduce: false,
        basic: false,
      }

  let inputs = initial
  let snapshot = onClient ? derivePreferences(initial) : serverSnapshot

  /** Mirror the effective state onto <html> so CSS (and the next page load) agree with React. */
  const applyToDocument = () => {
    if (!root) return
    root.dataset.theme = snapshot.theme
    root.dataset.motion = snapshot.motion
    root.dataset.machine = snapshot.machine
    root.dataset.plain = snapshot.plain ? 'on' : 'off'
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', THEME_COLORS[snapshot.theme])
  }

  const commit = (next: PreferenceInputs) => {
    inputs = next
    const derived = derivePreferences(next)
    const same = (Object.keys(derived) as (keyof PreferencesSnapshot)[]).every((key) => derived[key] === snapshot[key])
    if (same) return
    snapshot = derived
    applyToDocument()
    for (const listener of [...listeners]) listener()
  }

  const actions: PreferencesActions = {
    setTheme(theme) {
      if (theme !== 'light' && theme !== 'dark') return
      write(STORAGE_KEYS.theme, theme)
      commit({ ...inputs, theme })
    },
    toggleTheme() {
      actions.setTheme(inputs.theme === 'dark' ? 'light' : 'dark')
    },
    setMotion(mode) {
      write(STORAGE_KEYS.motion, mode)
      commit({ ...inputs, motionChoice: mode })
    },
    toggleMotion() {
      actions.setMotion(inputs.motionChoice === 'lite' ? 'full' : 'lite')
    },
    setMachine(mode) {
      write(STORAGE_KEYS.machine, mode)
      commit({ ...inputs, machineChoice: mode })
    },
    toggleMachine() {
      actions.setMachine(inputs.machineChoice === 'off' ? 'on' : 'off')
    },
    setPlain(on) {
      write(STORAGE_KEYS.plain, on ? 'on' : 'off')
      commit({ ...inputs, plain: on })
    },
    togglePlain() {
      actions.setPlain(!inputs.plain)
    },
    setDepth(depth) {
      if (!isDepth(depth) || depth === inputs.depth) return
      write(STORAGE_KEYS.depth, depth)
      commit({ ...inputs, depth })
    },
    setSound(on) {
      commit({ ...inputs, sound: on })
    },
    toggleSound() {
      actions.setSound(!inputs.sound)
    },
    setKeys(on) {
      write(STORAGE_KEYS.keys, on ? 'on' : 'off')
      commit({ ...inputs, keys: on })
    },
    toggleKeys() {
      actions.setKeys(!inputs.keys)
    },
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    actions,
    connect() {
      if (!onClient || typeof matchMedia !== 'function') return () => undefined
      applyToDocument()
      const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)')
      const onReduce = (event: MediaQueryListEvent) => commit({ ...inputs, reduce: event.matches })
      reduceQuery.addEventListener('change', onReduce)
      // Follow the system colour scheme until the visitor picks one explicitly.
      const schemeQuery = matchMedia('(prefers-color-scheme: dark)')
      const onScheme = (event: MediaQueryListEvent) => {
        if (read(STORAGE_KEYS.theme) === null) commit({ ...inputs, theme: event.matches ? 'dark' : 'light' })
      }
      schemeQuery.addEventListener('change', onScheme)
      return () => {
        reduceQuery.removeEventListener('change', onReduce)
        schemeQuery.removeEventListener('change', onScheme)
      }
    },
  }
}
