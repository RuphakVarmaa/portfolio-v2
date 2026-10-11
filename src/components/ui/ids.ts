import { useId } from 'react'

/** `useId()` made safe for SVG `url(#id)` references and CSS selectors (React's ids contain `:`, `«»` or `_`). */
export function useSvgId(prefix = 'q'): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '')
}
