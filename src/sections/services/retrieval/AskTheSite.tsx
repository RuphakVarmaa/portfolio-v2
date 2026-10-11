import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { announce } from '../../../cluster/live-region.ts'
import { isLit, type ServicePhase } from '../../../cluster/phase.ts'
import { formatBytes } from '../../../cluster/format.ts'
import { nodeIdFor } from '../../../cluster/registry.ts'
import type { JobHandle } from '../../../cluster/scheduler.ts'
import { useServicePhase, useTierInfo } from '../../../cluster/store.ts'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { usePanelContext } from '../../../components/ui/panel-context.ts'
import { cx } from '../../../components/ui/cx.ts'
import { usePreferences } from '../../../components/shell/preferences-context.ts'
import { copy } from '../../../data/copy.ts'
import { LAMP_GLOW_RINGS, lamp } from '../../../lib/draw/paths.ts'
import { analyzeQuery } from '../../../lib/retrieval/analyze.ts'
import { MODEL_NOT_LOADED } from '../../../lib/retrieval/messages.ts'
import type { LoadModelResult, RetrievalMode, RichHit, SearchResult, WarmResult } from '../../../lib/retrieval/types.ts'
import { serviceAnchor } from '../../../routes.ts'
import { loadModel, restartWorker, search, warm, workerAvailable, type SearchRun, type Where } from './client.ts'
import { showCitation } from './cite.ts'
import { citeNeeds, citedPart, citedSentence, whereLabel, DEPTH_NAMES } from './hit-view.ts'
import { fmtMs } from './format.ts'
import { elementAfter, placeToHold, scrollToRestore } from './hold-place.ts'
import { IndexCard } from './IndexCard.tsx'
import { ModelTap, type ModelView } from './ModelTap.tsx'
import { savePending } from './pending.ts'
import { DWELL_MS, annotate, engineName, planReplay } from './replay.ts'
import { pipeline } from './state.ts'
import { S } from './strings.ts'
import { TAP_START, describeProgress, reduceProgress, type ExpectedSizes, type TapProgress } from './tap-view.ts'
import styles from './Retrieval.module.css'

/**
 * ASK THE SITE (spec 3.3a, 4.3): a search box that reads this page's own text. A question becomes a
 * `retrieval.search` job on the retrieval worker; the five stages run there, each timed; the answer is a stack
 * of stamped index cards, each a 256-wordpiece window of the page with the sentence that answers banded, and a
 * link that finds that exact sentence on the page, scrolls to it and underlines it.
 *
 * Lazy: DemoSlot loads this chunk when the panel is within half a screen of the viewport. The corpus is fetched
 * and indexed (in the worker) as soon as it mounts, so the first question is already warm. The embedding model
 * is never fetched without a tap (tier 1, ModelTap); until the visitor taps, and while the model is not
 * published, BM25 answers and the panel says so.
 *
 * Every number on screen was measured by code that ran: stage times in the worker, the round trip here, the
 * index size by the index, the model bytes by the download.
 */

const MAX_QUESTION = 200

/** Collapse whitespace and cap the length: what is actually searched for and shown. */
function tidy(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION)
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 240)
const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

interface Index {
  info: WarmResult
  where: Where
}

interface Answer {
  id: number
  query: string
  run: SearchRun
  stems: ReadonlySet<string>
}

const LAMP = lamp(28, 28, 9, 'retrieval:lamp')

function WorkerLamp({ phase, mainThread }: { phase: ServicePhase; mainThread: boolean }) {
  const lit = !mainThread && isLit(phase)
  return (
    <div className={styles.lamp}>
      <svg className={styles.lampSvg} viewBox="0 0 56 56" aria-hidden="true">
        {lit ? LAMP_GLOW_RINGS.slice(0, 3).map((ring) => <circle key={ring.k} className={styles.glow} cx="28" cy="28" r={9 * ring.k} fillOpacity={ring.opacity} />) : null}
        <path className={styles.bezel} d={LAMP.bezel} />
        <path className={lit ? styles.lensOn : styles.lensOff} d={LAMP.lens} />
        <path className={styles.glare} d={LAMP.glare} />
      </svg>
      <span className={styles.lampWords}>
        <span className="mono">{mainThread ? S.worker.mainThread : nodeIdFor('retrieval', 0)}</span>
        <span className="muted">{mainThread ? S.worker.none : S.worker[phase]}</span>
      </span>
    </div>
  )
}

