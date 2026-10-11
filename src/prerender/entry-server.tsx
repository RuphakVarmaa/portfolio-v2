import { renderToString } from 'react-dom/server'
import { App } from '../App.tsx'
import { ROUTES, SITE_NAME, canonicalUrl, routeMeta, type RouteMatch } from '../routes.ts'

export { buildAgentFiles } from './agent-files.ts'
export type { BuildInfo } from './build-info.ts'
export { ROUTES } from '../routes.ts'

/** Everything the prerender script writes into <head> for a route. */
export interface HeadData {
  title: string
  description: string
  canonical: string
  ogType: 'website'
  ogTitle: string
  ogDescription: string
  ogUrl: string
  ogImage: string
  ogImageWidth: 1200
  ogImageHeight: 630
  twitterCard: 'summary_large_image'
  siteName: string
}

/** Server-render one route to an HTML string plus its head data. Pure: same input, same output. */
export function render(route: RouteMatch): { html: string; head: HeadData } {
  const meta = routeMeta(route) ?? ROUTES[0]
  const canonical = canonicalUrl(meta.path)
  return {
    html: renderToString(<App route={route} />),
    head: {
      title: meta.title,
      description: meta.description,
      canonical,
      ogType: 'website',
      ogTitle: meta.og.title,
      ogDescription: meta.og.description,
      ogUrl: canonical,
      ogImage: meta.og.image,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      twitterCard: 'summary_large_image',
      siteName: SITE_NAME,
    },
  }
}
