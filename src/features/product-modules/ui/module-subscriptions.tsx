import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'

import {
  moduleCatalogQuery,
  moduleSubscriptionsQuery,
  scheduleModule,
  tenantModulesQuery,
} from '../application/module-queries'
import { modules, type ModuleRate } from '../domain/modules'

type Selection = { rate: ModuleRate; enabled: boolean; undo: boolean }

const price = (monthly: number, yearly: number) =>
  `+${formatEuros(monthly)}/mes o +${formatEuros(yearly)}/año, sin IVA.`

export function ModuleSubscriptions({
  tenantId,
  active,
  courtesy = false,
  blocked = false,
  onChanged,
}: {
  tenantId: string
  active: boolean
  courtesy?: boolean
  blocked?: boolean
  onChanged: () => void | Promise<unknown>
}) {
  const catalog = useQuery(moduleCatalogQuery)
  const subscriptions = useQuery(moduleSubscriptionsQuery(tenantId))
  const client = useQueryClient()
  const [selection, setSelection] = useState<Selection | null>(null)
  const change = useMutation({
    mutationFn: ({ rate, enabled }: Selection) => scheduleModule(tenantId, rate, enabled),
    onSuccess: async () => {
      setSelection(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: moduleSubscriptionsQuery(tenantId).queryKey }),
        client.invalidateQueries({ queryKey: tenantModulesQuery(tenantId).queryKey }),
        onChanged(),
      ])
    },
    onError: () => client.invalidateQueries({ queryKey: moduleCatalogQuery.queryKey }),
  })
  const timing = active ? 'en la próxima renovación' : 'al pagar la primera cuota'

  return (
    <section
      aria-label="Módulos opcionales"
      className="border-border space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">Módulos opcionales</h3>
      <p className="text-muted-foreground text-sm">
        {courtesy
          ? 'Los cambios de cortesía son inmediatos y no generan cobros.'
          : `El suplemento se añade a la cuota de la empresa. El acceso cambia ${timing}, tras confirmar el pago. No se borran datos.`}
      </p>
      {blocked ? <p role="status">Resuelve primero la cancelación o el pago pendiente.</p> : null}
      {catalog.isPending || subscriptions.isPending ? <output>Cargando módulos…</output> : null}
      {catalog.isError || subscriptions.isError ? (
        <p role="alert">No se pudieron consultar los módulos.</p>
      ) : null}
      {change.error ? <p role="alert">{change.error.message}</p> : null}
      {change.isSuccess ? (
        <p role="status">
          {courtesy ? 'Acceso actualizado.' : 'Cambio guardado. No se ha realizado ningún cobro.'}
        </p>
      ) : null}
      {catalog.data && subscriptions.data ? (
        <ul className="space-y-3">
          {catalog.data.map((rate) => {
            const item = subscriptions.data.find(({ module_code }) => module_code === rate.code)
            const enabled = item?.enabled ?? false
            const pending = item?.next_enabled ?? null
            const module = modules[rate.code]
            const action = pending !== null ? 'Deshacer cambio' : enabled ? 'Desactivar' : 'Activar'
            return (
              <li
                key={rate.code}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {module.name} · {enabled ? 'Activo' : 'Inactivo'}
                  </p>
                  <p className="text-muted-foreground">{module.description}</p>
                  {courtesy ||
                  ((enabled || pending === true) &&
                    item?.monthly_cents === 0 &&
                    item.yearly_cents === 0) ? (
                    <p>Sin suplemento.</p>
                  ) : (
                    <p>
                      {item && (enabled || pending === true)
                        ? price(item.monthly_cents, item.yearly_cents)
                        : price(rate.monthly_cents, rate.yearly_cents)}
                    </p>
                  )}
                  {pending !== null ? <p>{pending ? 'Alta' : 'Baja'} programada.</p> : null}
                </div>
                <Button
                  variant="outline"
                  aria-label={`${action}: ${module.name}`}
                  isDisabled={blocked || change.isPending || Boolean(selection)}
                  onPress={() => {
                    change.reset()
                    setSelection({
                      rate,
                      enabled: pending !== null ? enabled : !enabled,
                      undo: pending !== null,
                    })
                  }}
                >
                  {action}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {selection ? (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p>
            {selection.undo
              ? 'Deshacer el cambio de'
              : selection.enabled
                ? 'Activar'
                : 'Desactivar'}{' '}
            {modules[selection.rate.code].name}.
            {!courtesy && !selection.undo && selection.enabled
              ? ` ${price(selection.rate.monthly_cents, selection.rate.yearly_cents)}`
              : null}
          </p>
          <div className="flex gap-2">
            <Button
              isDisabled={blocked || change.isPending}
              onPress={() => change.mutate(selection)}
            >
              Confirmar módulo
            </Button>
            <Button
              variant="outline"
              isDisabled={change.isPending}
              onPress={() => setSelection(null)}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
