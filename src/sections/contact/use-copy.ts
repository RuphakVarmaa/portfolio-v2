import { useCallback, useEffect, useRef, useState } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { copyText } from './clipboard.ts'

/** How long a button keeps saying "copied". */
export const COPIED_MS = 2000

/** Shown and announced when the browser refuses to copy (a short UI message, not site copy). */
export const COPY_FAILED = 'Copy failed. The text is selectable; copy it by hand.'

/**
 * Copy-to-clipboard with feedback. `copy(text, key)` copies and, on success, sets `copied` to `key` for two
 * seconds (so several buttons can share one hook and each ask `copied === myKey`); the site's single live
 * region announces `announcement`, or the failure message. `copy` resolves true on success.
 */
export function useCopy(announcement: string) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string, key = 'default') => {
      const ok = await copyText(text)
      announce(ok ? announcement : COPY_FAILED)
      if (!ok) return false
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPIED_MS)
      return true
    },
    [announcement],
  )

  return { copied, copy }
}