/** The five measured stages as a strip: name, time, and the share of the total each took. */
function Timings({ answer }: { answer: Answer }) {
  const { result, roundTripMs, where } = answer.run
  const total = result.totalMs
  return (
    <div className={styles.timings} role="group" aria-label={S.timingsLabel}>
      <p className="stencil">{where === 'main' ? S.timingsMain : S.timings}</p>
      <ol className={styles.stages}>
        {result.stages.map((stage) => (
          <li key={stage.name} className={styles.stageCell}>
            <span className={styles.stageName}>{stage.name}</span>
            <span className={styles.stageMs}>{fmtMs(stage.ms)}</span>
            <span className={styles.stageBar} style={{ '--share': total > 0 ? Math.round((stage.ms / total) * 100) : 0 } as CSSProperties} aria-hidden="true" />
          </li>
        ))}
        <li className={cx(styles.stageCell, styles.stageTotal)}>
          <span className={styles.stageName}>{S.total}</span>
          <span className={styles.stageMs}>{fmtMs(total)}</span>
        </li>
      </ol>
      <p className={styles.timingNote}>
        {S.roundTrip} {fmtMs(roundTripMs)} · {S.rerankNote(result.rerank)}
        {result.coldStartMs !== undefined ? ` · ${S.coldStart(result.coldStartMs)}` : ''}
      </p>
    </div>
  )
}

/** Why the model tap cannot be offered, in one line (or null when it can). The model not being published comes first: it is the one that matters now. */
function unavailableReason(index: Index | null, tier: string, simd: boolean): string | null {
  if (index === null) return null
  if (!index.info.assets.encoder) return copy.services.retrieval.demo.modelMissing
  if (tier === 'basic') return S.tap.unavailable.basic
  if (!simd) return S.tap.unavailable.noSimd
  if (!workerAvailable()) return S.tap.unavailable.noWorker
  if (index.info.tokenizer !== 'wordpiece') return S.tap.unavailable.noVocabulary
  return null
}

