// PLACEHOLDER from F (foundation). Owned by S5 after F merges: replace everything below with the Chaos Lab.
import { Section } from '../../components/ui/Section.tsx'
import { copy } from '../../data/copy.ts'

export function ChaosLab() {
  const t = copy.chaos
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.lead}>
      <ol data-machine-only="">
        <li>{t.experiments.plug.plain}</li>
        <li>{t.experiments.tab.plain}</li>
        <li>{t.experiments.leader.plain}</li>
      </ol>
      <p data-machine-off-only="">{t.machineOff.note}</p>
    </Section>
  )
}
