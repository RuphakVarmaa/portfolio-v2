import { useEffect, useState, type CSSProperties } from 'react'
import { formatBytes } from '../../cluster/format.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { copy } from '../../data/copy.ts'
import { useCopy } from '../contact/use-copy.ts'
import styles from './Colophon.module.css'
import { BUILD_INFO_PATH } from './build-info-path.ts'
import { fetchBuildInfo, toTrace, type TraceChunk, type TraceView } from './trace-model.ts'

/** Short UI wording for the trace's states (the row labels are in `copy.colophon.buildTrace`). */
const L = {
  loading: 'Reading the build trace…',
  unavailable: 'The build trace could not be read. The production build writes it, so a dev server or an offline tab has none.',
  built: 'built',
  commit: 'commit',
  raw: 'raw',
  gzip: 'gzip',
  loadsFirst: 'Loads first',
  onDemand: 'On demand',
  kinds: { entry: 'site entry', chunk: 'chunk', worker: 'worker' },
  files: (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`,
  firstWhen: 'before the page is interactive',
  lazyWhen: 'only when needed',
  latin: (files: number) => `latin subset, ${files} ${files === 1 ? 'file' : 'files'}`,
  otherFonts: (files: number, size: string) => `${files} more ${files === 1 ? 'subset' : 'subsets'} (${size}) are fetched only if a page uses their characters`,
  notPublished: 'not published',
  copyCsp: 'Copy the policy',
  cspCopied: 'Policy copied',
  cspMatch: 'Identical to the policy in this page’s <meta> tag.',
  cspDiffers: 'Differs from the policy in this page’s <meta> tag.',
}

type State = { status: 'loading' } | { status: 'ok'; view: TraceView; pageCsp: string | null } | { status: 'failed' }

/** The policy this page is actually running under: the <meta> in its <head>. */
function readPageCsp(): string | null {
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null
}

/** One group of files: a label with its measured total, then every file with its gzip size and a bar (solid = loads first). */
function Files({ label, total, when, chunks, initial }: { label: string; total: number; when: string; chunks: readonly TraceChunk[]; initial: boolean }) {
  return (
    <>
      <p className={styles.group}>
        <i className={styles.bar} data-initial={initial || undefined} data-key="" aria-hidden="true" />
        <b>{label}</b> {formatBytes(total)} {'·'} {L.files(chunks.length)}, {when}
      </p>
      <dl className={styles.list}>
        {chunks.map((chunk) => (
          <div key={chunk.file}>
            <dt>
              <code>{chunk.file.replace(/^assets\//, '')}</code> <small>{L.kinds[chunk.kind]}</small>
            </dt>
            <dd>
              <span className={styles.bar} data-initial={initial || undefined} style={{ '--w': chunk.share.toFixed(3) } as CSSProperties} aria-hidden="true" />
              <span>{formatBytes(chunk.gzipBytes)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}

/**
 * The build trace (spec 3.8): the files this build shipped, as `/build-info.json` says (written by the
 * prerender step from the real files in dist/): the HTML, CSS and font bytes, every JavaScript file with its
 * gzip size (what loads first, then what loads only when asked), the models and runtime, and the CSP verbatim
 * with a live check against this page's own <meta>. Fetched from the site's own origin when the Colophon nears
 * the viewport (a lazy chunk); a dev server has no such file and the panel says so. The device tier lives in
 * the telemetry panel beside it: that one is measured in this browser, this one is measured at build time.
 */
export default function BuildTrace() {
  const t = copy.colophon.buildTrace
  const [state, setState] = useState<State>({ status: 'loading' })
  const { copied, copy: copyText } = useCopy(L.cspCopied)

  useEffect(() => {
    const abort = new AbortController()
    void fetchBuildInfo({ signal: abort.signal }).then((info) => {
      if (abort.signal.aborted) return
      setState(info ? { status: 'ok', view: toTrace(info), pageCsp: readPageCsp() } : { status: 'failed' })
    })
    return () => abort.abort()
  }, [])

  if (state.status === 'loading') return <p className={styles.note}>{L.loading}</p>
  if (state.status === 'failed') {
    return (
      <p className={styles.note}>
        {L.unavailable} <a href={BUILD_INFO_PATH}>{BUILD_INFO_PATH}</a>
      </p>
    )
  }

  const { view, pageCsp } = state
  return (
    <div className={`panel ${styles.trace}`}>
      <p className={styles.built}>
        {view.version} {'·'} {L.built} {view.built}
        {view.commit ? ` · ${L.commit} ${view.commit}` : ''}
      </p>

      <dl className={styles.stats}>
        <div>
          <dt className="stencil">{t.html}</dt>
          <dd>
            <b>{formatBytes(view.html.gzipBytes)}</b> {L.gzip}
            <small>{formatBytes(view.html.bytes)} {L.raw}</small>
          </dd>
        </div>
        <div>
          <dt className="stencil">{t.css}</dt>
          <dd>
            <b>{formatBytes(view.css.gzipBytes)}</b> {L.gzip}
            <small>{formatBytes(view.css.bytes)} {L.raw}</small>
          </dd>
        </div>
        <div>
          <dt className="stencil">{t.fonts}</dt>
          <dd>
            <b>{formatBytes(view.fonts.latinBytes)}</b>
            <small>{L.latin(view.fonts.latin.length)}</small>
          </dd>
        </div>
      </dl>
      {view.fonts.other.files > 0 ? <p className={styles.fine}>{L.otherFonts(view.fonts.other.files, formatBytes(view.fonts.other.bytes))}.</p> : null}

      <h4 className={styles.sub}>{t.js}</h4>
      <Files label={L.loadsFirst} total={view.jsTotals.initialGzip} when={L.firstWhen} chunks={view.groups.initial} initial />
      <Files label={L.onDemand} total={view.jsTotals.lazyGzip} when={L.lazyWhen} chunks={view.groups.lazy} initial={false} />

      <div className={styles.cols}>
        <div>
          <h4 className={styles.sub}>{t.models}</h4>
          <dl className={styles.facts}>
            {view.assets.map((asset) => (
              <div key={asset.path}>
                <dt>{asset.label}</dt>
                <dd>{asset.present ? formatBytes(asset.bytes) : L.notPublished}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className={styles.sub}>{t.csp}</h4>
          <pre className={styles.csp}>
            <code>
              {view.csp.directives.map((directive) => (
                <span key={directive}>{directive}</span>
              ))}
            </code>
          </pre>
          <div className={styles.cspTools}>
            <Button size="sm" icon={<Icon name={copied === 'csp' ? 'check' : 'copy'} size={16} />} onClick={() => void copyText(view.csp.text, 'csp')}>
              {copied === 'csp' ? L.cspCopied : L.copyCsp}
            </Button>
            {pageCsp !== null ? <p>{pageCsp === view.csp.text ? L.cspMatch : L.cspDiffers}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
