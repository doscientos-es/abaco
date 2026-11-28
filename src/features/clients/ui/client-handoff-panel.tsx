import { Button } from '@doscientos/ui'
import { ArrowClockwise } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useId, type Ref } from 'react'

import { SelectField } from '@/shared/ui/form'

import type { loadHandoffIncidents, loadHandoffTiming } from '../application/client-handoff-actions'
import {
  handoffIncidentStatuses,
  handoffInstant,
  handoffLocationName,
  handoffRecordedDay,
} from '../domain/client-handoff'

type Location = { id: string; name: string }
type Props = {
  tenantId: string
  userId: string
  clientId: string
  locations: readonly Location[]
  location: string | null
  onLocationChange: (value: string | null) => void
  headingRef?: Ref<HTMLHeadingElement>
  loadTiming: typeof loadHandoffTiming
  loadIncidents: typeof loadHandoffIncidents | undefined
}

export function ClientHandoffPanel({
  tenantId,
  userId,
  clientId,
  locations,
  location,
  onLocationChange,
  headingRef,
  loadTiming,
  loadIncidents,
}: Props) {
  const panelId = useId()
  const headingId = useId()
  const scopeKey = [tenantId, userId, clientId, location]
  const valid = location !== null && (!location || locations.some(({ id }) => id === location))
  const timing = useQuery({
    queryKey: ['client-handoff-visits', ...scopeKey],
    queryFn: ({ signal }) =>
      loadTiming({ tenantId, clientId, locationId: location || null, signal }),
    enabled: valid,
    gcTime: 0,
    retry: false,
  })
  const pending = useQuery({
    queryKey: ['client-handoff-incidents', ...scopeKey],
    queryFn: ({ signal }) =>
      loadIncidents?.({ tenantId, clientId, locationId: location || null, signal }) ?? null,
    enabled: valid && Boolean(loadIncidents),
    gcTime: 0,
    retry: false,
  })

  return (
    <section
      aria-labelledby={headingId}
      className="border-border bg-card min-w-0 space-y-3 rounded-xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="scroll-mt-20 text-lg font-semibold"
          >
            Ficha de relevo
          </h2>
          <p className="text-muted-foreground text-sm">
            Último servicio, próxima visita{loadIncidents ? ' e incidencias pendientes' : ''} del
            cliente.
          </p>
        </div>
        <Button
          className="min-h-11"
          variant="outline"
          aria-expanded={valid}
          aria-controls={panelId}
          onPress={() => onLocationChange(valid ? null : '')}
        >
          {valid ? 'Cerrar ficha de relevo' : 'Abrir ficha de relevo'}
        </Button>
      </div>
      <div id={panelId} hidden={!valid} className="min-w-0 space-y-3">
        {valid ? (
          <>
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <SelectField
                label="Centro del relevo"
                className="w-full min-w-0 sm:max-w-80"
                value={location ?? ''}
                onChange={onLocationChange}
                options={[
                  { value: '', label: 'Todo el cliente' },
                  ...locations.map(({ id, name }) => ({ value: id, label: name })),
                ]}
              />
              <Button
                className="min-h-11"
                variant="outline"
                isDisabled={timing.isFetching || Boolean(loadIncidents && pending.isFetching)}
                onPress={() => {
                  void timing.refetch()
                  if (loadIncidents) void pending.refetch()
                }}
              >
                <ArrowClockwise aria-hidden="true" className="size-4" />
                Actualizar relevo
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Fechas y horas de las visitas y los avisos en hora de Madrid.
            </p>
            {timing.isFetching ? (
              <output className="text-sm">Comprobando las visitas…</output>
            ) : null}
            {timing.isError && !timing.isFetching ? (
              <p role="alert" className="text-sm">
                No se pudieron comprobar las visitas. Pulsa «Actualizar relevo» para reintentar.
              </p>
            ) : null}
            {timing.isSuccess && !timing.isFetching ? (
              <div className="grid min-w-0 gap-2 lg:grid-cols-2">
                <div className="border-border min-w-0 space-y-1 rounded-lg border p-3 text-sm wrap-anywhere">
                  <h3 className="font-semibold">Último servicio cerrado</h3>
                  {timing.data.last ? (
                    <>
                      <p>
                        {timing.data.last.title} ·{' '}
                        {handoffLocationName(timing.data.last.location_id, locations)}
                      </p>
                      {timing.data.last.performed_on ? (
                        <p className="text-muted-foreground">
                          Fecha real del parte:{' '}
                          <time dateTime={timing.data.last.performed_on}>
                            {handoffRecordedDay(timing.data.last.performed_on)}
                          </time>
                        </p>
                      ) : timing.data.last.actual_end_at ? (
                        <p className="text-muted-foreground">
                          Cerrada en la app: <Instant value={timing.data.last.actual_end_at} />
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Consta como cerrada, sin fecha real de cierre registrada.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      No consta un servicio cerrado en este ámbito.
                    </p>
                  )}
                </div>
                <div className="border-border min-w-0 space-y-2 rounded-lg border p-3 text-sm wrap-anywhere">
                  <h3 className="font-semibold">Visita en curso o próxima</h3>
                  {timing.data.active ? (
                    <div>
                      <p>
                        En curso: {timing.data.active.title} ·{' '}
                        {handoffLocationName(timing.data.active.location_id, locations)}
                      </p>
                      <p className="text-muted-foreground">
                        {timing.data.active.actual_start_at ? (
                          <>
                            Inicio registrado:{' '}
                            <Instant value={timing.data.active.actual_start_at} />
                          </>
                        ) : (
                          'Inicio real sin hora registrada.'
                        )}
                      </p>
                    </div>
                  ) : null}
                  {timing.data.next ? (
                    <div>
                      <p>
                        Programada: {timing.data.next.title} ·{' '}
                        {handoffLocationName(timing.data.next.location_id, locations)}
                      </p>
                      <p className="text-muted-foreground">
                        Inicio previsto: <Instant value={timing.data.next.scheduled_start_at} />
                      </p>
                    </div>
                  ) : null}
                  {!timing.data.active && !timing.data.next ? (
                    <p className="text-muted-foreground">
                      No consta una visita en curso ni una programada a partir de ahora en este
                      ámbito.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {loadIncidents ? (
              <div className="border-border min-w-0 space-y-2 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">Incidencias pendientes registradas</h3>
                {pending.isFetching ? <output>Comprobando las incidencias…</output> : null}
                {pending.isError && !pending.isFetching ? (
                  <p role="alert">
                    No se pudieron comprobar las incidencias. Pulsa «Actualizar relevo» para
                    reintentar.
                  </p>
                ) : null}
                {pending.isSuccess && pending.data && !pending.isFetching ? (
                  pending.data.items.length ? (
                    <>
                      <ul className="divide-border divide-y">
                        {pending.data.items.map((item) => (
                          <li className="space-y-1 py-2 wrap-anywhere" key={item.id}>
                            <p className="font-medium">{item.title}</p>
                            <p className="text-muted-foreground">
                              {handoffIncidentStatuses[item.status]} ·{' '}
                              {handoffLocationName(item.location_id, locations)} · Actualizada:{' '}
                              <Instant value={item.updated_at} />
                            </p>
                            {item.due_at ? (
                              <p className="text-muted-foreground">
                                Vence: <Instant value={item.due_at} />
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {pending.data.hasMore ? (
                        <p className="text-muted-foreground">
                          Se muestran hasta cinco. Hay más incidencias en este ámbito.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      No constan incidencias abiertas, en curso o reabiertas en este ámbito.
                    </p>
                  )
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}

function Instant({ value }: { value: string }) {
  return <time dateTime={value}>{handoffInstant(value)}</time>
}
