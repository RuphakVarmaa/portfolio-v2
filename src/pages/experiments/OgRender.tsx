import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { Icon } from '../../components/ui/Icon.tsx'
import { copy } from '../../data/copy.ts'
import { profile, projects } from '../../data/portfolio.ts'
import styles from '../Experiments.module.css'
import { FONT_SPECS, OG_HEIGHT, OG_WIDTH, drawCard, metricFigure, type OgText } from './og-card.ts'
import { tools } from './tools-copy.ts'

/** What the card says: the name from the data file, the headline and the first sentence of the lead from `copy`. */
function cardText(): OgText {
  const [first, ...rest] = profile.name.toUpperCase().split(' ')
  const short = copy.controlRoom.board.shortNames
  return {
    eyebrow: copy.controlRoom.eyebrow.split(' · ').slice(1).join(' · '),
    nameTop: first,
    nameBottom: rest.join(' '),
    tagline: copy.controlRoom.h1,
    line: copy.controlRoom.lead.split('. ')[0] + '.',
    domain: profile.website.replace(/^https?:\/\//, ''),
    lamps: [short.retrieval, short.vision, short.policy, short.review],
    // The headline number of each project, as the service index prints it (`87% retrieval precision` -> `87%`).
    metrics: [projects[0], projects[1], projects[2], projects[3]].map((project) => metricFigure(project.headlineMetric)) as unknown as OgText['metrics'],
    plane: copy.controlRoom.board.controlPlane,
  }
}

type Status = 'fonts' | 'ready' | 'error'

/**
 * Owner tool: render the 1200 x 630 social card on a canvas from the board's own drawing parts, and save
 * it as a PNG. Nothing is uploaded; the PNG is made in this browser. The canvas is exactly 1200 x 630
 * (it is the file), shown scaled to fit.
 */
export default function OgRender() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('fonts')
  const [pass, setPass] = useState(0)
  const t = tools.og

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) {
      queueMicrotask(() => setStatus('error'))
      return
    }
    let cancelled = false
    Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec)))
      .then(() => {
        if (cancelled) return
        drawCard(ctx, cardText())
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [pass])

  const download = () => {
    canvas.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'og.png'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return (
    <div className={styles.stack}>
      <canvas ref={canvas} className={styles.og} width={OG_WIDTH} height={OG_HEIGHT} role="img" aria-label={t.previewLabel} />
      <div className={styles.controls}>
        <Button variant="primary" icon={<Icon name="upload" style={{ transform: 'scaleY(-1)' }} />} disabled={status !== 'ready'} onClick={download}>
          {t.download}
        </Button>
        <Button variant="secondary" disabled={status === 'fonts'} onClick={() => setPass((n) => n + 1)}>
          {t.render}
        </Button>
        <span className={styles.note}>
          {status === 'fonts' ? t.fonts : `${t.size}: ${OG_WIDTH} × ${OG_HEIGHT}. ${t.saveTo}`}
        </span>
      </div>
      <p className={styles.note}>{t.note}</p>
    </div>
  )
}
