import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { Stamp } from '../../components/ui/Stamp.tsx'
import { certificationLines, copy, educationLine, releases } from '../../data/copy.ts'
import styles from './DeployHistory.module.css'

/**
 * `#deploy-history`: roles as releases (spec 3.5, 4.8). A cobalt cable runs down the page; every release hangs
 * a luggage tag (the release tag) from a hex jack on it. Role, organization, exact dates and proof are always
 * visible; the note and the stack diff are native <details>, so they work without JavaScript. Education and
 * every certification sit on the same ledger, each exactly once on the site. Nothing here moves.
 */
export function DeployHistory() {
  const t = copy.deployHistory
  const { ledger } = t
  const headings = copy.resume.headings
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.lead}>
      <PlainCaption>{t.plain}</PlainCaption>

      <ol className={styles.releases}>
        {releases().map((release, index) => (
          <li key={release.tag}>
            <span className={styles.tag}>{release.tag}</span>
            <h3>{release.role}</h3>
            <p className={styles.org}>{release.organization}</p>
            <p className={styles.when}>{release.period}</p>
            {release.proof ? (
              <p className={styles.proof}>
                <span className="stencil">{ledger.proofLabel}</span>{' '}
                <Stamp size="sm" tone="cobalt" rotate={index % 2 === 0 ? -3 : 2}>
                  {release.proof}
                </Stamp>
              </p>
            ) : null}
            <div className={styles.more} role="group" aria-label={release.role}>
              <details>
                <summary>{ledger.noteToggle}</summary>
                <p>{release.note}</p>
                {release.organization === 'Neural Inverse' && t.neuralInverseNote ? <p>{t.neuralInverseNote}</p> : null}
              </details>
              <details>
                <summary>{ledger.diffToggle}</summary>
                <p className={styles.diff}>{release.stackDiff}</p>
              </details>
            </div>
          </li>
        ))}
      </ol>

      <ul className={styles.ledger} aria-label={`${headings.education}, ${headings.certifications}`}>
        <li>
          <span>{ledger.educationTag}</span>
          {` ${educationLine()}`}
        </li>
        {certificationLines().map((line) => (
          <li key={line}>
            <span>{ledger.certificationTag}</span>
            {` ${line}`}
          </li>
        ))}
      </ul>
    </Section>
  )
}
