import {
  Button,
  Input,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
} from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { billingCatalogQuery, type CatalogRate } from '@/features/billing'
import { centsToInput, formatEuros } from '@/shared/domain/money'

import { saveCatalogPlan } from '../application/platform-billing'
import {
  catalogFields,
  catalogMonthlyCents,
  priceField,
  readCatalogUpdate,
} from '../domain/catalog-update'
import { PlatformMessage } from './platform-ui'

export function PlatformCatalog() {
  const catalog = useQuery({ ...billingCatalogQuery, refetchOnWindowFocus: false })
  const [notice, setNotice] = useState('')
  const rates = catalog.data ?? []
  const planIds = [...new Set(rates.map((rate) => rate.plan))]

  return (
    <PageStack>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Planes y precios</PageHeaderTitle>
          <PageHeaderDescription>
            Los cambios se publican en la página de precios y se aplican a las nuevas
            contrataciones. No cambian las cuotas vigentes ni las condiciones ya pactadas.
          </PageHeaderDescription>
        </PageHeaderHeading>
        <Link to="/precios" className="text-primary text-sm font-medium underline">
          Ver precios públicos
        </Link>
      </PageHeader>
      {catalog.isPending ? <output>Cargando catálogo…</output> : null}
      {catalog.isError ? (
        <PlatformMessage
          title="No se pudo actualizar la vista del catálogo."
          onRetry={() => void catalog.refetch()}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Importes sin IVA. La tarifa anual equivale a 10 mensualidades.
        </p>
        <Button
          variant="outline"
          size="sm"
          isDisabled={catalog.isFetching}
          onPress={() => void catalog.refetch()}
        >
          Recargar catálogo
        </Button>
      </div>
      {notice ? <output className="block text-sm">{notice}</output> : null}
      {!catalog.isError && rates.some((rate) => !rate.plan_info) ? (
        <p role="alert">Hay planes sin datos comerciales. Recarga el catálogo antes de editar.</p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {planIds.map((id) => {
          const planRates = rates.filter((rate) => rate.plan === id)
          const display = planRates[0]?.plan_info
          return display ? (
            <CatalogPlanForm
              key={`${id}:${display.revision}`}
              rates={planRates}
              display={display}
              onNotice={setNotice}
            />
          ) : null
        })}
      </div>
    </PageStack>
  )
}

function CatalogPlanForm({
  rates,
  display,
  onNotice,
}: {
  rates: CatalogRate[]
  display: NonNullable<CatalogRate['plan_info']>
  onNotice: (notice: string) => void
}) {
  const client = useQueryClient()
  const [validation, setValidation] = useState('')
  const mutation = useMutation({
    mutationFn: saveCatalogPlan,
    onSuccess: (__, update) => {
      onNotice(`Se ha publicado «${update.name}».`)
      return client.invalidateQueries({ queryKey: billingCatalogQuery.queryKey })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    onNotice('')
    setValidation('')
    mutation.reset()
    try {
      mutation.mutate(readCatalogUpdate(new FormData(event.currentTarget), rates))
    } catch (error) {
      setValidation(error instanceof Error ? error.message : 'Revisa los campos del plan.')
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-border bg-card space-y-3 rounded-xl border p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold">{display.name}</h2>
      <fieldset disabled={mutation.isPending} className="space-y-3">
        {catalogFields.map(({ name, label, maxLength }) => (
          <label key={name} className="grid gap-1 text-sm font-medium">
            {label}
            <Input name={name} defaultValue={display[name]} required maxLength={maxLength} />
          </label>
        ))}
        <div className="border-border space-y-2 border-t pt-3">
          {rates.map((rate) => (
            <RateField key={rate.seats} rate={rate} />
          ))}
        </div>
        {validation || mutation.error ? (
          <p role="alert" className="text-sm">
            {validation || mutation.error?.message}
          </p>
        ) : null}
        <Button
          type="submit"
          isDisabled={mutation.isPending}
          aria-label={`Guardar ${display.name}`}
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar plan'}
        </Button>
      </fieldset>
    </form>
  )
}

function RateField({ rate }: { rate: CatalogRate }) {
  const [value, setValue] = useState(() => centsToInput(rate.monthly_cents))
  const cents = catalogMonthlyCents(value)
  const id = `catalog-${rate.plan}-${rate.seats}-year`
  return (
    <label className="flex flex-wrap items-end gap-2 text-sm font-medium">
      <span className="grid gap-1">
        {rate.seats === 1 ? '1 persona' : `Hasta ${rate.seats} personas`} · €/mes
        <Input
          name={priceField(rate.seats)}
          inputMode="decimal"
          required
          maxLength={8}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          aria-describedby={id}
        />
      </span>
      <span id={id} className="text-muted-foreground pb-2 text-sm">
        {cents === null ? '—' : `${formatEuros(cents * 10)} al año`}
      </span>
    </label>
  )
}
