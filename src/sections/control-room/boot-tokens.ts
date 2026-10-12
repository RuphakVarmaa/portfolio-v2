import { BOOT_LINE_CLOSING } from '../../cluster/boot-line.ts'

/**
 * The boot line as the pieces it may break between (review round 2, craft: "the signature moment breaks
 * anywhere"). `buildBootLine` (src/cluster/boot-line.ts) returns one string, `A ms · B up 530 ms · ...`, and a
 * browser wraps a string wherever a space falls: at 1440 px the closing clause was cut after "harmed;", and on a
 * phone three rows started with a lone "·" because the space before the dot was a place to break.
 *
 * A token is one measurement with its separator glued to its right: `retrieval up 530 ms ·`, the dot joined to
 * "ms" by a no-break space. Each token is drawn as one unbreakable unit (nowrap in the stylesheet), and the
 * only places a row can end are the spaces between tokens, so a row can never begin with the dot and a figure
 * is never parted from its unit or its name. The closing clause is the one token with two pieces: it stays on
 * one row wherever the row is wide enough, and below 640 px it may break after the semicolon, which is where
 * a person would break it.
 *
 * Pure and DOM-free: `node --test` imports it, and the server and the client split the same string the same way.
 */

/** A no-break space (U+00A0), written as an escape so the source file holds no invisible character. */
export const NBSP = '\u00A0'
export const SEPARATOR = '·'

/** One unbreakable unit of the line: one piece, or (the closing clause) two pieces a narrow row may part between. */
export type BootToken = readonly string[]

/**
 * Split a boot line (as built by `buildBootLine`, or the prerendered placeholder) into tokens, in order. Every
 * token but the last ends with a no-break space and the separator; the closing clause is split at its semicolon.
 */
export function bootTokens(line: string): BootToken[] {
  const parts = line.split(` ${SEPARATOR} `)
  return parts.map((part, index): BootToken => {
    const last = index === parts.length - 1
    if (last && part === BOOT_LINE_CLOSING) {
      const cut = part.indexOf('; ')
      return cut < 0 ? [part] : [part.slice(0, cut + 1), part.slice(cut + 2)]
    }
    return [last ? part : `${part}${NBSP}${SEPARATOR}`]
  })
}

/** The line a screen shows, back as text (the tokens joined by plain spaces, the glued separators as ordinary spaces). */
export function bootText(tokens: readonly BootToken[]): string {
  return tokens
    .map((token) => token.join(' '))
    .join(' ')
    .replaceAll(`${NBSP}${SEPARATOR}`, ` ${SEPARATOR}`)
}
