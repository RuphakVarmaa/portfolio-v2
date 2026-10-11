import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { arrowHead, connector, roundedRect } from '../../../lib/draw/paths.ts'
import { axisDeflections, layoutRack, type RackCard } from '../../../lib/vision/rack.ts'
import { fitInBox, thumbnailBayer } from './Dither.ts'
import { Lamp } from './Lamp.tsx'
import { QUEUE_CAPACITY, type Pipeline } from './Pipeline.ts'
import { strings } from './strings.ts'
import styles from './Vision.module.css'

/**
 * The queue, drawn (spec 4.4): the real contents of the bounded ring as a rack of four slots, with the
 * worker's bay at the right-hand end. Frames go in at the left, the worker takes the OLDEST card from the
 * right-hand slot, and when the rack is full the oldest card is bumped out (it flips up and away) to make
 * room: drop-oldest backpressure, as a thing you can watch.
 *
 * Everything on it is a measurement of the real ring: each frame card is a dithered thumbnail of the frame
 * itself with its capture number, each motion card is the three axes of the sample, and a card moves only
 * because the ring moved. It is a snapshot of the ring at the last update (ten a second), with the card the
 * worker took last and the cards evicted in the last moment. The graphic is hidden from assistive technology:
 * the depth and drop gauges and the announcements carry the same facts as text.
 */

// The drawing's own coordinate system (the track is a fixed 536 x 80 box, scaled by CSS as a whole).
const CELL = 96
const LEAD = 36
const GAP = 20
const WIDTH = LEAD + QUEUE_CAPACITY * CELL + GAP + CELL
const HEIGHT = 80
const BAY_START = LEAD + QUEUE_CAPACITY * CELL + GAP
const MID = HEIGHT / 2
/** A card sits 6 units inside its pocket's cell (84 wide, 4:3). */
const CARD_INSET = 6
/** A card is 84 of the track's 536 units wide, 4:3, inside a 1.5 px border. */
const CARD_SHARE = 84 / WIDTH
const CARD_BORDER = 3

/** The pockets the cards sit in, the worker's bay, and the arrows that show the direction of travel. Seeded: the same pen line every time. */
const POCKETS = Array.from({ length: QUEUE_CAPACITY }, (_, slot) => roundedRect(LEAD + slot * CELL + 2, 2, CELL - 4, HEIGHT - 4, 5, `vision:pocket:${slot}`, 0.7))
const BAY = roundedRect(BAY_START + 2, 2, CELL - 4, HEIGHT - 4, 4, 'vision:bay', 0.6)
const ARROW_IN = connector([5, MID], [LEAD - 6, MID], 'vision:arrow:in') + arrowHead([LEAD - 3, MID], [1, 0], 6, 'vision:arrow:in:head')
const ARROW_OUT = connector([LEAD + QUEUE_CAPACITY * CELL + 2, MID], [BAY_START - 5, MID], 'vision:arrow:out') + arrowHead([BAY_START - 2, MID], [1, 0], 6, 'vision:arrow:out:head')

/** Left edge of a card in a slot, in the percent of the track's width (slot `QUEUE_CAPACITY` is the worker's bay). */
const cardX = (slot: number) => ((slot < QUEUE_CAPACITY ? LEAD + slot * CELL : BAY_START) + CARD_INSET) / (WIDTH / 100)
const labelX = (centre: number) => `${((centre / WIDTH) * 100).toFixed(2)}%`

interface ThumbBox {
  w: number
  h: number
}

interface ThumbProps {
  card: RackCard
  engine: Pipeline
  /** Changes when the theme's colours do, so the thumbnail is drawn again in the new inks. */
  tone: number
  /** The card's inner size in CSS pixels: the thumbnail is drawn at exactly this size, so its dither pixels are as chunky as the viewfinder's. */
  box: ThumbBox
}

