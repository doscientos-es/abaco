import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { FormError, useCompanyActions, useSession, useSignOut } from '@/features/auth'
import {
  billingCatalogQuery,
  billingProfileQuery,
  formatEuros,
  MAX_SCALE_PLAN_MEMBERS,
  startOnboardingCheckout,
  submitToRedsys,
  SubscriptionBillingProfileForm,
  tenantAccessQuery,
  type Interval,
} from '@/features/billing'
import { moduleCatalogQuery, modules } from '@/features/product-modules'

import { companyOnboardingQuery } from '../application/company-onboarding'
import { offerModules, onboardingOffer, publicBookingUrl, type OfferModule } from '../domain/offer'
import { ModuleCards } from './module-cards'

const steps = ['Módulos', 'Licencias', 'Suscripción', 'Puesta en marcha']
const bookingUrl = publicBookingUrl(
  import.meta.env.VITE_MENOSLIOS_ONBOARDING_BOOKING_URL,
  import.meta.env.VITE_ABACO_ONBOARDING_BOOKING_URL,
)

export function WelcomePage() {
  const session = useSession()
  if (!session?.tenantId) return null
  return <CompanyWelcome key={session.tenantId} tenantId={session.tenantId} email={session.email} />
}

function CompanyWelcome({ tenantId, email }: { tenantId: string; email: string }) {
  const session = useSession()
  const companyActions = useCompanyActions()
  const signOut = useSignOut()
  const otherCompanies = session?.companies?.filter((company) => company.id !== tenantId) ?? []
  const status = useQuery({
    ...companyOnboardingQuery(tenantId),
    refetchInterval: (query) =>
      ['booking', 'pending'].includes(query.state.data?.stage ?? '') ? 4000 : false,
  })
  const cache = useQueryClient()
  const router = useRouter()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const stage = status.data?.stage
  const activeStep =
    stage === 'booking' || stage === 'complete'
      ? 3
      : stage === 'pending' || stage === 'billing_issue'
        ? 2
        : step

  useEffect(() => {
    if (stage !== 'complete') return
    void (async () => {
      await cache.invalidateQueries({ queryKey: tenantAccessQuery(tenantId).queryKey })
      await router.invalidate()
      await navigate({ to: '/', replace: true })
    })()
  }, [cache, navigate, router, stage, tenantId])

  return (
    <main className="auth-bg min-h-svh px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xl font-bold tracking-tight">Menoslios</span>
            <div className="flex flex-wrap items-center gap-2">
              {otherCompanies.length ? (
                <label className="text-sm">
                  Cambiar de empresa
                  <select
                    className="border-input bg-card ml-2 rounded-lg border px-2 py-1"
                    value=""
                    onChange={(event) => {
                      const id = event.target.value
                      if (id) void companyActions.switchTo(id)
                    }}
                  >
                    <option value="">Seleccionar…</option>
                    {otherCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button variant="outline" size="sm" onPress={() => void signOut()}>
                Cerrar sesión
              </Button>
            </div>
          </div>
          <div>
            <p className="text-primary text-sm font-semibold">Tu empresa, lista para empezar</p>
            <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Configura Menoslios
            </h1>
          </div>
          <ol
            aria-label="Pasos del alta"
            className="border-border bg-card grid grid-cols-2 gap-2 rounded-2xl border p-2 text-sm sm:grid-cols-4"
          >
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === activeStep ? 'step' : undefined}
                className={`rounded-xl px-3 py-2 ${index === activeStep ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </header>
        {status.isError ? (
          <div className="bg-card border-border space-y-3 rounded-xl border p-5">
            <p role="alert">No se pudo comprobar el estado del alta.</p>
            <Button variant="outline" onPress={() => void status.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {status.isPending || stage === 'complete' ? <output>Comprobando tu acceso…</output> : null}
        {stage === 'selection' ? (
          <PlanSelection
            tenantId={tenantId}
            onStep={setStep}
            step={step}
            failed={status.data?.failed === true}
            refresh={() => void status.refetch()}
          />
        ) : null}
        {stage === 'pending' ? (
          <section className="bg-card border-border space-y-3 rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Estamos comprobando el pago</h2>
            <p>
              Esperamos la confirmación de Redsys. No vuelvas a pagar ni cierres otra operación.
              Puedes volver más tarde desde tu cuenta.
            </p>
            <Button variant="outline" onPress={() => void status.refetch()}>
              Comprobar estado
            </Button>
          </section>
        ) : null}
        {stage === 'billing_issue' ? (
          <section className="bg-card border-border space-y-3 rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Necesitamos revisar tu suscripción</h2>
            <p>
              Contacta con Menoslios para recuperar tu alta. No repitas el pago mientras se revisa.
            </p>
            <Button variant="outline" onPress={() => void status.refetch()}>
              Comprobar estado
            </Button>
          </section>
        ) : null}
        {stage === 'booking' ? (
          <BookingStep
            reference={status.data?.booking_reference ?? null}
            email={email}
            refresh={() => void status.refetch()}
          />
        ) : null}
      </div>
    </main>
  )
}

function BookingStep({
  reference,
  email,
  refresh,
}: {
  reference: string | null
  email: string
  refresh: () => void
}) {
  const url = bookingUrl && reference ? new URL(bookingUrl) : null
  url?.searchParams.set('abaco_reference', reference ?? '')
  return (
    <section className="bg-card border-border space-y-4 rounded-2xl border p-6">
      <p className="text-primary text-sm font-semibold">✓ Suscripción confirmada</p>
      <h2 className="text-xl font-semibold">Reserva tu sesión de puesta en marcha</h2>
      <p>
        Elige una hora disponible. Te ayudaremos a configurar los módulos que has contratado y a
        importar tus Excel. Tenlos a mano para la sesión; no hace falta enviarlos ahora.
      </p>
      {url ? (
        <>
          <p className="text-muted-foreground text-sm">
            Reserva con <strong>{email}</strong>. Si Cal.com no rellena la referencia de Menoslios,
            copia este código:
          </p>
          <code className="bg-muted block w-fit rounded px-2 py-1 text-xs break-all sm:text-sm">
            {reference}
          </code>
          <div className="flex flex-wrap gap-3">
            <a
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline"
            >
              Ver horas disponibles ↗
            </a>
            <Button variant="outline" onPress={refresh}>
              Comprobar mi reserva
            </Button>
          </div>
        </>
      ) : (
        <p role="alert">
          No se puede abrir la agenda con esta cuenta. Contacta con Menoslios para completar la
          reserva sin volver a pagar.
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        En cuanto se confirme la cita, tendrás acceso. No hace falta esperar a la reunión.
      </p>
    </section>
  )
}

function PlanSelection({
  tenantId,
  step,
  onStep,
  failed,
  refresh,
}: {
  tenantId: string
  step: number
  onStep: (step: number) => void
  failed: boolean
  refresh: () => void
}) {
  const rates = useQuery(billingCatalogQuery)
  const moduleRates = useQuery(moduleCatalogQuery)
  const profile = useQuery({ ...billingProfileQuery(tenantId), enabled: step === 2 })
  const [selected, setSelected] = useState<OfferModule[]>([])
  const [seats, setSeats] = useState('1')
  const [period, setPeriod] = useState<Interval>('month')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offers = offerModules.flatMap((code) => {
    const rate = moduleRates.data?.find((item) => item.code === code)
    return rate ? [{ ...rate, code }] : []
  })
  const quote = onboardingOffer(rates.data ?? [], offers, selected, Number(seats), period)
  const periodLabel = period === 'year' ? 'año' : 'mes'

  async function pay() {
    if (busy || !quote || !bookingUrl || !consent || !profile.data) return
    setBusy(true)
    setError(null)
    try {
      const result = await startOnboardingCheckout(tenantId, quote.terms, selected, bookingUrl)
      if (!result.ok) setError(result.message)
      else if (result.form) submitToRedsys(result.form)
      else if (!result.paidByBalance)
        setError('No se recibió el acceso al pago. Comprueba el estado antes de reintentar.')
      refresh()
    } catch {
      setError('No se pudo abrir el pago. Comprueba el estado antes de reintentar.')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (rates.isPending || moduleRates.isPending) return <output>Cargando el catálogo…</output>
  if (rates.isError || moduleRates.isError || offers.length !== offerModules.length)
    return (
      <div className="bg-card border-border space-y-3 rounded-xl border p-5">
        <p role="alert">No se pudo cargar la oferta completa. No se ha iniciado ningún cobro.</p>
        <Button
          variant="outline"
          onPress={() => void Promise.all([rates.refetch(), moduleRates.refetch()])}
        >
          Reintentar
        </Button>
      </div>
    )

  return (
    <div className="space-y-5">
      {failed ? (
        <output className="bg-card border-border block rounded-xl border p-4">
          El último pago no se completó. Puedes volver a elegir y reintentarlo.
        </output>
      ) : null}
      {step === 0 ? (
        <>
          <section className="bg-card border-border rounded-2xl border p-5">
            <h2 className="text-xl font-semibold">Elige cómo quieres trabajar</h2>
            <p className="text-muted-foreground mt-1">
              El plan base ya incluye clientes, catálogo, presupuestos, trabajos, mantenimientos y
              facturación. Añade solo lo que necesites.
            </p>
          </section>
          <ModuleCards
            offers={offers}
            selected={selected}
            toggle={(code) => {
              setConsent(false)
              setSelected((current) =>
                current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
              )
            }}
          />
        </>
      ) : null}
      {step === 1 ? (
        <section className="bg-card border-border space-y-4 rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">¿Cuántas personas necesitan entrar?</h2>
          <p className="text-muted-foreground">
            La primera plaza está incluida y es para ti. Cada usuario con acceso ocupa una plaza,
            incluidas las invitaciones pendientes. Las personas registradas sin acceso no ocupan
            plaza.
          </p>
          <label className="grid w-fit gap-2 font-medium">
            Licencias, incluyéndote
            <input
              className="border-input bg-background w-32 rounded-lg border px-3 py-2"
              type="number"
              min={1}
              max={MAX_SCALE_PLAN_MEMBERS}
              step={1}
              value={seats}
              onChange={(event) => {
                setSeats(event.target.value)
                setConsent(false)
              }}
            />
          </label>
          {quote ? (
            <p className="text-sm">
              Plazas adicionales: {formatEuros(quote.seatsCents / 100)}/{periodLabel}, sin IVA.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Introduce entre 1 y {MAX_SCALE_PLAN_MEMBERS} licencias.
            </p>
          )}
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 font-medium">Periodicidad de pago</legend>
            {(['month', 'year'] as const).map((value) => (
              <label
                key={value}
                className="border-border flex cursor-pointer gap-2 rounded-lg border p-3"
              >
                <input
                  type="radio"
                  className="accent-primary"
                  name="period"
                  value={value}
                  checked={period === value}
                  onChange={() => {
                    setPeriod(value)
                    setConsent(false)
                  }}
                />
                {value === 'month' ? 'Mensual' : 'Anual, en un solo cobro'}
              </label>
            ))}
          </fieldset>
        </section>
      ) : null}
      {step === 2 && quote ? (
        <section className="bg-card border-border space-y-4 rounded-2xl border p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Revisa y activa tu suscripción</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt>Plan base · 1 licencia</dt>
            <dd>{formatEuros(quote.baseCents / 100)}</dd>
            <dt>{quote.terms.seats - 1} licencias adicionales</dt>
            <dd>{formatEuros(quote.seatsCents / 100)}</dd>
            {quote.extras.map((item) =>
              item ? (
                <div key={item.code} className="contents">
                  <dt>{modules[item.code].name}</dt>
                  <dd>
                    {formatEuros(
                      (period === 'year' ? item.yearly_cents : item.monthly_cents) / 100,
                    )}
                  </dd>
                </div>
              ) : null,
            )}
            <dt>IVA ({quote.terms.vat_percent} %)</dt>
            <dd>{formatEuros((quote.terms.amount_cents - quote.terms.net_cents) / 100)}</dd>
            <dt className="border-border border-t pt-2 font-semibold">Total a pagar ahora</dt>
            <dd className="border-border border-t pt-2 font-semibold">
              {formatEuros(quote.terms.amount_cents / 100)} / {periodLabel}
            </dd>
          </dl>
          <p className="text-muted-foreground text-sm">
            La suscripción se renueva automáticamente cada {periodLabel}. Podrás desactivar la
            renovación desde el plan. Después del pago, elige hora para la puesta en marcha.
          </p>
          <SubscriptionBillingProfileForm tenantId={tenantId} />
          <label className="flex items-start gap-2 text-sm">
            <input
              className="accent-primary mt-0.5 size-4"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            Confirmo las licencias, los módulos y el pago recurrente mostrado.
          </label>
          {!bookingUrl ? (
            <p role="alert">
              La agenda de puesta en marcha no está configurada. Todavía no se puede pagar.
            </p>
          ) : null}
          <FormError message={error} />
          <Button
            isDisabled={busy || !consent || !profile.data || !bookingUrl}
            onPress={() => void pay()}
          >
            {busy ? 'Abriendo Redsys…' : 'Pagar y suscribirme con Redsys'}
          </Button>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="outline" isDisabled={busy} onPress={() => onStep(step - 1)}>
            Atrás
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">{selected.length} módulos opcionales</p>
        )}
        {step < 2 ? (
          <Button isDisabled={step === 1 && !quote} onPress={() => onStep(step + 1)}>
            {step === 0 ? 'Elegir licencias' : 'Revisar suscripción'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
