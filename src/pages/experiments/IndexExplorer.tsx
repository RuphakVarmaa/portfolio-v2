import { useEffect, useRef, useState, type FormEvent } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { copy } from '../../data/copy.ts'
import { analyzeQuery } from '../../lib/retrieval/analyze.ts'
import { explainBm25, termTable, type TermContribution } from '../../lib/retrieval/bm25.ts'
import { RetrievalEngine } from '../../lib/retrieval/engine.ts'
import type { RichHit, SearchResult } from '../../lib/retrieval/types.ts'
import chaos from '../../sections/chaos-lab/ChaosLab.module.css'
import { ScrollBox } from '../../sections/chaos-lab/ScrollBox.tsx'
// The home panel's time formatter: a stage too short for the clock to resolve reads "<0.1 ms", never "0 ms".
import { fmtMs } from '../../sections/services/retrieval/format.ts'
import styles from '../Experiments.module.css'
import {
  RIBBON_TARGET,
  citedSentence,
  filterTerms,
  highlightSegments,
  indexStats,
  parseCorpus,
  ribbonHeight,
  ribbonRows,
  ribbonTop,
  snippet,
  stageTimes,
  type IndexStats,
  type Segment,
  type TermRow,
  type TermSort,
} from './index-explorer.ts'
import { tools } from './tools-copy.ts'

/** How many chunks a question lists. */
const TOP = 6

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'empty' }
  | { status: 'ready'; engine: RetrievalEngine; table: TermRow[]; stats: IndexStats }

interface Answer {
  stems: ReadonlySet<string>
  result: SearchResult
  /** Per hit: what each question word added to its raw BM25 score (the engine's own scoring functions). */
  why: ReadonlyMap<string, TermContribution[]>
  /** The word the visitor typed for each stem, to show next to the stem the index stores. */
  wordOf: ReadonlyMap<string, string>
}

