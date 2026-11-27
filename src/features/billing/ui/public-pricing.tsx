import { ArrowRight, Check, Minus, Plus } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { coreFeatures, moduleCatalogQuery, modules } from '@/features/product-modules'
import { FlowBrand, FlowIllustration } from '@/shared/ui/public-flow'

import { billingCatalogQuery } from '../application/billing-actions'
import {
  catalogQuote,
  formatEuros,
  MAX_SCALE_PLAN_MEMBERS,
  smallestRateFor,
  type Interval,
} from '../domain/plans'
import { CustomPlanCard } from './custom-plan-card'

function PricingAction({ viewer }: { viewer: 'guest' | 'admin' | 'worker' }) {
  const icon = <ArrowRight size={17} aria-hidden="true" />
  if (viewer === 'guest')
    return (
      <Link to="/registro" className="flow-link flow-link--primary w-full">
        Crear mi cuenta {icon}
      </Link>
    )
  if (viewer === 'admin')
    return (
      <Link to="/ajustes" search={{ tab: 'plan' }} className="flow-link flow-link--primary w-full">
        Plan y facturación {icon}
      </Link>
    )
  return (
    <Link to="/" className="flow-link flow-link--primary w-full">
      Volver a Menos Líos {icon}
    </Link>
  )
}

