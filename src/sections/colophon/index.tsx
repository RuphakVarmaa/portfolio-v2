// PLACEHOLDER from F (foundation). Owned by S6 after F merges: replace everything below with the colophon + build trace.
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'

export function Colophon() {
  const t = copy.colophon
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.version}>
      <p>{t.authorship}</p>
      <p>{t.credits(t.sourceUrl)}</p>
    </Section>
  )
}
