import { ClusterStrip } from './components/shell/ClusterStrip.tsx'
import { Header } from './components/shell/Header.tsx'
import { KeySheet } from './components/shell/KeySheet.tsx'
import { LiveRegion } from './components/shell/LiveRegion.tsx'
import { PreferencesProvider } from './components/shell/Preferences.tsx'
import { SkipLink } from './components/shell/SkipLink.tsx'
import { PanelContext } from './components/ui/panel-context.ts'
import { SectionBoundary } from './components/ui/SectionBoundary.tsx'
import { ButtonLink } from './components/ui/Button.tsx'
import { Icon } from './components/ui/Icon.tsx'
import { copy, type Depth } from './data/copy.ts'
import { ExperimentsPage } from './pages/ExperimentsPage.tsx'
import { ResumePage } from './pages/ResumePage.tsx'
import type { RouteMatch } from './routes.ts'
import { ChaosLab } from './sections/chaos-lab/index.tsx'
import { Colophon } from './sections/colophon/index.tsx'
import { Contact } from './sections/contact/index.tsx'
import { ControlRoom } from './sections/control-room/index.tsx'
import { DeployHistory } from './sections/deploy-history/index.tsx'
import { Manifest } from './sections/manifest/index.tsx'
import { Services } from './sections/services/index.tsx'
import { SERVICE_COMPONENTS } from './sections/services/components.ts'

/** The standalone page for one service (/projects/<id>/): the panel's title is the page's h1. */
function ProjectPage({ id }: { id: keyof typeof SERVICE_COMPONENTS }) {
  const Service = SERVICE_COMPONENTS[id]
  return (
    <main id="content" tabIndex={-1} className="wrap" style={{ paddingBlock: 'var(--s-6) var(--s-8)' }}>
      <p style={{ marginBottom: 'var(--s-4)' }}>
        <ButtonLink href="/#services" variant="ghost" size="sm" icon={<Icon name="arrow-right" size={16} style={{ transform: 'scaleX(-1)' }} />}>
          {copy.services.panel.standaloneBack}
        </ButtonLink>
      </p>
      <PanelContext.Provider value={{ headingLevel: 1, standalone: true }}>
        <SectionBoundary id={`service-${id}`} name="This project">
          <Service />
        </SectionBoundary>
      </PanelContext.Provider>
    </main>
  )
}

function NotFound() {
  const t = copy.notFound
  return (
    <main id="content" tabIndex={-1} className="wrap" style={{ paddingBlock: 'var(--s-8)' }}>
      <h1 style={{ fontSize: 'var(--fs-h2)' }}>{t.title}</h1>
      <p className="lead measure" style={{ marginBlock: 'var(--s-4)' }}>
        {t.body}
      </p>
      <ButtonLink href="/" variant="primary">
        {t.link}
      </ButtonLink>
    </main>
  )
}

function RouteView({ route }: { route: RouteMatch }) {
  switch (route.kind) {
    case 'home':
      return (
        <main id="content" tabIndex={-1}>
          <SectionBoundary id="control-room" name="The control room">
            <ControlRoom />
          </SectionBoundary>
          <SectionBoundary id="services" name="The services">
            <Services />
          </SectionBoundary>
          <SectionBoundary id="chaos-lab" name="The chaos lab">
            <ChaosLab />
          </SectionBoundary>
          <SectionBoundary id="deploy-history" name="The deploy history">
            <DeployHistory />
          </SectionBoundary>
          <SectionBoundary id="manifest" name="The manifest">
            <Manifest />
          </SectionBoundary>
          <SectionBoundary id="contact" name="The contact section">
            <Contact />
          </SectionBoundary>
          <SectionBoundary id="colophon" name="The colophon">
            <Colophon />
          </SectionBoundary>
        </main>
      )
    case 'project':
      return <ProjectPage id={route.id} />
    case 'resume':
      return <ResumePage />
    case 'experiments':
      return <ExperimentsPage />
    case 'notfound':
      return <NotFound />
  }
}

/** The whole site for one route. Rendered on the server (prerender) and hydrated or rendered on the client. */
export function App({ route }: { route: RouteMatch }) {
  // A project page opens at the Engineer depth; everywhere else the 30-second depth (a stored choice always wins).
  const defaultDepth: Depth = route.kind === 'project' ? 'engineer' : '30s'
  return (
    <PreferencesProvider defaultDepth={defaultDepth}>
      <SkipLink />
      <LiveRegion />
      <Header route={route} />
      <RouteView route={route} />
      {route.kind === 'resume' ? null : <ClusterStrip />}
      <KeySheet />
    </PreferencesProvider>
  )
}
