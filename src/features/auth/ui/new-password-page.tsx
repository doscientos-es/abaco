import { Button } from '@doscientos/ui'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { TextField } from '@/shared/ui/form'

import { updatePassword, useSession } from '../application/auth-actions'
import { firstError, newPasswordSchema, passwordRules } from '../domain/credentials'
import { AuthLayout, FormError } from './auth-layout'

/** Reached after /confirmar (recovery or invite): the user already has a session, now picks a password. */
export function NewPasswordPage({ invite }: { invite: boolean }) {
  const navigate = useNavigate()
  const session = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = newPasswordSchema.safeParse({ password, confirm })
    if (!parsed.success) return setError(firstError(parsed.error))
    setBusy(true)
    setError(null)
    const result = await updatePassword(parsed.data.password)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    await navigate({ to: '/' })
  }

  return (
    <AuthLayout
      title={invite ? 'Crea tu contraseña' : 'Elige una nueva contraseña'}
      description={session ? `Cuenta: ${session.email}` : undefined}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <TextField
          label="Contraseña"
          type="password"
          placeholder="Nueva contraseña"
          helper={passwordRules}
          value={password}
          onChange={setPassword}
        />
        <TextField
          label="Repite la contraseña"
          type="password"
          placeholder="Repítela"
          value={confirm}
          onChange={setConfirm}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" isDisabled={busy}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthLayout>
  )
}
