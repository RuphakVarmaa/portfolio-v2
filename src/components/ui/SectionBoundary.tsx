import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Anchor id kept on the fallback so in-page links still land somewhere. */
  id: string
  /** Human name used in the fallback sentence, e.g. "The Chaos Lab". */
  name: string
  children: ReactNode
}

/**
 * One broken section must not blank the whole site. If a section throws while rendering, this shows a
 * single honest sentence in its place and logs the error; everything else keeps working. It adds no DOM
 * of its own, so it changes nothing in the prerendered HTML.
 */
export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} failed to render`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section id={this.props.id} className="wrap" style={{ paddingBlock: 'var(--s-6)' }}>
        <p role="alert" className="muted">
          {this.props.name} could not be shown. The rest of the page still works.
        </p>
      </section>
    )
  }
}
