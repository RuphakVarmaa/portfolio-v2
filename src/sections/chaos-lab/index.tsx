import { useState, useSyncExternalStore } from 'react'
import { usePreferences } from '../../components/shell/preferences-context.ts'
import { Button } from '../../components/ui/Button.tsx'
import { DemoSlot } from '../../components/ui/DemoSlot.tsx'
import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'
import { heldKey, rememberFocus, rememberPress, type LabKey } from './handoff.ts'
import { NumberBezel } from './NumberBezel.tsx'
import { Rivets } from './Rivets.tsx'
import { titles } from './titles.ts'
import { useLabObservers } from './use-observers.ts'
import { START_NOW, useWake } from './use-wake.ts'
import styles from './ChaosLab.module.css'

/**
 * #chaos-lab: three experiments on the real cluster (spec 3.4 and 4.7). Buttons only; nothing runs until
 * the visitor presses one.
 *
 * This file is in the initial bundle and is deliberately tiny. It renders the prerendered frame (the three
 * experiments with their titles and plain captions, which is also what "Skip the machine" shows, as a plain
 * list) and, once the page is up, loads the OBSERVERS (observers.ts): the store that watches the cluster for
 * the failovers a visitor causes, so an experiment can be completed in a tab whose lab was never scrolled to
 * (the tab that survives a closed leader). The interactive breaker panel (ChaosLabLive) loads when the
 * section is near the viewport, and never when the machine is off.
 *
 * The viewport alone is not enough for the keyboard. Tab goes to the next focusable element, and a lab that
 * has not loaded has none, so focus used to walk past it and the lab appeared behind the focus point. Three
 * things close that gap:
 *  - the first Tab key press anywhere starts the load (use-wake.ts), long before focus can get here
 *  - the frame carries stand-ins for the two buttons from the moment the page is interactive, so the lab is
 *    in the tab order even if its chunk is still on the way; focusing or pressing one starts the load too
 *  - when the live bench replaces the stand-ins, focus and any early press move to its buttons (handoff.ts)
 * The frame is built from the same skeleton as the live bench (the stand-ins fill the room its buttons take),
 * so the page below does not jump when the bench arrives.
 */

const ORDER = ['plug', 'tab', 'leader'] as const

/** A literal dynamic import: the live bench is its own chunk. */
const load = () => import('./ChaosLabLive.tsx')

const subscribeNothing = () => () => undefined
/** False on the server and while hydrating, true once the page is interactive: the prerendered HTML stays small. */
const useHydrated = () =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  )

/**
 * Ref for the stand-in frame. React runs the function this returns as the frame is replaced by the live bench,
 * before any of its nodes leave the page, so `document.activeElement` is still the stand-in that held focus.
 */
function keepFocus(frame: HTMLElement | null) {
  if (frame === null) return
  return () => {
    const active = document.activeElement
    rememberFocus(heldKey<HTMLElement>(frame, active instanceof HTMLElement ? active : null))
  }
}

/**
 * The twin of a live button: same name, same look, with the switch plate drawn as an outline. Focusing it or
 * pressing it starts the live bench loading; a press is also remembered, so the live bench runs the experiment
 * as it arrives (handoff.ts). `data-chaos-key` is how the live twin is found (Breaker.tsx has the same one).
 */
function StandIn({ which, wake }: { which: LabKey; wake: () => void }) {
  return (
    <Button
      variant={which === 'plug' ? 'danger' : 'secondary'}
      size="lg"
      className={styles.leverButton}
      icon={<span className={styles.leverGhost} aria-hidden="true" />}
      data-chaos-key={which}
      onFocus={wake}
      onClick={() => {
        rememberPress(which)
        wake()
      }}
    >
      {copy.chaos.experiments[which].button}
    </Button>
  )
}

/**
 * The frame: what the prerender, "Skip the machine", the Basic tier and a failed load show. `wake` is given
 * while a live bench may still arrive; the stand-ins then appear once the page is interactive.
 */
function StaticBench({ wake }: { wake?: () => void }) {
  const interactive = useHydrated()
  return (
    <div className={styles.bench} ref={keepFocus}>
      <Rivets />
      <ol className={styles.breakers}>
        {ORDER.map((key, index) => (
          <li key={key} className={styles.breaker}>
            <header className={styles.breakerHead}>
              <NumberBezel n={(index + 1) as 1 | 2 | 3} />
              <h3 className={styles.breakerTitle}>{titles[key]}</h3>
            </header>
            {/* The room the live bench's control takes (a button, or the instruction for the third); empty in the prerender. */}
            {wake ? <div className={styles.hold}>{interactive && key !== 'leader' ? <StandIn which={key} wake={wake} /> : null}</div> : null}
            <PlainCaption>{copy.chaos.experiments[key].plain}</PlainCaption>
          </li>
        ))}
      </ol>
      <div className={styles.aside} data-machine-only="" />
      <div className={styles.logBox} data-machine-only="" />
    </div>
  )
}

export function ChaosLab() {
  const t = copy.chaos
  const { machineOff } = usePreferences()
  const [woken, wake] = useWake(!machineOff)
  const [failed, setFailed] = useState(false)

  useLabObservers(!machineOff, true)

  /** The same import DemoSlot would make; a failure also takes the stand-ins away (they would do nothing). */
  const loadLive = () =>
    load().catch((error: unknown) => {
      setFailed(true)
      throw error
    })

  return (
    <Section
      id={t.id}
      label={t.label}
      title={t.title}
      lead={
        <>
          <span data-js-only="">{t.lead}</span>
          <span data-nojs-only="">{t.leadNoScript}</span>
        </>
      }
    >
      {/*
        With the machine off the lab is the plain list, always: a bench that was already loaded is swapped out
        for it (DemoSlot would keep showing a loaded demo), and nothing observes the cluster any more.
      */}
      {machineOff ? (
        <StaticBench />
      ) : (
        <DemoSlot load={loadLive} rootMargin={woken ? START_NOW : undefined} fallback={<StaticBench wake={failed ? undefined : wake} />} />
      )}
      <p className={styles.off} data-machine-off-only="">
        {t.machineOff.note}
      </p>
    </Section>
  )
}
