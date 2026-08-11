import { useRef, useState } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { projects, type Project } from '../data/portfolio'
import { usePreferences } from './preferences-context'
import { ProjectArtwork } from './ProjectArtwork'
import { ProjectDialog } from './ProjectDialog'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function ProjectReel() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Project | null>(null)
  const { motionMode } = usePreferences()

  useGSAP(
    () => {
      if (motionMode === 'lite' || !stageRef.current || !trackRef.current) return

      const media = gsap.matchMedia()
      media.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const stage = stageRef.current
        const track = trackRef.current
        if (!stage || !track) return

        const distance = () => Math.max(0, track.scrollWidth - stage.clientWidth)
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${Math.max(distance(), 1)}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })
      })

      return () => media.revert()
    },
    { scope: sectionRef, dependencies: [motionMode], revertOnUpdate: true },
  )

  return (
    <section className="project-reel" id="work" ref={sectionRef} aria-labelledby="work-title">
      <div className="section-heading project-heading">
        <h2 id="work-title">Four systems. Measured outcomes.</h2>
        <p>Each project is presented as engineering evidence: the constraint, the architecture, and the result.</p>
      </div>

      <div className="project-stage" ref={stageRef}>
        <div className="project-track" ref={trackRef}>
          {projects.map((project) => (
            <article className="project-panel" key={project.id}>
              <ProjectArtwork art={project.art} title={project.title} />
              <div className="project-copy">
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <div className="project-metrics" aria-label="Project outcomes">
                  {project.metrics.map((metric) => (
                    <div key={metric.label}>
                      <strong>{metric.value}</strong>
                      <span>{metric.label}</span>
                    </div>
                  ))}
                </div>
                <p className="project-stack">{project.stack.join(' / ')}</p>
                <button className="detail-button" type="button" onClick={() => setSelected(project)}>
                  Open details
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <ProjectDialog project={selected} onClose={() => setSelected(null)} />
    </section>
  )
}
