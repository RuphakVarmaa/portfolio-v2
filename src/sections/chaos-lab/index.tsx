import { usePreferences } from '../../components/shell/preferences-context.ts'
import { DemoSlot } from '../../components/ui/DemoSlot.tsx'
import { PlainCaption } from '../../components/ui/PlainCaption.tsx'
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'
import { NumberBezel } from './NumberBezel.tsx'
import { Rivets } from './Rivets.tsx'
import { titles } from './titles.ts'
import { useLabObservers } from './use-observers.ts'
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
 */

const ORDER = ['plug', 'tab', 'leader'] as const

function StaticBench() {
  return (
    <div className={styles.bench}>
      <Rivets />
      <ol className={styles.breakers}>
        {ORDER.map((key, index) => (
          <li key={key} className={styles.breaker}>
            <header className={styles.breakerHead}>
              <NumberBezel n={(index + 1) as 1 | 2 | 3} />
              <h3 className={styles.breakerTitle}>{titles[key]}</h3>
            </header>
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

  useLabObservers(!machineOff, true)

  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.lead}>
      {/*
        With the machine off the lab is the plain list, always: a bench that was already loaded is swapped out
        for it (DemoSlot would keep showing a loaded demo), and nothing observes the cluster any more.
      */}
      {machineOff ? <StaticBench /> : <DemoSlot load={() => import('./ChaosLabLive.tsx')} fallback={<StaticBench />} />}
      <p className={styles.off} data-machine-off-only="">
        {t.machineOff.note}
      </p>
    </Section>
  )
}
