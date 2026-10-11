import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import type { Depth } from '../../data/copy.ts'
import type { PreferencesStore } from './preferences-store.ts'

export type Theme = 'light' | 'dark'
export type MotionMode = 'full' | 'lite'
export type MachineMode = 'on' | 'off'
export type { Depth }

/** The preference state every component can read. All values are effective (already combined with system settings). */
export interface PreferencesSnapshot {
  /** Paper (`light`) or Ink (`dark`). Mirrors `html[data-theme]`. */
  theme: Theme
  /** Effective motion: `lite` when the visitor chose it OR the system asks for reduced motion. Mirrors `html[data-motion]`. */
  motion: MotionMode
  /** `motion === 'lite'`. */
  motionLite: boolean
  /** True when lite is forced by `prefers-reduced-motion` (the Motion toggle is then disabled). */
  motionForced: boolean
  /** Plain-language captions visible. Mirrors `html[data-plain]`. */
  plain: boolean
  /** Effective machine mode: `off` means "Skip the machine" (chosen, or forced by the Basic tier). Mirrors `html[data-machine]`. */
  machine: MachineMode
  /** `machine === 'off'`. */
  machineOff: boolean
  /** True when the Basic tier forces the machine off (the toggle is then disabled). */
  machineForced: boolean
  /** Explanation depth shared by every ServicePanel. */
  depth: Depth
  /** Sound on. Never persisted; always starts off. */
  sound: boolean
}

export interface PreferencesActions {
  setTheme(theme: Theme): void
  toggleTheme(): void
  setMotion(mode: MotionMode): void
  toggleMotion(): void
  setMachine(mode: MachineMode): void
  toggleMachine(): void
  setPlain(on: boolean): void
  togglePlain(): void
  setDepth(depth: Depth): void
  setSound(on: boolean): void
  toggleSound(): void
}

export type PreferencesValue = PreferencesSnapshot & PreferencesActions

export const PreferencesContext = createContext<PreferencesStore | null>(null)

/** Read and change the visitor's preferences. Must be used inside <PreferencesProvider> (App renders one). */
export function usePreferences(): PreferencesValue {
  const store = useContext(PreferencesContext)
  if (!store) throw new Error('usePreferences must be used inside PreferencesProvider')
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  return useMemo(() => ({ ...snapshot, ...store.actions }), [snapshot, store])
}

/** The raw store, for code that must act outside React render (rare). */
export function usePreferencesStore(): PreferencesStore {
  const store = useContext(PreferencesContext)
  if (!store) throw new Error('usePreferencesStore must be used inside PreferencesProvider')
  return store
}
