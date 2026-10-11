import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { formatBytes, formatMs } from '../../cluster/format.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { copy as siteCopy } from '../../data/copy.ts'
import { skillGroups } from '../../data/portfolio.ts'
import { circle, roundedRect } from '../../lib/draw/paths.ts'
import { SITE_URL } from '../../routes.ts'
import { useCopy } from '../contact/use-copy.ts'
import { useHydrated } from '../../components/ui/use-hydrated.ts'
import type { ProfileFile } from './profile-file.ts'
import { AGENT_URLS, PROFILE_PATH } from './urls.ts'
import styles from './Manifest.module.css'

// The numbered, syntax-set printout is a lazy chunk: it loads when the visitor reaches for the switch.
const JsonView = lazy(() => import('./JsonView.tsx'))
const warmJsonView = () => void import('./JsonView.tsx')

/** Short UI messages for the switch (state announcements, not site copy). */
const SAY = {
  agent: 'Showing the file agents read, exactly as served.',
  people: 'Showing the skills as sentences.',
}

type Load = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; file: ProfileFile } | { status: 'failed' }

/**
 * Fetches `/profile.json` once, when the section is within half a screen of the viewport or the first time
 * the visitor asks for the agent view, whichever comes first. Nothing is requested at first paint.
 */
function useProfileFile(target: RefObject<Element | null>) {
  const [load, setLoad] = useState<Load>({ status: 'idle' })
  const started = useRef(false)

  const begin = useCallback(() => {
    if (started.current) return
    started.current = true
    setLoad({ status: 'loading' })
    // The fetcher and its validation load with the first request, not with the page.
    void import('./profile-file.ts')
      .then((module) => module.fetchProfile())
      .then((file) => setLoad(file ? { status: 'ok', file } : { status: 'failed' }))
      .catch(() => setLoad({ status: 'failed' }))
  }, [])

  useEffect(() => {
    const element = target.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(begin)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          begin()
        }
      },
      { rootMargin: '50% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [target, begin])

  return { load, begin }
}

// The two-position lever on the switch: a baseplate, a pivot, an arm with a ball. Seeded, so server and client draw the same.
const PLATE = roundedRect(1.5, 15, 41, 12, 6, 'manifest:lever:plate', 0.6)
const PIVOT = circle(22, 21, 2.4)
const BALL = circle(22, 4.5, 3.4)

function Lever({ agent }: { agent: boolean }) {
  return (
    <svg className={styles.lever} data-agent={agent || undefined} viewBox="0 0 44 28" width="44" height="28" aria-hidden="true">
      <path className={styles.plate} d={PLATE} />
      <g className={styles.arm}>
        <path d="M22 21V7.5" />
        <path className={styles.ball} d={BALL} />
      </g>
      <path className={styles.pivot} d={PIVOT} />
    </svg>
  )
}

/**
 * `#manifest`: the section is rendered from the same `/profile.json` that agents read (spec 3.6, 4.8). After
 * hydration it fetches the file from its own origin and renders the skill lines from what came back; the
 * status line under the switch shows what was measured (status, bytes, milliseconds). "View as agent" flips
 * the sheet to the file's own text. Without JavaScript the sheet shows the same facts from the build. The
 * switch and the copy buttons need JavaScript, so they render after hydration (their room is reserved in CSS).
 */
export function Manifest() {
  const t = siteCopy.manifest
  const [agent, setAgent] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { load, begin } = useProfileFile(root)
  const { copied, copy } = useCopy(t.copy.copied)
  const ready = useHydrated()

  const groups = load.status === 'ok' ? load.file.skillGroups : skillGroups
  const toggle = () => {
    const next = !agent
    setAgent(next)
    if (next) begin()
    announce(next ? SAY.agent : SAY.people)
  }

  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.note}>
      <PlainCaption>{t.plain}</PlainCaption>

      <div ref={root} className={styles.bench}>
        <div className={styles.main}>
          <div className={styles.toolbar} data-js-only="">
            {ready ? (
              <>
                <Button
                  icon={<Lever agent={agent} />}
                  aria-controls="manifest-sheet"
                  onClick={toggle}
                  onPointerEnter={warmJsonView}
                  onFocus={warmJsonView}
                >
                  {agent ? t.viewAsPeople : t.viewAsAgent}
                </Button>
                <p className={styles.source}>
                  <span className={styles.lamp} data-lit={load.status === 'ok' || undefined} aria-hidden="true" />
                  {load.status === 'ok' ? (
                    <span>
                      {PROFILE_PATH} · {load.file.status} · {formatBytes(load.file.bytes)} · {formatMs(load.file.ms)}
                    </span>
                  ) : load.status === 'loading' ? (
                    <span>{t.fetching}</span>
                  ) : load.status === 'failed' ? (
                    <span>{t.fetchFailed}</span>
                  ) : null}
                </p>
              </>
            ) : null}
          </div>

          <div id="manifest-sheet" className={styles.sheet} data-view={agent ? 'agent' : 'people'}>
            <p className={styles.label}>{agent ? PROFILE_PATH : siteCopy.resume.headings.skills}</p>
            {agent ? (
              load.status === 'ok' ? (
                <Suspense fallback={<p className={styles.status}>{t.fetching}</p>}>
                  <JsonView text={load.file.text} />
                </Suspense>
              ) : (
                <p className={styles.status}>{load.status === 'failed' ? t.fetchFailed : t.fetching}</p>
              )
            ) : (
              <ul className={styles.skills}>
                {groups.map((group) => (
                  <li key={group.label}>
                    <b>{group.label}</b>
                    {` — ${group.items.join(', ')}.`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ul className={styles.files}>
          {AGENT_URLS.map(({ id, path }) => (
            <li key={id}>
              <a href={path}>{path}</a>
              {ready ? (
                <Button
                  size="sm"
                  icon={<Icon name={copied === id ? 'check' : 'copy'} size={16} />}
                  onClick={() => void copy(`${SITE_URL}${path}`, id)}
                >
                  {copied === id ? t.copy.copied : t.copy[id]}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
