import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Button, ButtonLink } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { Stamp } from '../../../components/ui/Stamp.tsx'
import { cx } from '../../../components/ui/cx.ts'
import type { Depth } from '../../../data/copy.ts'
import { hexagon } from '../../../lib/draw/paths.ts'
import { terms } from '../../../lib/retrieval/analyze.ts'
import type { RichHit } from '../../../lib/retrieval/types.ts'
import { DEPTH_NAMES, citedExcerpt, citedPart, passageRange, shownParts, showsInternals, whereLabel } from './hit-view.ts'
import { WindowBrackets } from './WindowBrackets.tsx'
import { S } from './strings.ts'
import styles from './Retrieval.module.css'

/**
 * A stamped index card: one retrieved passage. The summary line is the card as filed (rank, where it came from,
 * the score); open it for the passage itself (the question's words marked, the cited sentence banded) with the
 * citation link that finds the sentence on the page directly under it, then the window miniature and, at the
 * Engineer and Peer depths, the engineer's rows (chunk id, wordpiece offsets, the sum behind the BM25 score).
 *
 * The passage is an excerpt around the cited sentence (the page element holding it and its neighbours) when the
 * window is long; one button shows the whole window, as the retriever returned it. It begins and ends on whole
 * words (hit-view.ts, `shownParts`), and a cut inside a line is a `…` in the line, not a row of its own.
 *
 * Everything on a card is data the worker measured or the corpus recorded: nothing is composed.
 */

export interface IndexCardProps {
  hit: RichHit
  /** Stems of the question's words, for marking them in the passage. */
  stems: ReadonlySet<string>
  /** The depth the page is showing now; a citation to another depth says it will switch, and the engineer's rows show at Engineer and Peer. */
  depth: Depth
  plain: boolean
  /** True on a /projects/ page citing a section that is not there: the link opens the home page. */
  away: boolean
  onCite: (hit: RichHit) => void
}

const HEX = hexagon(20, 20, 17, 'retrieval:rank', 0.6)

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

/**
 * The `…` of a cut inside a line: the page element goes on beyond what the card shows. It is part of the line, so it
 * wraps with the words (a no-break space ties it to the one beside it) and never stands on a ruled row of its own. A
 * screen reader skips it: it is punctuation, and the card says in words how many lines were left out.
 */
function Cut({ end = false }: { end?: boolean }) {
  return (
    <span className={styles.cut} aria-hidden="true">
      {end ? '\u00a0…' : '…\u00a0'}
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
  const excerpt = citedExcerpt(hit)
  const embed = hit.mode === 'embed' && hit.cosine !== undefined
  const deep = showsInternals(depth)
  const [whole, setWhole] = useState(false)

  // The page elements the card shows, each clipped to the stretch that begins and ends on whole words.
  const shown = useMemo(() => shownParts(hit), [hit])
  const total = shown.length
  const evidenceAt = Math.max(0, shown.findIndex((entry) => entry.index === hit.evidence?.part))
  // Which of them: the whole window, or an excerpt around the cited sentence (hit-view.ts says how much, by depth).
  const { first, last, expandable } = passageRange(shown, evidenceAt, deep, whole)

  const passage = useMemo(
    () =>
      shown.slice(first, last + 1).map((entry, offset) => {
        const i = first + offset
        const body = hit.text.slice(entry.from, entry.to)
        const band = hit.evidence && hit.evidence.part === entry.index ? { from: hit.evidence.from - entry.from, to: hit.evidence.to - entry.from } : null
        // A small stencil label above the first part of each source (consecutive parts of one source share it).
        const showLabel = i === first || shown[i - 1].part.label !== entry.part.label
        return { entry, body, band, showLabel, key: `${entry.index}:${entry.from}` }
      }),
    [hit, shown, first, last],
  )

  // Whole lines left out of the excerpt get a row of their own; a cut inside a line is a `…` in that line.
  const before = first
  const after = total - 1 - last

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
            <span className={styles.preview}>
              {excerpt.cutStart ? <Cut /> : null}
              {excerpt.text}
              {excerpt.cutEnd ? <Cut end /> : null}
            </span>
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
            {before > 0 ? <p className={styles.cutNote}>{S.skipped(before)}</p> : null}
            {passage.map(({ entry, body, band, showLabel, key }, offset) => {
              const lead = first === 0 && offset === 0 && entry.cutStart
              const tail = last === total - 1 && offset === passage.length - 1 && entry.cutEnd
              return (
                <Fragment key={key}>
                  {showLabel ? <p className={cx('stencil', styles.partLabel)}>{entry.part.label}</p> : null}
                  <p className={entry.part.kind === 'label' ? styles.partHeading : styles.partText}>
                    {lead ? <Cut /> : null}
                    {renderPart(body, stems, band)}
                    {tail ? <Cut end /> : null}
                  </p>
                </Fragment>
              )
            })}
            {after > 0 ? <p className={styles.cutNote}>{S.skipped(after)}</p> : null}
          </div>

          {/* The citation: under the passage it cites, before anything about how the passage was found. */}
          <div className={styles.cite}>
            <p className={styles.citeRow}>
              <ButtonLink
                variant="secondary"
                size="sm"
                href={`/#${hit.anchor}`}
                data-find=""
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

          {expandable ? (
            <div className={styles.citeRow}>
              <Button variant="ghost" size="sm" aria-expanded={whole} onClick={() => setWhole((value) => !value)}>
                {whole ? S.showExcerpt : S.showWhole(total, deep)}
              </Button>
              <span className={styles.citeFrom}>{whole ? S.wholeWindow(total, deep) : S.excerptOf(last - first + 1, total, deep)}</span>
            </div>
          ) : null}

          <div className={styles.cardFoot}>
            <WindowBrackets section={hit.section} seed={hit.chunkId} plain={!deep} />
            {deep ? (
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
            ) : null}
          </div>
        </div>
      </details>
    </li>
  )
}
