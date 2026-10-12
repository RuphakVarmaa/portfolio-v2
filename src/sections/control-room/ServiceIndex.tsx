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
 * The résumé and contact links (spec 3.2): the résumé as a page, the résumé as a PDF, and the contact section.
 *
 * They are drawn twice, and CSS shows one. On a phone or a tablet they come first, straight under the prompt, because under
 * the list they were covered by the status strip at the bottom of a 390 x 844 screen (review round 2, recruiter); from 1024
 * px they are under the list, as the spec has it. Each copy stands in the markup where it appears on screen, so the order
 * the Tab key walks is the order the eye reads at every width (spec 4.0: "Tab order = reading order"); the hidden copy is
 * `display: none`, so it is neither focusable nor read. The paths and the id come from the shared constants, once.
 */
function Links({ first }: { first?: boolean }) {
  const t = copy.controlRoom.serviceIndex
  const resume = copy.contact.resume
  return (
    <p className={styles.links} data-first={first ? '' : undefined}>
      <a href={resume.htmlPath}>{t.links.resumeHtml}</a>
      <a href={resume.pdfPath}>{t.links.resumePdf}</a>
      <a href={`#${SECTION_IDS.contact}`}>{t.links.contact}</a>
    </p>
  )
}

/**
 * The service index (spec 3.2): the four real project titles, each with its one headline metric, each a link
 * to its panel, then the résumé and contact links. Prerendered, so a recruiter has the work and the numbers before
 * any JavaScript runs. Titles and metrics are read from the data file, never retyped.
 *
 * It returns the index box (its label, its caption and the list) with the links on both sides of it, one copy each (see
 * `Links`): the hero places them apart, the links before the list on a phone and after it from 1024 px.
 */
export function ServiceIndex() {
  const t = copy.controlRoom.serviceIndex
  return (
    <>
      <Links first />
      <div className={styles.indexBox}>
        <p className="stencil">{t.label}</p>
        <h2 className={styles.indexHeading}>{t.heading}</h2>
        <ol className={styles.index}>
          {projects.map((project) => (
            <Row key={project.id} project={project} />
          ))}
        </ol>
      </div>
      <Links />
    </>
  )
}
