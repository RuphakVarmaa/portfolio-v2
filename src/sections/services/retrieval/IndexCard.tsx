import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Button, ButtonLink } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { Stamp } from '../../../components/ui/Stamp.tsx'
import { cx } from '../../../components/ui/cx.ts'
import type { Depth } from '../../../data/copy.ts'
import { hexagon } from '../../../lib/draw/paths.ts'
import { terms } from '../../../lib/retrieval/analyze.ts'
import type { RichHit } from '../../../lib/retrieval/types.ts'
import { DEPTH_NAMES, citedPart, citedSentence, whereLabel } from './hit-view.ts'
import { WindowBrackets } from './WindowBrackets.tsx'
import { S } from './strings.ts'
import styles from './Retrieval.module.css'

/**
 * A stamped index card: one retrieved passage. The summary line is the card as filed (rank, where it came from,
 * the score); open it for the passage itself (the question's words marked, the cited sentence banded), the
 * window miniature, and the citation link that finds the sentence on the page.
 *
 * The passage is an excerpt around the cited sentence (the page element holding it and its neighbours) when the
 * window is long; one button shows the whole 256-wordpiece window, verbatim, as the retriever returned it.
 *
 * Everything on a card is data the worker measured or the corpus recorded: nothing is composed.
 */

export interface IndexCardProps {
  hit: RichHit
  /** Stems of the question's words, for marking them in the passage. */
  stems: ReadonlySet<string>
  /** The depth the page is showing now; a citation to another depth says it will switch. */
  depth: Depth
  plain: boolean
  /** True on a /projects/ page citing a section that is not there: the link opens the home page. */
  away: boolean
  onCite: (hit: RichHit) => void
}

const HEX = hexagon(20, 20, 17, 'retrieval:rank', 0.6)
/** A window with this many lines or fewer is shown whole; longer ones start as an excerpt. */
const WHOLE_LIMIT = 5

function Rank({ n }: { n: number }) {
  return (
    <span className={styles.rank} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <path d={HEX} />
      </svg>
      <span className={styles.rankNumeral}>{n}</span>
    </span>
  )
}

/** The part's text as nodes: question words in <mark>, the cited sentence on a band. */
function renderPart(body: string, stems: ReadonlySet<string>, band: { from: number; to: number } | null): ReactNode {
  const marks = terms(body).filter((term) => stems.has(term.stem))
  const cuts = new Set<number>([0, body.length])
  for (const m of marks) {
    cuts.add(m.start)
    cuts.add(m.end)
  }
  if (band) {
    cuts.add(Math.max(0, band.from))
    cuts.add(Math.min(body.length, band.to))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const nodes: ReactNode[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i], points[i + 1]]
    if (to <= from) continue
    const slice = body.slice(from, to)
    const marked = marks.some((m) => from >= m.start && to <= m.end)
    const banded = band !== null && from >= band.from && to <= band.to
    const inner = marked ? <mark>{slice}</mark> : slice
    nodes.push(
      banded ? (
        <span key={from} className={styles.evidence}>
          {inner}
        </span>
      ) : (
        <Fragment key={from}>{inner}</Fragment>
      ),
    )
  }
  return nodes
}

