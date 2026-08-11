import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  PreferencesContext,
  type MotionMode,
  type Theme,
} from './preferences-context'

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function readMotion(): MotionMode {
  return document.documentElement.dataset.motion === 'lite' ? 'lite' : 'full'
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [motionMode, setMotionMode] = useState<MotionMode>(readMotion)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ruphak-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.motion = motionMode
    localStorage.setItem('ruphak-motion', motionMode)
  }, [motionMode])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const toggleMotion = useCallback(() => {
    setMotionMode((current) => (current === 'full' ? 'lite' : 'full'))
  }, [])

  const value = useMemo(
    () => ({ theme, motionMode, toggleTheme, toggleMotion }),
    [motionMode, theme, toggleMotion, toggleTheme],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
