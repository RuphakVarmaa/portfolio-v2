import { useState } from 'react'
import { quorum } from '../../cluster/quorum.ts'
import { useQuorum } from '../../cluster/store.ts'
import { ButtonLink } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { copy } from '../../data/copy.ts'
import { splitHint } from './board-state.ts'
import { NO_NOTICE, advanceNotice, noticeLines, type NoticeText } from './quorum-notice.ts'
import styles from './ControlRoom.module.css'

/** The words of the notice: the hero's own lines, and the Chaos Lab's reward for a lost leader (spec 3.4), so there is one sentence for it. */
const NOTICE_TEXT: NoticeText = {
  joined: copy.controlRoom.quorumPrompt.joined,
  joinedNew: copy.controlRoom.quorumPrompt.joinedNew,
  failover: copy.chaos.experiments.leader.reward,
  self: copy.controlRoom.quorumPrompt.self,
  unsupported: copy.controlRoom.quorumPrompt.unsupported,
  blocked: copy.controlRoom.quorumPrompt.blocked,
}

/**
 * The quorum prompt (spec 3.2, signature moment 1): the button that opens this page in a second tab, the
 * `or press 2` hint (the key is wired in the key sheet), and the notice under them.
 *
 * The button is a link to this site that opens in a new tab, so it works before any JavaScript has run; once
 * hydrated it goes through `quorum.openSecondTab()`, which cuts the opener by hand and reports a blocked pop-up.
 *
 * The notice says nothing until something real happened, and then it says the payoff of what the hero promised
 * ("open a second tab ... close the leader and the other one takes over"), in the tab where the visitor is looking:
 *   - a peer tab joined over BroadcastChannel (`nodes >= 2`, measured by the quorum): the join line, a live region
 *     (role="status"), worded for the tab that reads it ("that tab just joined this one" in the tab that was open,
 *     "this tab just joined another one" in the tab that has just opened). The cluster announces leader changes, not
 *     arrivals, and the Chaos Lab no longer announces either, so this is the only announcement of an arrival;
 *   - the leader was lost and a different tab holds the lock now (quorum-notice.ts): the failover line. It is shown,
 *     not announced: the shared announcer already says, once, who leads now, and a second status region saying
 *     it again is what the round-2 accessibility review found hard to hear;
 *   - the pop-up was blocked, or this browser cannot run a quorum at all.
 * Nothing is reserved for the notice in CSS (`.rewards` in ControlRoom.module.css): the blank band it used to leave
 * under the button was 70 px of the first screen, what kept the switchboard below the fold. It only ever appears
 * after the visitor has opened another tab (or closed one), when the page is not being read.
 */
export function QuorumPrompt() {
  const state = useQuorum()
  const [blocked, setBlocked] = useState(false)
  // What this tab has seen of the quorum, for the failover rule (a leader that was another tab went away and a new
  // one holds a higher term). "Storing information from previous renders": updated while rendering, from a pure
  // function that hands back the same object when nothing changed, so a repeated or discarded render does nothing.
  // It starts from the quorum as it is on the first render (the server's snapshot while hydrating), so mounting is not an update.
  const [memory, setMemory] = useState(() => advanceNotice(NO_NOTICE, state))
  const remembered = advanceNotice(memory, state)
  if (remembered !== memory) setMemory(remembered)

  const t = copy.controlRoom.quorumPrompt
  const hint = splitHint(t.hint)
  const lines = noticeLines(remembered, state, blocked, NOTICE_TEXT)

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
      <div className={styles.rewards}>
        <p className={styles.reward} role="status" aria-atomic="true" data-shown={lines.live !== '' || undefined}>
          {lines.live}
        </p>
        {lines.still === '' ? null : (
          <p key={remembered.seq} className={styles.reward} data-shown="" data-failover="">
            {lines.still}
          </p>
        )}
      </div>
    </div>
  )
}
