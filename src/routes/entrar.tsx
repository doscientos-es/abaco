import { createFileRoute, useRouterState } from '@tanstack/react-router'

import { LoginPage } from '@/features/auth'
import { equipmentScanPath, tagFromFragment } from '@/features/equipment-labels'

export const Route = createFileRoute('/entrar')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: function Entrar() {
    const { redirect } = Route.useSearch()
    const fragment = useRouterState({ select: (state) => state.location.hash })
    const token = redirect === equipmentScanPath ? tagFromFragment(fragment) : null
    const target = token ? `${equipmentScanPath}#${token}` : redirect
    return <LoginPage redirect={target} />
  },
})
