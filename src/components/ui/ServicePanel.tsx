import { useRef, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Stage } from '../../cluster/protocol.ts'
import { formatMs } from '../../cluster/format.ts'
import { copy as siteCopy, type Depth, type ServiceCopy } from '../../data/copy.ts'
import type { Project } from '../../data/portfolio.ts'
import { getGsap, isLite, loadGsap } from '../../lib/draw/motion.ts'
import { serviceAnchor } from '../../routes.ts'
import { usePreferences } from '../shell/preferences-context.ts'
import { Button } from './Button.tsx'
import { cx } from './cx.ts'
import { DepthSwitch } from './DepthSwitch.tsx'
import { Icon } from './Icon.tsx'
import { DemoFallbackContext, usePanelContext } from './panel-context.ts'
import { PlainCaption } from './PlainCaption.tsx'
import { Schematic, type SchematicProps } from './Schematic.tsx'
import { Stamp } from './Stamp.tsx'
import styles from './ui.module.css'

export interface ServicePanelProps {
  /** The project record (title, stack, metrics) from `projects[n]`. */
  project: Project
  /** `copy.services.<id>`: depth text, work trace, captions. */
  copy: ServiceCopy
  /**
   * The interactive area, normally a `<DemoSlot load={() => import('./Demo.tsx')} />`. If omitted, the
   * fallback is shown instead.
   */
  demo?: ReactNode
  /**
   * Static content for the demo area: what the prerendered HTML, the Basic tier and a failed load
   * show. A recorded trace if one is published, otherwise `No recorded run published yet.` Never
   * invented numbers. A DemoSlot inside the panel uses this unless it has its own.
   */
  fallback: ReactNode
  /** From `getSchematic(project.serviceId)`, plus `active` / `annotations` / `onNode` as your demo runs. */
  schematic: SchematicProps
  /** The honesty stamp shown beside the always-visible caption. */
  stamp: 'PORT' | 'RULES ONLY'
  /** Measured stage timings from the last real run. Names should match `copy.pipeline`. */
  stages?: readonly Stage[]
  /**
   * How a stage time is printed. Default `formatMs` (`412 ms`, `<0.1 ms`). A panel that times a stage by
   * repeating it can pass a finer one (`46 µs`); a panel whose clock is coarse keeps the default.
   */
  formatStageMs?: (ms: number) => string
  /** Renders the "Show me the pipeline" button; run a real job and feed `stages` as results arrive. */
  onShowPipeline?: () => void
  /** True while a pipeline run is in flight (button shows busy). */
  pipelineBusy?: boolean
  /** Extra controls under the demo (e.g. a "load the model" tap and its size label). */
  demoFooter?: ReactNode
}

const TRACE_ORDER = ['decisions', 'tradeoffs', 'broke', 'change'] as const

/**
 * The shared anatomy of a service panel (spec 3.3): label, h2 title, three metrics, stack, depth
 * switch, the explanation at the chosen depth, the plain-language caption, the demo, the honest
 * caption with its stamp, the schematic, the pipeline, and the work trace. A service supplies content;
 * this component supplies structure, accessibility and motion.
 */
