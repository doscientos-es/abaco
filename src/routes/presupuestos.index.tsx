import { createFileRoute } from '@tanstack/react-router'

import { EstimateListPage } from '@/features/estimates'
import { validateEstimateFollowUpSearch } from '@/features/estimates/domain/estimate-follow-up'

export const Route = createFileRoute('/presupuestos/')({
  validateSearch: validateEstimateFollowUpSearch,
  component: EstimateListPage,
})
