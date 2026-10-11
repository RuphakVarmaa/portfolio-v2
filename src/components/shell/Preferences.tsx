import { useEffect, useState, type ReactNode } from 'react'
import { telemetry } from '../../cluster/telemetry.ts'
import type { Depth } from '../../data/copy.ts'
import { PreferencesContext } from './preferences-context.ts'
import { createPreferencesStore } from './preferences-store.ts'

/**
 * Provides the preference store to the tree. `defaultDepth` is `'30s'` everywhere except /projects/*,
 * which default to `'engineer'` (a stored choice always wins).
 */
export function PreferencesProvider({ children, defaultDepth = '30s' }: { children: ReactNode; defaultDepth?: Depth }) {
  const [store] = useState(() => createPreferencesStore({ defaultDepth }))

  useEffect(() => store.connect(), [store])

  // Lite motion batches telemetry to one update per 500 ms (spec 4.0).
  useEffect(() => {
    const sync = () => telemetry.setLite(store.getSnapshot().motionLite)
    sync()
    return store.subscribe(sync)
  }, [store])

  return <PreferencesContext.Provider value={store}>{children}</PreferencesContext.Provider>
}
