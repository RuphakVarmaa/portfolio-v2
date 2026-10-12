import { useId } from 'react'
import { copy, DEPTHS, type Depth, type DepthText } from '../../data/copy.ts'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export interface DepthSwitchProps {
  value: Depth
  onChange: (depth: Depth) => void
  /** Visible legend. Default `Explain at`. */
  legend?: string
  /** Option labels. Default `30 s · Engineer · Peer`. */
  labels?: DepthText
  /** What each option is called to a screen reader (the face `30 s` is read "30 S" once it is set in capitals). Default `30 seconds · Engineer · Peer`. */
  names?: DepthText
  /** Called on pointer or keyboard focus entering the control (a hint to preload what the change will need). */
  onIntent?: () => void
  className?: string
}

/**
 * The 30 s / Engineer / Peer switch: a native radio group (arrow keys, one tab stop, screen-reader
 * friendly), drawn as a segmented keycap row. Controlled; ServicePanel wires it to the preferences.
 */
export function DepthSwitch({
  value,
  onChange,
  legend = copy.services.panel.depthLegend,
  labels = copy.services.panel.depthOptions,
  names = copy.services.panel.depthNames,
  onIntent,
  className,
}: DepthSwitchProps) {
  const name = useId()
  return (
    <fieldset className={cx(styles.depth, className)} role="radiogroup" onPointerEnter={onIntent} onFocus={onIntent}>
      <legend className={cx('stencil', styles.depthLegend)}>{legend}</legend>
      <div className={styles.depthOptions}>
        {DEPTHS.map((depth) => (
          <label key={depth} className={styles.depthOption}>
            <input
              className="sr-only"
              type="radio"
              name={name}
              aria-label={names[depth]}
              value={depth}
              checked={value === depth}
              onChange={() => onChange(depth)}
            />
            <span className={cx(styles.depthFace, value === depth && styles.depthOn)}>{labels[depth]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