function Marked({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark key={index} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

/** The passage a hit shows: the sentence its citation points at, or a short cut around the first matching word. */
function Passage({ hit, stems }: { hit: RichHit; stems: ReadonlySet<string> }) {
  const cited = citedSentence(hit)
  if (cited !== null) return <Marked segments={highlightSegments(cited, stems)} />
  const excerpt = snippet(hit.text, stems)
  return (
    <>
      {excerpt.before ? '… ' : ''}
      <Marked segments={highlightSegments(excerpt.text, stems)} />
      {excerpt.after ? ' …' : ''}
    </>
  )
}

/**
 * The retrieval index, opened up. The page's own text, cut into overlapping windows by the build, is read from
 * the file the retrieval worker reads and indexed in this page by the very engine the worker runs
 * (src/lib/retrieval/engine.ts), so the terms, the counts, the scores and the ranking below are what a search
 * on the site produces. Ask a question and see which chunks win, word by word; click a chunk on the ribbon to
 * read it; filter the terms.
 */
export default function IndexExplorer() {
  const t = tools.index
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const [sort, setSort] = useState<TermSort>('common')
  /** Only the newest question may write its answer (two quick searches must not swap places). */
  const asking = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch('/retrieval/corpus.json', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<unknown>
      })
      .then((json) => {
        if (cancelled) return
        const corpus = parseCorpus(json)
        if (!corpus) return setLoad({ status: 'failed' })
        if (corpus.chunks.length === 0) return setLoad({ status: 'empty' })
        const engine = new RetrievalEngine(corpus)
        setLoad({ status: 'ready', engine, table: termTable(engine.index), stats: indexStats(corpus, engine.stats) })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (load.status === 'loading') return <p className={styles.note}>{t.loading}</p>
  if (load.status === 'failed') return <p className={styles.problem}>{t.failed}</p>
  if (load.status === 'empty') return <p className={styles.note}>{t.empty}</p>

  const { engine, table, stats } = load
  const corpus = engine.corpus
  const hitIds = new Set(answer?.result.hits.map((hit) => hit.chunkId))
  const chunk = corpus.chunks.find((candidate) => candidate.id === selected) ?? null
  const chunkSection = chunk ? corpus.sections.find((candidate) => candidate.id === chunk.sectionId) : undefined
  const stems = answer?.stems ?? new Set<string>()

  const ask = async (text: string) => {
    const clean = text.trim()
    if (clean === '') return
    const turn = ++asking.current
    const asked = analyzeQuery(clean)
    const result = await engine.search(clean, { mode: 'bm25', topK: TOP })
    if (turn !== asking.current) return
    const why = new Map(
      result.hits.map((hit) => [hit.chunkId, explainBm25(engine.index, corpus.chunks.findIndex((candidate) => candidate.id === hit.chunkId), asked.stems)] as const),
    )
    setQuery(clean)
    setAnswer({ stems: new Set(asked.stems), result, why, wordOf: new Map(asked.words.map((entry) => [entry.stem, entry.word])) })
    setSelected(result.hits[0]?.chunkId ?? null)
    announce(result.hits.length === 0 ? t.noHits : `${result.hits.length} chunks match. Best: ${result.hits[0].chunkId}, BM25 ${result.hits[0].bm25.toFixed(2)}.`)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void ask(query)
  }

  const rows = ribbonRows(corpus)
  const shownTerms = filterTerms(table, prefix, sort)
  const maxDf = Math.max(1, ...table.map((row) => row.df))
  const unit = stats.tokenizer === 'wordpiece' ? t.tokenizers.wordpiece : t.tokenizers.words
  const found = answer?.result

  return (
    <div className={styles.stack}>
      <dl className={styles.chips}>
        <div>
          <dt className="stencil">{t.stats.chunks}</dt>
          <dd>{stats.chunks}</dd>
        </div>
        <div>
          <dt className="stencil">{t.stats.terms}</dt>
          <dd>{stats.terms}</dd>
        </div>
        <div>
          <dt className="stencil">{t.stats.avg}</dt>
          <dd>
            {stats.avgLen} {t.stats.terms_unit}
          </dd>
        </div>
        <div>
          <dt className="stencil">{t.stats.window}</dt>
          <dd>
            {stats.window} / {stats.overlap} {t.stats.overlap}
          </dd>
        </div>
        <div>
          <dt className="stencil">{t.stats.tokenizer}</dt>
          <dd>{t.tokenizers[stats.tokenizer]}</dd>
        </div>
        <div>
          <dt className="stencil">{t.stats.built}</dt>
          <dd>{fmtMs(stats.buildMs)}</dd>
        </div>
      </dl>

      <form className={styles.controls} onSubmit={onSubmit} role="search" aria-label={t.form.label}>
        <label className={styles.field} data-grow="">
          <span className="stencil">{t.form.label}</span>
          <input type="search" value={query} placeholder={copy.services.retrieval.demo.placeholder} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Button type="submit" variant="primary" icon={<Icon name="arrow-right" />}>
          {t.form.submit}
        </Button>
      </form>
      <ul className={styles.chipRow}>
        {copy.services.retrieval.demo.chips.map((chip) => (
          <li key={chip}>
            <button type="button" className={styles.suggest} onClick={() => void ask(chip)}>
              {chip}
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.ribbon} role="group" aria-label={t.ribbonLabel}>
        {rows.map((row) => (
          <div key={row.sectionId} className={styles.ribbonRow}>
            <span className={styles.ribbonLabel}>{row.title}</span>
            <div className={styles.ribbonTrack} style={{ height: ribbonHeight(row.lines) }}>
              {row.items.map((item) => (
                <button
                  key={item.chunkId}
                  type="button"
                  className={styles.win}
                  // A window is a 44 px target (the window you see is drawn smaller, inside it); one near the track's end is pulled back so its whole target stays on the track.
                  style={{ left: `min(${item.left}%, calc(100% - ${RIBBON_TARGET}px))`, width: `${item.width}%`, top: ribbonTop(item.line) }}
                  data-hit={hitIds.has(item.chunkId) || undefined}
                  aria-pressed={selected === item.chunkId}
                  aria-label={`${t.chunk} ${item.chunkId}, ${item.tokens} ${unit}`}
                  onClick={() => setSelected(item.chunkId)}
                >
                  <span aria-hidden="true">{item.tokens}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {answer && found ? (
        <div className={styles.stack}>
          <p className={styles.stages}>
            {stageTimes(found.stages).map((stage) => (
              <span key={stage.name}>
                {stage.name} <b>{stage.time}</b>
              </span>
            ))}
          </p>
          <p className={styles.meta}>
            <span className="stencil">{t.searched}</span> {found.words.length === 0 ? t.noWords : found.words.join(' · ')}
            {found.words.length > 0 ? ` — ${found.rerank}; ${found.candidates} ${t.candidates}` : ''}
          </p>
          <h3 className={styles.sub}>{t.hits}</h3>
          {found.hits.length === 0 ? (
            <p className={styles.note}>{t.noHits}</p>
          ) : (
            <ol className={styles.hits}>
              {found.hits.map((hit) => (
                <li key={hit.chunkId} className={styles.hit} data-selected={selected === hit.chunkId || undefined}>
                  <div className={styles.hitHead}>
                    <span className={styles.rank}>{hit.rank}</span>
                    <button type="button" className={styles.link} onClick={() => setSelected(hit.chunkId)}>
                      {hit.chunkId}
                    </button>
                    <span className={styles.score}>
                      <span className="sr-only">{t.score} </span>
                      {hit.bm25.toFixed(3)}
                    </span>
                  </div>
                  <p className={styles.snippet}>
                    <Passage hit={hit} stems={stems} />
                  </p>
                  <p className={styles.meta}>{t.found(hit.matched.length, hit.asked)}</p>
                  <ScrollBox label={`${t.why}: ${hit.chunkId}`}>
                    <table className={styles.why}>
                      <caption className="sr-only">{t.why}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t.whyHead.term}</th>
                          <th scope="col">{t.whyHead.tf}</th>
                          <th scope="col">{t.whyHead.idf}</th>
                          <th scope="col">{t.whyHead.adds}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(answer.why.get(hit.chunkId) ?? []).map((part) => (
                          <tr key={part.stem}>
                            <th scope="row">{answer.wordOf.get(part.stem) ?? part.stem}</th>
                            <td>{part.tf}</td>
                            <td>{part.idf.toFixed(2)}</td>
                            <td>
                              <span className={styles.barBox} aria-hidden="true">
                                <span className={styles.bar} style={{ width: `${Math.max(4, (part.score / Math.max(hit.bm25, 1e-9)) * 100)}%` }} />
                              </span>
                              {part.score.toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollBox>
                  <a className={styles.open} href={`/#${hit.anchor}`}>
                    {t.open}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {chunk ? (
        <div className={styles.detail}>
          <h3 className={styles.sub}>
            {t.selected} <span className={styles.mono}>{chunk.id}</span>
          </h3>
          <p className={styles.meta}>
            {chunk.start}–{chunk.end} · {chunk.tokens} {unit}
          </p>
          <p className={styles.chunkText}>
            <Marked segments={highlightSegments(chunk.text, stems)} />
          </p>
          {chunk.parts.length > 0 ? (
            <p className={styles.meta}>
              <span className="stencil">{t.parts}</span> {[...new Set(chunk.parts.map((part) => part.label))].join(' · ')}
            </p>
          ) : null}
          {chunkSection && chunkSection.context !== '' ? (
            <p className={styles.meta}>
              <span className="stencil">{t.heading}</span> {chunkSection.context}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.stack}>
        <h3 className={styles.sub}>{t.termsHeading}</h3>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span className="stencil">{t.termsFilter}</span>
            <input type="text" value={prefix} onChange={(event) => setPrefix(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <label className={styles.field}>
            <span className="stencil">{tools.trace.show}</span>
            <Select value={sort} onChange={(event) => setSort(event.target.value as TermSort)}>
              <option value="common">{t.termsSort.common}</option>
              <option value="rare">{t.termsSort.rare}</option>
            </Select>
          </label>
        </div>
        <ScrollBox label={t.termsHeading}>
          <table className={chaos.table}>
            <thead>
              <tr>
                <th scope="col">{t.termsHead.term}</th>
                <th scope="col">{t.termsHead.df}</th>
                <th scope="col">{t.termsHead.idf}</th>
              </tr>
            </thead>
            <tbody>
              {shownTerms.map((row) => (
                <tr key={row.term}>
                  <th scope="row">{row.term}</th>
                  <td>
                    <span className={styles.barBox} aria-hidden="true">
                      <span className={styles.bar} style={{ width: `${(row.df / maxDf) * 100}%` }} />
                    </span>
                    {row.df}
                  </td>
                  <td>{row.idf.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
        <p className={styles.note}>{t.termsNote}</p>
      </div>
    </div>
  )
}
