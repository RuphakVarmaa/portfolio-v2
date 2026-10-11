import { useRef } from 'react'
import { PreferenceControls } from '../../components/shell/PreferenceControls.tsx'
import { DemoSlot } from '../../components/ui/DemoSlot.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { Stamp } from '../../components/ui/Stamp.tsx'
import { copy } from '../../data/copy.ts'
import { External } from '../contact/External.tsx'
import { useHydrated } from '../../components/ui/use-hydrated.ts'
import { Changelog } from './Changelog.tsx'
import styles from './Colophon.module.css'
import { useOperatorStamp } from './operator.ts'
import { BUILD_INFO_PATH } from './build-info-path.ts'
import { colophonSource, splitAtLink, type ColophonSource } from './source-link.ts'

/**
 * The credits sentence from copy with the source words turned into a link. While the source address is only a
 * GitHub account page the link says "GitHub profile" rather than passing the page off as the code (source-link.ts).
 * It is an inline link with no arrow, so the sentence's full stop follows it directly.
 */
function Credits({ source }: { source: ColophonSource }) {
  const { href, label, sentence } = source
  const parts = splitAtLink(sentence, label)
  if (!parts) return <>{sentence}</>
  return (
    <>
      {parts.before}
      <External href={href} inline>
        {label}
      </External>
      {parts.after}
    </>
  )
}

/**
 * `#colophon`: how this site was made, and the evidence (spec 3.8, 4.8). A maker's plate carries the
 * authorship line (the cluster is new work; the four services are ports of the projects), beside it the
 * links and the changelog. Then the session: the live telemetry of this very tab next to every display
 * preference again. Last, the build trace read from /build-info.json. The telemetry and the trace are lazy
 * chunks that load when they are within half a screen of the viewport; the trace is the last thing on the
 * page, so nothing sits below it to be pushed down when it arrives, and the telemetry's room is held. Without
 * JavaScript the page still has the plate, the links, the changelog and a link to the raw build trace. The
 * Experiments link lights once the Chaos Lab's stamp is earned. The Making-of link (its label says "repo
 * README") is shown only once `copy.colophon.sourceUrl` names a repository; until then the credits link
 * is labelled "GitHub profile" and the Making-of link is left out (source-link.ts).
 */
export function Colophon() {
  const t = copy.colophon
  const source = colophonSource()
  const root = useRef<HTMLDivElement>(null)
  const stamped = useOperatorStamp(root)
  const ready = useHydrated()

  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.version}>
      <div ref={root} className={styles.layout}>
        <div className={styles.plate}>
          <p className={styles.statement}>{t.authorship}</p>
          <p className={styles.credits}>
            <Credits source={source} />
          </p>
        </div>

        <div className={styles.aside}>
          <ul className={styles.links}>
            <li>
              <a href={t.links.experiments.href}>{t.links.experiments.label}</a>
              <span className={styles.lamp} data-lit={stamped || undefined} aria-hidden="true" />
              {stamped ? (
                <Stamp size="sm" rotate={-4}>
                  {copy.chaos.stamp}
                </Stamp>
              ) : null}
            </li>
            {source.makingOfHref ? (
              <li>
                <External href={source.makingOfHref}>{t.links.makingOf.label}</External>
              </li>
            ) : null}
            <li>
              <a href="#changelog">{t.links.changelog.label}</a>
            </li>
          </ul>
          <h3 id="changelog" className={styles.sub}>
            {t.links.changelog.label}
          </h3>
          <Changelog />
        </div>

        <section className={styles.session} aria-labelledby="telemetry-title" data-js-only="">
          <h3 id="telemetry-title">{t.telemetry.heading}</h3>
          <div className={styles.sessionSlot}>
            <DemoSlot load={() => import('./TelemetryPanel.tsx')} fallback={null} />
          </div>
        </section>

        <section className={styles.prefs} aria-labelledby="prefs-title" data-js-only="">
          <h3 id="prefs-title">{t.preferences.heading}</h3>
          <div className={styles.controls}>
            {ready ? (
              <div className={`panel ${styles.box}`}>
                <PreferenceControls variant="panel" />
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.build} aria-labelledby="trace-title">
          <h3 id="trace-title">{t.buildTrace.heading}</h3>
          <DemoSlot
            load={() => import('./BuildTrace.tsx')}
            fallback={
              <p>
                <a href={BUILD_INFO_PATH}>{BUILD_INFO_PATH}</a>
              </p>
            }
          />
        </section>
      </div>
    </Section>
  )
}
