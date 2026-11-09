import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { PersonalizationPage } from '@/features/personalization'

export const Route = createFileRoute('/personalizar')({
  beforeLoad: requirePermission('settings:write'),
  component: PersonalizationPage,
})
