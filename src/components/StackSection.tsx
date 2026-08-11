import {
  BracketsCurly,
  Brain,
  Cloud,
  Code,
  Database,
  type Icon,
} from '@phosphor-icons/react'
import { skillGroups } from '../data/portfolio'
import { Reveal } from './Reveal'

const icons: Icon[] = [Code, BracketsCurly, Cloud, Brain, Database]

export function StackSection() {
  return (
    <section className="stack-section" id="stack" aria-labelledby="stack-title">
      <div className="section-heading stack-heading">
        <p className="section-eyebrow">ENGINEERING RANGE</p>
        <h2 id="stack-title">From language runtime to cloud edge.</h2>
        <p>A stack shaped around reliable services, observable systems, applied intelligence, and the data beneath them.</p>
      </div>

      <Reveal className="stack-grid">
        {skillGroups.map((group, index) => {
          const SkillIcon = icons[index]
          return (
            <article className={`stack-cell stack-cell-${index + 1}`} key={group.label}>
              <div className="stack-cell-title">
                {SkillIcon && <SkillIcon aria-hidden="true" />}
                <h3>{group.label}</h3>
              </div>
              <ul className="skill-cloud">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          )
        })}
      </Reveal>
    </section>
  )
}
