import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { SettingsPage } from '@/features/settings'

export const Route = createFileRoute('/ajustes')({
  beforeLoad: requirePermission('settings:write'),
  component: SettingsPage,
})
