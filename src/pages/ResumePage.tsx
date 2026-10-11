// PLACEHOLDER from F (foundation). Owned by S6 after F merges: replace everything below with the print-ready résumé.
import { certificationLines, copy, educationLine, skillLines } from '../data/copy.ts'
import { experience, profile, projects } from '../data/portfolio.ts'

export function ResumePage() {
  const t = copy.resume
  return (
    <main id="content" tabIndex={-1} className="wrap" style={{ paddingBlock: 'var(--s-8)' }}>
      <h1>{profile.name}</h1>
      <p>{copy.controlRoom.identity}</p>
      <p>
        <a href={`mailto:${profile.email}`}>{profile.email}</a> · <a href={profile.linkedin}>LinkedIn</a> · <a href={profile.github}>GitHub</a> · {profile.website}
      </p>
      <h2>{t.headings.projects}</h2>
      {projects.map((p) => (
        <section key={p.id}>
          <h3>{p.title}</h3>
          <p>{p.stack.join(', ')} · {p.metrics.map((m) => `${m.value} ${m.label}`).join(' · ')}</p>
          {p.details.map((d) => <p key={d}>{d}</p>)}
        </section>
      ))}
      <h2>{t.headings.experience}</h2>
      {experience.map((e) => (
        <p key={e.role}>{e.role}, {e.organization}, {e.period}. {e.description} {e.proof}</p>
      ))}
      <h2>{t.headings.education}</h2>
      <p>{educationLine()}</p>
      <h2>{t.headings.certifications}</h2>
      {certificationLines().map((line) => <p key={line}>{line}</p>)}
      <h2>{t.headings.skills}</h2>
      {skillLines().map((line) => <p key={line}>{line}</p>)}
    </main>
  )
}
