import { createFileRoute } from '@tanstack/react-router'

import { ContractsPage } from '@/features/contracts'

export const Route = createFileRoute('/contratos/')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'trabajos' } =>
    search.tab === 'trabajos' ? { tab: 'trabajos' } : {},
  component: ContractsPage,
})
