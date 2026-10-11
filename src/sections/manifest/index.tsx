// PLACEHOLDER from F (foundation). Owned by S6 after F merges: replace everything below with the manifest viewer.
import { Section } from '../../components/ui/Section.tsx'
import { copy, skillLines } from '../../data/copy.ts'

export function Manifest() {
  const t = copy.manifest
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.note}>
      {skillLines().map((line) => (
        <p key={line}>{line}</p>
      ))}
    </Section>
  )
}
