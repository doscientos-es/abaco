import { Button } from '@doscientos/ui'
import { ArrowRight } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { fieldIcons } from '@/shared/ui/field-icons'
import { PasswordField, TextField } from '@/shared/ui/form'

import { sessionQuery, signIn } from '../application/auth-actions'
import { firstError, loginSchema } from '../domain/credentials'
import { FormError } from './auth-layout'
import { GoogleAuthButton } from './google-auth-button'
import { LoginLayout } from './login-layout'

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
    <LoginLayout>
      <header className="mb-8 space-y-2">
        <h1 id="login-title" className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          Bienvenido de nuevo
        </h1>
        <p className="text-sm leading-6 text-[#667468] sm:text-base">
          Accede al espacio de trabajo de tu empresa.
        </p>
      </header>
      <GoogleAuthButton redirect={redirect} />
      <div className="my-7 flex items-center gap-4 text-xs text-[#738176]">
        <span className="h-px flex-1 bg-[#dfe6dc]" />
        <span>o entra con tu correo</span>
        <span className="h-px flex-1 bg-[#dfe6dc]" />
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="login-form-fields space-y-5"
        noValidate
      >
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
        <Button type="submit" className="h-12 w-full rounded-xl" isDisabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
          {!busy ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
        </Button>
        <p className="text-center text-sm">
          <Link
            to="/recuperar"
            className="font-medium text-[#425d45] underline-offset-4 hover:underline"
          >
            ¿Has olvidado tu contraseña?
          </Link>
        </p>
      </form>
      <div className="mt-9 border-t border-[#dfe6dc] pt-6 text-sm leading-6 text-[#667468]">
        <p>
          ¿Primera vez? Si te han invitado, abre el enlace del correo para aceptar la invitación y
          crear tu contraseña.
        </p>
        <p className="mt-3">
          ¿Vas a empezar con tu empresa?{' '}
          <Link
            to="/registro"
            className="font-semibold text-[#294b32] underline-offset-4 hover:underline"
          >
            Crea una cuenta
          </Link>
          {' · '}
          <Link
            to="/precios"
            className="font-semibold text-[#294b32] underline-offset-4 hover:underline"
          >
            Ver planes y precios
          </Link>
        </p>
      </div>
    </LoginLayout>
  )
}
