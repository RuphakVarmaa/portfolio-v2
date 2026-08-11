import { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import type { Project } from '../data/portfolio'

export function ProjectDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !project || dialog.open) return
    dialog.showModal()
  }, [project])

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog"
      aria-labelledby={project ? `dialog-${project.id}` : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close()
      }}
    >
      {project && (
        <div className="dialog-shell">
          <form method="dialog" className="dialog-topline">
            <span>PROJECT DETAIL</span>
            <button type="submit" aria-label="Close project details">
              <X aria-hidden="true" />
            </button>
          </form>
          <h3 id={`dialog-${project.id}`}>{project.title}</h3>
          <p className="dialog-summary">{project.summary}</p>
          <div className="dialog-metrics">
            {project.metrics.map((metric) => (
              <div key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
          <div className="dialog-body">
            {project.details.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
          <p className="dialog-stack">{project.stack.join(' / ')}</p>
        </div>
      )}
    </dialog>
  )
}
