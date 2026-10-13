import { createFileRoute, redirect } from '@tanstack/react-router'

import { NewPasswordPage, sessionQuery } from '@/features/auth'

export const Route = createFileRoute('/nueva-contrasena')({
  validateSearch: (search: Record<string, unknown>): { invitacion?: boolean } =>
    search.invitacion === true || search.invitacion === 'true' ? { invitacion: true } : {},
  // Needs the session created by /confirmar; without it there is nothing to change.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) throw redirect({ to: '/entrar', replace: true })
  },
  component: function NuevaContrasena() {
    const { invitacion } = Route.useSearch()
    return <NewPasswordPage invite={invitacion === true} />
  },
})
