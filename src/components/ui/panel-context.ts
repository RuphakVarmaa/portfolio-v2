import { createContext, useContext, type ReactNode } from 'react'

/**
 * What a ServicePanel needs to know about where it sits. The Services section provides the default
 * (an h3 inside the section's h2); a /projects/* route provides `{ headingLevel: 1, standalone: true }`
 * so the panel's title becomes the page's single h1 without the service component knowing.
 */
export interface PanelContextValue {
  headingLevel: 1 | 2 | 3
  /** True on a dedicated /projects/* page. */
  standalone: boolean
}

export const DEFAULT_PANEL_CONTEXT: PanelContextValue = { headingLevel: 3, standalone: false }

export const PanelContext = createContext<PanelContextValue>(DEFAULT_PANEL_CONTEXT)

export function usePanelContext(): PanelContextValue {
  return useContext(PanelContext)
}

/** What a ServicePanel offers to a DemoSlot inside it: the static content to show until/unless the demo runs. */
export const DemoFallbackContext = createContext<ReactNode>(null)

export function useDemoFallback(): ReactNode {
  return useContext(DemoFallbackContext)
}
