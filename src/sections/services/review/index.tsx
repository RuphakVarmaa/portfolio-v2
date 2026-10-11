// PLACEHOLDER from F (foundation). Owned by S4 after F merges: replace everything below.
// Wire the real demo with <DemoSlot load={() => import('./Galley.tsx')} /> (see docs/INTERFACES.md).
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'

export function ReviewService() {
  return (
    <ServicePanel
      project={projects[3]}
      copy={copy.services.review}
      stamp="RULES ONLY"
      schematic={getSchematic('review')}
      fallback={<p>{copy.services.panel.noRun}</p>}
    />
  )
}
