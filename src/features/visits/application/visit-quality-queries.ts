import { queryOptions } from '@tanstack/react-query'

import type { QualityMode } from '../domain/visit-quality'
import {
  listQualityEvents,
  listQualityOwners,
  listQualityReview,
} from '../infrastructure/visit-quality-repository'

export { recordQualityReview } from '../infrastructure/visit-quality-repository'
export type { QualityRecord } from '../infrastructure/visit-quality-repository'

export const qualityKey = (tenantId: string) => ['visit-quality', tenantId] as const

export const qualityReviewsQuery = (
  tenantId: string,
  week: string,
  mode: QualityMode,
  page: number,
) =>
  queryOptions({
    queryKey: [...qualityKey(tenantId), 'list', week, mode, page],
    queryFn: () => listQualityReview(tenantId, week, mode, page),
  })

export const qualityOwnersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: [...qualityKey(tenantId), 'owners'],
    queryFn: () => listQualityOwners(tenantId),
  })

export const qualityEventsQuery = (tenantId: string, reportId: string) =>
  queryOptions({
    queryKey: [...qualityKey(tenantId), 'history', reportId],
    queryFn: () => listQualityEvents(tenantId, reportId),
  })
