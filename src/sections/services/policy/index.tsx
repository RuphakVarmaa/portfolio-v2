// PLACEHOLDER from F (foundation). Owned by S4 after F merges: replace everything below.
// Wire the real demo with <DemoSlot load={() => import('./Playground.tsx')} /> (see docs/INTERFACES.md).
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'

export function PolicyService() {
  return (
    <ServicePanel
      project={projects[2]}
      copy={copy.services.policy}
      stamp="PORT"
      schematic={getSchematic('policy')}
      fallback={<p>{copy.services.panel.noRun}</p>}
    />
  )
}
