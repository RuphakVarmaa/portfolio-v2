import { copy } from '../../data/copy.ts'
import { setTierOverride, type Tier } from '../../cluster/tier.ts'
import { useTierInfo } from '../../cluster/store.ts'
import { Icon, type IconName } from '../ui/Icon.tsx'
import { cx } from '../ui/cx.ts'
import { usePreferences } from './preferences-context.ts'
import { SoundToggle } from './SoundToggle.tsx'
import styles from './shell.module.css'

interface ToggleProps {
  pressed: boolean
  onClick: () => void
  icon: IconName
  label: string
  title: string
  disabled?: boolean
}

function Toggle({ pressed, onClick, icon, label, title, disabled }: ToggleProps) {
  return (
    <button type="button" className={styles.toggle} aria-pressed={pressed} title={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={18} />
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.toggleLamp} aria-hidden="true" />
    </button>
  )
}

export interface PreferenceControlsProps {
  /**
   * `header` a compact row (the utility bar); `menu` a stacked list (the small-screen menu);
   * `panel` a wrapping list with the device-tier control (the Colophon).
   */
  variant?: 'header' | 'menu' | 'panel'
  className?: string
}

/** Plain language, Skip the machine, Paper/Ink, Motion, Sound. Every one is a native toggle button with `aria-pressed`. */
export function PreferenceControls({ variant = 'header', className }: PreferenceControlsProps) {
  const prefs = usePreferences()
  const t = copy.header.toggles
  const tier = useTierInfo()

  return (
    <div className={cx(styles.controls, styles[`controls-${variant}`], className)} role="group" aria-label={copy.header.controlsLabel}>
      <Toggle pressed={prefs.plain} onClick={prefs.togglePlain} icon="text" label={t.plain.label} title={t.plain.title} />
      <Toggle
        pressed={prefs.machineOff}
        onClick={prefs.toggleMachine}
        icon="machine"
        label={t.machine.label}
        title={prefs.machineForced ? t.machine.forced : t.machine.title}
        disabled={prefs.machineForced}
      />
      <Toggle
        pressed={prefs.theme === 'dark'}
        onClick={prefs.toggleTheme}
        icon={prefs.theme === 'dark' ? 'moon' : 'sun'}
        label={t.theme.ink}
        title={t.theme.title}
      />
      <Toggle
        pressed={prefs.motionLite}
        onClick={prefs.toggleMotion}
        icon="gauge"
        label={t.motion.label}
        title={prefs.motionForced ? t.motion.forced : t.motion.title}
        disabled={prefs.motionForced}
      />
      <SoundToggle />
      {variant === 'panel' ? (
        <label className={styles.tierControl}>
          <span className="stencil">{copy.header.tier.label}</span>
          <select
            value={tier.override ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setTierOverride(value === '' ? null : (value as Tier))
              window.location.reload()
            }}
          >
            <option value="">
              {copy.header.tier.auto} ({copy.header.tier.names[tier.detected]})
            </option>
            {(['full', 'standard', 'basic'] as const).map((name) => (
              <option key={name} value={name}>
                {copy.header.tier.names[name]}
              </option>
            ))}
          </select>
          <span className={styles.tierHint}>{copy.header.tier.applies}</span>
        </label>
      ) : null}
    </div>
  )
}
