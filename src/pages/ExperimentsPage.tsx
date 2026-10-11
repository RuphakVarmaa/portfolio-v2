// PLACEHOLDER from F (foundation). Owned by S5 after F merges: replace everything below with the live lab.
import { copy } from '../data/copy.ts'

export function ExperimentsPage() {
  const t = copy.experiments
  return (
    <main id="content" tabIndex={-1} className="wrap" style={{ paddingBlock: 'var(--s-8)' }}>
      <h1>{t.title}</h1>
      <p className="lead measure">{t.lead}</p>
      <ul>
        {Object.values(t.items).map((item) => (
          <li key={item.title}>{item.title}: {item.text}</li>
        ))}
      </ul>
    </main>
  )
}
