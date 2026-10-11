import { Fragment, memo } from 'react'
import { splitUnbroken, tapeFields } from './tape-fields.ts'
import styles from './ui.module.css'

/**
 * Text with its line breaks chosen (the rules are in tape-fields.ts): a word with a hyphen or a slash between
 * letters (`policy-b`, `evals/s`) is never split. Used for the sentences next to a tape that name a node.
 */
export function SoftText({ text }: { text: string }) {
  return splitUnbroken(text).map((piece, index) =>
    index % 2 === 1 ? (
      <span key={index} className={styles.tapeNb}>
        {piece}
      </span>
    ) : (
      piece
    ),
  )
}

/**
 * A log line or a result sentence. Each field (an audit key=value pair, a `·` part) is an inline block, so a
 * line wraps between fields and a field is cut only when it is wider than the whole line. The fields are joined
 * with the same single space they were split on: the text, as selected and copied, is unchanged. The Tape draws
 * every string line this way; the sentences around it (a result line, a recovery line) use it directly.
 */
export const TapeText = memo(function TapeText({ text }: { text: string }) {
  const fields = tapeFields(text)
  if (fields.length === 1) return <SoftText text={text} />
  return fields.map((field, index) => (
    <Fragment key={index}>
      {index > 0 ? ' ' : null}
      <span className={styles.tapeField}>
        <SoftText text={field} />
      </span>
    </Fragment>
  ))
})
