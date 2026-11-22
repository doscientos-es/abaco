import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { TRIAL_DAYS } from '@/features/billing/domain/plans'
import { fieldIcons } from '@/shared/ui/field-icons'
import { PasswordField, TextField } from '@/shared/ui/form'

import { sessionQuery, signUp } from '../application/auth-actions'
import { firstError, passwordRules, signupSchema, signupStepError } from '../domain/credentials'
import { referralCodeFromSearch } from '../domain/referral-link'
import { AuthLayout, FormError } from './auth-layout'

const toLogin = (
  <Link to="/entrar" className="hover:text-foreground underline">
    Volver a entrar
  </Link>
)

const steps = [
  {
    title: 'Empecemos por ti',
    description: '¿Cómo te llamas?',
  },
  {
    title: 'Cuéntanos sobre tu empresa',
    description: 'Podrás completar los demás datos más adelante.',
  },
  {
    title: 'Crea tu acceso',
    description: 'Usarás estos datos para entrar en Ábaco.',
  },
] as const

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
  const [step, setStep] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [step])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const values = { fullName, companyName, email, password }
    const current = steps[step]
    if (!current || busy) return
    const stepError = signupStepError(step, values)
    if (stepError) return setError(stepError)
    if (step < steps.length - 1) {
      setError(null)
      setStep(step + 1)
      return
    }
    const parsed = signupSchema.safeParse(values)
    if (!parsed.success) return setError(firstError(parsed.error))
    setBusy(true)
    setError(null)
    const referralCode =
      typeof window === 'undefined' ? null : referralCodeFromSearch(window.location.search)
    const result = await signUp({ ...parsed.data, ...(referralCode ? { referralCode } : {}) })
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
      title={steps[step]?.title ?? 'Crea tu cuenta'}
      description={steps[step]?.description}
      footer={toLogin}
    >
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Paso {step + 1} de {steps.length}
        </p>
        <progress
          className="h-1.5 w-full"
          value={step + 1}
          max={steps.length}
          aria-label="Progreso del registro"
        />
      </div>
      <form ref={formRef} onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
        {step === 0 ? (
          <TextField
            label="Tu nombre"
            name="name"
            autoComplete="name"
            placeholder="Nombre y apellidos"
            maxLength={120}
            minLength={2}
            value={fullName}
            onChange={setFullName}
          />
        ) : null}
        {step === 1 ? (
          <TextField
            label="Nombre de la empresa"
            maxLength={120}
            minLength={1}
            placeholder="Ej. Instalaciones García"
            value={companyName}
            onChange={setCompanyName}
          />
        ) : null}
        {step === 2 ? (
          <>
            <TextField
              label="Correo"
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              placeholder="nombre@empresa.es"
              icon={fieldIcons.mail}
              value={email}
              onChange={setEmail}
            />
            <PasswordField
              label="Contraseña"
              name="password"
              autoComplete="new-password"
              placeholder="Elige una contraseña"
              helper={passwordRules}
              value={password}
              onChange={setPassword}
            />
          </>
        ) : null}
        <FormError message={error} />
        <Button type="submit" className="w-full" isDisabled={busy}>
          {busy ? 'Creando cuenta…' : step === steps.length - 1 ? 'Crear cuenta' : 'Continuar'}
        </Button>
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            isDisabled={busy}
            onPress={() => {
              setError(null)
              setStep(step - 1)
            }}
          >
            Volver
          </Button>
        ) : null}
      </form>
      <p className="text-muted-foreground text-xs">
        {TRIAL_DAYS} días de prueba sin tarjeta.{' '}
        <Link to="/precios" className="font-medium underline">
          Ver precios
        </Link>
        .
      </p>
    </AuthLayout>
  )
}