export default function AskTheSite() {
  const demo = copy.services.retrieval.demo
  const { headingLevel, standalone } = usePanelContext()
  const SubHeading = (['h2', 'h3', 'h4'] as const)[headingLevel - 1]
  const ResultsHeading = (['h3', 'h4', 'h5'] as const)[headingLevel - 1]
  const { depth, plain, motionLite, setDepth, setPlain } = usePreferences()
  const tier = useTierInfo()
  const phase = useServicePhase('retrieval')
  const inputId = useId()
  const chipsId = useId()
  const resultsId = useId()

  const [text, setText] = useState('')
  const [hint, setHint] = useState(false)
  const [searching, setSearching] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [index, setIndex] = useState<Index | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [mode, setMode] = useState<RetrievalMode>('bm25')
  const [tap, setTap] = useState<ModelView>({ kind: 'idle' })

  const root = useRef<HTMLDivElement>(null)
  const suggestions = useRef<HTMLDivElement>(null)
  /** Where the element after the demo was when a question was asked from further down the panel (see hold-place.ts). */
  const held = useRef<number | null>(null)
  const seq = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const job = useRef<JobHandle<'retrieval.loadModel'> | null>(null)
  const needsRestart = useRef(false)
  // What an answer that arrives later (after an await) needs to know about the page as it is by then.
  const latest = useRef({ index, motionLite })
  useEffect(() => {
    latest.current = { index, motionLite }
  })

  // The answer is inserted above the "Show me the pipeline" button: after every commit, put the page back where the
  // visitor's place was, until the answer (or the failure) has landed.
  useLayoutEffect(() => {
    if (held.current === null || !root.current) return
    const reference = elementAfter(root.current)
    if (reference) {
      const delta = scrollToRestore(held.current, reference.getBoundingClientRect().top)
      if (delta !== 0) window.scrollBy({ top: delta, behavior: 'instant' })
    }
    if (searching === null) held.current = null
  })

  // ---- the index: fetched and built in the worker as soon as the demo is on screen ----------------------------
  useEffect(() => {
    let live = true
    warm().then(
      (made) => {
        if (!live) return
        setIndex(made)
        // What the worker measured while it built the index: the two index-time parts of the drawing show it.
        pipeline.patch({ annotations: { ...pipeline.get().annotations, ...annotate([], 'bm25', made.info) } })
      },
      (error: unknown) => {
        if (live) setIndexError(messageOf(error))
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  const clearReplay = () => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  /**
   * "Try again" is inside the message it clears, so pressing it removes the focused button. The Ask button is
   * always there: the keyboard goes to it (not to the input, which would raise a phone's on-screen keyboard).
   */
  const keepKeyboard = () => root.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus()

  /** Leaving the page, or the demo unmounting: stop the replay and the download, and put the drawing back to rest. */
  const leave = useEffectEvent(() => {
    clearReplay()
    job.current?.cancel()
    pipeline.reset()
  })
  useEffect(() => () => leave(), [])

  // ---- publish a run to the panel (its stage list and its schematic) -----------------------------------------
  const publish = (run: SearchRun, replay: boolean) => {
    const { stages, mode: ran } = run.result
    const facts = latest.current.index?.info ?? null
    const final = { stages, annotations: annotate(stages, ran, facts), active: [], busy: false }
    clearReplay()
    const steps = planReplay(stages, ran, facts)
    if (!replay || latest.current.motionLite || steps.length === 0) {
      pipeline.patch(final)
      return
    }
    // Replay the real stages one at a time, so each part lights as its stage "arrives"; the times shown are the measured ones.
    pipeline.patch({ busy: true, stages: [], active: [], annotations: {} })
    steps.forEach((step, at) => {
      timers.current.push(setTimeout(() => pipeline.patch({ ...step, busy: true }), at * DWELL_MS))
    })
    timers.current.push(setTimeout(() => pipeline.patch(final), steps.length * DWELL_MS))
  }

  // ---- ask --------------------------------------------------------------------------------------------------
  const ask = async (raw: string, options: { mode?: RetrievalMode; replay?: boolean } = {}): Promise<void> => {
    const query = tidy(raw)
    if (query === '') {
      setHint(true)
      pipeline.patch({ busy: false })
      return
    }
    const engine = options.mode ?? mode
    const id = ++seq.current
    if (root.current) held.current = placeToHold(suggestions.current?.getBoundingClientRect().bottom, elementAfter(root.current)?.getBoundingClientRect().top)
    setHint(false)
    setText(query)
    setSearching(query)
    setProblem(null)
    clearReplay()
    try {
      const run = await search(query, engine)
      if (id !== seq.current) return
      setSearching(null)
      setAnswer({ id, query, run, stems: new Set(analyzeQuery(query).stems) })
      publish(run, options.replay === true)
      const hits = run.result.hits
      announce(hits.length === 0 ? S.announce.none(query) : S.announce.results(hits.length, query, whereLabel(hits[0]), engineName(run.result.mode)))
    } catch (error) {
      if (id !== seq.current || isAbort(error)) return
      setSearching(null)
      pipeline.patch({ busy: false })
      if (engine === 'embed' && messageOf(error).includes(MODEL_NOT_LOADED)) {
        // The worker restarted and forgot the model: say so, and answer this question with BM25 instead.
        setMode('bm25')
        setTap({ kind: 'idle', note: S.tap.reloadNote })
        void ask(query, { mode: 'bm25', replay: options.replay })
        return
      }
      setProblem(messageOf(error))
      announce(S.announce.error)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ask(text)
  }

  // "Show me the pipeline" in the panel runs a real search (the question in the box, or the placeholder's) and replays it.
  const runPipeline = useEffectEvent(() => {
    void ask(tidy(text) === '' ? demo.placeholder : text, { replay: true })
  })
  useEffect(() => pipeline.onRun(() => runPipeline()), [])

  // ---- citations -----------------------------------------------------------------------------------------------
  const cite = (hit: RichHit) => {
    const needs = citeNeeds(hit, { depth, plain })
    const sentence = citedSentence(hit)
    const part = citedPart(hit)
    if (!document.getElementById(hit.anchor)) {
      // /projects/retrieval/ has no other section on it: open the home page there; its panel applies the underline.
      savePending({ anchor: hit.anchor, sentence, ...(part.depth ? { depth: part.depth } : {}), ...(part.kind === 'plain' ? { plain: true } : {}), at: Date.now() })
      announce(S.announce.toHome)
      window.location.assign(`/#${hit.anchor}`)
      return
    }
    // Switch the page to the depth (or the captions) the sentence lives in, so it is on screen when it is looked for.
    flushSync(() => {
      if (needs.depth) setDepth(needs.depth)
      if (needs.plain) setPlain(true)
    })
    if (needs.depth) announce(S.announce.revealDepth(DEPTH_NAMES[needs.depth]))
    else if (needs.plain) announce(S.announce.revealPlain)
    const outcome = showCitation(hit.anchor, sentence, motionLite)
    if (outcome === 'sentence') announce(S.announce.cited(whereLabel(hit)))
    else if (outcome === 'section') announce(S.announce.citedSection)
  }

  // ---- tier 1: the embedding model, on a tap -------------------------------------------------------------------
  const sizes = useMemo<ExpectedSizes>(
    () => ({ vocabulary: index?.info.assets.vocab?.bytes ?? null, model: index?.info.assets.encoder?.bytes ?? null, runtime: index?.info.assets.runtime?.bytes ?? null }),
    [index],
  )

  const loadTap = async () => {
    if (job.current) return
    let progress: TapProgress = TAP_START
    const show = () => {
      const view = describeProgress(progress, sizes)
      setTap({ kind: 'loading', stage: progress.stage, fraction: view.fraction, detail: view.detail })
    }
    show()
    announce(S.announce.modelStart(`${formatBytes(sizes.model ?? 0)} model and ${formatBytes(sizes.runtime ?? 0)} runtime`))
    try {
      if (needsRestart.current) {
        // ONNX Runtime keeps a failed start for the life of its worker: begin again in a fresh one.
        setTap({ kind: 'loading', stage: 'vocabulary', fraction: null, detail: S.tap.restarting })
        await restartWorker()
        needsRestart.current = false
      }
      const started = loadModel((event) => {
        progress = reduceProgress(progress, event)
        show()
      })
      job.current = started
      // The worker returns the richer LoadModelResult (src/lib/retrieval/types.ts); the protocol's type is its first three fields.
      const result = (await started.promise) as LoadModelResult
      job.current = null
      setTap({ kind: 'ready', result })
      setMode('embed')
      announce(S.announce.modelDone(result.timings.total, result.chunksEmbedded, result.chunksPrecomputed))
    } catch (error) {
      job.current = null
      if (isAbort(error)) {
        setTap({ kind: 'idle', note: S.announce.modelStopped })
        announce(S.announce.modelStopped)
        return
      }
      const message = messageOf(error)
      needsRestart.current = message.startsWith('[session]')
      setTap({ kind: 'error', message: message.replace(/^\[session\]\s*/, '') })
      announce(S.announce.modelFailed)
    }
  }

  const reason = unavailableReason(index, tier.tier, tier.simd)
  const tapView: ModelView | null = reason !== null ? { kind: 'unavailable', reason } : index === null ? null : tap

  const hits = answer?.run.result.hits ?? []
  const result: SearchResult | null = answer?.run.result ?? null
  const showStats = index !== null

  return (
    <div ref={root} className={styles.demo} data-retrieval-demo="">
      <header className={styles.head}>
        <SubHeading className={styles.title}>{demo.label}</SubHeading>
        <WorkerLamp phase={phase} mainThread={index?.where === 'main'} />
      </header>

      <dl className={styles.plate}>
        <div className={styles.plateItem}>
          <dt className="stencil">{S.index.label}</dt>
          <dd className={styles.plateValue}>{showStats ? S.index.value(index.info.chunks, index.info.terms) : indexError ? S.indexFailed : `${S.indexing}…`}</dd>
        </div>
        <div className={styles.plateItem}>
          <dt className="stencil">{S.index.built}</dt>
          <dd className={styles.plateValue}>{showStats ? S.index.builtValue(index.info.corpusBytes, index.info.fetchMs, index.info.indexMs) : '—'}</dd>
        </div>
        <div className={styles.plateItem}>
          <dt className="stencil">{S.engine.label}</dt>
          <dd className={styles.plateValue}>{mode === 'embed' ? S.engine.hybrid : S.engine.bm25}</dd>
        </div>
      </dl>
      {showStats && index.where === 'main' ? <p className={styles.note}>{S.mainThread}</p> : null}
      {indexError ? (
        <div className={styles.problem} role="alert">
          <p>{S.indexFailed}</p>
          <p className={styles.note}>{indexError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              keepKeyboard()
              setIndexError(null)
              setAttempt((n) => n + 1)
            }}
          >
            {S.retry}
          </Button>
        </div>
      ) : null}

      <form className={styles.form} role="search" onSubmit={onSubmit} aria-label={demo.label}>
        <label className={cx('stencil', styles.fieldLabel)} htmlFor={inputId}>
          {S.inputLabel}
        </label>
        <div className={styles.askRow}>
          <input
            id={inputId}
            className={styles.input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={MAX_QUESTION}
            placeholder={demo.placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" variant="primary" busy={searching !== null} iconAfter={<Icon name="arrow-right" size={18} />}>
            {S.ask}
          </Button>
        </div>
        {hint ? (
          <p className={styles.hint} role="status">
            {S.emptyQuestion}
          </p>
        ) : null}
      </form>

      <div ref={suggestions} className={styles.chipsBox}>
        <p className="stencil" id={chipsId}>
          {S.chipsLabel}
        </p>
        <ul className={styles.chips} aria-labelledby={chipsId}>
          {demo.chips.map((chip) => (
            <li key={chip}>
              <button type="button" className={styles.chip} onClick={() => void ask(chip)}>
                {chip}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {answer === null && searching === null && problem === null ? <p className={styles.idle}>{S.idle}</p> : null}
      {answer === null && searching !== null ? (
        <p className={styles.idle} role="status">
          {S.asking}…
        </p>
      ) : null}
      {problem !== null ? (
        <div className={styles.problem} role="alert">
          <p>{S.searchFailed}</p>
          <p className={styles.note}>{problem}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              keepKeyboard()
              void ask(text)
            }}
          >
            {S.retry}
          </Button>
        </div>
      ) : null}

      {answer !== null && result !== null ? (
        <section className={styles.results} aria-labelledby={resultsId} aria-busy={searching !== null || undefined}>
          <div className={styles.resultsHead}>
            <ResultsHeading id={resultsId} className={styles.resultsTitle}>
              {S.resultsHeading(answer.query)}
            </ResultsHeading>
            <p className={styles.count}>{S.count(hits.length, result.candidates)}</p>
          </div>
          <Timings answer={answer} />
          {hits.length === 0 ? (
            <div className={styles.empty}>
              <p>{demo.noResults}</p>
            </div>
          ) : (
            <ol className={styles.cards}>
              {hits.map((hit) => (
                <IndexCard key={`${answer.id}:${hit.chunkId}`} hit={hit} stems={answer.stems} depth={depth} plain={plain} away={standalone && hit.anchor !== serviceAnchor('retrieval')} onCite={cite} />
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tapView !== null ? (
        <ModelTap
          view={tapView}
          sizes={{ model: sizes.model, runtime: sizes.runtime }}
          mode={mode}
          onMode={setMode}
          onLoad={() => void loadTap()}
          onStop={() => job.current?.cancel()}
        />
      ) : null}
    </div>
  )
}
