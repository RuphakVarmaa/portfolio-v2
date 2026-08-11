import type { CSSProperties } from 'react'
import type { Project } from '../data/portfolio'

const nodes = Array.from({ length: 14 }, (_, index) => index)
const bars = Array.from({ length: 9 }, (_, index) => index)

export function ProjectArtwork({ art, title }: Pick<Project, 'art' | 'title'>) {
  return (
    <div className={`project-art project-art-${art}`} role="img" aria-label={`Abstract visual for ${title}`}>
      {art === 'rag' && (
        <div className="rag-field" aria-hidden="true">
          <span className="rag-core" />
          <span className="rag-orbit rag-orbit-one" />
          <span className="rag-orbit rag-orbit-two" />
          {nodes.map((node) => (
            <span className="rag-node" key={node} style={{ '--node': node } as CSSProperties} />
          ))}
        </div>
      )}

      {art === 'vision' && (
        <div className="vision-field" aria-hidden="true">
          <span className="vision-scan" />
          <span className="vision-target target-one" />
          <span className="vision-target target-two" />
          <span className="vision-target target-three" />
          <span className="vision-axis axis-x" />
          <span className="vision-axis axis-y" />
        </div>
      )}

      {art === 'rbac' && (
        <div className="rbac-field" aria-hidden="true">
          <span className="access-ring access-ring-one" />
          <span className="access-ring access-ring-two" />
          <span className="access-ring access-ring-three" />
          <span className="access-core" />
          <span className="access-gate gate-one" />
          <span className="access-gate gate-two" />
          <span className="access-gate gate-three" />
        </div>
      )}

      {art === 'review' && (
        <div className="review-field" aria-hidden="true">
          <span className="review-beam" />
          {bars.map((bar) => (
            <span className="review-bar" key={bar} />
          ))}
        </div>
      )}
    </div>
  )
}
