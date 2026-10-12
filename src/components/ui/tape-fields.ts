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

/**
 * The line as a phone's tape shows it. A tape under 560 px wide is one row per entry that pans sideways, and about 25
 * characters are in view: in the order the lines are printed the part that matters sat 80 characters to the right (every
 * audit row read `2026-10-11T23:19:38.707Z t` and was cut there, with the ALLOW or DENY off-screen; the operator log read
 * `00:00.2  tab-3b9a (this tab) st`). So for the two logs that have a fixed shape, the narrow tape prints the same fields
 * with the answer first and the time last or short. Nothing is added or dropped but the date and the arrow; the wide layout
 * keeps the line exactly as it is written, and so does a screen reader's reading of it in that layout.
 *
 *   audit     `2026-10-11T23:19:38.707Z tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417 → DENY policy=rls.tenant`
 *             `DENY policy=rls.tenant 23:19:38.7 tenant=B actor=u_3fa9(role=owner) action=write resource=project:A-417`
 *   operator  `00:18.3  retry 1 · batch 7 → policy-a · recovered in 15 ms`
 *             `retry 1 · batch 7 → policy-a · recovered in 15 ms · 00:18.3`
 *
 * Returns null for any other line (it needs no second form). Plain TypeScript, no DOM.
 */
const AUDIT_FULL = /^\d{4}-\d\d-\d\dT(\d\d:\d\d:\d\d)(?:\.(\d))?\d*Z (tenant=\S+ actor=\S+ action=\S+ resource=\S+) → (ALLOW|DENY) (policy=\S+)$/
const OPERATOR = /^(\d\d:\d\d\.\d) {2}(\S.*)$/

export function compactLine(text: string): string | null {
  const audit = AUDIT_FULL.exec(text)
  if (audit) {
    const [, time, tenth = '0', who, verdict, policy] = audit
    return `${verdict} ${policy} ${time}.${tenth} ${who}`
  }
  const operator = OPERATOR.exec(text)
  if (operator) return `${operator[2]} · ${operator[1]}`
  return null
}
