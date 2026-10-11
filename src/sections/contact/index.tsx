// PLACEHOLDER from F (foundation). Owned by S6 after F merges: replace everything below with the contact block.
// Owner override: the phone number IS rendered (profile.publishPhone), but never in profile.json, llms.txt or JSON-LD.
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'
import { profile } from '../../data/portfolio.ts'

export function Contact() {
  const t = copy.contact
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.line}>
      <ul>
        <li><a href={`mailto:${profile.email}`}>{profile.email}</a></li>
        {profile.publishPhone ? <li><a href={`tel:${profile.phone.replaceAll(' ', '')}`}>{profile.phone}</a></li> : null}
        <li><a href={profile.linkedin}>{t.linkedin}</a></li>
        <li><a href={profile.github}>{t.github}</a></li>
        <li>{t.resume.label}: <a href={t.resume.htmlPath}>{t.resume.html}</a> · <a href={t.resume.pdfPath}>{t.resume.pdf}</a></li>
      </ul>
    </Section>
  )
}
