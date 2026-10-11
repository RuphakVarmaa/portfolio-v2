import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { usePreferencesStore } from '../../../components/shell/preferences-context.ts'
import { DemoSlot } from '../../../components/ui/DemoSlot.tsx'
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'
import styles from './Fallback.module.css'
import { hasPending, takePending } from './pending.ts'
import { fmtMs } from './format.ts'
import { pipeline } from './state.ts'

/**
 * SERVICE 01, Agentic RAG Document Intelligence (spec 3.3a): an honest in-browser port. Retrieval and citation
 * run over this page's own text, in the retrieval worker; there is no LLM and no API.
 *
 * This file is part of the initial JavaScript and is deliberately tiny: the panel, the lazy demo slot, and a
 * three-line read of what the demo reports (measured stage timings, and which schematic parts are lit with
 * what they measured). The search box, the index cards, the model tap and the worker client are all in
 * `AskTheSite.tsx`, which DemoSlot loads when the panel is within half a screen of the viewport. The embedding
 * model (23 MB) and the ONNX Runtime (14 MB) are fetched on a tap and never before.
 *
 * It also finishes a citation that had to cross a page load (see pending.ts): a hit found on /projects/retrieval/
 * that lives in another section opens the home page, and this panel underlines the sentence once it has hydrated.
 */

const SCHEMATIC = getSchematic('retrieval')
const load = () => import('./AskTheSite.tsx')

/** Two static sentences of the fallback; the rest of the demo's wording is in strings.ts (lazy). */
const NEEDS_JS = 'Searching this page needs JavaScript and a Web Worker. The description and the numbers above are unchanged.'
const EXAMPLES = 'Questions it answers:'

/**
 * What the prerendered HTML, the Basic tier without Web Workers and a failed load show in the demo area: no
 * invented numbers, only what the demo does and the questions it is built around. While the demo is on its way
 * it also holds the demo's place (`data-reserve`, see the stylesheet), so the panel does not jump when the demo arrives.
 */
function Fallback() {
  const demo = copy.services.retrieval.demo
  return (
    <div className={styles.hold} data-reserve="">
      <div className={styles.fallback}>
        <p className="stencil">{demo.label}</p>
        <p className={styles.note}>{NEEDS_JS}</p>
        <p className={styles.note}>{EXAMPLES}</p>
        <ul className={styles.samples}>
          {demo.chips.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}


/** Apply a citation another page left behind (once, after hydration). */
function useFinishPendingCitation() {
  const preferences = usePreferencesStore()
  useEffect(() => {
    if (!hasPending()) return
    const pending = takePending(Date.now())
    if (!pending) return
    // The page must show the depth (or the captions) the sentence lives in before it is looked for.
    if (pending.depth) preferences.actions.setDepth(pending.depth)
    if (pending.plain) preferences.actions.setPlain(true)
    // No cleanup on purpose: the entry was taken, so a remount (StrictMode, a fast refresh) must not lose it.
    setTimeout(() => {
      void import('./cite.ts').then((module) => module.showCitation(pending.anchor, pending.sentence, preferences.getSnapshot().motionLite))
    }, 150)
  }, [preferences])
}

export function RetrievalService() {
  const state = useSyncExternalStore(pipeline.subscribe, pipeline.get, pipeline.getServer)
  const schematic = useMemo(() => ({ ...SCHEMATIC, active: state.active, annotations: state.annotations }), [state.active, state.annotations])
  const t = copy.services.retrieval
  useFinishPendingCitation()
  return (
    <ServicePanel
      project={projects[0]}
      copy={t}
      stamp={t.stamp}
      schematic={schematic}
      fallback={<Fallback />}
      demo={<DemoSlot load={load} />}
      stages={state.stages}
      formatStageMs={fmtMs}
      onShowPipeline={pipeline.requestRun}
      pipelineBusy={state.busy}
    />
  )
}
