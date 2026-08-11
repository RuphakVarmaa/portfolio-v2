import { lazy, Suspense } from 'react'
import { ArrowDownRight, FilePdf } from '@phosphor-icons/react'
import { usePreferences } from './preferences-context'

const HeroScene = lazy(() => import('./HeroScene'))

export function Hero() {
  const { motionMode } = usePreferences()

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="hero-eyebrow">RUPHAK VARMAA S / BACKEND AND AI SYSTEMS</p>
        <h1 id="hero-title">
          Systems that think.
          <span className="hero-desktop-line">Infrastructure that holds.</span>
          <span className="hero-mobile-line">Built to hold.</span>
        </h1>
        <p className="hero-lede">
          I build resilient backends, distributed AI systems, and cloud infrastructure where measurable performance matters.
        </p>
        <div className="hero-actions">
          <a className="primary-cta" href="#work">
            View work
            <ArrowDownRight aria-hidden="true" />
          </a>
          <a
            className="secondary-cta"
            href="/Ruphak-Varmaa-Resume.pdf"
            download="Ruphak-Varmaa-Resume.pdf"
          >
            <FilePdf aria-hidden="true" />
            Download resume
          </a>
        </div>
      </div>

      <div className="hero-visual">
        {motionMode === 'full' ? (
          <Suspense fallback={<div className="scene-fallback" aria-hidden="true" />}>
            <HeroScene />
          </Suspense>
        ) : (
          <div className="scene-fallback" aria-hidden="true" />
        )}
        <p className="sr-only">
          An interactive abstract model of a distributed intelligence network, rendered as a metallic core connected to orbiting nodes.
        </p>
      </div>
    </section>
  )
}
