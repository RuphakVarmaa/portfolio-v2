import type { ComponentType } from 'react'
import type { ServiceId } from '../../cluster/protocol.ts'
import { PolicyService } from './policy/index.tsx'
import { RetrievalService } from './retrieval/index.tsx'
import { ReviewService } from './review/index.tsx'
import { VisionService } from './vision/index.tsx'

/** The four service components by id: the Services section renders them in order, /projects/* routes render one. */
export const SERVICE_COMPONENTS: Record<ServiceId, ComponentType> = {
  retrieval: RetrievalService,
  vision: VisionService,
  policy: PolicyService,
  review: ReviewService,
}
