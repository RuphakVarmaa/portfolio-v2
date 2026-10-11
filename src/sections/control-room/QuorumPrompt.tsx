import { useState } from 'react'
import { quorum } from '../../cluster/quorum.ts'
import { useQuorum } from '../../cluster/store.ts'
import { ButtonLink } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { copy } from '../../data/copy.ts'
import { splitHint } from './board-state.ts'
import styles from './ControlRoom.module.css'

/**
 * The quorum prompt (spec 3.2, signature moment 1): the button that opens this page in a second tab, the
 * `or press 2` hint (the key is wired in the key sheet), and the reward line.
 *
 * The button is a link to this site that opens in a new tab, so it works before any JavaScript has run; once
 * hydrated it goes through `quorum.openSecondTab()`, which cuts the opener by hand and reports a blocked pop-up.
 *
 * The reward line is a live region (role="status"). It says nothing until something real happened: a peer
 * tab joined over BroadcastChannel (`nodes >= 2`, measured by the quorum), the pop-up was blocked, or this
 * browser cannot run a quorum at all. It is the only announcement of a peer joining (the cluster announces
 * leader changes, not arrivals), so it is not repeated through `announce()`. Its two lines are reserved in
 * CSS, so it never moves anything.
 */
export function QuorumPrompt() {
  const state = useQuorum()
  const [blocked, setBlocked] = useState(false)
  const t = copy.controlRoom.quorumPrompt
  const hint = splitHint(t.hint)
  const message = !state.supported ? t.unsupported : state.nodes >= 2 ? t.joined(state.nodes) : blocked ? t.blocked : ''

  return (
    <div className={styles.prompt}>
      <ButtonLink
        href="/"
        target="_blank"
        variant="primary"
        size="lg"
        iconAfter={<Icon name="external" />}
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          setBlocked(!quorum.openSecondTab())
        }}
      >
        {t.button}
      </ButtonLink>
      <span className={styles.hint} data-js-only="">
        {`${hint.text} `}
        <kbd className="keycap">{hint.key}</kbd>
      </span>
      <p className={styles.reward} role="status" aria-atomic="true" data-shown={message !== '' || undefined}>
        {message}
      </p>
    </div>
  )
}
