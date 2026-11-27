import { Button } from '@doscientos/ui'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { fieldIcons } from '@/shared/ui/field-icons'
import { PasswordField, TextField } from '@/shared/ui/form'
import { FlowBrand, FlowIllustration, FlowProgress } from '@/shared/ui/public-flow'

import { sessionQuery, signUp } from '../application/auth-actions'
import { clearReferral, rememberReferral } from '../application/referral-actions'
import { firstError, passwordRules, signupSchema, signupStepError } from '../domain/credentials'
import { AuthLayout, FormError } from './auth-layout'
import { GoogleAuthButton } from './google-auth-button'

const toLogin = (
  <Link to="/entrar" className="hover:text-foreground underline">
    Volver a entrar
  </Link>
)

const steps = [
  {
    title: 'Empecemos por ti',
    description: 'Tu nombre será visible para tu equipo.',
  },
  {
    title: '¿Cómo se llama tu empresa?',
    description: 'Ponle nombre a tu espacio de trabajo. Podrás completar los datos después.',
  },
  {
    title: 'Crea tu acceso',
    description: 'Entra con Google o usa tu correo profesional.',
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
  const [invitation] = useState(() =>
    typeof window === 'undefined' ? null : rememberReferral(window.location.search),
  )
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(step)

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
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
      typeof window === 'undefined' ? null : rememberReferral(window.location.search)
    const result = await signUp({ ...parsed.data, ...(referralCode ? { referralCode } : {}) })
    setBusy(false)
    if (!result.ok) return setError(result.message)
    clearReferral()
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
    <main className="public-flow">
      <div className="flow-wrap">
        <header className="flow-top">
          <FlowBrand />
          <Link to="/entrar" className="flow-link">
            Ya tengo cuenta
          </Link>
        </header>
        <div className="mx-auto grid max-w-5xl items-center gap-6 pt-4 pb-8 lg:grid-cols-[1fr_1fr] lg:gap-10 lg:pt-9">
          <aside className="hidden space-y-5 lg:block">
            <p className="flow-kicker">Tu nuevo espacio de trabajo</p>
            <p className="max-w-[12ch] text-5xl leading-[1.06] font-extrabold tracking-[-0.055em]">
              Del presupuesto al cobro, sin líos.
            </p>
            <div className="flow-hero-art">
              <FlowIllustration variant="start" />
            </div>
          </aside>
          <section
            className="flow-panel min-w-0 space-y-6 p-4 sm:p-7"
            aria-labelledby="register-heading"
          >
            <FlowProgress
              labels={['Sobre ti', 'Tu empresa', 'Acceso']}
              step={step}
              name="Progreso del registro"
            />
            <div key={step} className="flow-enter space-y-4">
              <header className="space-y-1">
                <h1
                  id="register-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl"
                >
                  {steps[step]?.title ?? 'Crea tu cuenta'}
                </h1>
                <p className="flow-muted text-sm">{steps[step]?.description}</p>
              </header>
              {step === 0 ? (
                <div className="flow-hero-art max-w-60 lg:hidden">
                  <FlowIllustration variant="start" />
                </div>
              ) : null}
              {invitation ? (
                <p className="rounded-xl bg-[#edf5e5] p-3 text-sm">
                  Enlace de invitación detectado. Lo comprobaremos al crear tu empresa.
                </p>
              ) : null}
              {step === 2 ? (
                <GoogleAuthButton signup={{ fullName, companyName, referralCode: invitation }} />
              ) : null}
              <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
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
                    autoComplete="organization"
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
                <div className="flex items-center gap-2">
                  {step > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12"
                      isDisabled={busy}
                      onPress={() => {
                        setError(null)
                        setStep(step - 1)
                      }}
                    >
                      <ArrowLeft size={16} aria-hidden="true" /> Volver
                    </Button>
                  ) : null}
                  <Button type="submit" className="min-h-12 flex-1 font-bold" isDisabled={busy}>
                    {busy
                      ? 'Creando cuenta…'
                      : step === steps.length - 1
                        ? 'Crear cuenta'
                        : 'Continuar'}
                    {!busy ? <ArrowRight size={16} aria-hidden="true" /> : null}
                  </Button>
                </div>
              </form>
            </div>
            <footer className="flow-muted flex flex-wrap items-center justify-between gap-x-3 border-t border-[#dae5d3] pt-3 text-xs">
              <p>Configurarás la suscripción después.</p>
              <Link to="/precios" className="flow-link flow-link--plain">
                Ver precios <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </section>
        </div>
      </div>
    </main>
  )
}