export function IndexCard({ hit, stems, depth, plain, away, onCite }: IndexCardProps) {
  const part = citedPart(hit)
  const label = whereLabel(hit)
  const sentence = citedSentence(hit)
  const embed = hit.mode === 'embed' && hit.cosine !== undefined
  const [whole, setWhole] = useState(false)

  const total = hit.parts.length
  const evidencePart = hit.evidence?.part ?? 0
  const excerpt = total > WHOLE_LIMIT && !whole
  const first = excerpt ? Math.max(0, evidencePart - 1) : 0
  const last = excerpt ? Math.min(total - 1, evidencePart + 1) : total - 1

  const passage = useMemo(
    () =>
      hit.parts.slice(first, last + 1).map((p, offset) => {
        const i = first + offset
        const body = hit.text.slice(p.from, p.to)
        const band = hit.evidence && hit.evidence.part === i ? { from: hit.evidence.from - p.from, to: hit.evidence.to - p.from } : null
        // A small stencil label above the first part of each source (consecutive parts of one source share it).
        const showLabel = i === first || hit.parts[i - 1].label !== p.label
        return { part: p, body, band, showLabel, key: `${i}:${p.from}` }
      }),
    [hit, first, last],
  )

  const before = first
  const after = total - 1 - last
  const cutStart = first === 0 && (hit.parts[0]?.cut === 'start' || hit.parts[0]?.cut === 'both')
  const cutEnd = last === total - 1 && (hit.parts[total - 1]?.cut === 'end' || hit.parts[total - 1]?.cut === 'both')

  // The note under the citation link: what showing the sentence will change.
  let note: string | null = null
  if (away) note = S.findElsewhere
  else if (part.depth && part.depth !== depth) note = S.findAt(DEPTH_NAMES[part.depth])
  else if (part.kind === 'plain' && !plain) note = S.findPlain

  return (
    <li className={styles.cardItem}>
      <details className={cx(styles.card, hit.rank === 1 && styles.cardTop)} open={hit.rank === 1} data-rank={hit.rank}>
        <summary className={styles.summary}>
          <Rank n={hit.rank} />
          <span className={styles.where}>
            <span className="sr-only">{S.rank(hit.rank)} </span>
            <span className={cx('stencil', styles.whereLabel)}>{label}</span>
            <span className={styles.preview}>{sentence}</span>
          </span>
          <span className={styles.score}>
            <span className={styles.scoreMain}>{embed ? `${S.cosine} ${(hit.cosine as number).toFixed(2)}` : `${S.bm25} ${hit.bm25.toFixed(2)}`}</span>
            <span className={styles.scoreSub}>
              {embed ? `${S.bm25} ${hit.bm25.toFixed(2)} · ` : ''}
              {S.wordsFound(hit.matched.length, hit.asked)}
            </span>
          </span>
          {hit.rank === 1 ? (
            <Stamp size="sm" tone="cobalt" rotate={-5} animate className={styles.stampPos}>
              {S.best}
            </Stamp>
          ) : null}
          <Icon name="arrow-right" size={18} className={styles.chevron} />
        </summary>

        <div className={styles.cardBody}>
          <div className={styles.passage}>
            {cutStart || before > 0 ? <p className={styles.cutNote}>{before > 0 ? S.skipped(before) : '…'}</p> : null}
            {passage.map(({ part: p, body, band, showLabel, key }) => (
              <Fragment key={key}>
                {showLabel ? <p className={cx('stencil', styles.partLabel)}>{p.label}</p> : null}
                {p.kind === 'label' ? <p className={styles.partHeading}>{renderPart(body, stems, band)}</p> : <p className={styles.partText}>{renderPart(body, stems, band)}</p>}
              </Fragment>
            ))}
            {cutEnd || after > 0 ? <p className={styles.cutNote}>{after > 0 ? S.skipped(after) : '…'}</p> : null}
          </div>
          {total > WHOLE_LIMIT ? (
            <div className={styles.citeRow}>
              <Button variant="ghost" size="sm" aria-expanded={whole} onClick={() => setWhole((value) => !value)}>
                {whole ? S.showExcerpt : S.showWhole(total)}
              </Button>
              <span className={styles.citeFrom}>{whole ? S.wholeWindow(total) : S.excerptOf(last - first + 1, total)}</span>
            </div>
          ) : null}

          <div className={styles.cardFoot}>
            <WindowBrackets section={hit.section} seed={hit.chunkId} />
            <div className={styles.cardMeta}>
              <dl className={styles.facts}>
                <div>
                  <dt>chunk</dt>
                  <dd>{hit.chunkId}</dd>
                </div>
                <div>
                  <dt>window</dt>
                  <dd>
                    wordpieces {hit.window.start}–{hit.window.end} ({hit.tokens})
                  </dd>
                </div>
                {hit.contributions.length > 0 ? (
                  <div>
                    <dt>{S.scoreParts}</dt>
                    <dd>{hit.contributions.slice(0, 4).map((c) => `${c.word} ${c.score.toFixed(2)}`).join(' + ')}</dd>
                  </div>
                ) : null}
              </dl>
              <p className={styles.citeRow}>
                <ButtonLink
                  variant="secondary"
                  size="sm"
                  href={`/#${hit.anchor}`}
                  iconAfter={<Icon name="arrow-right" size={16} />}
                  aria-describedby={note ? `${hit.chunkId}-note` : undefined}
                  onClick={(event) => {
                    // A plain click is handled here (scroll, underline); a modified click keeps the browser's own behaviour.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                    event.preventDefault()
                    onCite(hit)
                  }}
                >
                  {S.find}
                </ButtonLink>
                <span className={styles.citeFrom}>{S.passageFrom(label)}</span>
              </p>
              {note ? (
                <p className={styles.citeNote} id={`${hit.chunkId}-note`}>
                  {note}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </details>
    </li>
  )
}
