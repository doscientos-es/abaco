import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { PersonalizationPage } from '@/features/personalization'

export const Route = createFileRoute('/personalizar')({
  beforeLoad: requirePermission('settings:write'),
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: 'marca' | 'documentos' | 'listas' } => {
    const tab = search.tab
    return tab === 'marca' || tab === 'documentos' || tab === 'listas' ? { tab } : {}
  },
  component: PersonalizationPage,
})
