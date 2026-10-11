// PLACEHOLDER from F (foundation). Owned by S1 after F merges: replace everything below with the hero + Board.
// Until then it prerenders every fact the hero must carry (spec 3.2) with no board.
import { copy } from '../../data/copy.ts'
import { projects } from '../../data/portfolio.ts'

export function ControlRoom() {
  const t = copy.controlRoom
  return (
    <section id={t.id} aria-labelledby="hero-title" className="wrap" style={{ paddingBlock: 'var(--s-8)' }}>
      <div className="grid">
        <div className="span-full span-md-7">
          <p className="stencil">{t.eyebrow}</p>
          <h1 id="hero-title">{t.h1}</h1>
          <p className="lead measure">{t.lead}</p>
          <p className="measure">{t.identity}</p>
          <p className="measure">{t.authorship}</p>
          <p className="mono">{t.boot.prerendered}</p>
        </div>
        <div className="span-full span-md-5">
          <h2 className="stencil">{t.serviceIndex.label}</h2>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <a href={`#service-${p.serviceId}`}>{p.title}</a> — {p.headlineMetric}
              </li>
            ))}
          </ul>
          <p>
            <a href="/resume/">{t.serviceIndex.links.resumeHtml}</a> · <a href="/Ruphak-Varmaa-Resume.pdf">{t.serviceIndex.links.resumePdf}</a> ·{' '}
            <a href="#contact">{t.serviceIndex.links.contact}</a>
          </p>
        </div>
      </div>
    </section>
  )
}