export function ServicePanel({
  project,
  copy,
  demo,
  fallback,
  schematic,
  stamp,
  stages,
  formatStageMs = formatMs,
  onShowPipeline,
  pipelineBusy,
  demoFooter,
}: ServicePanelProps) {
  const labels = siteCopy.services.panel
  const { headingLevel } = usePanelContext()
  const { depth, setDepth } = usePreferences()
  const root = useRef<HTMLElement>(null)
  const anchor = serviceAnchor(project.serviceId)
  const titleId = `${anchor}-title`
  const Heading = (['h1', 'h2', 'h3'] as const)[headingLevel - 1]
  // Sub-headings sit one level below the panel title (h3 -> h4 on the home page, h1 -> h2 on /projects/*), never skipping.
  const SubHeading = (['h2', 'h3', 'h4'] as const)[headingLevel - 1]

  /** Switch depth, reflowing the panel with Flip when GSAP is ready and motion is allowed (spec 4.2). */
  const changeDepth = (next: Depth) => {
    const kit = getGsap()
    const element = root.current
    if (!kit || !element || isLite() || next === depth) {
      setDepth(next)
      return
    }
    const targets = element.querySelectorAll('[data-flip]')
    const state = kit.Flip.getState(targets)
    flushSync(() => setDepth(next))
    kit.Flip.from(state, { duration: 0.24, ease: 'power2.out', scale: false })
  }

  const measured = new Map((stages ?? []).map((stage) => [stage.name, stage.ms]))
  const extraStages = (stages ?? []).filter((stage) => !copy.pipeline.includes(stage.name))

  return (
    <article ref={root} id={anchor} className={styles.service} aria-labelledby={titleId} data-service={project.serviceId}>
      <header className={styles.serviceHead}>
        <div className={styles.serviceNameplate}>
          <p className="stencil">{copy.label}</p>
          <Stamp size="sm" tone={stamp === 'PORT' ? 'cobalt' : 'ink'}>
            {stamp}
          </Stamp>
        </div>
        <Heading id={titleId} className={styles.serviceTitle} tabIndex={-1} data-panel-heading="">
          {project.title}
        </Heading>
        <ul className={styles.metrics} aria-label={labels.metricsHeading}>
          {project.metrics.map((metric) => (
            <li key={metric.label} className={styles.metric}>
              <span className={styles.metricValue}>{metric.value}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
            </li>
          ))}
        </ul>
        <p className={styles.stack}>
          <span className="stencil">{labels.stackLabel}</span>
          {` ${project.stack.join(' · ')}`}
        </p>
      </header>

      <div className={styles.serviceBar}>
        <DepthSwitch value={depth} onChange={changeDepth} onIntent={() => void loadGsap()} />
      </div>

      <div className={styles.serviceBody}>
        <div className={styles.serviceMain}>
          <div className={styles.explain} data-flip="">
            <p key={depth} className={cx(styles.explainText, 'measure')} data-depth={depth}>
              {copy.depth[depth]}
            </p>
          </div>
          <div data-flip="">
            <PlainCaption>{copy.plain}</PlainCaption>
          </div>

          <div className={styles.demo} data-flip="">
            <DemoFallbackContext.Provider value={fallback}>{demo ?? fallback}</DemoFallbackContext.Provider>
            {demoFooter ? <div className={styles.demoFooter}>{demoFooter}</div> : null}
          </div>

          <p className={styles.honest} data-flip="">
            {copy.caption}
          </p>
        </div>

        {/* A group, not an <aside>: the work trace is part of the article, and nested landmarks hurt navigation. */}
        <div className={cx(styles.trace, 'ruled')} role="group" aria-labelledby={`${anchor}-trace`} data-flip="">
          <SubHeading id={`${anchor}-trace`} className={styles.subHeading}>
            {labels.traceHeading}
          </SubHeading>
          <dl className={styles.traceList}>
            {TRACE_ORDER.map((key) => (
              <div key={key} className={styles.traceItem}>
                <dt className="stencil">{labels.traceLabels[key]}</dt>
                <dd>{copy.trace[key]}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The drawing and its stage list. Beside the demo on a wide screen (the lit parts and their timings are in view while you
            use it), under the trace; stacked after the trace on a phone. */}
        <div className={styles.serviceSide}>
          <div data-flip="">
            <Schematic {...schematic} />
          </div>

          {onShowPipeline ? (
            <div className={styles.pipeline} data-flip="" data-js-only="">
              <Button
                variant="secondary"
                icon={<Icon name="play" />}
                busy={pipelineBusy}
                onClick={onShowPipeline}
              >
                {labels.showPipeline}
              </Button>
              <SubHeading className={styles.subHeading}>{labels.pipelineHeading}</SubHeading>
              <ol className={styles.stages}>
                {copy.pipeline.map((name) => {
                  const ms = measured.get(name)
                  return (
                    <li key={name} className={styles.stage} data-measured={ms !== undefined || undefined}>
                      <span>{name}</span>
                      <span className={styles.stageMs}>{ms === undefined ? '—' : formatStageMs(ms)}</span>
                    </li>
                  )
                })}
                {extraStages.map((stage) => (
                  <li key={stage.name} className={styles.stage} data-measured="">
                    <span>{stage.name}</span>
                    <span className={styles.stageMs}>{formatStageMs(stage.ms)}</span>
                  </li>
                ))}
              </ol>
              {measured.size === 0 ? <p className={styles.pipelineIdle}>{labels.pipelineIdle}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
