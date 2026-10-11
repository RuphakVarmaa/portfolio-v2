import { useSyncExternalStore } from 'react'
import { DemoSlot } from '../components/ui/DemoSlot.tsx'
import { PlainCaption } from '../components/ui/PlainCaption.tsx'
import { Stamp } from '../components/ui/Stamp.tsx'
import { copy } from '../data/copy.ts'
import { OPERATOR_EVENT, OPERATOR_KEY, OPERATOR_VALUE } from '../sections/chaos-lab/operator-keys.ts'
import { useLabObservers } from '../sections/chaos-lab/use-observers.ts'
import { START_NOW, useWake } from '../sections/chaos-lab/use-wake.ts'
import { page } from './experiments/page-copy.ts'
import styles from './Experiments.module.css'

/**
 * /experiments/ (spec 3.8): small live pieces of the cluster that runs this site. Reachable always; the
 * Chaos Lab stamp only lights the link to it, nothing here is gated.
 *
 * This file is in the initial bundle, so it is only the page: a heading, an index and six sections, each
 * with its title, description, plain caption and a static fallback. The pieces themselves are lazy chunks
 * (DemoSlot loads each when it is within half a screen of the viewport), so a visitor who only reads the
 * index downloads none of them. The first four are for visitors; the last two are owner tools.
 *
 * The viewport is the wrong trigger for the keyboard: Tab goes to the next focusable element, and a piece
 * that has not loaded has none, so focus would walk past it. The first Tab key press anywhere on the page
 * starts every piece loading (use-wake.ts), long before focus can reach one.
 */

const items = copy.experiments.items

/** `load` must be a literal dynamic import so each piece becomes its own chunk. */
const PIECES = [
  { id: 'trace', title: items.trace.title, text: items.trace.text, plain: page.plain.trace, owner: false, load: () => import('./experiments/TraceViewer.tsx') },
  { id: 'peers', title: items.peers.title, text: items.peers.text, plain: page.plain.peers, owner: false, load: () => import('./experiments/PeerTable.tsx') },
  { id: 'index', title: items.index.title, text: items.index.text, plain: page.plain.index, owner: false, load: () => import('./experiments/IndexExplorer.tsx') },
  { id: 'meter', title: items.meter.title, text: items.meter.text, plain: page.plain.meter, owner: false, load: () => import('./experiments/MeterBench.tsx') },
  { id: 'parity', title: page.owner.parity.title, text: page.owner.parity.text, plain: page.owner.parity.plain, owner: true, load: () => import('./experiments/ParityExport.tsx') },
  { id: 'og', title: page.owner.og.title, text: page.owner.og.text, plain: page.owner.og.plain, owner: true, load: () => import('./experiments/OgRender.tsx') },
] as const

/**
 * Has this visitor earned CERTIFIED OPERATOR? Read straight from the stored flag (the Chaos Lab's logic is a
 * separate chunk this page does not need). It changes when another tab earns it (`storage`) and when this tab
 * does (the lab announces it with `OPERATOR_EVENT`). Never earned on the server, so the prerender is the same
 * for everyone and the line appears after hydration.
 */
function subscribeStamp(listener: () => void): () => void {
  window.addEventListener('storage', listener)
  window.addEventListener(OPERATOR_EVENT, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(OPERATOR_EVENT, listener)
  }
}

function readStamp(): boolean {
  try {
    return localStorage.getItem(OPERATOR_KEY) === OPERATOR_VALUE
  } catch {
    return false
  }
}

export function ExperimentsPage() {
  const earned = useSyncExternalStore(subscribeStamp, readStamp, () => false)
  const [woken] = useWake()
  useLabObservers(true) // credit an experiment finished in this tab even though the Chaos Lab section is not on this page
  return (
    <main id="content" tabIndex={-1} className={`wrap ${styles.page}`}>
      <header className={styles.head}>
        <p className="stencil">{page.eyebrow}</p>
        <h1 className={styles.title}>{copy.experiments.title}</h1>
        <p className="lead measure">{copy.experiments.lead}</p>
        {earned ? (
          <p className={styles.earned}>
            <Stamp tone="live" size="md">
              {copy.chaos.stamp}
            </Stamp>
            <span>{page.operatorEarned}</span>
          </p>
        ) : null}
        <nav aria-label={page.navLabel}>
          <ol className={styles.index}>
            {PIECES.map((piece, index) => (
              <li key={piece.id}>
                <a href={`#${piece.id}`}>
                  <span className={styles.indexNo}>{String(index + 1).padStart(2, '0')}</span> {piece.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      {PIECES.map((piece, index) => (
        <section key={piece.id} id={piece.id} aria-labelledby={`${piece.id}-title`} className={styles.piece}>
          <header className={styles.pieceHead}>
            <p className="stencil">{page.benchLabel(index + 1)}</p>
            <Stamp size="sm" tone={piece.owner ? 'ink' : 'cobalt'}>
              {piece.owner ? page.ownerTool : page.live}
            </Stamp>
          </header>
          <div className={styles.pieceBody}>
            <h2 id={`${piece.id}-title`} className={styles.pieceTitle} tabIndex={-1}>
              {piece.title}
            </h2>
            <p className="measure">{piece.text}</p>
            <PlainCaption>{piece.plain}</PlainCaption>
            <div className={styles.live}>
              <DemoSlot load={piece.load} rootMargin={woken ? START_NOW : undefined} fallback={<p className={styles.note}>{page.fallback}</p>} />
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
