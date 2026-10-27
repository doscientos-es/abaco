import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { formatEuros, planCatalog, TRIAL_DAYS } from '@/features/billing/domain/plans'
import { brand } from '@/shared/lib/brand'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField } from '@/shared/ui/form'

import { sessionQuery, signUp } from '../application/auth-actions'
import { firstError, passwordRules, signupSchema } from '../domain/credentials'
import { AuthLayout, FormError } from './auth-layout'

const toLogin = (
  <Link to="/entrar" className="hover:text-foreground underline">
    Volver a entrar
  </Link>
)

/** Self-service signup: creates the account and, once confirmed, the company. */
export function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = signupSchema.safeParse({ fullName, companyName, email, password })
    if (!parsed.success) return setError(firstError(parsed.error))
    setBusy(true)
    setError(null)
    const result = await signUp(parsed.data)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    if (result.needsConfirmation) return setSentTo(parsed.data.email)
    // Email confirmation is off: there is already a session, so go straight in.
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    await navigate({ to: '/', replace: true })
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        description={`Te hemos enviado un enlace a ${sentTo}. Púlsalo para confirmar tu cuenta y crear tu empresa.`}
        footer={toLogin}
      >
        {null}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Prueba Ábaco con tu próximo presupuesto"
      description={brand.promise}
      footer={toLogin}
    >
      <div className="text-muted-foreground space-y-2 text-sm">
        <p>{brand.audience}</p>
        <ul aria-label="Qué puedes hacer con Ábaco" className="list-disc space-y-1 pl-4">
          <li>Materiales y mano de obra en un mismo presupuesto.</li>
          <li>Aceptación o rechazo desde el enlace del cliente.</li>
          <li>Facturas y seguimiento de cobros pendientes.</li>
        </ul>
      </div>
      <div className="bg-accent text-accent-foreground mb-4 rounded-lg px-4 py-3 text-sm">
        <p className="font-medium">{TRIAL_DAYS} días gratis con el plan Empresa completo</p>
        <p className="mt-1 text-xs">
          Sin tarjeta. Todos los planes incluyen las mismas funciones; solo cambia el tamaño del
          equipo: {planCatalog.map((p) => `${p.name} ${formatEuros(p.monthly)}/mes`).join(' · ')}{' '}
          (sin IVA, y 2 meses gratis pagando al año). Si no eliges, tus datos siguen ahí en solo
          lectura.
        </p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        <TextField
          label="Tu nombre"
          placeholder="Nombre y apellidos"
          maxLength={120}
          minLength={2}
          value={fullName}
          onChange={setFullName}
        />
        <TextField
          label="Nombre de la empresa"
          maxLength={120}
          minLength={1}
          placeholder="Ej. Instalaciones García"
          value={companyName}
          onChange={setCompanyName}
        />
        <TextField
          label="Correo"
          type="email"
          maxLength={254}
          placeholder="nombre@empresa.es"
          icon={fieldIcons.mail}
          value={email}
          onChange={setEmail}
        />
        <TextField
          label="Contraseña"
          type="password"
          placeholder="Elige una contraseña"
          helper={passwordRules}
          value={password}
          onChange={setPassword}
        />
        <FormError message={error} />
        <Button type="submit" className="w-full" isDisabled={busy}>
          {busy ? 'Creando cuenta…' : `Crear cuenta y probar ${TRIAL_DAYS} días`}
        </Button>
      </form>
    </AuthLayout>
  )
}
