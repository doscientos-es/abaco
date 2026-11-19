import {
  Button,
  FormFeedback,
  Input,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
  Textarea,
} from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { billingCatalogQuery, type CatalogRate } from '@/features/billing'
import { centsToInput, formatEuros } from '@/shared/domain/money'

import { saveCatalogPlan } from '../application/platform-billing'
import {
  catalogFields,
  CatalogFieldError,
  catalogMonthlyCents,
  priceField,
  readCatalogUpdate,
} from '../domain/catalog-update'
import { planSearch, type PlatformSearch } from '../domain/platform-navigation'
import { PlatformField } from './platform-form-field'
import {
  PlatformBackLink,
  PlatformEditLink,
  PlatformMessage,
  PlatformRowLink,
  platformRowMetaClass,
  platformRowTitleClass,
} from './platform-ui'

export function PlatformCatalog({ search }: { search: PlatformSearch }) {
  const catalog = useQuery({ ...billingCatalogQuery, refetchOnWindowFocus: false })
  const plans = new Map<CatalogRate['plan'], CatalogRate[]>()
  for (const rate of catalog.data ?? []) {
    const group = plans.get(rate.plan)
    if (group) group.push(rate)
    else plans.set(rate.plan, [rate])
  }
  const plan = search.plan
  const selectedRates = plan ? plans.get(plan) : undefined
  const display = selectedRates?.[0]?.plan_info
  const editing = search.edicion === 'plan'

  return (
    <PageStack className="max-w-4xl">
      {plan ? (
        <PlatformBackLink search={editing ? planSearch(plan) : { vista: 'planes' }}>
          {editing ? 'Volver al plan' : 'Volver a planes y precios'}
        </PlatformBackLink>
      ) : null}
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {editing && display ? `Editar ${display.name}` : (display?.name ?? 'Planes y precios')}
          </PageHeaderTitle>
          <PageHeaderDescription>
            {plan && !editing
              ? 'Información pública y tarifas por capacidad.'
              : 'El catálogo se publica en la página de precios. Los cambios no alteran las cuotas vigentes ni los precios pactados.'}
          </PageHeaderDescription>
        </PageHeaderHeading>
        {plan ? (
          display && !editing && !catalog.isError ? (
            <PlatformEditLink search={planSearch(plan, true)}>Editar plan</PlatformEditLink>
          ) : null
        ) : (
          <Link to="/precios" className="text-primary text-sm font-medium underline">
            Ver precios públicos
          </Link>
        )}
      </PageHeader>
      {catalog.isPending ? <output>Cargando catálogo…</output> : null}
      {catalog.isError ? (
        <PlatformMessage
          title="No se pudo cargar el catálogo actualizado."
          onRetry={() => void catalog.refetch()}
        />
      ) : null}
      {editing && !catalog.isError ? (
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
            {catalog.isFetching ? 'Actualizando…' : 'Recargar catálogo'}
          </Button>
        </div>
      ) : null}
      {!catalog.isPending && !catalog.isError && plan && (!display || !selectedRates) ? (
        <PlatformMessage title="No se ha encontrado este plan en el catálogo." />
      ) : null}
      {plan && display && selectedRates ? (
        editing ? (
          <CatalogPlanForm
            key={plan}
            rates={selectedRates}
            display={display}
            unavailable={catalog.isError}
          />
        ) : (
          <CatalogPlanDetail rates={selectedRates} display={display} />
        )
      ) : null}
      {!plan && !catalog.isPending && !catalog.isError ? (
        <section
          aria-label="Catálogo de planes"
          className="border-border bg-card overflow-hidden rounded-xl border"
        >
          <div className="border-border space-y-1 border-b px-4 py-3 sm:px-5">
            <h2 className="font-semibold">Catálogo de planes</h2>
            <p className="text-muted-foreground text-sm">Precios sin IVA.</p>
          </div>
          {plans.size ? (
            <ul className="divide-border divide-y">
              {[...plans].map(([id, planRates]) => {
                const info = planRates[0]?.plan_info
                const monthly = Math.min(...planRates.map((rate) => rate.monthly_cents))
                return (
                  <li key={id}>
                    <PlatformRowLink
                      search={planSearch(id)}
                      aside={
                        <>
                          {planRates.length > 1 ? (
                            <span className={platformRowMetaClass}>Desde</span>
                          ) : null}
                          <span className="font-semibold tabular-nums">
                            {formatEuros(monthly)}/mes
                          </span>
                        </>
                      }
                    >
                      <span className={platformRowTitleClass}>{info?.name ?? id}</span>
                      <span className={platformRowMetaClass}>
                        {info?.audience ?? 'Sin datos comerciales'}
                      </span>
                    </PlatformRowLink>
                  </li>
                )
              })}
            </ul>
          ) : (
            <PlatformMessage title="No hay planes en el catálogo." />
          )}
        </section>
      ) : null}
    </PageStack>
  )
}

