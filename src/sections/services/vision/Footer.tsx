import { useTierInfo } from '../../../cluster/store.ts'
import { formatBytes } from '../../../cluster/format.ts'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { copy } from '../../../data/copy.ts'
import { tapLabelFor } from '../../../lib/vision/readings.ts'
import { Label } from './Label.tsx'
import type { Pipeline } from './Pipeline.ts'
import { strings } from './strings.ts'
import type { ParsedTrace } from './TracePlayer.ts'
import { useEngine } from './useEngine.ts'
import styles from './Vision.module.css'

/** The detector: a tap that says what it will download, a progress bar while it does, and honest notes when it cannot. */
function Detector({ engine }: { engine: Pipeline }) {
  const t = copy.services.vision
  const tier = useTierInfo()
  const d = useEngine(engine, (s) => ({
    capability: s.capability,
    reason: s.capabilityReason,
    status: s.detector.status,
    quant: s.detector.quant,
    loaded: s.detector.loaded,
    total: s.detector.total,
    stage: s.detector.stage,
    error: s.detector.error,
    modelBytes: s.detector.modelBytes,
    runtimeBytes: s.detector.runtimeBytes,
  }))
  // The copy's sentence with the real sizes of the files this build ships.
  const tapLabel = tapLabelFor(t.tapLabel, d.modelBytes, d.runtimeBytes)

  if (d.capability === 'basic') return <p className={styles.note}>{strings.tier.basic}</p>
  if (d.capability === 'unsupported') return <p className={styles.note}>{strings.tier.unsupported(d.reason)}</p>
  if (d.status === 'unknown') return null
  if (d.status === 'absent') return <p className={styles.note}>{strings.detector.absent}</p>
  if (d.status === 'ready') {
    return (
      <p className={styles.ready}>
        <Icon name="check" />
        {strings.detector.ready(d.quant ?? '')}
      </p>
    )
  }
  if (d.status === 'loading') {
    const known = d.total > 0
    return (
      <div className={styles.tap}>
        <p className={styles.note}>{d.stage ? strings.detector.loading[d.stage] : strings.detector.loading.runtime}</p>
        <progress
          className={styles.progress}
          aria-label={tapLabel}
          max={known ? d.total : undefined}
          value={known ? Math.min(d.loaded, d.total) : undefined}
        />
        <p className="mono muted">{strings.detector.progress(formatBytes(d.loaded), known ? formatBytes(d.total) : null)}</p>
      </div>
    )
  }
  // available, or failed (try again)
  if (!tier.simd) return <p className={styles.note}>{strings.detector.noSimd}</p>
  return (
    <div className={styles.tap}>
      {d.status === 'failed' ? <p className={styles.note}>{strings.detector.failed(d.error ?? 'unknown error')}</p> : null}
      <Button variant="secondary" icon={<Icon name="gauge" />} onClick={() => void engine.loadDetector()}>
        {d.status === 'failed' ? strings.detector.retry : tapLabel}
      </Button>
    </div>
  )
}

/** A recorded run, if the owner has published one: clearly labelled, never presented as live. */
function Recorded({ engine, trace }: { engine: Pipeline; trace: ParsedTrace | null }) {
  const t = copy.services.vision.demo
  const known = useEngine(engine, (s) => s.detector.status !== 'unknown')
  const published = useEngine(engine, (s) => s.hasTrace)
  const replaying = useEngine(engine, (s) => s.phase === 'replay')
  const capable = useEngine(engine, (s) => s.capability === 'ok' || s.capability === 'basic')
  if (!known) return null // the build's inventory has not been read yet
  if (!published) return <p className={styles.note}>{t.noRecording}</p>
  if (!trace) return null // published; being fetched
  if (!trace.ok) return <p className={styles.note}>{`${t.noRecording} (${trace.error})`}</p>
  return (
    <div className={styles.block}>
      <Label>{strings.replay.heading}</Label>
      <p className="mono">{strings.replay.meta(trace.trace.device, trace.trace.date.slice(0, 10))}</p>
      {capable ? (
        <Button
          variant="secondary"
          icon={<Icon name={replaying ? 'stop' : 'play'} />}
          onClick={replaying ? () => engine.stopReplay() : () => engine.startReplay(trace.trace)}
        >
          {replaying ? strings.controls.replayStop : strings.controls.replay}
        </Button>
      ) : null}
      <p className={styles.note}>{strings.replay.note}</p>
    </div>
  )
}

/** Owner mode (`?record=1`): record a real run and download it as the trace the site replays. */
function Recorder({ engine }: { engine: Pipeline }) {
  const r = useEngine(engine, (s) => s.record)
  if (!r.enabled) return null
  const download = () => {
    const json = engine.recordingJson()
    if (!json) return
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'vision.json'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <div className={`${styles.block} ${styles.rec}`}>
      <Label>{strings.record.heading}</Label>
      <div className={styles.blockActions}>
        <Button variant="secondary" pressed={r.recording} onClick={r.recording ? () => engine.stopRecording() : () => engine.startRecording()}>
          {r.recording ? strings.record.stop : strings.record.start}
        </Button>
        <Button variant="secondary" icon={<Icon name="pdf" />} disabled={r.count === 0} onClick={download}>
          {strings.record.download}
        </Button>
        <Button variant="ghost" disabled={r.count === 0} onClick={() => engine.clearRecording()}>
          {strings.record.clear}
        </Button>
      </div>
      <p className="mono">{strings.record.count(r.count)}</p>
      {r.full ? <p className={styles.note}>{strings.record.full}</p> : null}
      <p className={styles.note}>{strings.record.note}</p>
    </div>
  )
}

export function Footer({ engine, trace }: { engine: Pipeline; trace: ParsedTrace | null }) {
  return (
    <div className={styles.foot}>
      <Detector engine={engine} />
      <Recorded engine={engine} trace={trace} />
      <Recorder engine={engine} />
    </div>
  )
}
