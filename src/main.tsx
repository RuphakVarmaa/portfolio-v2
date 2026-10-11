import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import '@fontsource-variable/big-shoulders/wght.css'
import '@fontsource-variable/big-shoulders-stencil/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/martian-mono/wght.css'
// `full.css` (not `wght.css`): the only Doto file with the ROND axis the round-dot readouts need (+0.7 KB).
import '@fontsource-variable/doto/full.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/utilities.css'
import { App } from './App.tsx'
import { bootCluster } from './cluster/boot.ts'
import { detectTier } from './cluster/tier.ts'
import { copy } from './data/copy.ts'
import { SITE_NAME, matchRoute, routeKey } from './routes.ts'

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

// Tier first, before any lazy chunk: it decides which workers boot and whether the machine is forced off.
detectTier()

const route = matchRoute(window.location.pathname)
if (route.kind === 'notfound') document.title = `${copy.notFound.title} — ${SITE_NAME}`
const tree = (
  <StrictMode>
    <App route={route} />
  </StrictMode>
)

// Hydrate only when the prerendered HTML is for exactly this route. 404.html carries the home page's
// HTML, so an unknown path renders from scratch instead of hydrating the wrong tree.
if (container.dataset.prerendered === '1' && container.dataset.route === routeKey(route)) {
  hydrateRoot(container, tree)
} else {
  container.textContent = ''
  createRoot(container).render(tree)
}

bootCluster({ route })
