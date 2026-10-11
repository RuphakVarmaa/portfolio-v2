import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Button } from '../../../components/ui/Button.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { usePanelContext } from '../../../components/ui/panel-context.ts'
import { PlainCaption } from '../../../components/ui/PlainCaption.tsx'
import { copy } from '../../../data/copy.ts'
import { MAX_SOURCE_CHARS } from '../../../lib/review/analyze.ts'
import { TIERS, tierCounts, type Tier } from '../../../lib/review/tiers.ts'
import { NodeLamps } from '../policy/NodeLamps.tsx'
import { Galley, type GalleyJump } from './Galley.tsx'
import { Pipeline } from './Pipeline.tsx'
import { RuleList } from './RuleList.tsx'
import disclosure from '../policy/Disclosure.module.css'
import styles from './Review.module.css'
import { reviewStore } from './review-store.ts'
import { SEEDS } from './seeds.ts'
import { REVIEW_STRINGS as t } from './strings.ts'
import { TierShape } from './TierShape.tsx'

/**
 * The review demo (spec 3.3d, 4.6), lazy-loaded by DemoSlot. Pick a seeded diff or paste up to 20 KB of
 * JavaScript; the review worker runs the pattern rules and an acorn AST pass and answers with structured
 * findings, each with its rule id, tier, line and one-line fix. The galley shows the code with the findings
 * in the margin; the pipeline strip shows what each stage measured. Input that is not plain JavaScript (JSX,
 * TypeScript) still gets the pattern rules and says why the AST pass was skipped.
 *
 * The first seed is reviewed as soon as the demo appears, so there is a real result to read straight away. That
 * review is shown but not announced: nobody asked for it. Every review the visitor asks for is announced.
 */

export default function Reviewer() {
  const demo = copy.services.review.demo
  const { headingLevel } = usePanelContext()
  const SubHeading = (['h2', 'h3', 'h4'] as const)[headingLevel - 1]
  const store = useSyncExternalStore(reviewStore.subscribe, reviewStore.getSnapshot, reviewStore.getServerSnapshot)
  const [draft, setDraft] = useState(() => reviewStore.getSnapshot().run?.source ?? SEEDS[0].source)
  const matched = SEEDS.find((seed) => seed.source === draft)
  const [jump, setJump] = useState<GalleyJump | null>(null)

  useEffect(() => {
    reviewStore.warm()
    if (!reviewStore.getSnapshot().run) reviewStore.analyze(SEEDS[0].source, SEEDS[0].filename, { silent: true })
  }, [])

  const submit = () => reviewStore.analyze(draft, matched?.filename ?? t.pastedName)
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  const { run, done } = store
  const result = done?.result
  const counts = result ? tierCounts(result.findings) : null
  const worstTier = result && result.findings.length > 0 ? (Math.min(...result.findings.map((finding) => finding.tier)) as Tier) : null
  const worst = worstTier === null ? null : { name: demo.tiers[worstTier - 1].name, shape: demo.tiers[worstTier - 1].shape }

  return (
    <div className={styles.review}>
      <header className={styles.head}>
        <SubHeading className={styles.title}>{demo.label}</SubHeading>
        <NodeLamps nodes={['review-a']} label={t.workersLabel} />
      </header>

      <div className={styles.picker} role="group" aria-label={t.seedsLabel}>
        <span className="stencil">{t.seedsLabel}</span>
        <span className={styles.seeds}>
          {SEEDS.map((seed) => (
            <Button
              key={seed.filename}
              className={styles.seed}
              pressed={matched?.filename === seed.filename && done?.filename === seed.filename}
              onClick={() => {
                setDraft(seed.source)
                reviewStore.analyze(seed.source, seed.filename)
              }}
            >
              {seed.filename}
            </Button>
          ))}
        </span>
      </div>

      <details className={disclosure.box}>
        <summary>{t.paste}</summary>
        <div className={disclosure.body}>
          <label className={styles.sourceLabel}>
            <span className="stencil">{t.sourceLabel}</span>
            <textarea
              className={styles.textarea}
              value={draft}
              maxLength={MAX_SOURCE_CHARS}
              placeholder={demo.placeholder}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </label>
          <p className={styles.meta}>{t.parseHint}</p>
          <div className={styles.pasteFoot}>
            <Button variant="primary" icon={<Icon name="play" />} busy={store.busy} onClick={submit}>
              {t.run}
            </Button>
            <span className={styles.meta}>{t.count(draft.length, MAX_SOURCE_CHARS)}</span>
            {draft.length >= MAX_SOURCE_CHARS ? <span className={styles.meta}>{t.limit}</span> : <span className={styles.meta}>{t.runHint}</span>}
          </div>
        </div>
      </details>

      <RuleList />

      <div className={styles.results} data-first={result || run?.status === 'error' ? undefined : ''} aria-busy={store.busy || undefined}>
        {run?.status === 'error' ? <p className={styles.problem}>{t.failed(run.error ?? 'unknown')}</p> : null}
        {store.busy ? <p className={styles.meta}>{t.running}</p> : null}
        {done && result && counts ? (
          <>
            <p className={styles.summary}>{t.summary(result.findings.length, result.lines)}</p>
            <ul className={styles.tally} aria-label={t.tallyLabel}>
              {TIERS.map((tier) => {
                const first = result.findings.find((finding) => finding.tier === tier)
                const name = `T${tier} ${demo.tiers[tier - 1].name}`
                return (
                  <li key={tier}>
                    <button
                      type="button"
                      className={styles.tallyItem}
                      data-zero={counts[tier] === 0 || undefined}
                      disabled={first === undefined}
                      aria-label={first === undefined ? undefined : t.jumpLabel(name, counts[tier])}
                      onClick={() => first && setJump({ line: first.line, seq: (jump?.seq ?? 0) + 1 })}
                    >
                      <TierShape tier={tier} />
                      <span>{name}</span>
                      <span className={styles.count}>{counts[tier]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <PlainCaption>{t.plainReview({ findings: result.findings.length, lines: result.lines, worst, parsed: result.parsed })}</PlainCaption>
            <Pipeline result={result} roundTripMs={done.roundTripMs} shown={store.shown} />
            {result.findings.length === 0 ? <p className={styles.meta}>{t.noFindings(result.lines)}</p> : null}
            <Galley source={done.source} filename={done.filename} findings={result.findings} jump={jump} />
          </>
        ) : !run ? (
          <p className={styles.meta}>{t.idle}</p>
        ) : null}
      </div>
    </div>
  )
}
