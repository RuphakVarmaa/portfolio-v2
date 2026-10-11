import { isLit } from '../../cluster/phase.ts'
import { useServicePhase } from '../../cluster/store.ts'
import { copy, serviceNumber } from '../../data/copy.ts'
import { projects, type Project } from '../../data/portfolio.ts'
import { SECTION_IDS, serviceAnchor } from '../../routes.ts'
import { Hex } from './BoardSvg.tsx'
import styles from './ControlRoom.module.css'

/**
 * One row: the number in its hexagon (the same number hangs on the board's cable), the title as the link,
 * a small lamp that lights the moment that service's workers are ready, and its headline metric.
 *
 * The title is the link (cobalt, underlined); a stretched pseudo-element makes the whole row the target.
 * It is a plain `#service-...` anchor, which works before any script has run; once the page is hydrated,
 * useHashNavigation takes the click over: the page scrolls to the panel (smoothly unless motion is lite,
 * below the sticky header) and keeps going until it is there, even though the demos below load as they come
 * near, and focus moves to the panel's heading, so keyboard and screen-reader users land there.
 */
function Row({ project }: { project: Project }) {
  const phase = useServicePhase(project.serviceId)
  return (
    <li>
      <Hex className={styles.hx} label={String(serviceNumber(project.serviceId)).padStart(2, '0')} />
      <a href={`#${serviceAnchor(project.serviceId)}`}>{project.title}</a>
      <i data-s={isLit(phase) ? 'on' : phase === 'starting' ? 'wait' : 'off'} />
      <b>{project.headlineMetric}</b>
    </li>
  )
}

/**
 * The service index (spec 3.2): the four real project titles, each with its one headline metric, each a link
 * to its panel, then the résumé and contact links. Prerendered, so a recruiter has the work and the numbers before any JavaScript runs. Titles and metrics are
 * read from the data file, never retyped.
 */
export function ServiceIndex() {
  const t = copy.controlRoom.serviceIndex
  const resume = copy.contact.resume
  return (
    <>
      <p className="stencil">{t.label}</p>
      <h2 className={styles.indexHeading}>{t.heading}</h2>
      <ol className={styles.index}>
        {projects.map((project) => (
          <Row key={project.id} project={project} />
        ))}
      </ol>
      <p className={styles.links}>
        <a href={resume.htmlPath}>{t.links.resumeHtml}</a>
        <a href={resume.pdfPath}>{t.links.resumePdf}</a>
        <a href={`#${SECTION_IDS.contact}`}>{t.links.contact}</a>
      </p>
    </>
  )
}