function CatalogPlanDetail({
  rates,
  display,
}: {
  rates: CatalogRate[]
  display: NonNullable<CatalogRate['plan_info']>
}) {
  return (
    <section
      aria-label="Detalle del plan"
      className="border-border bg-card space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h2 className="font-semibold">Información pública</h2>
        <p className="text-muted-foreground text-sm">{display.audience}</p>
        <p className="text-sm">{display.benefit}</p>
      </div>
      <div className="border-border border-t pt-4">
        <h2 className="font-semibold">Tarifas sin IVA</h2>
        <dl className="divide-border divide-y">
          {rates.map((rate) => (
            <div
              key={rate.seats}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
            >
              <dt className="font-medium">
                {rate.seats === 1 ? '1 persona' : `Hasta ${rate.seats} personas`}
              </dt>
              <dd className="flex flex-wrap gap-x-3 tabular-nums">
                <span>{formatEuros(rate.monthly_cents)}/mes</span>
                <span className="text-muted-foreground">
                  {formatEuros(rate.yearly_cents)} al año
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

type CatalogDraft = { revision: number; values: Record<string, string> }

function CatalogPlanForm({
  rates,
  display,
  unavailable,
}: {
  rates: CatalogRate[]
  display: NonNullable<CatalogRate['plan_info']>
  unavailable: boolean
}) {
  const client = useQueryClient()
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [validation, setValidation] = useState<Error | null>(null)
  const [draft, setDraft] = useState<CatalogDraft | null>(null)
  const savedValues: Record<string, string> = {
    name: display.name,
    audience: display.audience,
    benefit: display.benefit,
  }
  for (const rate of rates) savedValues[priceField(rate.seats)] = centsToInput(rate.monthly_cents)
  const values = draft?.values ?? savedValues
  const stale = draft !== null && draft.revision !== display.revision
  const fieldError = validation instanceof CatalogFieldError ? validation : null
  const mutation = useMutation({
    mutationFn: saveCatalogPlan,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: billingCatalogQuery.queryKey })
      setDraft(null)
    },
  })

  useEffect(() => {
    if (!fieldError) return
    const element = formRef.current?.elements.namedItem(fieldError.field)
    if (element instanceof HTMLElement) element.focus()
  }, [fieldError])

  function change(field: string, value: string) {
    if (fieldError?.field === field) setValidation(null)
    if (mutation.isSuccess) mutation.reset()
    const next = { ...values, [field]: value }
    setDraft(
      stale || Object.entries(savedValues).some(([name, saved]) => next[name] !== saved)
        ? { revision: draft?.revision ?? display.revision, values: next }
        : null,
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || stale || unavailable || mutation.isPending) return
    setValidation(null)
    mutation.reset()
    try {
      mutation.mutate(readCatalogUpdate(new FormData(event.currentTarget), rates))
    } catch (error) {
      setValidation(error instanceof Error ? error : new Error('Revisa los campos del plan.'))
    }
  }

  return (
    <form
      ref={formRef}
      aria-labelledby={titleId}
      noValidate
      onSubmit={submit}
      className="border-border bg-card space-y-5 rounded-xl border p-4 sm:p-5"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        Información y tarifas
      </h2>
      <fieldset disabled={mutation.isPending} className="min-w-0 space-y-3">
        <legend className="pb-2 text-sm font-semibold">Información pública</legend>
        {catalogFields.map(({ name, label, maxLength, placeholder }) => {
          const Control = name === 'name' ? Input : Textarea
          return (
            <PlatformField
              key={name}
              label={label}
              error={fieldError?.field === name ? fieldError.message : undefined}
            >
              {(control) => (
                <Control
                  {...control}
                  className={name === 'name' ? 'h-11' : 'min-h-16'}
                  name={name}
                  value={values[name] ?? ''}
                  onChange={(event) => change(name, event.currentTarget.value)}
                  placeholder={placeholder}
                  required
                  maxLength={maxLength}
                />
              )}
            </PlatformField>
          )
        })}
      </fieldset>
      <fieldset
        disabled={mutation.isPending}
        className="border-border min-w-0 space-y-3 border-t pt-3"
      >
        <legend className="pr-2 text-sm font-semibold">Precios por capacidad</legend>
        {rates.map((rate) => {
          const name = priceField(rate.seats)
          return (
            <RateField
              key={name}
              rate={rate}
              value={values[name] ?? ''}
              error={fieldError?.field === name ? fieldError.message : undefined}
              onChange={(value) => change(name, value)}
            />
          )
        })}
      </fieldset>
      <div className="border-border space-y-2 border-t pt-3">
        {stale ? (
          <p role="alert" className="text-destructive text-sm">
            El plan cambió desde que empezaste a editar. Tus cambios siguen visibles. Descártalos
            para editar la versión actual.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            isDisabled={!draft || stale || unavailable || mutation.isPending}
            aria-label={`Guardar plan: ${display.name}`}
          >
            Guardar plan
          </Button>
          {draft ? (
            <Button
              type="button"
              variant="outline"
              isDisabled={mutation.isPending}
              onPress={() => {
                setDraft(null)
                setValidation(null)
                mutation.reset()
              }}
            >
              Descartar cambios
            </Button>
          ) : null}
        </div>
        {mutation.isPending ? <FormFeedback state={{ status: 'pending' }} /> : null}
        {mutation.isSuccess ? (
          <FormFeedback
            state={{ status: 'success', message: 'Cambios publicados en la página de precios.' }}
          />
        ) : null}
        {mutation.error || (validation && !fieldError) ? (
          <FormFeedback
            className="h-auto"
            state={{
              status: 'error',
              message: (mutation.error ?? validation)?.message ?? 'No se pudo guardar el plan.',
            }}
          />
        ) : null}
      </div>
    </form>
  )
}

function RateField({
  rate,
  value,
  error,
  onChange,
}: {
  rate: CatalogRate
  value: string
  error: string | undefined
  onChange: (value: string) => void
}) {
  const cents = catalogMonthlyCents(value)
  return (
    <PlatformField
      label={`${rate.seats === 1 ? '1 persona' : `Hasta ${rate.seats} personas`} · €/mes`}
      hint={
        cents === null
          ? 'El importe anual se calcula a partir del precio mensual.'
          : `${formatEuros(cents * 10)} al año`
      }
      error={error}
    >
      {(control) => (
        <Input
          {...control}
          className="h-11"
          name={priceField(rate.seats)}
          inputMode="decimal"
          placeholder="Ej. 34,90"
          required
          maxLength={8}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </PlatformField>
  )
}
