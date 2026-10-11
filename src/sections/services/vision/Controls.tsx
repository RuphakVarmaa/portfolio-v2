import { useRef, type ChangeEvent, type RefObject } from 'react'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { copy } from '../../../data/copy.ts'
import type { Pipeline } from './Pipeline.ts'
import { messageText, strings } from './strings.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

export interface ControlsProps {
  engine: Pipeline
  /** The camera button, so focus can return to it when the consent dialog closes. */
  cameraButton: RefObject<HTMLButtonElement | null>
  /** Open the consent dialog; the camera is only ever started from the dialog's Allow. */
  onAskCamera: () => void
  /**
   * A detector can be used here (one is published, has not failed, and this browser can run it). Only then is
   * "Or drop an image" offered: with none there is nothing to run a picture through, so the control is hidden
   * (spec section 10, item 5) and the status line stops pointing at it.
   */
  canDrop: boolean
}

/**
 * Where the picture comes from: use the camera (or stop it), drop an image, run the recorded clip, with the
 * one-line status under them. One button is both "Use my camera" and "Stop", so keyboard focus never falls
 * off when the camera starts. The motion sensors, the other producer, live with the queue they feed.
 */
export function Controls({ engine, cameraButton, onAskCamera, canDrop }: ControlsProps) {
  const t = copy.services.vision.demo
  const file = useRef<HTMLInputElement>(null)
  const s = useEngine(engine, (x) => ({ capability: x.capability, phase: x.phase, canFlip: x.canFlip, hasClip: x.hasClip, message: x.message }))
  const running = s.phase === 'starting' || s.phase === 'live'
  const canRun = s.capability === 'ok'
  const offerImage = canRun && canDrop

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    if (picked) void engine.showImage(picked)
    event.target.value = '' // so choosing the same file again still fires
  }

  return (
    <div className={styles.sources}>
      {canRun ? (
        <div className={styles.buttons}>
          <Button
            ref={cameraButton}
            variant={running ? 'secondary' : 'primary'}
            icon={<Icon name={running ? 'stop' : 'camera'} />}
            busy={s.phase === 'starting'}
            onClick={running ? () => engine.stop('user') : onAskCamera}
          >
            {running ? strings.controls.stop : t.cameraButton}
          </Button>
          {running && s.canFlip ? (
            <Button variant="secondary" onClick={() => void engine.flipCamera()}>
              {strings.controls.flip}
            </Button>
          ) : null}
          {offerImage ? (
            <Button variant="secondary" icon={<Icon name="image" />} onClick={() => file.current?.click()}>
              {t.dropImage}
            </Button>
          ) : null}
          {s.hasClip ? (
            <Button variant="secondary" icon={<Icon name="play" />} onClick={() => void engine.startClip()}>
              {t.clip}
            </Button>
          ) : null}
          {s.phase === 'still' ? (
            <Button variant="ghost" onClick={() => engine.stop('user')}>
              {strings.controls.clear}
            </Button>
          ) : null}
        </div>
      ) : null}
      {offerImage ? <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label={strings.controls.pickImage} onChange={onPick} /> : null}
      <p className={styles.status}>{messageText(s.message, offerImage)}</p>
    </div>
  )
}
