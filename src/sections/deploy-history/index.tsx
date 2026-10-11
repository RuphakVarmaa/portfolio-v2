// PLACEHOLDER from F (foundation). Owned by S6 after F merges: replace everything below with the release ledger.
import { Section } from '../../components/ui/Section.tsx'
import { certificationLines, copy, educationLine, releases } from '../../data/copy.ts'

export function DeployHistory() {
  const t = copy.deployHistory
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.lead}>
      <ol>
        {releases().map((r) => (
          <li key={r.tag}>
            <strong>{r.tag}</strong> {r.role} — {r.organization} — {r.period}. {r.note}
            {r.proof ? ` ${t.ledger.proofLabel}: ${r.proof}` : ''} {r.stackDiff}
          </li>
        ))}
      </ol>
      <p>{t.ledger.educationTag}: {educationLine()}</p>
      {certificationLines().map((line) => (
        <p key={line}>{t.ledger.certificationTag}: {line}</p>
      ))}
    </Section>
  )
}
