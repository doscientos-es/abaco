import { Badge, Button, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { moduleCatalogQuery, modules, type ModuleRate } from '@/features/product-modules'
import { centsToInput, formatEuros, parseEuros } from '@/shared/domain/money'

import { saveModulePrice } from '../application/platform-billing'
import { PlatformField } from './platform-form-field'
import {
  PlatformFeedback,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
} from './platform-ui'

type Draft = { source: ModuleRate; monthly: string; yearly: string }

const readPrice = (value: string, max: number) => {
  const candidate = value.trim()
  const cents = /^\d{1,6}([,.]\d{1,2})?$/.test(candidate) ? parseEuros(candidate) : 0
  return cents >= 1 && cents <= max ? cents : null
}

export function PlatformModuleCatalog() {
  const query = useQuery(moduleCatalogQuery)
  return (
    <section aria-labelledby="catalog-module-prices" className="space-y-3">
      <div>
        <h2 id="catalog-module-prices" className="text-lg font-semibold">
          Módulos opcionales
        </h2>
        <p className="text-muted-foreground text-sm">
          Precios sin IVA para nuevas activaciones. No cambian los precios de módulos ya
          contratados.
        </p>
      </div>
      {query.isPending ? (
        <PlatformLoading>Cargando precios de módulos…</PlatformLoading>
      ) : query.isError ? (
        <PlatformMessage
          title="No se pudieron consultar los módulos."
          onRetry={() => void query.refetch()}
        />
      ) : query.data.length ? (
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {query.data.map((rate) => (
            <li key={rate.code}>
              <ModuleRateCard rate={rate} />
            </li>
          ))}
        </ul>
      ) : (
        <PlatformMessage title="No hay módulos disponibles en el catálogo." />
      )}
    </section>
  )
}

function ModuleRateCard({ rate }: { rate: ModuleRate }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const mutation = useMutation({
    mutationFn: saveModulePrice,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: moduleCatalogQuery.queryKey })
      setDraft(null)
    },
  })
  const info = modules[rate.code]
  const unit = rate.code === 'ai' ? 'por usuario' : 'por empresa'
  const month = draft ? readPrice(draft.monthly, 1_000_000) : null
  const year = draft ? readPrice(draft.yearly, 12_000_000) : null
  const stale =
    draft &&
    (draft.source.monthly_cents !== rate.monthly_cents ||
      draft.source.yearly_cents !== rate.yearly_cents)
  const changed = month !== rate.monthly_cents || year !== rate.yearly_cents

  return (
    <article className={`${platformPanelClass} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{info.name}</h3>
        <Badge variant="outline">{unit}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">{info.description}</p>
      {draft ? (
        <form
          aria-label={`Tarifas de ${info.name}`}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!stale && changed && month !== null && year !== null && !mutation.isPending)
              mutation.mutate({ rate: draft.source, monthlyCents: month, yearlyCents: year })
          }}
        >
          <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-2 sm:grid-cols-2">
            <PlatformField
              label="Mensual · €"
              error={month === null ? 'Importe mensual no válido.' : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  maxLength={9}
                  value={draft.monthly}
                  onChange={(event) => setDraft({ ...draft, monthly: event.currentTarget.value })}
                />
              )}
            </PlatformField>
            <PlatformField
              label="Anual · €"
              error={year === null ? 'Importe anual no válido.' : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  maxLength={9}
                  value={draft.yearly}
                  onChange={(event) => setDraft({ ...draft, yearly: event.currentTarget.value })}
                />
              )}
            </PlatformField>
          </fieldset>
          {stale ? (
            <p role="alert" className="text-sm">
              El precio cambió. Cancela y vuelve a editarlo.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              isDisabled={
                Boolean(stale) || !changed || month === null || year === null || mutation.isPending
              }
            >
              Publicar precio
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isDisabled={mutation.isPending}
              onPress={() => {
                setDraft(null)
                mutation.reset()
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <dl className="flex flex-wrap gap-x-4 text-sm tabular-nums">
            <div>
              <dt className="text-muted-foreground">Al mes</dt>
              <dd className="font-semibold">{formatEuros(rate.monthly_cents)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Al año</dt>
              <dd className="font-semibold">{formatEuros(rate.yearly_cents)}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Editar precio de ${info.name}`}
            onPress={() => {
              mutation.reset()
              setDraft({
                source: rate,
                monthly: centsToInput(rate.monthly_cents),
                yearly: centsToInput(rate.yearly_cents),
              })
            }}
          >
            Editar precio
          </Button>
        </div>
      )}
      <PlatformFeedback action={mutation} success="Precio publicado en el catálogo." />
    </article>
  )
}
