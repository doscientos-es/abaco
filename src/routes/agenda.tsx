import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { AgendaPage } from '@/features/visits'
import { validateAgendaSearch } from '@/features/visits/ui/agenda-search'

export const Route = createFileRoute('/agenda')({
  beforeLoad: requirePermission('visits:read'),
  validateSearch: validateAgendaSearch,
  component: AgendaPage,
})
