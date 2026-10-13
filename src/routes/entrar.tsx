import { createFileRoute } from '@tanstack/react-router'

import { LoginPage } from '@/features/auth'

export const Route = createFileRoute('/entrar')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: function Entrar() {
    const { redirect } = Route.useSearch()
    return <LoginPage redirect={redirect} />
  },
})
