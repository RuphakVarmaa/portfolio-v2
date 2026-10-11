import type { Box } from '../../../cluster/protocol.ts'
import type { Phase } from './Pipeline.ts'
import { strings } from './strings.ts'

/**
 * The text behind the canvas's `aria-label` (spec 8.2): what a screen reader hears instead of the picture,
 * for example "3 objects detected: person, cup, laptop". Pure, so the wording is tested.
 */

/** Distinct class names in the order they first appear (boxes arrive most confident first), at most `max` of them. */
export function listClasses(boxes: readonly Box[], max = 5): string {
  const names: string[] = []
  for (const box of boxes) if (!names.includes(box.cls)) names.push(box.cls)
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} ${strings.stage.more(names.length - max)}`
}

/** What the canvas is showing, in a sentence. */
export function describeFrame(phase: Phase, boxes: readonly Box[], detector: boolean): string {
  if (phase === 'idle' || phase === 'starting') return strings.stage.canvasIdle
  const base = phase === 'still' ? strings.stage.canvasStill : phase === 'replay' ? strings.stage.canvasReplay : strings.stage.canvasRunning
  if (!detector) return `${base} ${strings.stage.noDetector}`
  return `${base} ${boxes.length === 0 ? strings.stage.noObjects : strings.stage.objects(boxes.length, listClasses(boxes))}`
}
