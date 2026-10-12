/**
 * The check that keeps the phone number out of the site's public data files.
 *
 * Owner decision: the number is on the page (Contact shows it), but it is never written to a machine-readable file:
 * not the retrieval corpus (scripts/build-corpus.ts), nor `profile.json`, `llms.txt`, the JSON-LD or `build-info.json`
 * (scripts/prerender.mjs and src/prerender/agent-files.ts). Those guards share this one rule.
 *
 * The rule looks for the number's digits, in order, wherever they are spaced or punctuated, in both of the ways it can
 * leak: with its country code (`+91 7708358305`, `917708358305`) and without it (`7708358305`, `077083 58305`,
 * `(770) 835-8305`). A guard that only knows the number as the data file spells it misses a template that prints the
 * national form, which is how a leak would happen.
 *
 * Pure and DOM-free, plain erasable TypeScript with no imports, so a `.mjs` build script can import it too.
 */

/** Fewer digits than this is not a number worth searching for (it would match a year). */
const MIN_DIGITS = 7
/** The national number is the last ten digits: what is dialled without the country code (`+91`, `+1`, `+44`). */
const NATIONAL_DIGITS = 10
/** How many spaces or punctuation marks may sit between two neighbouring digits of the number. */
const GAP = 4

/**
 * The digit strings a leak of `phone` would contain: all of its digits (`+91 7708358305` gives `917708358305`), and
 * the national number (`7708358305`) when the country code is there.
 */
export function phoneDigitForms(phone: string): string[] {
  const all = phone.replace(/\D/g, '')
  const national = all.length > NATIONAL_DIGITS ? all.slice(-NATIONAL_DIGITS) : all
  return [...new Set([all, national])].filter((form) => form.length >= MIN_DIGITS)
}

/**
 * True when `text` holds the number: its digits in order, with up to four spaces or punctuation marks between
 * neighbours (so `77083 58305`, `770-835-8305` and `+91 (770) 835 8305` are all found). A letter or a digit in
 * between is never skipped, so two different numbers of a data file that happen to sit side by side cannot be read
 * as one.
 */
export function leaksPhone(text: string, phone: string): boolean {
  return phoneDigitForms(phone).some((digits) => new RegExp([...digits].join(`[^\\p{L}\\p{N}]{0,${GAP}}`), 'u').test(text))
}
