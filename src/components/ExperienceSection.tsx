import { experience } from '../data/portfolio'
import { Reveal } from './Reveal'

export function ExperienceSection() {
  return (
    <section className="experience-section" id="experience" aria-labelledby="experience-title">
      <div className="section-heading experience-heading">
        <h2 id="experience-title">Leadership built in the field.</h2>
        <p>Cloud education, applied machine learning, and product engineering across campus and startup environments.</p>
      </div>

      <div className="experience-list">
        {experience.map((item) => (
          <Reveal className="experience-item" key={`${item.organization}-${item.role}`}>
            <div className="experience-period">{item.period}</div>
            <div className="experience-role">
              <h3>{item.role}</h3>
              <p>{item.organization}</p>
            </div>
            <div className="experience-detail">
              <p>{item.description}</p>
              {item.proof && <strong>{item.proof}</strong>}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
