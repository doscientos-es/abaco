import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { confirmEmailLink, isConfirmType, sessionQuery } from '../application/auth-actions'
import { AuthLayout, FormError } from './auth-layout'

/**
 * Landing page for links in emails. The token is only spent when the person presses the button,
 * so email scanners that open links in advance can't burn it.
 */
export function ConfirmPage({ tokenHash, type }: { tokenHash: string | undefined; type: string | undefined }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!tokenHash || !type || !isConfirmType(type)) {
    return (
      <AuthLayout
        title="Enlace no válido"
        description="Este enlace está incompleto. Pide uno nuevo."
        footer={<Link to="/entrar" className="hover:text-foreground underline">Ir a entrar</Link>}
      >
        {null}
      </AuthLayout>
    )
  }

  const needsPassword = type === 'recovery' || type === 'invite'

  async function confirm() {
    if (!tokenHash || !type || !isConfirmType(type)) return
    setBusy(true)
    setError(null)
    const result = await confirmEmailLink(tokenHash, type)
    if (!result.ok) {
      setBusy(false)
      return setError(result.message)
    }
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    await navigate(needsPassword ? { to: '/nueva-contrasena', search: { invitacion: type === 'invite' } } : { to: '/' })
  }

  const copy = {
    recovery: { title: 'Restablecer contraseña', text: 'Pulsa para elegir una nueva contraseña.', cta: 'Continuar' },
    invite: { title: 'Te han invitado', text: 'Pulsa para aceptar la invitación y crear tu contraseña.', cta: 'Aceptar invitación' },
  }[type as 'recovery' | 'invite'] ?? { title: 'Confirmar', text: 'Pulsa para confirmar.', cta: 'Confirmar' }

  return (
    <AuthLayout title={copy.title} description={copy.text}>
      <FormError message={error} />
      <Button className="w-full" isDisabled={busy} onPress={() => void confirm()}>
        {busy ? 'Comprobando…' : copy.cta}
      </Button>
    </AuthLayout>
  )
}
