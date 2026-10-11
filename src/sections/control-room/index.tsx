import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { usePreferences } from '../../components/shell/preferences-context.ts'
import { copy } from '../../data/copy.ts'
import { Board } from './Board.tsx'
import { Hex, Sprite } from './BoardSvg.tsx'
import { BootLine } from './BootLine.tsx'
import { OffList } from './OffList.tsx'
import { QuorumPrompt } from './QuorumPrompt.tsx'
import { ServiceIndex } from './ServiceIndex.tsx'
import { useHashNavigation } from './useHashNavigation.ts'
import styles from './ControlRoom.module.css'

/**
 * 1 Control Room: the hero and the board (spec 3.2, 4.1). Everything a recruiter needs is prerendered and
 * readable before any JavaScript: the name, the identity line, the four real project titles with a
 * headline metric each, the résumé and contact links, the one-line boot text. After hydration the same
 * page comes alive: the readout counts tabs, the index lamps and the boot line report the visitor's own
 * workers as they come up, and the board lights its lamps as each one says it is ready.
 *
 * The first screen is two columns from 1024 px: the letterhead, headline, lead and the quorum prompt on
 * the left, the service index (with the résumé and contact links, the authorship line that qualifies its
 * numbers, and the plain-language caption) on the right. On a phone the index comes straight after the
 * prompt, so the four projects and their numbers are on the first screen. The boot line is a ruled tape
 * above the board.
 *
 * Under "Skip the machine" (or the Basic tier) the board is replaced by a plain list of the services.
 *
 * The control room is also where the home page's hash navigation is mounted (useHashNavigation): links to
 * the page's own sections, and a visit to `/#contact`, land on their target even though the page grows
 * after it was prerendered.
 */
export function ControlRoom() {
  const t = copy.controlRoom
  const { machineOff } = usePreferences()
  useHashNavigation()
  return (
    <section id={t.id} aria-labelledby="hero-title" className={styles.hero}>
      <Sprite />
      <div className="wrap">
        <div className={styles.layout}>
          <p className={styles.eyebrow}>
            <Hex className={styles.hx} label={t.label} />
            <span className="stencil">{t.eyebrow}</span>
          </p>
          <p className={styles.identity}>{t.identity}</p>
          <h1 id="hero-title" className={styles.title}>
            {t.h1}
          </h1>
          <p className={`lead ${styles.lead}`}>{t.lead}</p>
          <QuorumPrompt />
          <div className={styles.side}>
            <ServiceIndex />
            <p className={styles.authorship}>{t.authorship}</p>
            <PlainCaption className={styles.plain}>{t.plain}</PlainCaption>
          </div>
        </div>
        <BootLine />
        {machineOff ? null : <Board />}
        <OffList />
      </div>
    </section>
  )
}
