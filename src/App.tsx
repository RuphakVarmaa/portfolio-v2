import { lazy, Suspense } from 'react'
import { CredentialsSection } from './components/CredentialsSection'
import { ExperienceSection } from './components/ExperienceSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { IntroCurtain } from './components/IntroCurtain'
import { PreferencesProvider } from './components/Preferences'
import { ProofRail } from './components/ProofRail'
import { StackSection } from './components/StackSection'

const ProjectReel = lazy(() =>
  import('./components/ProjectReel').then((module) => ({ default: module.ProjectReel })),
)

function ProjectLoadingState() {
  return (
    <section className="project-loading" aria-live="polite" aria-label="Loading project stories">
      <div className="project-loading-copy">
        <span />
        <span />
      </div>
      <div className="project-loading-visual" />
    </section>
  )
}

export default function App() {
  return (
    <PreferencesProvider>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <IntroCurtain />
      <div className="site-shell">
        <Header />
        <main id="content">
          <Hero />
          <ProofRail />
          <Suspense fallback={<ProjectLoadingState />}>
            <ProjectReel />
          </Suspense>
          <ExperienceSection />
          <StackSection />
          <CredentialsSection />
        </main>
        <Footer />
      </div>
    </PreferencesProvider>
  )
}
