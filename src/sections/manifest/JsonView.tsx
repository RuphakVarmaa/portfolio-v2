import { tokenizeJson, type JsonTokenKind } from './json-tokens.ts'
import { PROFILE_PATH } from './urls.ts'
import styles from './Manifest.module.css'

const CLASS: Partial<Record<JsonTokenKind, string>> = {
  key: styles.k,
  number: styles.n,
  literal: styles.n,
  punct: styles.p,
}

/**
 * "View as agent": the text of `/profile.json` exactly as the server sent it, one numbered line per line of
 * the file, with keys, punctuation and values set apart (weight and a tint behind the keys: text stays ink or
 * muted ink, so contrast never depends on a colour). Lazy chunk: it loads when the visitor flips the switch.
 * A focusable region, so the keyboard can scroll it.
 */
export default function JsonView({ text }: { text: string }) {
  const lines = tokenizeJson(text)
  return (
    <div className={styles.json} role="region" aria-label={PROFILE_PATH} tabIndex={0}>
      <pre>
        <code>
          {lines.map((tokens, index) => (
            <span key={index} className={styles.line}>
              {tokens.map((token, at) => {
                const className = CLASS[token.kind]
                return className ? (
                  <span key={at} className={className}>
                    {token.text}
                  </span>
                ) : (
                  token.text
                )
              })}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
