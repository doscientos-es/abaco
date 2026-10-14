import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { SettingsPage } from '@/features/settings'

const tabs = ['empresa', 'marca', 'equipo', 'plan'] as const

export const Route = createFileRoute('/ajustes')({
  beforeLoad: requirePermission('settings:write'),
  // `pago` lo añade Redsys al volver: lleva directo a la pestaña del plan.
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof tabs)[number]; pago?: string } => {
    const pago = typeof search.pago === 'string' ? search.pago : undefined
    const tab = tabs.find((t) => t === search.tab) ?? (pago ? 'plan' : undefined)
    return { ...(tab ? { tab } : {}), ...(pago ? { pago } : {}) }
  },
  component: SettingsPage,
})
