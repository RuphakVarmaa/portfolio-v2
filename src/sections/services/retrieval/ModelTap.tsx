import { useEffect, useMemo, useRef } from 'react'
import { formatBytes, formatMs } from '../../../cluster/format.ts'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { useSvgId } from '../../../components/ui/ids.ts'
import { copy } from '../../../data/copy.ts'
import { roundedRect } from '../../../lib/draw/paths.ts'
import { fmt } from '../../../lib/draw/wobble.ts'
import { EMBEDDINGS_MODEL } from '../../../lib/retrieval/embed.ts'
import type { LoadModelResult, LoadStage, RetrievalMode } from '../../../lib/retrieval/types.ts'
import { S } from './strings.ts'
import { focusAfter } from './tap-view.ts'
import styles from './Retrieval.module.css'

/**
 * Tier 1: the embedding model, on a tap only (spec 4.3 and 6.6). Nothing is fetched until the visitor presses
 * the button, and the button says what it costs before they do: the encoder and the runtime, in bytes measured
 * from the files this build actually ships. While it loads there is a real progress bar (bytes read, or the
 * page being embedded), and a Stop. When it is ready the visitor can choose which engine answers.
 *
 * When the tap cannot be offered it says why in one line (the model is not published yet, the browser has no
 * WASM SIMD, the Basic tier, no Web Worker) and offers nothing.
 */

export type ModelView =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'idle'; note?: string }
  | { kind: 'loading'; stage: LoadStage; /** 0 to 1, or null while the amount is unknown. */ fraction: number | null; detail: string }
  | { kind: 'ready'; result: LoadModelResult }
  | { kind: 'error'; message: string }

export interface ModelTapProps {
  view: ModelView
  /** Bytes of the files this build ships (null when not published): the tap's measured size line. */
  sizes: { model: number | null; runtime: number | null }
  /** The engine that answers questions now. */
  mode: RetrievalMode
  onMode: (mode: RetrievalMode) => void
  onLoad: () => void
  onStop: () => void
}

const BAR_W = 300
const BAR_H = 18

function ProgressTape({ fraction, label }: { fraction: number | null; label: string }) {
  const id = useSvgId('tape')
  const frame = useMemo(() => roundedRect(1.5, 1.5, BAR_W - 3, BAR_H - 3, 2, 'retrieval:progress', 0.5), [])
  const filled = fraction === null ? 0 : Math.max(0, Math.min(1, fraction)) * (BAR_W - 6)
  const percent = fraction === null ? undefined : Math.round(fraction * 100)
  return (
    <div className={styles.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={percent === undefined ? label : `${percent}%`}>
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V6" className={styles.progressHatch} />
          </pattern>
        </defs>
        {fraction === null ? <rect x="3" y="3" width={BAR_W - 6} height={BAR_H - 6} fill={`url(#${id})`} /> : <rect x="3" y="3" width={fmt(filled)} height={BAR_H - 6} className={styles.progressFill} />}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tick) => (
          <path key={tick} d={`M${(BAR_W / 10) * tick} ${BAR_H - 6}V${BAR_H - 2}`} className={styles.progressTick} />
        ))}
        <path d={frame} className={styles.progressFrame} />
      </svg>
    </div>
  )
}

function readyLines(result: LoadModelResult): string[] {
  const lines = [
    `${EMBEDDINGS_MODEL} · ${result.dim} dimensions · loaded in ${formatMs(result.timings.total)}`,
    result.chunksPrecomputed > 0
      ? `${result.chunksPrecomputed} page-element vectors from the build${result.chunksEmbedded > 0 ? `, ${result.chunksEmbedded} embedded here` : ''}`
      : `${result.chunksEmbedded} page elements embedded here in ${formatMs(result.timings.embeddings)}`,
  ]
  if (result.transferred !== undefined) {
    lines.push(
      result.transferred < result.bytes * 0.05
        ? S.tap.readCached(formatBytes(result.bytes))
        : S.tap.readNetwork(formatBytes(result.bytes), formatBytes(result.transferred), result.transferred >= result.bytes * 0.95),
    )
  }
  return lines
}

