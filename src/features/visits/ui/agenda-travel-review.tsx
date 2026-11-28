import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@doscientos/ui'
import { RoadHorizon } from '@phosphor-icons/react'
import { useId, useState } from 'react'

import { calendarDate } from '@/shared/lib/date-range'
import { SelectField } from '@/shared/ui/form'

import {
  manualTravelMinutes,
  maxTravelMinutes,
  maxTravelStops,
  selectedTravelLegs,
  travelLegMargin,
  type TravelRoute,
  type TravelStop,
} from '../domain/agenda-travel-review'

const dayLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' })
const numberLabel = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

function durationLabel(value: number) {
  return value > 0 && value < 1 ? 'menos de 1 min' : `${numberLabel.format(value)} min`
}

function travelClock(stamp: string, timeZone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(stamp))
}

type AgendaTravelReviewProps = {
  date: string
  routes: readonly TravelRoute[]
  disabled: boolean
}

export function AgendaTravelReview({ date, routes, disabled }: AgendaTravelReviewProps) {
  const [open, setOpen] = useState(false)
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger variant="outline" className="min-h-11" isDisabled={disabled}>
        <RoadHorizon aria-hidden="true" className="size-4 shrink-0" />
        Revisar traslados
      </DialogTrigger>
      <DialogContent
        className="app-dialog max-h-[90dvh] w-full overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Ruta diaria y margen de traslados</DialogTitle>
          <DialogDescription>
            {dayLabel.format(calendarDate(date))}. Revisión orientativa; no cambia la agenda ni
            consulta el tráfico.
          </DialogDescription>
        </DialogHeader>
        {open ? <ReviewSchedule routes={routes} /> : null}
        <DialogFooter>
          <DialogClose variant="outline" className="min-h-11">
            Cerrar revisión
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

function ReviewSchedule({ routes }: { routes: readonly TravelRoute[] }) {
  const [routeId, setRouteId] = useState('')
  const route = routes.find(({ id }) => id === routeId)
  return (
    <div className="min-w-0 space-y-4">
      {routes.length ? (
        <SelectField
          label="Persona o equipo de la ruta"
          value={route?.id ?? ''}
          className="min-w-0"
          controlClassName="min-h-11 w-full min-w-0"
          options={[
            { value: '', label: 'Elige una ruta' },
            ...routes.map(({ id, name, stops }) => ({
              value: id,
              label: `${name} · ${stops.length} visitas`,
            })),
          ]}
          onChange={setRouteId}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay dos visitas planificadas del mismo técnico o equipo para ese día.
        </p>
      )}
      {route ? <TravelRouteFields key={route.id} stops={route.stops} /> : null}
    </div>
  )
}

function TravelRouteFields({ stops }: { stops: readonly TravelStop[] }) {
  const fieldsId = useId()
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [estimates, setEstimates] = useState<Record<string, string>>({})
  const legs = selectedTravelLegs(stops, selection)
  const count = legs.length ? legs.length + 1 : stops.filter(({ id }) => selection.has(id)).length
  const known = legs.filter(({ id }) => manualTravelMinutes(estimates[id]) !== null).length

  function toggle(id: string) {
    setSelection((current) => {
      const next = new Set(stops.filter((stop) => current.has(stop.id)).map((stop) => stop.id))
      if (next.has(id)) next.delete(id)
      else if (next.size < maxTravelStops) next.add(id)
      return next
    })
  }

  return (
    <div className="min-w-0 space-y-4">
      <fieldset className="border-border min-w-0 space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-semibold">Paradas en el orden de la agenda</legend>
        <p className="text-muted-foreground text-sm">
          Marca entre 2 y {maxTravelStops}. El orden viene de la agenda; si coincide, se usa la
          hora. Se muestran las visitas planificadas de la ruta aunque apliques filtros.
        </p>
        <div className="divide-border max-h-56 divide-y overflow-y-auto rounded-md">
          {stops.map((stop) => (
            <label
              key={stop.id}
              aria-labelledby={`${fieldsId}-${stop.id}-description`}
              className="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 px-1 py-2"
            >
              <input
                type="checkbox"
                className="accent-primary focus-visible:ring-ring mt-1 size-4 shrink-0"
                checked={selection.has(stop.id)}
                disabled={!selection.has(stop.id) && count >= maxTravelStops}
                onChange={() => toggle(stop.id)}
              />
              <span
                id={`${fieldsId}-${stop.id}-description`}
                className="min-w-0 text-sm wrap-anywhere"
              >
                <span className="block font-medium">{stop.title}</span>
                <span className="text-muted-foreground">
                  {travelClock(stop.startsAt, stop.timezone)} a{' '}
                  {travelClock(stop.endsAt, stop.timezone)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <output className="text-muted-foreground text-sm">{count} paradas seleccionadas.</output>
      </fieldset>

      {legs.length ? (
        <section aria-label="Estimaciones de los tramos" className="min-w-0 space-y-2">
          <h3 className="font-semibold">Tramos entre paradas seleccionadas</h3>
          <p className="text-muted-foreground text-sm">
            Se compara el tiempo entre el fin de una visita y el inicio de la siguiente con tu
            estimación manual. Deja en blanco los tramos que no sepas. Ten en cuenta el tráfico y el
            aparcamiento: Menos Líos no los calcula.
          </p>
          <output className="text-muted-foreground text-sm">
            {known} de {legs.length} tramos con estimación.
          </output>
          <ol className="space-y-2">
            {legs.map((leg) => (
              <li key={leg.id} className="border-border min-w-0 space-y-2 rounded-md border p-3">
                <TravelLegField
                  leg={leg}
                  value={estimates[leg.id] ?? ''}
                  onChange={(value) => setEstimates((current) => ({ ...current, [leg.id]: value }))}
                />
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Marca al menos dos paradas para comparar los huecos.
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        Solo es una revisión en esta pantalla. No reordena visitas ni guarda las estimaciones.
      </p>
    </div>
  )
}

function TravelLegField({
  leg,
  value,
  onChange,
}: {
  leg: ReturnType<typeof selectedTravelLegs>[number]
  value: string
  onChange: (value: string) => void
}) {
  const inputId = useId()
  const resultId = useId()
  const estimate = manualTravelMinutes(value)
  const invalid = value !== '' && estimate === null
  const result = travelLegMargin(leg.gapMinutes, estimate)
  const warning =
    result.status === 'overlap' || result.status === 'short' || result.status === 'tight'
  const resultText = {
    overlap: `Las visitas se solapan ${durationLabel(result.minutes)}. Revisa sus horarios.`,
    unknown: `Hueco previsto: ${durationLabel(result.minutes)}. Falta la estimación.`,
    short: `Faltan ${durationLabel(result.minutes)} según tu estimación. Revisa la agenda.`,
    tight: 'Sin margen de un minuto completo según tu estimación.',
    spare: `Margen orientativo: ${durationLabel(result.minutes)} según tu estimación.`,
  }[result.status]
  return (
    <>
      <p className="text-sm font-medium wrap-anywhere">
        {leg.from.title} → {leg.to.title}
      </p>
      {leg.omitted > 0 ? (
        <p className="border-warning border-s-2 ps-2 text-sm">
          Hay {leg.omitted}{' '}
          {leg.omitted === 1
            ? 'parada intermedia no seleccionada'
            : 'paradas intermedias no seleccionadas'}
          . Este tramo no comprueba la ruta completa.
        </p>
      ) : null}
      <label htmlFor={inputId} className="block text-sm font-medium">
        Minutos de traslado
        <span className="sr-only">
          {' '}
          de {leg.from.title} a {leg.to.title}
        </span>
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background focus-visible:ring-ring min-h-11 w-full max-w-36 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-hidden"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={resultId}
      />
      <output
        id={resultId}
        htmlFor={inputId}
        className={
          warning || invalid
            ? 'text-destructive block text-sm'
            : 'text-muted-foreground block text-sm'
        }
      >
        {invalid && result.status !== 'overlap'
          ? `Indica minutos enteros entre 0 y ${maxTravelMinutes}.`
          : resultText}
        {invalid && result.status === 'overlap'
          ? ` Indica minutos enteros entre 0 y ${maxTravelMinutes}.`
          : ''}
      </output>
    </>
  )
}
