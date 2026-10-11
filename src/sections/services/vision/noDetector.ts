import { copy, type ServiceCopy } from '../../../data/copy.ts'
import type { DetectorKnown } from './panel-store.ts'

/**
 * What the panel says while no detector is published with this build (finding R1). The owner's override is that
 * the site must work honestly without model files, and a caption that says "YOLOv8n runs here" above a panel
 * that detects nothing is the opposite of honest. So the always-visible caption, the plain-language caption and
 * the consent text each have a no-detector version, chosen from what the build ships (`panelStore.detector`).
 *
 * `unknown` (the prerendered HTML, and the first moment before the build's inventory has been read) takes the
 * no-detector wording too: the page never promises detection it has not confirmed. The production claim in the
 * caption is the data's own, unchanged: "a fine-tuned YOLOv8 at <30 ms" is what the real system ran.
 *
 * The words live in `copy.services.vision.demo.noDetector` (src/data/copy.ts), with the rest of the site's prose.
 */
export const noDetector = copy.services.vision.demo.noDetector

/**
 * The panel's copy for a build that ships (or does not ship) a detector. A published detector keeps the
 * foundation's copy exactly as written; anything else swaps in the two captions that must not claim detection.
 */
export function panelCopy<T extends ServiceCopy>(base: T, detector: DetectorKnown): T {
  return detector === 'published' ? base : { ...base, plain: noDetector.plain, caption: noDetector.caption }
}