export function PublicPricing({ viewer }: { viewer: 'guest' | 'admin' | 'worker' }) {
  const rates = useQuery({ ...billingCatalogQuery, refetchOnMount: 'always' })
  const addons = useQuery(moduleCatalogQuery)
  const [period, setPeriod] = useState<Interval>('year')
  const [seatsText, setSeats] = useState('1')
  const seats = Number(seatsText)
  const valid = Number.isInteger(seats) && seats >= 1
  const standard = rates.data?.filter((rate) => rate.plan === 'standard') ?? []
  const base = standard[0]
  const rate = valid && seats <= MAX_SCALE_PLAN_MEMBERS ? smallestRateFor(standard, seats) : null
  const quote = rate ? catalogQuote(rate, period) : null
  const saving = base ? base.monthly_cents * 12 - base.yearly_cents : 0
  const hasTwoMonths = Boolean(base && base.monthly_cents > 0 && saving === base.monthly_cents * 2)
  const unit = period === 'year' ? 'año' : 'mes'
  const adjustSeats = (by: number) =>
    setSeats(String(Math.max(1, Math.min(MAX_SCALE_PLAN_MEMBERS, (valid ? seats : 1) + by))))

  return (
    <main className="public-flow">
      <div className="flow-wrap">
        <header className="flow-top">
          <FlowBrand />
          {viewer === 'guest' ? (
            <Link to="/entrar" className="flow-link">
              Ya tengo cuenta
            </Link>
          ) : (
            <Link to="/" className="flow-link">
              Volver a la app
            </Link>
          )}
        </header>
        <div className="grid items-start gap-5 pt-2 pb-7 lg:grid-cols-[1fr_0.91fr] lg:gap-8 lg:pt-7 lg:pb-12">
          <section className="flow-enter space-y-3 lg:space-y-5">
            <p className="flow-kicker">Planes y precios</p>
            <h1 className="max-w-[13ch] text-[clamp(2rem,6.5vw,4.25rem)] leading-[1.04] font-extrabold tracking-[-0.055em]">
              Tu trabajo, en un solo sitio.
            </h1>
            <p className="flow-muted max-w-[43ch] text-sm leading-relaxed sm:text-base">
              Presupuesta, organiza los trabajos y factura. Empieza con una persona y añade lo que
              necesites.
            </p>
            <div className="flow-hero-art hidden max-w-lg lg:block">
              <FlowIllustration />
            </div>
          </section>
          <section
            className="flow-panel flow-enter relative min-w-0 space-y-4 p-4 sm:p-6"
            aria-labelledby="price-heading"
          >
            <div>
              <p className="flow-kicker">Tu presupuesto</p>
              <h2 id="price-heading" className="mt-1 text-xl font-bold sm:text-2xl">
                Configura tu plan
              </h2>
            </div>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-2 text-sm font-bold">¿Cómo quieres pagar?</legend>
              {(['month', 'year'] as const).map((value) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#dae5d3] bg-white px-3 py-2 text-sm font-bold has-checked:border-[#547751] has-checked:bg-[#edf5e5]"
                >
                  <input
                    name="pricing-period"
                    type="radio"
                    value={value}
                    checked={period === value}
                    onChange={() => setPeriod(value)}
                    className="size-4 shrink-0 accent-[#2a4928]"
                  />
                  {value === 'month' ? 'Mensual' : 'Anual'}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="pricing-seats" className="text-sm font-bold">
                Personas con acceso
              </label>
              <div className="flex items-center gap-1 rounded-xl border border-[#dae5d3] p-1">
                <button
                  type="button"
                  aria-label="Quitar una plaza"
                  disabled={!valid || seats <= 1}
                  onClick={() => adjustSeats(-1)}
                  className="grid size-10 place-items-center rounded-lg bg-[#edf5e5] disabled:opacity-40"
                >
                  <Minus size={16} />
                </button>
                <input
                  id="pricing-seats"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={seatsText}
                  onChange={(event) => setSeats(event.currentTarget.value)}
                  className="w-14 [appearance:textfield] rounded-md py-2 text-center text-sm font-bold [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Añadir una plaza"
                  disabled={valid && seats >= MAX_SCALE_PLAN_MEMBERS}
                  onClick={() => adjustSeats(1)}
                  className="grid size-10 place-items-center rounded-lg bg-[#edf5e5] disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            {rates.isPending ? (
              <output className="flow-muted text-sm">Cargando precios…</output>
            ) : null}
            {rates.isError ? (
              <div role="alert" className="space-y-2">
                <p>No se pudieron cargar los precios.</p>
                <button className="flow-link" type="button" onClick={() => void rates.refetch()}>
                  Reintentar
                </button>
              </div>
            ) : null}
            {rates.isSuccess && valid && seats > MAX_SCALE_PLAN_MEMBERS ? <CustomPlanCard /> : null}
            {rates.isSuccess && !base ? (
              <p role="alert" className="flow-muted text-sm">
                La tarifa por persona no está disponible ahora.
              </p>
            ) : null}
            {!valid ? (
              <output className="flow-muted block text-sm">Indica al menos una persona.</output>
            ) : null}
            {quote && !rates.isError ? (
              <div className="rounded-xl bg-[#edf5e5] px-4 py-3" aria-live="polite">
                <p className="text-xs font-bold tracking-wide uppercase">Cuota estimada</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <strong className="text-4xl leading-tight font-extrabold tracking-[-0.045em] tabular-nums">
                    {formatEuros(quote.net_cents / 100)}
                  </strong>
                  <span className="flow-muted text-sm">/ {unit} · sin IVA</span>
                </p>
                <p className="flow-muted mt-1 text-xs leading-relaxed">
                  {period === 'year'
                    ? `Un cobro al año · Equivale a ${formatEuros(quote.net_cents / 1200)}/mes.`
                    : 'Un cobro al mes.'}
                  {period === 'year' && saving > 0
                    ? ` ${hasTwoMonths ? 'Dos meses de ahorro en la cuota base.' : `Ahorras ${formatEuros(saving / 100)} al año en la cuota base.`}`
                    : null}
                </p>
                <p className="flow-muted mt-1 text-xs">
                  1 plaza incluida
                  {seats > 1 ? ` + ${seats - 1} ${seats === 2 ? 'extra' : 'extras'}` : ''}. Los
                  módulos son opcionales.
                </p>
              </div>
            ) : null}
            <PricingAction viewer={viewer} />
            <p className="flow-muted text-center text-xs">
              Consulta el total con impuestos antes de confirmar.
            </p>
          </section>
        </div>
        <div className="flow-hero-art mb-6 lg:hidden">
          <FlowIllustration />
        </div>
        <section className="flow-panel mb-5 space-y-4 p-4 sm:p-6" aria-labelledby="base-features">
          <h2 id="base-features" className="text-lg font-bold">
            Lo esencial, ya incluido
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-[#467040]" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <details className="border-t border-[#dae5d3] pt-3">
            <summary className="cursor-pointer text-sm font-bold">Ver módulos opcionales</summary>
            {addons.isPending ? (
              <output className="flow-muted mt-2 text-sm">Cargando módulos…</output>
            ) : null}
            {addons.isError ? (
              <div role="alert" className="mt-2 space-y-2 text-sm">
                <p>No se pudieron cargar los módulos.</p>
                <button type="button" className="flow-link" onClick={() => void addons.refetch()}>
                  Reintentar
                </button>
              </div>
            ) : null}
            <ul className="grid gap-3 pt-3 sm:grid-cols-2">
              {addons.data?.map((addon) => (
                <li key={addon.code} className="rounded-xl bg-[#f4f7ef] p-3 text-sm">
                  <strong>{modules[addon.code].name}</strong>
                  <p className="flow-muted mt-1">
                    +
                    {formatEuros(
                      (period === 'year' ? addon.yearly_cents : addon.monthly_cents) / 100,
                    )}{' '}
                    / {unit} · {addon.code === 'ai' ? 'por usuario' : 'por empresa'} · sin IVA
                  </p>
                </li>
              ))}
            </ul>
          </details>
          <details className="border-t border-[#dae5d3] pt-3">
            <summary className="cursor-pointer text-sm font-bold">
              ¿Cuándo se renueva? ¿Y si quiero cancelar?
            </summary>
            <p className="flow-muted mt-2 max-w-prose text-sm">
              El plan se renueva al acabar cada periodo. Puedes desactivar la renovación y seguir
              usando el servicio hasta el final del periodo pagado.
            </p>
          </details>
        </section>
        <footer className="flow-muted pb-6 text-xs">Menos Líos · Un producto de Doscientos</footer>
      </div>
    </main>
  )
}
