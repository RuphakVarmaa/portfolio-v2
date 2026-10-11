import { useEffect, useRef, useState } from 'react'
import { useTierInfo } from '../../../cluster/store.ts'
import { canAutoLoadDetector } from '../../../cluster/tier.ts'
import { usePreferences } from '../../../components/shell/preferences-context.ts'
import { ConsentDialog } from '../../../components/ui/ConsentDialog.tsx'
import { copy } from '../../../data/copy.ts'
import { ASSET_PATHS, fetchJson, fileExists, fileSize, loadAvailability } from '../../../lib/vision/availability.ts'
import { tapLabelFor } from '../../../lib/vision/readings.ts'
import { Controls } from './Controls.tsx'
import { parseColor } from './Dither.ts'
import { Footer } from './Footer.tsx'
import { Gauges } from './Gauges.tsx'
import { motionMaybeAvailable } from './MotionProducer.ts'
import { registerPipelineRunner } from './panel-store.ts'
import { createPipeline } from './Pipeline.ts'
import { Queue } from './Queue.tsx'
import { Stage } from './Stage.tsx'
import { strings } from './strings.ts'
import { parseTrace, type ParsedTrace } from './TracePlayer.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

/**
 * The Vision demo (spec 4.4), loaded when the panel nears the viewport. It owns one pipeline engine and
 * wires it to the page: the consent dialog (the camera is only ever started from its Allow), the
 * conditions that end a camera session (Stop, Esc, scrolling away, a hidden tab), the theme palette for the
 * one-bit dither, and the panel's "Show me the pipeline" button.
 *
 * The bench (viewfinder, sources, queue, gauges) is the part that has to be on screen for the camera to stay
 * on. It is one block on purpose: on a phone the viewfinder and the dials are a screen apart, and someone
 * shaking the phone to watch the queue is looking at the dials, not the picture.
 *
 * Nothing here loads a model or the ONNX runtime: that is the detector tap (Footer.tsx), or the Allow of
 * the consent dialog when it says so.
 */
export default function CameraStage() {
  const t = copy.services.vision
  const { theme, motionLite } = usePreferences()
  const tier = useTierInfo()
  const [engine] = useState(createPipeline)
  const [motionCapable] = useState(motionMaybeAvailable)
  const [asking, setAsking] = useState(false)
  const [trace, setTrace] = useState<ParsedTrace | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const bench = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const cameraButton = useRef<HTMLButtonElement>(null)
  const detector = useEngine(engine, (s) => ({ status: s.detector.status, modelBytes: s.detector.modelBytes, runtimeBytes: s.detector.runtimeBytes }))
  const hasTrace = useEngine(engine, (s) => s.hasTrace)
  const capability = useEngine(engine, (s) => s.capability)
  const canRun = capability === 'ok'
  // A device that cannot run the pipeline (the Basic tier, no workers) and has no recorded run to play has nothing
  // to measure: the instruments are put away and the note below says why, instead of dials stuck at zero.
  const dormant = capability !== 'ok' && capability !== 'checking' && !hasTrace

  // Allowing the camera also loads the detector only when the device may (full tier, no data saver, no slow
  // network) and the dialog says so; otherwise the tap is the only way to download it.
  const willLoadDetector = detector.status === 'available' && tier.simd && canAutoLoadDetector(tier)
  const tapLabel = tapLabelFor(t.tapLabel, detector.modelBytes, detector.runtimeBytes)
  const sizes = tapLabel.split(' — ')[1] ?? tapLabel

  useEffect(() => {
    const surface = canvas.current
    const hidden = video.current
    if (!surface || !hidden) return
    return engine.attach({ canvas: surface, video: hidden })
  }, [engine])

  // The dither takes its two inks from the active theme, and repaints when the theme changes.
  useEffect(() => {
    const element = root.current
    if (!element) return
    const style = getComputedStyle(element)
    const ink = parseColor(style.getPropertyValue('--ink'))
    const paper = parseColor(style.getPropertyValue('--paper'))
    if (ink && paper) engine.setPalette(ink, paper)
  }, [engine, theme])

  useEffect(() => engine.setLite(motionLite), [engine, motionLite])

  // The standard tier leaves vision on standby until its panel asks; this mounts when the panel nears the viewport.
  useEffect(() => engine.prepare(), [engine])

  useEffect(() => {
    let current = true
    void loadAvailability({ fetchJson, probeDirectly: import.meta.env.DEV, exists: (path) => fileExists(path, 'video/'), size: fileSize }).then((found) => {
      if (current) engine.setAvailability(found)
    })
    return () => {
      current = false
    }
  }, [engine])

  useEffect(() => {
    if (!hasTrace) return
    let current = true
    void fetchJson(ASSET_PATHS.trace).then((json) => {
      if (current) setTrace(parseTrace(json))
    })
    return () => {
      current = false
    }
  }, [hasTrace])

  // "Show me the pipeline" is a button in the panel; it runs a real pass through this engine.
  useEffect(() => {
    registerPipelineRunner(() => {
      void engine.runPipeline()
    })
    return () => registerPipelineRunner(null)
  }, [engine])

  // The camera stops on Stop, on Esc, when the bench leaves the screen, and when the tab is hidden (spec 4.4).
  useEffect(() => {
    const stopRunning = (reason: 'esc' | 'scroll' | 'hidden') => {
      const phase = engine.store.get().phase
      if (phase === 'starting' || phase === 'live') engine.stop(reason)
      else if (phase === 'replay') engine.stopReplay()
      if (reason !== 'esc') engine.stopMotion()
    }
    const onKey = (event: KeyboardEvent) => {
      // A dialog (this demo's consent, a schematic part, the key sheet) handles its own Esc.
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return
      stopRunning('esc')
    }
    const onVisibility = () => {
      if (document.hidden) stopRunning('hidden')
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    const region = bench.current
    const observer =
      region && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => !entry.isIntersecting)) stopRunning('scroll')
          })
        : null
    if (region) observer?.observe(region)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
    }
  }, [engine])

  return (
    <div ref={root} className={styles.vz} data-vision-demo="">
      <div ref={bench} className={styles.bench} hidden={dormant}>
        <Stage engine={engine} canvasRef={canvas} videoRef={video} canDrop={canRun} onFile={(file) => void engine.showImage(file)} />
        <Controls engine={engine} cameraButton={cameraButton} onAskCamera={() => setAsking(true)} />
        <Queue engine={engine} motionCapable={motionCapable} />
        <Gauges engine={engine} />
      </div>
      <Footer engine={engine} trace={trace} />
      <ConsentDialog
        open={asking}
        title={t.demo.consent.title}
        confirmLabel={t.demo.consent.allow}
        cancelLabel={t.demo.consent.deny}
        returnFocus={cameraButton}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          void engine.startCamera({ loadDetector: willLoadDetector })
        }}
      >
        <p>{t.demo.consent.body}</p>
        {willLoadDetector ? <p>{strings.detector.alsoLoads(sizes)}</p> : null}
      </ConsentDialog>
    </div>
  )
}
