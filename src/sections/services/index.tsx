import { Section } from '../../components/ui/Section.tsx'
import { SectionBoundary } from '../../components/ui/SectionBoundary.tsx'
import { DEFAULT_PANEL_CONTEXT, PanelContext } from '../../components/ui/panel-context.ts'
import { copy } from '../../data/copy.ts'
import { PolicyService } from './policy/index.tsx'
import { RetrievalService } from './retrieval/index.tsx'
import { ReviewService } from './review/index.tsx'
import { VisionService } from './vision/index.tsx'

/** `#services`: the section wrapper that orders the four ServicePanels (spec 6.11). Panels render as h3s under this h2. */
export function Services() {
  const t = copy.services
  return (
    <Section id={t.id} label={t.label} title={t.title} lead={t.lead}>
      <PanelContext.Provider value={DEFAULT_PANEL_CONTEXT}>
        <SectionBoundary id="service-retrieval" name="The retrieval service">
          <RetrievalService />
        </SectionBoundary>
        <SectionBoundary id="service-vision" name="The vision service">
          <VisionService />
        </SectionBoundary>
        <SectionBoundary id="service-policy" name="The policy service">
          <PolicyService />
        </SectionBoundary>
        <SectionBoundary id="service-review" name="The review service">
          <ReviewService />
        </SectionBoundary>
      </PanelContext.Provider>
    </Section>
  )
}
