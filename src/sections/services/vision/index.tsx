import { useSyncExternalStore } from 'react'
import { DemoSlot } from '../../../components/ui/DemoSlot.tsx'
import { ServicePanel } from '../../../components/ui/ServicePanel.tsx'
import { copy, projectFor } from '../../../data/copy.ts'
import { getSchematic } from '../../../data/schematics.ts'
import { EMPTY_PANEL, panelStore, requestPipeline } from './panel-store.ts'
import styles from './Vision.module.css'

const SCHEMATIC = getSchematic('vision')
const load = () => import('./CameraStage.tsx')

/**
 * SERVICE 02, Real-Time Vision Analytics (spec 3.3b): a real producer-consumer pipeline in the browser.
 *
 * This file is part of the initial JavaScript and is deliberately tiny: the panel, the lazy demo slot, and
 * a three-line read of what the demo reports (measured stage timings and which schematic parts are
 * running). The camera stage, the queue, the gauges, the worker client and the recorder are all in
 * `CameraStage.tsx`, which loads when the panel is within half a screen of the viewport. The detector
 * (a 3.5 MB model and the 14 MB ONNX runtime) loads only on a tap, or on an Allow that says so.
 */
export function VisionService() {
  const panel = useSyncExternalStore(panelStore.subscribe, panelStore.get, () => EMPTY_PANEL)
  const t = copy.services.vision
  return (
    <ServicePanel
      project={projectFor('vision')}
      copy={t}
      stamp={t.stamp}
      schematic={{ ...SCHEMATIC, active: panel.active, annotations: panel.annotations }}
      // What the prerendered HTML, the Basic tier and a failed load show: the honest line, in a box that
      // holds the demo's place so the panel does not jump when the demo arrives. Never invented numbers.
      fallback={
        <div className={styles.fallback}>
          <p>{t.demo.noRecording}</p>
        </div>
      }
      demo={<DemoSlot load={load} />}
      stages={panel.stages}
      onShowPipeline={requestPipeline}
      pipelineBusy={panel.busy}
    />
  )
}
