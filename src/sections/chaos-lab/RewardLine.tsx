import { Fragment } from 'react'
import { splitNodeIds } from './format.ts'
import { labels } from './labels.ts'
import styles from './ChaosLab.module.css'

/** A sentence with its node ids (`policy-b`, `tab-4a8c`) kept whole: mono, and never broken across two lines. */
function Sentence({ text }: { text: string }) {
  return (
    <>
      {splitNodeIds(text).map((segment, index) =>
        segment.node ? (
          <span key={index} className={styles.nodeId}>
            {segment.text}
          </span>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * What an experiment just proved: the reward sentence from `copy.chaos.experiments.*.reward` (with live
 * values) and, under it, the measured figures as mono "receipts". The text is announced once by whoever
 * completed the experiment (the store or the runner); this is the page's copy of it.
 */
export function RewardLine({ text, receipts }: { text: string; receipts?: string }) {
  return (
    <div className={styles.reward}>
      <p className={styles.rewardText}>
        <Sentence text={text} />
      </p>
      {receipts ? (
        <p className={styles.receipts}>
          <span className="stencil">{labels.receipts}</span> <Sentence text={receipts} />
        </p>
      ) : null}
    </div>
  )
}
