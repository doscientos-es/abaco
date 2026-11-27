import { Button, Input, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'

import { coreFeatures, moduleCatalogQuery, modules } from '@/features/product-modules'

import { billingCatalogQuery } from '../application/billing-actions'
import {
  catalogQuote,
  formatEuros,
  MAX_SCALE_PLAN_MEMBERS,
  planInfo,
  smallestRateFor,
  type BillingTerms,
  type FixedBillingPrice,
  type Interval,
  type PlanInfo,
} from '../domain/plans'
import { CustomPlanCard } from './custom-plan-card'
import { PlanOptionCard } from './plan-option-card'

export function PricingCatalog({
  actualMembers = 1,
  showModuleCatalog = true,
  vatPercent,
  fixedPrice,
  renderAction,
}: {
  actualMembers?: number
  showModuleCatalog?: boolean
  vatPercent?: number
  fixedPrice?: FixedBillingPrice | undefined
  renderAction?: (terms: BillingTerms, plan: PlanInfo) => ReactNode
}) {
  const catalog = useQuery({ ...billingCatalogQuery, refetchOnMount: 'always' })
  const addons = useQuery({ ...moduleCatalogQuery, enabled: showModuleCatalog })
  const headcountId = useId()
  const [selectedPeriod, setPeriod] = useState<Interval>('year')
  const period = fixedPrice?.period ?? selectedPeriod
  const [headcount, setHeadcount] = useState<string>()
  const requested = Number(headcount ?? actualMembers)
  const members = Math.max(actualMembers, Number.isInteger(requested) ? requested : actualMembers)

  if (catalog.isPending) return <output>Cargando precios…</output>
  if (catalog.isError)
    return (
      <div role="alert" className="space-y-2">
        <p>No se pudieron cargar los precios.</p>
        <Button variant="outline" onPress={() => void catalog.refetch()}>
          Reintentar
        </Button>
      </div>
    )

  const standardRates = catalog.data.filter((rate) => rate.plan === 'standard')
  const rate = smallestRateFor(standardRates, members)
  const plan = planInfo('standard', standardRates)
  const terms = rate ? catalogQuote(rate, period, vatPercent, fixedPrice?.netCents) : null

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Una cuota base con una persona incluida, más un importe por cada plaza adicional. Los
        módulos opcionales se cobran por empresa, salvo el asistente de IA, que va por usuario.
      </p>
      <p className="text-muted-foreground text-sm">
        Las plazas contratadas cubren a las personas con acceso, incluida la persona administradora
        y las invitaciones pendientes. Puedes ajustar la capacidad para la siguiente renovación.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label htmlFor={headcountId} className="grid gap-1 text-sm font-medium">
          Personas con acceso
          <Input
            id={headcountId}
            className="w-36"
            type="number"
            min={actualMembers}
            step={1}
            value={headcount ?? String(actualMembers)}
            onChange={(event) => setHeadcount(event.currentTarget.value)}
          />
        </label>
        {fixedPrice ? (
          <p className="text-muted-foreground max-w-md text-sm">
            Tu precio base pactado se mantiene al cambiar de capacidad. Para cambiar el periodo de
            facturación, contacta con Menos Líos.
          </p>
        ) : (
          <Tabs
            selectedKey={period}
            onSelectionChange={(key) => setPeriod(key === 'year' ? 'year' : 'month')}
          >
            <TabsList aria-label="Periodo de pago">
              <TabsTrigger id="month">Mensual</TabsTrigger>
              <TabsTrigger id="year">Anual</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {members > MAX_SCALE_PLAN_MEMBERS ? (
        <CustomPlanCard />
      ) : rate && plan && terms ? (
        <PlanOptionCard
          plan={plan}
          rate={rate}
          terms={terms}
          recommended
          fixedPrice={Boolean(fixedPrice)}
        >
          {renderAction?.(terms, plan)}
        </PlanOptionCard>
      ) : (
        <p role="alert">La tarifa por persona todavía no está disponible.</p>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">Incluido en la cuota base</h2>
        <ul className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2">
          {coreFeatures.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
      </section>
      {showModuleCatalog ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Módulos opcionales</h2>
          {addons.isPending ? <output>Cargando módulos…</output> : null}
          {addons.isError ? (
            <p role="alert">No se pudieron consultar los módulos opcionales.</p>
          ) : null}
          {addons.data?.length ? (
            <>
              <p className="text-muted-foreground text-sm">
                Puedes contratar los módulos desde los ajustes de suscripción. El asistente de IA
                cubre una licencia individual para una persona administradora.
              </p>
              <ul className="space-y-2 text-sm">
                {addons.data.map((addon) => (
                  <li key={addon.code}>
                    <strong>{modules[addon.code].name}</strong> · +
                    {formatEuros(
                      (period === 'year' ? addon.yearly_cents : addon.monthly_cents) / 100,
                    )}{' '}
                    {period === 'year' ? 'al año' : 'al mes'}{' '}
                    {addon.code === 'ai' ? 'por usuario' : 'por empresa'}, sin IVA.
                    <p className="text-muted-foreground">{modules[addon.code].description}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
