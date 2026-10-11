// PLACEHOLDER from F (foundation). Owned by S3 after F merges: replace everything below.
// Wire the real demo with <DemoSlot load={() => import('./CameraStage.tsx')} /> (see docs/INTERFACES.md).
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy } from '../../../data/copy.ts'
import { projects } from '../../../data/portfolio.ts'
import { getSchematic } from '../../../data/schematics.ts'

export function VisionService() {
  return (
    <ServicePanel
      project={projects[1]}
      copy={copy.services.vision}
      stamp="PORT"
      schematic={getSchematic('vision')}
      fallback={<p>{copy.services.vision.demo.noRecording}</p>}
    />
  )
}