export function ModelTap({ view, sizes, mode, onMode, onLoad, onStop }: ModelTapProps) {
  const label = copy.services.retrieval.tapLabel
  const [verb, cost] = label.includes(' — ') ? label.split(' — ') : [label, '']
  const groupId = useSvgId('tap')
  const group = useRef<HTMLDivElement>(null)
  // Set by this component's own buttons. A button that is pressed is replaced by the next step's button (Load by
  // Stop, Stop by the engine choice), and the keyboard would be left on <body>: see focusAfter in tap-view.ts.
  const handoff = useRef(false)
  const press = (action: () => void) => () => {
    handoff.current = true
    action()
  }

  useEffect(() => {
    const root = group.current
    if (!handoff.current || !root) return
    const active = document.activeElement
    // Only focus that went down with the removed button (it falls to <body>), or is still in the tap, is moved:
    // a visitor who has gone on to type a question keeps the keyboard where it is.
    if (active === null || active === document.body || root.contains(active)) {
      const target = focusAfter(view.kind)
      const selector = target === 'engine' ? 'input[type="radio"]:checked' : `[data-tap-focus="${target}"]`
      if (target !== null) root.querySelector<HTMLElement>(selector)?.focus()
    }
    if (view.kind !== 'loading') handoff.current = false
  }, [view.kind])

  return (
    <div ref={group} className={styles.tap} role="group" aria-labelledby={`${groupId}-label`} data-state={view.kind}>
      <p className={`stencil ${styles.tapLabel}`} id={`${groupId}-label`}>
        {S.tap.label}
      </p>

      {view.kind === 'unavailable' ? <p className={styles.tapNote}>{view.reason}</p> : null}

      {view.kind === 'idle' || view.kind === 'error' ? (
        <div className={styles.tapBody}>
          <Button variant="secondary" icon={<Icon name="upload" />} onClick={press(onLoad)} aria-describedby={`${groupId}-cost`} data-tap-focus="load">
            {verb}
          </Button>
          <p className={styles.tapCost} id={`${groupId}-cost`}>
            {cost}
          </p>
          {sizes.model !== null && sizes.runtime !== null ? (
            <p className={styles.tapMeasured}>{S.tap.measured(formatBytes(sizes.model), formatBytes(sizes.runtime))}</p>
          ) : null}
          {view.kind === 'idle' && view.note ? <p className={styles.tapNote}>{view.note}</p> : null}
          {view.kind === 'error' ? (
            <p className={styles.tapError} role="alert">
              {S.tap.failed(view.message)}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.kind === 'loading' ? (
        <div className={styles.tapBody}>
          <ProgressTape fraction={view.fraction} label={`${S.tap.loading}: ${S.tap.stages[view.stage]}`} />
          <p className={styles.tapMeasured} aria-hidden="true">
            {S.tap.stages[view.stage]} · {view.detail}
          </p>
          <Button variant="ghost" size="sm" icon={<Icon name="stop" size={16} />} onClick={press(onStop)} data-tap-focus="stop">
            {S.tap.stop}
          </Button>
        </div>
      ) : null}

      {view.kind === 'ready' ? (
        <div className={styles.tapBody}>
          <p className={styles.tapDone}>
            <Icon name="check" size={18} /> {S.tap.done}
          </p>
          {readyLines(view.result).map((line) => (
            <p key={line} className={styles.tapMeasured}>
              {line}
            </p>
          ))}
          <fieldset className={styles.engine}>
            <legend className="stencil">{S.tap.engineLabel}</legend>
            <label className={styles.engineOption}>
              <input type="radio" name={`${groupId}-engine`} value="bm25" checked={mode === 'bm25'} onChange={() => onMode('bm25')} />
              <span>{S.engine.bm25}</span>
            </label>
            <label className={styles.engineOption}>
              <input type="radio" name={`${groupId}-engine`} value="embed" checked={mode === 'embed'} onChange={() => onMode('embed')} />
              <span>{S.engine.hybrid}</span>
            </label>
          </fieldset>
        </div>
      ) : null}
    </div>
  )
}
