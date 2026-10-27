import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { AgendaPage } from '@/features/visits'

export const Route = createFileRoute('/agenda')({
  beforeLoad: requirePermission('visits:read'),
  component: AgendaPage,
})
