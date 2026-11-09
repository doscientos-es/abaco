import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { fieldIcons } from '@/shared/ui/field-icons'
import { PasswordField, TextField } from '@/shared/ui/form'

import { sessionQuery, signIn } from '../application/auth-actions'
import { firstError, loginSchema } from '../domain/credentials'
import { AuthLayout, FormError } from './auth-layout'

export function LoginPage({ redirect }: { redirect?: string | undefined }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) return setError(firstError(parsed.error))
    setBusy(true)
    setError(null)
    try {
      const result = await signIn(parsed.data.email, parsed.data.password)
      if (!result.ok) return setError(result.message)
      // Mark the cached "no session" stale so the root guard reloads it before redirecting.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
      // Only same-site paths are honoured, so the link can't send people elsewhere.
      const target =
        redirect?.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\')
          ? redirect
          : '/'
      await navigate({ href: target })
    } catch {
      setError('No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      description="Accede al espacio de trabajo de tu empresa."
      footer={
        <span>
          ¿Primera vez? Si te han invitado, abre el enlace del correo para aceptar la invitación y
          crear tu contraseña. ¿Vas a empezar con tu empresa?{' '}
          <Link to="/registro" className="hover:text-foreground underline">
            Crea una cuenta
          </Link>
          .
        </span>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <TextField
          label="Correo"
          type="email"
          name="username"
          autoComplete="username"
          maxLength={254}
          placeholder="nombre@empresa.es"
          icon={fieldIcons.mail}
          value={email}
          onChange={setEmail}
        />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          maxLength={256}
          placeholder="Tu contraseña"
          value={password}
          onChange={setPassword}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" isDisabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/recuperar" className="text-muted-foreground hover:text-foreground underline">
            He olvidado mi contraseña
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
