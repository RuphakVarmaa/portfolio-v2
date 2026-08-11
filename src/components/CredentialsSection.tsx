import { SealCheck } from '@phosphor-icons/react'
import { highlights, profile } from '../data/portfolio'
import { Reveal } from './Reveal'

export function CredentialsSection() {
  return (
    <section className="credentials-section" aria-labelledby="credentials-title">
      <Reveal className="education-panel">
        <div>
          <p className="education-status">Computer Science / Third Year</p>
          <h2 id="credentials-title">{profile.degree}</h2>
          <p>{profile.institution}</p>
        </div>
        <div className="education-facts">
          <div>
            <span>Study period</span>
            <strong>{profile.educationPeriod}</strong>
          </div>
          <div>
            <span>CGPA</span>
            <strong>{profile.cgpa}</strong>
          </div>
        </div>
      </Reveal>

      <div className="credentials-grid">
        {highlights.map((item) => (
          <Reveal className="credential-item" key={item.label}>
            <SealCheck aria-hidden="true" />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
