import '../styles/print.css'
import { Button, ButtonLink } from '../components/ui/Button.tsx'
import { Icon } from '../components/ui/Icon.tsx'
import { certificationLines, copy } from '../data/copy.ts'
import { experience, profile, projects, skillGroups } from '../data/portfolio.ts'
import styles from './Resume.module.css'

/** `https://linkedin.com/in/ruphakvarmaa` -> `linkedin.com/in/ruphakvarmaa`: how the address is printed. */
const bare = (url: string): string => url.replace(/^https?:\/\//, '')

/** One-word legends for the contact block (the other labels come from `copy`). */
const EMAIL = 'Email'

/**
 * A metric's figure. Big Shoulders draws "<" as a small flat chevron that runs into the numeral after it
 * (`<2s` reads like `=2s`), so a leading "<" is set in the text face. The characters are unchanged.
 */
function Figure({ value }: { value: string }) {
  if (!value.startsWith('<')) return value
  return (
    <>
      <span className={styles.lt}>{'<'}</span>
      {value.slice(1)}
    </>
  )
}

/**
 * `/resume/` (spec 3.7): the whole résumé as a prerendered, no-JavaScript HTML page that prints cleanly. On
 * screen it is a sheet of paper with the site's stencil headings; printed (print.css and the `@media print`
 * blocks in Resume.module.css) it is plain ink on white, A4, 12 pt, the site chrome gone and each link shown
 * as its address. Every fact is read from `src/data/portfolio.ts`; LeetCode and the certifications appear once,
 * under Certifications and practice. The phone number follows the owner's `publishPhone` switch (it is on the
 * PDF résumé too) and, as everywhere, is never written to profile.json or llms.txt.
 */
export function ResumePage() {
  const t = copy.resume
  const { proofLabel } = copy.deployHistory.ledger

  return (
    <main id="content" tabIndex={-1} className={`wrap ${styles.page}`} data-resume="">
      <div className={styles.bar} data-no-print="">
        <ButtonLink href="/" variant="ghost" size="sm" icon={<Icon name="arrow-right" size={16} style={{ transform: 'scaleX(-1)' }} />}>
          {copy.notFound.link}
        </ButtonLink>
        <div className={styles.actions}>
          <Button data-js-only="" onClick={() => window.print()}>
            {t.print}
          </Button>
          <ButtonLink href={copy.contact.resume.pdfPath} variant="primary" icon={<Icon name="pdf" size={18} />} download>
            {t.downloadPdf}
          </ButtonLink>
        </div>
      </div>

      <article className={styles.sheet} aria-labelledby="resume-title">
        <header className={styles.head}>
          <div>
            <p className="stencil">{t.title}</p>
            <h1 id="resume-title" className={styles.name}>
              {profile.name}
            </h1>
            <p className={styles.identity}>{copy.controlRoom.identity}</p>
          </div>
          <ul className={styles.contact}>
            <li>
              <span>{EMAIL}</span>{' '}
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </li>
            {profile.publishPhone ? (
              <li>
                <span>{copy.contact.phoneLabel}</span>{' '}
                <a href={`tel:${profile.phone.replaceAll(' ', '')}`}>{profile.phone}</a>
              </li>
            ) : null}
            <li>
              <span>{copy.contact.linkedin}</span>{' '}
              <a href={profile.linkedin} data-url="">
                {bare(profile.linkedin)}
              </a>
            </li>
            <li>
              <span>{copy.contact.github}</span>{' '}
              <a href={profile.github} data-url="">
                {bare(profile.github)}
              </a>
            </li>
            <li>
              <span>{t.website}</span>{' '}
              <a href={profile.website} data-url="">
                {bare(profile.website)}
              </a>
            </li>
          </ul>
        </header>

        <section aria-labelledby="resume-projects">
          <h2 id="resume-projects">{t.headings.projects}</h2>
          {projects.map((project) => (
            <article key={project.id} className={styles.entry}>
              <h3>{project.title}</h3>
              <p className={styles.stack}>{project.stack.join(' · ')}</p>
              <ul className={styles.metrics}>
                {project.metrics.map((metric) => (
                  <li key={metric.label}>
                    <b>
                      <Figure value={metric.value} />
                    </b>{' '}
                    {metric.label}
                  </li>
                ))}
              </ul>
              <ul className={styles.details}>
                {project.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section aria-labelledby="resume-experience">
          <h2 id="resume-experience">{t.headings.experience}</h2>
          {experience.map((entry) => (
            <article key={entry.role} className={styles.entry}>
              <div className={styles.line}>
                <h3>{entry.role}</h3>
                <p className={styles.when}>{entry.period}</p>
              </div>
              <p className={styles.org}>{entry.organization}</p>
              <p>{entry.description}</p>
              {entry.proof ? (
                <p className={styles.proof}>
                  <span className="stencil">{proofLabel}</span> {entry.proof}
                </p>
              ) : null}
            </article>
          ))}
        </section>

        <section aria-labelledby="resume-education">
          <h2 id="resume-education">{t.headings.education}</h2>
          <article className={styles.entry}>
            <div className={styles.line}>
              <h3>{profile.degree}</h3>
              <p className={styles.when}>{profile.educationPeriod}</p>
            </div>
            <div className={styles.line}>
              <p className={styles.org}>{profile.institution}</p>
              <p className={styles.when}>CGPA {profile.cgpa}</p>
            </div>
          </article>
        </section>

        <section aria-labelledby="resume-certifications">
          <h2 id="resume-certifications">{t.headings.certifications}</h2>
          <ul className={styles.plainList}>
            {certificationLines().map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="resume-skills">
          <h2 id="resume-skills">{t.headings.skills}</h2>
          <ul className={styles.plainList}>
            {skillGroups.map((group) => (
              <li key={group.label}>
                <b>{group.label}</b> — {group.items.join(', ')}.
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  )
}
