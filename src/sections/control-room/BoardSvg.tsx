import { hexBezel, lampArt, relayArt, RELAY_JACKS } from './board-art.ts'
import styles from './ControlRoom.module.css'

/**
 * The switchboard drawing (spec 2.5): hand-drawn SVG authored in code from `board-art.ts`, with the pen
 * wobble seeded so the server and the client draw the same lines. No images, no generated art.
 *
 * The prerendered HTML counts against a byte budget, so the markup is lean: the parts that repeat are drawn
 * once in a hidden sprite (`Sprite`) and `<use>`d, state reaches them through CSS custom properties (a
 * `<use>` shadow tree inherits from its `<use>` element), and sets of circles share a group's class.
 *
 *   Sprite    the hexagon (section numbers, index rows, cable tags), the lamp, the dither pattern. The lamp's outer
 *             halo is drawn twice, flat and dithered, and the lamp's custom properties choose which one shows: a
 *             selector with `html[data-theme]` in front of a sprite part does not match inside the <use> shadow tree
 *   LampArt   one lamp: `<use>` of the sprite's lamp; `--lens`, `--g1..g3`, `--gd`, `--hl/--hr`, `--t` come from the button
 *   RelayArt  the relay: housing, winding, core, yoke, the arm that throws, contacts, sockets
 *
 * The cables are in Cables.tsx (client only: they draw themselves when the board is first on screen).
 */

const LAMP = lampArt()
const RELAY = relayArt()
const HEX = hexBezel()

/**
 * Hidden sprite: the parts every hexagon and every lamp shares. Zero size but never display:none (a
 * reference to a pattern inside a display:none subtree would break). Always rendered, also under "Skip the
 * machine", because the service index and the section number use the hexagon.
 */
export function Sprite() {
  const [outer, middle, inner] = LAMP.rings
  return (
    <svg className={styles.defs} width="0" height="0" aria-hidden="true">
      <defs>
        <path id="qb-hx" className={styles.hex} d={HEX} />
        <g id="qb-lamp">
          <circle className={styles.g1} r={outer.r} />
          <circle className={styles.gd} r={outer.r} fill="url(#qb-dither)" />
          <circle className={styles.g2} r={middle.r} />
          <circle className={styles.g3} r={inner.r} />
          <g className={styles.tilt}>
            <path className={styles.shadowFill} d={LAMP.bezel} transform={`translate(${LAMP.shadow} ${LAMP.shadow})`} />
            <path className={styles.lampBezel} d={LAMP.bezel} />
            <circle className={styles.hairline} r={LAMP.grooveR} />
            <path className={styles.focusRing} d={LAMP.focus} />
          </g>
          <circle className={styles.lens} r={LAMP.lensR} />
          <path className={styles.halfLeft} d={LAMP.halves.left} />
          <path className={styles.halfRight} d={LAMP.halves.right} />
          <circle className={styles.hairline} r={LAMP.innerR} />
          <path className={styles.glare} d={LAMP.glare} />
        </g>
        <pattern id="qb-dither" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle className={styles.ditherDot} cx="1" cy="1" r="0.9" />
          <circle className={styles.ditherDot} cx="3" cy="3" r="0.9" />
        </pattern>
      </defs>
    </svg>
  )
}

/** A hexagon from the sprite with a stencil number on it: the same bezel the section numbers carry. */
export function Hex({ className, label }: { className?: string; label: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <use href="#qb-hx" />
      <text x="24" y="25">
        {label}
      </text>
    </svg>
  )
}

/** One lamp's drawing: the sprite's lamp, lit and tilted by the button it sits in. */
export function LampArt() {
  return (
    <svg className={styles.art} viewBox={LAMP.viewBox} aria-hidden="true">
      <use href="#qb-lamp" />
    </svg>
  )
}

/**
 * The relay: housing with its hard offset shadow, a winding on an iron core, the yoke, the armature that
 * swings between two contacts (`data-arm`, rotated about its pivot by useBoardMotion on every message), the
 * contact that sparks when the arm lands (`data-contact`), ten sockets for the patch cables, a small "coil
 * energised" lamp (lit while a job is running on any worker) and a recessed window. The window is only drawn
 * here; Relay.tsx lays the NODES / TERM display over it in HTML.
 */
export function RelayArt({ energised = false }: { energised?: boolean }) {
  const [pivotX, pivotY] = RELAY.pivot
  return (
    <svg className={styles.relaySvg} viewBox={RELAY.viewBox} aria-hidden="true">
      <defs>
        <path id="qb-rb" className={styles.relayBase} d={RELAY.body} />
      </defs>
      <use className={styles.shadowFill} href="#qb-rb" transform="translate(5 5)" />
      <use className={styles.relayBody} href="#qb-rb" />
      <g className={styles.lines}>
        <path className={styles.winding} d={RELAY.winding} />
        <path d={RELAY.flanges} />
        <path className={styles.paperFill} d={RELAY.core} />
        <path d={RELAY.yoke} />
        <path d={RELAY.posts} />
        <g className={styles.contacts}>
          {RELAY.contacts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" />
          ))}
          {RELAY.contacts.map(([x, y], i) => (
            <circle key={`spark${i}`} data-contact={i === 0 ? 'in' : 'out'} cx={x} cy={y} r="10" />
          ))}
        </g>
        <g transform={`translate(${pivotX} ${pivotY})`}>
          <g className={styles.arm} data-arm="">
            <path className={styles.paperFill} d={RELAY.arm} />
            <circle className={styles.brass} cx={RELAY.armTip[0]} cy={RELAY.armTip[1]} r="3.4" />
          </g>
          <circle className={styles.pivotPin} r="4.5" />
        </g>
        <path className={styles.windowGlass} d={RELAY.window.outer} />
        <path className={styles.hairline} d={RELAY.window.inner} />
        <g className={styles.screws}>
          {RELAY.screws.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" />
          ))}
        </g>
        <path d={RELAY.screwSlots} />
        <g className={styles.sockets}>
          {Object.entries(RELAY_JACKS).map(([name, jack]) => (
            <circle key={name} cx={jack.at[0]} cy={jack.at[1]} r="8" />
          ))}
        </g>
        <circle className={styles.coilLamp} data-lit={energised || undefined} cx={RELAY.coilLamp[0]} cy={RELAY.coilLamp[1]} r="8" />
      </g>
    </svg>
  )
}
