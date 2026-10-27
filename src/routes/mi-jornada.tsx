import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { MyDayPage } from '@/features/visits'

export const Route = createFileRoute('/mi-jornada')({
  beforeLoad: requirePermission('visits:assigned'),
  component: MyDayPage,
})
