import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type RefObject } from 'react'
import { formatBytes } from '../../../cluster/format.ts'
import { Stamp } from '../../../components/ui/Stamp.tsx'
import { copy } from '../../../data/copy.ts'
import { bracket } from '../../../lib/draw/paths.ts'
import { twoDigits } from '../../../lib/vision/readings.ts'
import { Label } from './Label.tsx'
import { Lamp } from './Lamp.tsx'
import type { Pipeline } from './Pipeline.ts'
import { strings } from './strings.ts'
import { describeFrame } from './summary.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

/** Length of a bracket arm for a box: a third of its short side, within a readable range. */
const arm = (width: number, height: number) => Math.max(5, Math.min(16, Math.min(width, height) / 3))

/**
 * The detection boxes (spec 4.4): cobalt stencil corner brackets, not full rectangles; the class name in
 * Martian Mono and the confidence as two digits on a paper chip. Drawn as an SVG over the canvas whose
 * viewBox is the frame itself, so a box at x = 40 of 320 sits at 12.5% however large the picture is shown.
 * Each bracket has a paper-coloured halo under it so it reads over both dark and light dither. It
 * re-renders on every painted frame and nothing else does.
 */
function Boxes({ engine }: { engine: Pipeline }) {
  const { width, height, boxes } = useSyncExternalStore(engine.frames.subscribe, engine.frames.get)
  const finder = bracket(8, 8, width - 16, height - 16, 22, 'vision:finder', 0.6)
  return (
    <div className={styles.overlay} aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path className={styles.halo} d={finder} />
        <path className={styles.finder} d={finder} />
        {boxes.map((box, index) => {
          const d = bracket(box.x, box.y, box.w, box.h, arm(box.w, box.h), `vision:box:${index}`, 0.5)
          return (
            <g key={index}>
              <path className={styles.halo} d={d} />
              <path className={styles.bracket} d={d} />
            </g>
          )
        })}
      </svg>
      {boxes.map((box, index) => {
        // A box in the right half hangs its label from the box's right edge, so a long name never runs off the picture.
        const right = box.x + box.w / 2 > width / 2
        return (
          <span
            key={index}
            className={styles.chip}
            style={{ left: `${(((right ? box.x + box.w : box.x) / width) * 100).toFixed(2)}%`, top: `${((box.y / height) * 100).toFixed(2)}%` }}
            data-inside={box.y < 22 || undefined}
            data-right={right || undefined}
          >
            {box.cls} {twoDigits(box.conf)}
          </span>
        )
      })}
    </div>
  )
}

/** The detector's download, on the picture it is for: a paper strip along the bottom edge with the real bytes. */
function Loading({ engine }: { engine: Pipeline }) {
  const d = useEngine(engine, (s) => ({ status: s.detector.status, stage: s.detector.stage, loaded: s.detector.loaded, total: s.detector.total }))
  if (d.status !== 'loading') return null
  const known = d.total > 0
  return (
    <div className={styles.loading} aria-hidden="true">
      <span className="stencil">{d.stage ? strings.detector.loading[d.stage] : strings.detector.loading.runtime}</span>
      <progress className={styles.progress} max={known ? d.total : undefined} value={known ? Math.min(d.loaded, d.total) : undefined} />
      <span className="mono">{strings.detector.progress(formatBytes(d.loaded), known ? formatBytes(d.total) : null)}</span>
    </div>
  )
}

/** The word on the picture: what this is, and whether anything is being detected on it. */
function Tag({ engine }: { engine: Pipeline }) {
  const s = useEngine(engine, (x) => ({ phase: x.phase, detector: x.detector.status }))
  let text: string | null = null
  if (s.phase === 'idle' || s.phase === 'starting') text = strings.stage.testCard
  else if (s.phase === 'replay') text = strings.stage.recorded
  else if (s.detector === 'loading') text = strings.stage.loadingTag
  else if (s.detector === 'available') text = strings.stage.notLoadedTag
  else if (s.detector !== 'ready') text = strings.stage.noDetectorTag
  return text ? (
    <span className={styles.tag} aria-hidden="true">
      {text}
    </span>
  ) : null
}

