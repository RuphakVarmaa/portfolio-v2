import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'
import { profile } from '../../data/portfolio.ts'
import styles from './Contact.module.css'
import { External } from './External.tsx'
import { useCopy } from './use-copy.ts'
import { useHydrated } from './use-hydrated.ts'

/** `https://linkedin.com/in/ruphakvarmaa` -> `linkedin.com/in/ruphakvarmaa`: the address as people say it. */
const bare = (url: string): string => url.replace(/^https?:\/\//, '')

/**
 * `#contact`: email first, then a patch panel of the other lines (spec 3.7). Owner override: the phone number
 * is shown here, next to email, LinkedIn and GitHub, whenever `profile.publishPhone` is true. It is rendered
 * on the page only: never in profile.json, llms.txt or the JSON-LD (agent-files.ts and the prerender check).
 * Copying the email lights the lamp beside the button and says so through the site's live region. The copy
 * button needs JavaScript, so it is rendered after hydration (its space is reserved in CSS).
 */
export function Contact() {
  const t = copy.contact
  const { copied, copy: copyText } = useCopy(t.emailCopied)
  const done = copied === 'email'
  const ready = useHydrated()

  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.line}>
      <div className={styles.layout}>
        <div className={styles.mail}>
          <a className={styles.address} href={`mailto:${profile.email}`}>
            {profile.email}
          </a>
          <div className={styles.copyRow} data-js-only="">
            {ready ? (
              <>
                <span className={styles.jack} data-lit={done || undefined} aria-hidden="true" />
                <Button variant="primary" icon={<Icon name={done ? 'check' : 'copy'} />} onClick={() => void copyText(profile.email, 'email')}>
                  {done ? t.emailCopied : t.copyEmail}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.rack}>
          <ul className={styles.lines}>
            {profile.publishPhone ? (
              <li>
                <span>{t.phoneLabel}</span>{' '}
                <a href={`tel:${profile.phone.replaceAll(' ', '')}`}>{profile.phone}</a>
              </li>
            ) : null}
            <li>
              <span>{t.linkedin}</span>{' '}
              <External href={profile.linkedin}>{bare(profile.linkedin)}</External>
            </li>
            <li>
              <span>{t.github}</span>{' '}
              <External href={profile.github}>{bare(profile.github)}</External>
            </li>
            <li>
              <span>{t.resume.label}</span>{' '}
              <span className={styles.pair}>
                <a href={t.resume.htmlPath}>{t.resume.html}</a>{' '}
                <a href={t.resume.pdfPath}>{t.resume.pdf}</a>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </Section>
  )
}
