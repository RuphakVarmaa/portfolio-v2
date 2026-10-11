// PLACEHOLDER from F (foundation). Owned by S2 after F merges: replace everything below.
// Wire the real demo with <DemoSlot load={() => import('./AskTheSite.tsx')} /> (see docs/INTERFACES.md).
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'

export function RetrievalService() {
  return (
    <ServicePanel
      project={projects[0]}
      copy={copy.services.retrieval}
      stamp="PORT"
      schematic={getSchematic('retrieval')}
      fallback={<p>{copy.services.panel.noRun}</p>}
    />
  )
}
