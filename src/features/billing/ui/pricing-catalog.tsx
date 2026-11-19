import { Button, Input, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'

import { coreFeatures, moduleCatalogQuery, modules } from '@/features/product-modules'

import { billingCatalogQuery } from '../application/billing-actions'
import {
  catalogQuote,
  formatEuros,
  MAX_SCALE_PLAN_MEMBERS,
  paidPlans,
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
  const catalog = useQuery(billingCatalogQuery)
  const addons = useQuery({ ...moduleCatalogQuery, enabled: showModuleCatalog })
  const headcountId = useId()
  const [selectedPeriod, setPeriod] = useState<Interval>('month')
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

  const recommended = smallestRateFor(catalog.data, members)
  const scale = catalog.data.filter((rate) => rate.plan === 'scale')
  const scaleRate = smallestRateFor(scale, members) ?? scale.at(-1)

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Todos los planes incluyen el mismo núcleo. Elige el plan por número de personas con acceso,
        incluida quien administra.
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
            facturación, contacta con Ábaco.
          </p>
        ) : (
          <Tabs
            selectedKey={period}
            onSelectionChange={(key) => setPeriod(key === 'year' ? 'year' : 'month')}
          >
            <TabsList aria-label="Periodo de pago">
              <TabsTrigger id="month">Mensual</TabsTrigger>
              <TabsTrigger id="year">Anual · 2 meses de ahorro</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {members > MAX_SCALE_PLAN_MEMBERS ? (
        <CustomPlanCard />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {paidPlans.map((id) => {
            const rate =
              id === 'scale' ? scaleRate : catalog.data.find((option) => option.plan === id)
            const plan = planInfo(id, catalog.data)
            if (!rate || !plan) return null
            const terms = catalogQuote(rate, period, vatPercent, fixedPrice?.netCents)
            return (
              <PlanOptionCard
                key={plan.id}
                plan={plan}
                terms={terms}
                recommended={recommended === rate}
              >
                {renderAction?.(terms, plan)}
              </PlanOptionCard>
            )
          })}
        </div>
      )}
      {scale.length > 0 ? (
        <details className="border-border rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Ver todos los tramos de Escala</summary>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {scale.map((rate) => (
              <li key={rate.seats}>
                Hasta {rate.seats} personas
                {!fixedPrice ? (
                  <>
                    : {formatEuros(catalogQuote(rate, period).net_cents / 100)}{' '}
                    {period === 'year' ? 'al año' : 'al mes'}, sin IVA
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <section className="space-y-2">
        <h2 className="font-semibold">Incluido en todos los planes</h2>
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
                El precio del módulo se suma al plan base, por empresa. Puedes contratarlo desde
                Ajustes → Plan y facturación.
              </p>
              <ul className="space-y-2 text-sm">
                {addons.data.map((addon) => (
                  <li key={addon.code}>
                    <strong>{modules[addon.code].name}</strong> · +
                    {formatEuros(
                      (period === 'year' ? addon.yearly_cents : addon.monthly_cents) / 100,
                    )}{' '}
                    {period === 'year' ? 'al año' : 'al mes'}, sin IVA.
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
