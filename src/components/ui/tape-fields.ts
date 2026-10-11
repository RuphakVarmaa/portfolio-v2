/**
 * Where a line on the policy panel may break. The shared Tape wraps a line anywhere, so a narrow column cut
 * `actor=u_3fa9(role=member)` in the middle, split `policy-b` after its hyphen, and one audit entry read as seven.
 * Here a line is cut into fields and the browser breaks between fields only (see TapeText.tsx):
 *
 *   audit   `2026-10-11T12:00:00.000Z tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417 → DENY policy=rls.tenant`
 *           one field per key=value pair; the verdict and the policy stay together after the arrow
 *   events  `batch 7 · policy-a · 1,000 evaluated · 505 across tenants · 0 leaks · 1.1 ms`
 *           one field per `·` part, each carrying its own trailing `·`
 *   prose   one field (the whole sentence)
 *
 * Joined with a space, the fields are the original text again: nothing is added or dropped, so what is copied from
 * the tape is exactly what the production system would have written.
 *
 * Plain TypeScript with no DOM or React, so the unit tests import it.
 */

/** The engine's audit line (`auditLine` in lib/policy/engine.ts) starts with an ISO time and `tenant=`. */
const AUDIT = /^\d{4}-\d\d-\d\dT\S+ tenant=/

export function tapeFields(text: string): string[] {
  if (AUDIT.test(text)) {
    const arrow = text.indexOf(' → ')
    if (arrow < 0) return text.split(' ')
    return [...text.slice(0, arrow).split(' '), text.slice(arrow + 1)]
  }
  const parts = text.split(' · ')
  return parts.map((part, index) => (index < parts.length - 1 ? `${part} ·` : part))
}

/**
 * A word the browser would break in the middle: a hyphen or a slash between two letters (`policy-a`, `evals/s`,
 * `cross-tenant`). A hyphen before a digit (`A-417`, the date) is not a break opportunity to begin with.
 */
const SOFT_WORD = /(\S*[A-Za-z][-/][A-Za-z]\S*)/

/** `text` as [plain, unbroken, plain, unbroken, ...]: the odd entries are the words that must stay in one piece. */
export function splitUnbroken(text: string): string[] {
  return text.split(SOFT_WORD)
}
