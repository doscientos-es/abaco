import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth'
import { useBrowserOnline } from '@/shared/lib/use-browser-online'

import { equipmentScanQuery } from '../application/equipment-label-queries'
import {
  equipmentActivityLabel,
  equipmentSubtitle,
  tagFromFragment,
} from '../domain/equipment-label'

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeZone: 'Europe/Madrid',
})

export function ScannedEquipmentPage({ fragment }: { fragment: string }) {
  const session = useSession()
  const token = tagFromFragment(fragment)
  const online = useBrowserOnline()
  const enabled = Boolean(online && session?.tenantId && session.userId && token)
  const result = useQuery({
    ...equipmentScanQuery(session?.tenantId, session?.userId, token),
    enabled,
  })
  const data =
    enabled &&
    result.isSuccess &&
    result.isFetchedAfterMount &&
    !result.isFetching &&
    !result.isPaused
      ? result.data
      : null
  return (
    <section className="border-border bg-card mx-auto max-w-2xl min-w-0 space-y-4 rounded-xl border p-3 sm:p-5">
      <h1 className="text-xl font-semibold">Etiqueta de equipo</h1>
      {!data ? (
        enabled &&
        (result.isFetching ||
          (!result.isFetchedAfterMount && !result.isPaused && !result.isError)) ? (
          <output className="text-muted-foreground">Comprobando acceso al equipo…</output>
        ) : (
          <div className="space-y-2">
            <p role="alert">No se pudo abrir esta etiqueta.</p>
            <p className="text-muted-foreground text-sm">
              Comprueba que estás en la empresa correcta y que tienes acceso a la visita. Si la
              etiqueta se sustituyó, utiliza la nueva.
            </p>
            {enabled ? (
              <Button variant="outline" className="min-h-11" onPress={() => void result.refetch()}>
                Volver a comprobar
              </Button>
            ) : null}
          </div>
        )
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold wrap-break-word">{data.kind}</h2>
            {equipmentSubtitle(data) ? (
              <p className="text-muted-foreground wrap-break-word">{equipmentSubtitle(data)}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <h2 className="font-semibold">Actividad visible</h2>
            {data.activity.length ? (
              <ul className="divide-border divide-y">
                {data.activity.map((activity, index) => {
                  const label = equipmentActivityLabel(activity)
                  if (!label || !Number.isFinite(Date.parse(activity.date))) return null
                  return (
                    <li
                      key={`${activity.date}:${index}`}
                      className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                    >
                      <span>{label}</span>
                      <time dateTime={activity.date}>
                        {dateFormat.format(new Date(activity.date))}
                      </time>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No hay actividad visible para este equipo.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