export interface StageProps {
  engine: Pipeline
  canvasRef: RefObject<HTMLCanvasElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  /** A picture was dropped on the viewfinder. */
  onFile: (file: File) => void
  /** False when a picture would have nothing to be run through (this device cannot run the pipeline, or no detector can be used): a dropped file is then refused. */
  canDrop: boolean
}

/**
 * The viewfinder: the one `<canvas>` on the site (a one-bit dither of the frame the pipeline just
 * finished), the detection boxes over it, the LIVE lamp, the backpressure stamp. The camera's own picture
 * is never shown: the `<video>` that receives the stream is kept out of sight and only read from. The
 * canvas is shown at its own size (320 px wide), so every dithered pixel is a whole number of screen
 * pixels on 1x, 2x and 3x screens; the paper mat around it takes up the rest of the width.
 */
export function Stage({ engine, canvasRef, videoRef, onFile, canDrop }: StageProps) {
  const phase = useEngine(engine, (s) => s.phase)
  const backpressure = useEngine(engine, (s) => s.backpressure)
  const [dropping, setDropping] = useState(false)

  // What a screen reader hears for the picture. A string, so it only re-renders when the wording changes.
  const subscribe = useCallback(
    (listener: () => void) => {
      const offFrames = engine.frames.subscribe(listener)
      const offState = engine.store.subscribe(listener)
      return () => {
        offFrames()
        offState()
      }
    },
    [engine],
  )
  const label = useSyncExternalStore(subscribe, () => {
    const frame = engine.frames.get()
    return describeFrame(engine.store.get().phase, frame.boxes, frame.detector)
  })

  // The picture is dithered at the width it is shown at, so tell the engine how wide that is.
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = frame.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (!width) return
      // Redrawing the picture can move the layout, so do it on the next frame, never inside the observer's
      // own delivery: a layout change made there is what raises "ResizeObserver loop completed with
      // undelivered notifications" when the window is resized or a phone is turned.
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => engine.setDisplayWidth(width))
    })
    observer.observe(element)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [engine])

  const live = phase === 'live'
  const onDragOver = (event: DragEvent) => {
    // The viewfinder always takes the event, so a picture dropped on it never makes the browser leave the page to open the
    // file. Where no detector can be used (nothing to run the picture through) the drop is refused, not accepted.
    event.preventDefault()
    if (!canDrop) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    setDropping(true)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDropping(false)
    const file = event.dataTransfer.files[0]
    if (canDrop && file) onFile(file)
  }

  return (
    <div className={styles.stageBox}>
      <div className={styles.stageHead}>
        <Label>{strings.stage.heading}</Label>
        <span className={styles.liveTag}>
          <Lamp lit={live} />
          <span className="stencil">{live ? strings.stage.live : strings.stage.off}</span>
        </span>
      </div>
      <figure className={styles.stage} data-phase={phase} data-drop={dropping || undefined} onDragOver={onDragOver} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
        <div ref={frame} className={styles.frame}>
          <div className={styles.sheet}>
            <canvas ref={canvasRef} className={styles.canvas} width={320} height={240} role="img" aria-label={label} />
            <video ref={videoRef} className="sr-only" muted playsInline tabIndex={-1} aria-hidden="true" />
            <Boxes engine={engine} />
            <Tag engine={engine} />
            {backpressure ? (
              <div className={styles.stamp} aria-hidden="true">
                <Stamp tone="live" size="md" animate>
                  {copy.services.vision.demo.backpressure}
                </Stamp>
              </div>
            ) : null}
            <Loading engine={engine} />
            {dropping ? (
              <span className={styles.dropTag} aria-hidden="true">
                {strings.drop.over}
              </span>
            ) : null}
          </div>
        </div>
      </figure>
    </div>
  )
}