/** A one-bit thumbnail of a frame, in the same two inks as the viewfinder. Drawn once per card (per colour or size change), before paint. */
const Thumb = memo(
  function Thumb({ card, engine, tone, box }: ThumbProps) {
    const canvas = useRef<HTMLCanvasElement>(null)
    useLayoutEffect(() => {
      const element = canvas.current
      const context = element?.getContext('2d')
      if (!element || !context || !card.raw) return
      const { width, height } = fitInBox(card.width, card.height, box.w, box.h)
      element.width = width
      element.height = height
      const { dark, light } = engine.palette()
      const image = new ImageData(width, height)
      thumbnailBayer(card.raw, card.width, card.height, width, height, dark, light, image.data)
      context.putImageData(image, 0, 0)
    }, [card, engine, tone, box])
    return <canvas ref={canvas} className={styles.thumb} />
  },
  (before, after) => before.card.id === after.card.id && before.tone === after.tone && before.box.w === after.box.w && before.box.h === after.box.h,
)

/** The three axes of a motion sample: bars up or down from a centre line, cobalt, 20 m/s^2 being the full bar. */
function Glyph({ axes }: { axes: readonly [number, number, number] }) {
  const bars = axisDeflections(axes)
  return (
    <svg className={styles.glyph} viewBox="0 0 36 27" aria-hidden="true">
      <path className={styles.glyphBase} d="M2 13.5H34" />
      {bars.map((deflection, index) => (
        <path key={index} className={styles.glyphBar} d={`M${8 + index * 10} 13.5V${(13.5 - deflection * 11).toFixed(1)}`} />
      ))}
    </svg>
  )
}

export function Rack({ engine }: { engine: Pipeline }) {
  const state = useSyncExternalStore(engine.rack.subscribe, engine.rack.get)
  const placements = layoutRack(state, QUEUE_CAPACITY)
  const track = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<ThumbBox>({ w: 81, h: 60 })

  // The cards scale with the track; thumbnails are drawn at the card's real size, so measure it.
  useEffect(() => {
    const element = track.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const measure = () => {
      const width = Math.max(24, Math.round(element.clientWidth * CARD_SHARE) - CARD_BORDER)
      const height = Math.max(18, Math.round(width * 0.75))
      setBox((before) => (before.w === width && before.h === height ? before : { w: width, h: height }))
    }
    // Measured on the next frame, not inside the observer's delivery (a change of the thumbnails' size moves
    // the layout, which would otherwise raise "ResizeObserver loop completed with undelivered notifications").
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return (
    <div className={styles.rack} aria-hidden="true">
      <div ref={track} className={styles.track}>
        <svg className={styles.rackSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          {POCKETS.map((d, slot) => (
            <path key={slot} className={styles.pocket} d={d} />
          ))}
          <path className={styles.bayBox} d={BAY} />
          <path className={styles.flow} d={ARROW_IN} />
          <path className={styles.flow} d={ARROW_OUT} />
        </svg>
        {placements.map(({ card, slot, ghost }) => (
          <div
            key={card.id}
            className={styles.card}
            data-kind={card.kind}
            data-ghost={ghost || undefined}
            data-idle={(slot === QUEUE_CAPACITY && !state.busy) || undefined}
            style={{ '--x': cardX(slot).toFixed(3) } as CSSProperties}
          >
            {card.kind === 'frame' ? (
              <>
                <Thumb card={card} engine={engine} tone={state.tone} box={box} />
                <span className={styles.cardTag}>{strings.queue.tag(card.n)}</span>
              </>
            ) : card.axes ? (
              <Glyph axes={card.axes} />
            ) : null}
          </div>
        ))}
        <span className={styles.bayLamp}>
          <Lamp lit={state.busy} />
        </span>
      </div>
      <div className={styles.rackLabels}>
        <span style={{ left: 0, '--shift': '0%' } as CSSProperties}>{strings.queue.in}</span>
        <span style={{ left: labelX(LEAD + (QUEUE_CAPACITY - 0.5) * CELL) }}>{strings.queue.oldest}</span>
        <span style={{ left: labelX(WIDTH), '--shift': '-100%' } as CSSProperties}>{strings.queue.worker}</span>
      </div>
    </div>
  )
}
