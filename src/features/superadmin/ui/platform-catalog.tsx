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
import { PlatformField } from './platform-form-field'
import { PlatformMessage } from './platform-ui'

export function PlatformCatalog() {
  const catalog = useQuery({ ...billingCatalogQuery, refetchOnWindowFocus: false })
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
          title="No se pudo cargar el catálogo actualizado."
          onRetry={() => void catalog.refetch()}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Importes sin IVA. La tarifa anual equivale a 10 mensualidades.
        </p>
        {!catalog.isError ? (
          <Button
            variant="outline"
            size="sm"
            isDisabled={catalog.isFetching}
            onPress={() => void catalog.refetch()}
          >
            {catalog.isFetching ? 'Actualizando…' : 'Recargar catálogo'}
          </Button>
        ) : null}
      </div>
      {!catalog.isPending && !catalog.isError && !rates.length ? (
        <PlatformMessage title="No hay planes en el catálogo." />
      ) : null}
      {!catalog.isError && rates.some((rate) => !rate.plan_info) ? (
        <p role="alert">Hay planes sin datos comerciales. Recarga el catálogo antes de editar.</p>
      ) : null}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {planIds.map((id) => {
          const planRates = rates.filter((rate) => rate.plan === id)
          const display = planRates[0]?.plan_info
          return display ? (
            <CatalogPlanForm
              key={id}
              rates={planRates}
              display={display}
              unavailable={catalog.isError}
            />
          ) : null
        })}
      </div>
    </PageStack>
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
        {display.name}
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
          <FormFeedback state={{ status: 'success', message: 'Plan publicado.' }} />
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
