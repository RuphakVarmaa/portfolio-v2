import { useEffect, useRef, useState } from 'react'
import { formatBytes, formatMs } from '../../cluster/format.ts'
import { announce } from '../../cluster/live-region.ts'
import { useTierInfo } from '../../cluster/store.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { copy } from '../../data/copy.ts'
import type { ParityFixture } from '../../lib/retrieval/embed.ts'
import { MODEL_URL, loadModel, restartWorker, type LoadModelResult, type ModelProgress } from '../../sections/services/retrieval/client.ts'
import styles from '../Experiments.module.css'
import { PARITY_SENTENCES, fixtureFromParity, looksLikeModel, modelListed, previewFixture, serializeFixture } from './parity-fixture.ts'
import { tools } from './tools-copy.ts'

type Availability = 'checking' | 'absent' | 'present'
type Phase = 'idle' | 'working' | 'done' | 'error'

/**
 * Owner tool: export the parity fixture (spec 6.6). With the embedding model published, one tap loads the
 * encoder in the retrieval worker (23 MB model and 14 MB runtime, once, cached), which embeds the five fixed
 * sentences of src/lib/retrieval/embed.ts and reports the vectors; this page checks them and offers the file
 * `scripts/parity.test.mjs` reads. Without the model it says so and stops: it never fabricates a fixture.
 */
export default function ParityExport() {
  const t = tools.parity
  const tier = useTierInfo()
  const [availability, setAvailability] = useState<Availability>('checking')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ModelProgress | null>(null)
  const [fixture, setFixture] = useState<ParityFixture | null>(null)
  const [loaded, setLoaded] = useState<LoadModelResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** ONNX Runtime keeps a failed start for the life of the worker: the node is restarted before the next try. */
  const restart = useRef(false)

  useEffect(() => {
    let cancelled = false
    // The build's own inventory first: a probe of a file that is not published prints a red 404 in the console.
    // Only the dev server, which has no /build-info.json, asks for the file itself.
    fetch('/build-info.json')
      .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .catch(() => null)
      .then((info) => {
        const listed = modelListed(info)
        if (listed !== null) return listed ? 'present' : 'absent'
        return fetch(MODEL_URL, { method: 'HEAD' }).then((response): Availability => (looksLikeModel(response) ? 'present' : 'absent'))
      })
      .catch((): Availability => 'absent')
      .then((found) => {
        if (!cancelled) setAvailability(found)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const blocked = !tier.simd ? t.needsSimd : tier.tier === 'basic' ? t.needsTier : null

  const run = async () => {
    setPhase('working')
    setError(null)
    setFixture(null)
    setLoaded(null)
    setProgress(null)
    try {
      if (restart.current) {
        await restartWorker()
        restart.current = false
      }
      const result = (await loadModel(setProgress).promise) as LoadModelResult
      const made = fixtureFromParity(result.parity, new Date().toISOString())
      if (!made.ok) throw new Error(made.reason)
      setFixture(made.fixture)
      setLoaded(result)
      setPhase('done')
      announce(t.done)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      restart.current = message.startsWith('[session]')
      setError(message)
      setPhase('error')
    }
  }

  const download = () => {
    if (!fixture) return
    const blob = new Blob([serializeFixture(fixture)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'parity-fixture.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (availability === 'checking') return <p className={styles.note}>{t.checking}</p>
  if (availability === 'absent') {
    return (
      <div className={styles.stack}>
        <p className={styles.note}>{copy.services.retrieval.demo.modelMissing}</p>
        <p className={styles.note}>{t.howTo}</p>
      </div>
    )
  }

  const bytesLine =
    progress && progress.total > 0
      ? `${t.stages[progress.stage]}: ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
      : progress
        ? `${t.stages[progress.stage]}${progress.pct === undefined ? '' : `: ${progress.pct}%`}`
        : null

  return (
    <div className={styles.stack}>
      <p className={styles.note}>{t.shape}</p>
      <div className={styles.stack}>
        <p className="stencil">{t.sentences}</p>
        <ol className={styles.sentences}>
          {PARITY_SENTENCES.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ol>
      </div>
      {blocked ? (
        <p className={styles.problem}>{blocked}</p>
      ) : (
        <div className={styles.controls}>
          <Button variant="primary" busy={phase === 'working'} disabled={phase === 'working'} icon={<Icon name="play" />} onClick={() => void run()}>
            {phase === 'working' ? t.working : phase === 'error' ? t.again : t.run}
          </Button>
          <span className={styles.note}>{copy.services.retrieval.tapLabel}</span>
        </div>
      )}
      {phase === 'working' && bytesLine ? (
        <p className={styles.note} role="status">
          {bytesLine}
        </p>
      ) : null}
      {error ? (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      ) : null}
      {fixture && loaded ? (
        <div className={styles.stack}>
          <p className={styles.note}>
            {t.done} <span className="stencil">{t.measured}</span> {formatMs(loaded.timings.total)} · {formatBytes(loaded.bytes)}
          </p>
          <div className={styles.controls}>
            <Button variant="secondary" icon={<Icon name="upload" style={{ transform: 'scaleY(-1)' }} />} onClick={download}>
              {t.download}
            </Button>
            <span className={styles.note}>{t.saveTo}</span>
          </div>
          <pre className={styles.pre} aria-label={t.previewLabel} tabIndex={0}>
            {previewFixture(fixture)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
