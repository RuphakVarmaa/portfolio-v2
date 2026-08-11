import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'
export type MotionMode = 'full' | 'lite'

export type PreferencesValue = {
  theme: Theme
  motionMode: MotionMode
  toggleTheme: () => void
  toggleMotion: () => void
}

export const PreferencesContext = createContext<PreferencesValue | null>(null)

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider')
  }
  return context
}
