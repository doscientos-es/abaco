import { createFileRoute } from '@tanstack/react-router'

import { ContractsPage } from '@/features/contracts'

export const Route = createFileRoute('/contratos/')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'trabajos' | 'plantillas' } =>
    search.tab === 'trabajos' || search.tab === 'plantillas' ? { tab: search.tab } : {},
  component: ContractsPage,
})
