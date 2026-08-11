import { Gauge, Moon, Sun } from '@phosphor-icons/react'
import { usePreferences } from './preferences-context'

export function ThemeToggle() {
  const { theme, toggleTheme } = usePreferences()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      className="icon-control"
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}

export function MotionToggle() {
  const { motionMode, toggleMotion } = usePreferences()

  return (
    <button
      className="motion-control"
      type="button"
      onClick={toggleMotion}
      aria-label={`Motion is ${motionMode}. Switch to ${motionMode === 'full' ? 'lite' : 'full'} mode`}
      aria-pressed={motionMode === 'lite'}
    >
      <Gauge aria-hidden="true" />
      <span>{motionMode === 'full' ? 'Full motion' : 'Lite motion'}</span>
    </button>
  )
}
