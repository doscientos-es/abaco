import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { brand } from '@/shared/lib/brand'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField } from '@/shared/ui/form'

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
    const result = await signIn(parsed.data.email, parsed.data.password)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    // The cached "no session" is still fresh; without this the root guard bounces us back to /entrar.
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    // Only same-site paths are honoured, so the link can't send people elsewhere.
    const target = redirect?.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\') ? redirect : '/'
    await navigate({ href: target })
  }

  return (
    <AuthLayout
      title="Entrar"
      description="Accede con tu correo y contraseña."
      footer={
        <span>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/registro" className="hover:text-foreground underline">
            Crea la de tu empresa
          </Link>
          . Si tu empresa ya usa {brand.name}, pide una invitación.
        </span>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <TextField
          label="Correo"
          type="email"
          placeholder="nombre@empresa.es"
          icon={fieldIcons.mail}
          value={email}
          onChange={setEmail}
        />
        <TextField
          label="Contraseña"
          type="password"
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
