import { Reveal } from './Reveal'

const proof = [
  { value: '100K', label: 'token document corpora' },
  { value: '<30ms', label: 'computer vision inference' },
  { value: '200+', label: 'concurrent SaaS users' },
  { value: '400+', label: 'LeetCode problems solved' },
]

export function ProofRail() {
  return (
    <section className="proof-rail" aria-label="Selected engineering outcomes">
      <Reveal className="proof-grid">
        {proof.map((item) => (
          <div className="proof-item" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </Reveal>
    </section>
  )
}
